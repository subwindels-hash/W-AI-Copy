/**
 * Contact & Support Center service.
 *
 * Persistent contact requests (Postgres), communication history, status
 * tracking, AI-assisted routing, admin management, email delivery and
 * notifications. Reuses the existing AI registry, notifications service,
 * audit service and SMTP client — no duplicate infrastructure.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { auditService } from "../audit/audit.service.js";
import { sendContactMail, supportEmail } from "./mailer.js";
import { ContactAiService } from "./aiAssistant.js";
import { resolveUserContext } from "../services/workspace.service.js";
import { CONTACT_CATEGORY_DEPARTMENT, CONTACT_CATEGORY_LABELS } from "@windels/shared/contactCenter";
import type {
  ContactCategory,
  ContactDashboardRow,
  ContactFormInput,
  ContactListQuery,
  ContactMessageRow,
  ContactPriority,
  ContactRequestRow,
  ContactStatus,
  ContactStatusHistoryRow,
} from "@windels/shared/contactCenter";

function iso(v: unknown): string | null {
  return v instanceof Date ? v.toISOString() : v ? String(v) : null;
}

function toRow(r: any): ContactRequestRow {
  return {
    id: r.id,
    requestNumber: r.requestNumber,
    userId: r.userId ?? null,
    accountId: r.accountId ?? null,
    name: r.name,
    email: r.email,
    phone: r.phone ?? null,
    country: r.country ?? null,
    company: r.company ?? null,
    category: r.category,
    subject: r.subject,
    message: r.message ?? "",
    preferredContactMethod: r.preferredContactMethod ?? "email",
    aiConversationId: r.aiConversationId ?? null,
    aiSummary: r.aiSummary ?? null,
    priority: r.priority ?? "normal",
    status: r.status,
    department: r.department,
    assignedUserId: r.assignedUserId ?? null,
    assignedAgentId: r.assignedAgentId ?? null,
    source: r.source ?? "web",
    createdAt: iso(r.createdAt) ?? "",
    updatedAt: iso(r.updatedAt) ?? "",
    resolvedAt: iso(r.resolvedAt),
    closedAt: iso(r.closedAt),
    messageCount: (r as any)._count?.messages ?? 0,
  };
}

async function audit(adminId: string, action: string, resourceId: string, metadata: Record<string, unknown> = {}) {
  await auditService.log({
    organizationId: undefined,
    userId: adminId,
    action: action as any,
    resourceType: "integration",
    resourceId,
    metadata,
  });
}

function genRequestNumber(): string {
  return `CC-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

/** Route a request to a department (category-driven, refined by message keywords). */
function routeDepartment(category: ContactCategory, message: string): string {
  const base = CONTACT_CATEGORY_DEPARTMENT[category] ?? "general";
  const t = message.toLowerCase();
  if (/(api|sdk|oauth|webhook|api key)/.test(t) && category === "technical") return "api";
  if (/(security|breach|privacy|hack|phishing)/.test(t)) return "security";
  if (/(enterprise|contract|team plan|org)/.test(t) && category === "sales") return "enterprise_sales";
  return base;
}

/* ── Submission ────────────────────────────────────────────────────────── */

export async function submitContactRequest(
  input: ContactFormInput,
  ctx?: { userId?: string | null; organizationId?: string | null },
): Promise<ContactRequestRow> {
  // Honeypot spam check.
  if (input.website && input.website.length > 0) {
    throw AppError.badRequest("Submission rejected");
  }
  const message = (input.message ?? "").trim();
  if (message.length < 10) throw AppError.badRequest("Please provide a more detailed message.");

  // Resolve authenticated context when available.
  let userId = input.userId ?? ctx?.userId ?? null;
  let organizationId = ctx?.organizationId ?? null;
  if (userId && !organizationId) {
    try {
      const uctx = await resolveUserContext(userId);
      organizationId = uctx.organizationId;
    } catch { /* keep null */ }
  }

  const category: ContactCategory = input.category ?? "general";
  const department = routeDepartment(category, message);

  const request = await prisma.contactRequest.create({
    data: {
      requestNumber: genRequestNumber(),
      organizationId,
      userId,
      accountId: input.accountId ?? null,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      country: input.country ?? null,
      company: input.company ?? null,
      category,
      subject: input.subject,
      message,
      preferredContactMethod: input.preferredContactMethod ?? "email",
      aiConversationId: input.aiConversationId ?? null,
      aiSummary: input.aiSummary ?? null,
      priority: "normal",
      status: "new",
      department,
      source: input.aiConversationId ? "ai_assistant" : (ctx?.userId ? "web" : "web"),
    },
    include: { _count: { select: { messages: true } } },
  });

  await prisma.contactMessage.create({
    data: {
      requestId: request.id,
      authorType: input.aiConversationId ? "ai" : "user",
      authorId: userId,
      authorName: input.name,
      body: message,
      isInternal: false,
    },
  });
  await prisma.contactStatusHistory.create({
    data: { requestId: request.id, toStatus: "new", changedByUserId: userId },
  });

  await audit(userId ?? "system", "data.create", request.id, {
    category, department, source: "contact_submission",
  });

  // Notifications: notify staff that a request was created (best-effort).
  try {
    const { notificationsService } = await import("../notifications/notifications.service.js");
    await notificationsService.createAndSend({
      userId: userId ?? "system",
      organizationId: organizationId ?? "org-system",
      title: `New contact request ${request.requestNumber}`,
      body: `${CONTACT_CATEGORY_LABELS[category]} — ${input.subject}`,
      category: "collaboration.channel_join",
      priority: "normal",
      channels: ["in_app"],
      data: { requestId: request.id, requestNumber: request.requestNumber },
      linkUrl: `/app/contact-center/${request.id}`,
    });
  } catch { /* best effort */ }

  // Emails: system + user confirmation (best-effort, never blocks).
  const subject = `[WINDELS CONTACT] ${CONTACT_CATEGORY_LABELS[category]} — ${input.subject}`;
  await sendContactMail({
    to: supportEmail(),
    subject,
    text: [
      "Contact Request",
      "=".repeat(40),
      `Name: ${input.name}`,
      `Email: ${input.email}`,
      input.phone ? `Phone: ${input.phone}` : null,
      input.country ? `Country: ${input.country}` : null,
      input.company ? `Company: ${input.company}` : null,
      `Category: ${CONTACT_CATEGORY_LABELS[category]}`,
      `Subject: ${input.subject}`,
      `Department: ${department}`,
      `Priority: normal`,
      `Source: ${input.aiConversationId ? "AI Contact Assistant" : "Web form"}`,
      input.aiConversationId ? `Conversation ID: ${input.aiConversationId}` : null,
      ctx?.userId ? `Account ID: ${ctx.userId}` : null,
      input.aiSummary ? `AI Summary: ${input.aiSummary}` : null,
      `Timestamp: ${new Date().toISOString()}`,
      "",
      "Message:",
      message,
    ].filter(Boolean).join("\n"),
  }).catch(() => {});

  await sendContactMail({
    to: input.email,
    subject: `We received your request — ${request.requestNumber}`,
    text: [
      `Thank you for contacting WINDELS AI OS.`,
      "",
      `We received your request and created support request #${request.requestNumber}.`,
      "",
      `Our team will review your request and respond through the available contact channel.`,
      "",
      `WINDELS AI OS`,
    ].join("\n"),
  }).catch(() => {});

  return toRow(request);
}

/* ── My requests (authenticated user) ──────────────────────────────────── */

export async function listMyRequests(userId: string): Promise<ContactRequestRow[]> {
  const rows = await prisma.contactRequest.findMany({
    where: { OR: [{ userId }, { email: (await userEmail(userId)) ?? "" }] },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { messages: true } } },
  });
  return (rows as any[]).map(toRow);
}

async function userEmail(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return u?.email ?? null;
}

export async function getMyRequest(userId: string, requestId: string): Promise<ContactRequestRow> {
  const email = await userEmail(userId);
  const row = await prisma.contactRequest.findFirst({
    where: { id: requestId, OR: [{ userId }, { email: email ?? "" }] },
    include: { _count: { select: { messages: true } } },
  });
  if (!row) throw AppError.notFound("Request not found");
  return toRow(row);
}

/* ── Messages ──────────────────────────────────────────────────────────── */

export async function listMessages(requestId: string, viewerUserId?: string): Promise<ContactMessageRow[]> {
  // Public viewer: only their own non-internal messages.
  const rows = await prisma.contactMessage.findMany({
    where: { requestId, ...(viewerUserId ? { isInternal: false } : {}) },
    orderBy: { createdAt: "asc" },
  });
  return (rows as any[]).map((m) => ({
    id: m.id,
    requestId: m.requestId,
    authorType: m.authorType,
    authorId: m.authorId ?? null,
    authorName: m.authorName ?? null,
    body: m.body,
    isInternal: m.isInternal,
    createdAt: iso(m.createdAt) ?? "",
  }));
}

/* ── Admin ─────────────────────────────────────────────────────────────── */

export async function adminList(query: ContactListQuery): Promise<{ items: ContactRequestRow[]; total: number }> {
  const where: any = {};
  if (query.status) where.status = query.status;
  if (query.category) where.category = query.category;
  if (query.department) where.department = query.department;
  if (query.q) {
    const q = query.q.toLowerCase();
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { requestNumber: { contains: q, mode: "insensitive" } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.contactRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: ((query.page ?? 1) - 1) * (query.perPage ?? 20),
      take: query.perPage ?? 20,
      include: { _count: { select: { messages: true } } },
    }),
    prisma.contactRequest.count({ where }),
  ]);
  return { items: (items as any[]).map(toRow), total };
}

export async function adminGet(requestId: string): Promise<ContactRequestRow> {
  const row = await prisma.contactRequest.findUnique({
    where: { id: requestId },
    include: { _count: { select: { messages: true } } },
  });
  if (!row) throw AppError.notFound("Request not found");
  return toRow(row);
}

export async function adminRespond(
  adminId: string,
  requestId: string,
  input: { body: string; isInternal: boolean },
): Promise<ContactMessageRow> {
  const req = await prisma.contactRequest.findUnique({ where: { id: requestId } });
  if (!req) throw AppError.notFound("Request not found");
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { email: true, profile: { select: { displayName: true } } } });
  const msg = await prisma.contactMessage.create({
    data: {
      requestId,
      authorType: input.isInternal ? "staff" : "staff",
      authorId: adminId,
      authorName: admin?.profile?.displayName ?? admin?.email ?? "Staff",
      body: input.body,
      isInternal: input.isInternal,
    },
  });
  // If a public response, reopen/keep in progress.
  if (!input.isInternal && req.status === "awaiting_customer") {
    await transitionStatus(adminId, requestId, "in_progress");
  }
  await audit(adminId, "data.update", requestId, { action: input.isInternal ? "internal_note" : "staff_response" });
  return {
    id: msg.id, requestId, authorType: "staff", authorId: adminId,
    authorName: admin?.profile?.displayName ?? admin?.email ?? "Staff",
    body: msg.body, isInternal: msg.isInternal, createdAt: iso(msg.createdAt) ?? "",
  };
}

export async function adminAssign(
  adminId: string,
  requestId: string,
  input: { userId?: string; agentId?: string },
): Promise<ContactRequestRow> {
  const req = await prisma.contactRequest.findUnique({ where: { id: requestId } });
  if (!req) throw AppError.notFound("Request not found");
  const data: any = { assignedUserId: input.userId ?? null, assignedAgentId: input.agentId ?? null };
  if (input.userId || input.agentId) data.status = "assigned";
  const updated = await prisma.contactRequest.update({ where: { id: requestId }, data, include: { _count: { select: { messages: true } } } });
  await audit(adminId, "data.update", requestId, { action: "assign", userId: input.userId, agentId: input.agentId });
  return toRow(updated);
}

export async function adminTransition(
  adminId: string,
  requestId: string,
  to: ContactStatus,
): Promise<ContactRequestRow> {
  await transitionStatus(adminId, requestId, to);
  const updated = await prisma.contactRequest.findUnique({ where: { id: requestId }, include: { _count: { select: { messages: true } } } });
  return toRow(updated!);
}

async function transitionStatus(changedBy: string, requestId: string, to: ContactStatus) {
  const req = await prisma.contactRequest.findUnique({ where: { id: requestId } });
  if (!req) throw AppError.notFound("Request not found");
  const data: any = { status: to };
  if (to === "resolved") data.resolvedAt = new Date();
  if (to === "closed") data.closedAt = new Date();
  const updated = await prisma.contactRequest.update({ where: { id: requestId }, data });
  await prisma.contactStatusHistory.create({
    data: { requestId, fromStatus: req.status, toStatus: to, changedByUserId: changedBy },
  });
  await audit(changedBy, "data.update", requestId, { action: "status_change", from: req.status, to });
}

export async function adminStatusHistory(requestId: string): Promise<ContactStatusHistoryRow[]> {
  const rows = await prisma.contactStatusHistory.findMany({ where: { requestId }, orderBy: { createdAt: "asc" } });
  return rows.map((r: any) => ({
    id: r.id, requestId: r.requestId, fromStatus: r.fromStatus ?? null, toStatus: r.toStatus,
    changedByUserId: r.changedByUserId ?? null, createdAt: iso(r.createdAt) ?? "",
  }));
}

export async function adminDashboard(): Promise<ContactDashboardRow> {
  const [byStatus, byCategory, byCountry, byDepartment, aiHandled, humanHandled, resolved, all] = await Promise.all([
    prisma.contactRequest.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.contactRequest.groupBy({ by: ["category"], _count: { id: true } }),
    prisma.contactRequest.groupBy({ by: ["country"], _count: { id: true } }),
    prisma.contactRequest.groupBy({ by: ["department"], _count: { id: true } }),
    prisma.contactRequest.count({ where: { source: "ai_assistant" } }),
    prisma.contactRequest.count({ where: { source: { not: "ai_assistant" } } }),
    prisma.contactRequest.findMany({ where: { resolvedAt: { not: null } }, select: { resolvedAt: true, createdAt: true }, take: 5000 }),
    prisma.contactRequest.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { _count: { select: { messages: true } } } }),
  ]);
  // Avg resolution time.
  let avgResolutionHours: number | null = null;
  const dur = resolved.map((r: any) => (new Date(r.resolvedAt).getTime() - new Date(r.createdAt).getTime()) / 3600000);
  if (dur.length) avgResolutionHours = Math.round((dur.reduce((a, b) => a + b, 0) / dur.length) * 100) / 100;

  return {
    generatedAt: new Date().toISOString(),
    total: (await prisma.contactRequest.count()),
    byStatus: byStatus.map((s: any) => ({ status: s.status, count: s._count.id })),
    byCategory: byCategory.map((c: any) => ({ category: c.category, count: c._count.id })),
    byCountry: byCountry.filter((c: any) => c.country).map((c: any) => ({ country: c.country, count: c._count.id })),
    byDepartment: byDepartment.map((d: any) => ({ department: d.department, count: d._count.id })),
    aiHandled,
    humanHandled,
    avgResolutionHours,
    recent: (all as any[]).map(toRow),
  };
}

export const ContactService = {
  submitContactRequest,
  listMyRequests,
  getMyRequest,
  listMessages,
  adminList,
  adminGet,
  adminRespond,
  adminAssign,
  adminTransition,
  adminStatusHistory,
  adminDashboard,
};
