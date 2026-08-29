/**
 * Session 95 — Enterprise Helpdesk & Customer Support.
 *
 * Org-scoped tickets with an honest lifecycle, a comment timeline (with
 * internal staff notes), deterministic SLA tracking, assignment, a rollup
 * computed from stored records, and CRM integration (linking a ticket to a
 * contact/company writes a real Session 90 CRM activity).
 *
 * Honesty rules:
 *   - No Math.random anywhere; ids come from CSPRNG (randomUUID); ticket
 *     numbers come from a Redis monotonic counter (`hd:seq:<org>`) so they
 *     are stable and never collide.
 *   - `slaDueAt` is computed from the priority target hours and real
 *     timestamps — never invented; compliance is measured on resolved
 *     tickets against their stored due date.
 *   - `resolvedAt`/`closedAt` are stamped only on the actual transition;
 *     lifecycle transitions are validated (resolved → closed, etc.), and
 *     re-transitions are idempotent no-ops.
 *
 * Keys: hd:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  HdTicket,
  HdComment,
  HdTicketDetail,
  HdRollup,
  HdTicketCreateInput,
  HdCommentCreateInput,
  HdTransitionInput,
  HdAssignInput,
  HdTicketUpsertInput,
  HdTicketStatus,
  HdPriority,
} from "@windels/shared/helpdesk";
import { HD_SLA_TARGET_HOURS, HD_OPEN_STATUSES } from "@windels/shared/helpdesk";

type Entity = "ticket" | "comment";

const K = {
  item: (e: Entity, org: string, id: string) => `hd:${e}:i:${org}:${id}`,
  idx: (e: Entity, org: string) => `hd:${e}:idx:${org}`,
  seq: (org: string) => `hd:seq:${org}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

/** Read a record ONLY when it belongs to `org` — fail-closed cross-tenant. */
async function readOwned<T extends { organizationId: string }>(
  entity: Entity,
  org: string,
  id: string
): Promise<T | null> {
  const raw = await redis.hget(K.item(entity, org, id), "_doc");
  if (!raw) return null;
  const rec = j<T>(raw);
  return rec && rec.organizationId === org ? rec : null;
}

async function writeItem(entity: Entity, org: string, rec: unknown): Promise<void> {
  await redis.hset(K.item(entity, org, (rec as { id: string }).id), "_doc", s2(rec));
  await redis.zadd(K.idx(entity, org), Date.now(), (rec as { id: string }).id);
}

async function deleteItem(entity: Entity, org: string, id: string): Promise<boolean> {
  const existed = await readOwned<{ organizationId: string }>(entity, org, id);
  if (!existed) return false;
  await redis.del(K.item(entity, org, id));
  await redis.zrem(K.idx(entity, org), id);
  return true;
}

async function listIds(entity: Entity, org: string): Promise<string[]> {
  return redis.zrange(K.idx(entity, org), 0, -1);
}

const uid = (p: string) => p + randomUUID().slice(0, 8);

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ kind, source: "helpdesk", payload });
  } catch {
    /* best effort */
  }
}

/** Compute the SLA due date from the priority target hours and a base time. */
function slaDue(priority: HdPriority, baseMs: number): string {
  return new Date(baseMs + HD_SLA_TARGET_HOURS[priority] * 3_600_000).toISOString();
}

/** Allowed forward transitions — the honest lifecycle. */
const TRANSITIONS: Record<HdTicketStatus, ReadonlySet<HdTicketStatus>> = {
  new: new Set(["open", "pending", "resolved", "closed"]),
  open: new Set(["pending", "resolved", "closed"]),
  pending: new Set(["open", "resolved", "closed"]),
  resolved: new Set(["closed"]),
  closed: new Set([]),
};

export const HelpdeskService = {
  // ── Tickets ───────────────────────────────────────────────────────
  async listTickets(org: string, filter?: { status?: HdTicketStatus; priority?: HdPriority; assigneeId?: string; q?: string }): Promise<HdTicket[]> {
    const ids = await listIds("ticket", org);
    const out: HdTicket[] = [];
    for (const id of ids) {
      const t = await readOwned<HdTicket>("ticket", org, id);
      if (!t) continue;
      if (filter?.status && t.status !== filter.status) continue;
      if (filter?.priority && t.priority !== filter.priority) continue;
      if (filter?.assigneeId !== undefined && (t.assigneeId ?? null) !== (filter.assigneeId || null)) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!`${t.subject} ${t.number} ${t.requesterName} ${t.description ?? ""}`.toLowerCase().includes(q)) continue;
      }
      out.push(t);
    }
    return out.sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1));
  },

  async getTicket(org: string, id: string): Promise<HdTicket | null> {
    return readOwned<HdTicket>("ticket", org, id);
  },

  /** Next human ticket number from the org-local monotonic counter. */
  async nextTicketNumber(org: string): Promise<string> {
    const n = await redis.incr(K.seq(org));
    return `HD-${1000 + n}`;
  },

  async createTicket(org: string, input: HdTicketCreateInput, userId: string | null): Promise<HdTicket> {
    const now = new Date().toISOString();
    const nowMs = Date.now();
    const status = input.status ?? "new";
    const priority = input.priority ?? "medium";
    const rec: HdTicket = {
      id: uid("hdt-"),
      number: await this.nextTicketNumber(org),
      organizationId: org,
      subject: input.subject,
      description: input.description ?? null,
      status,
      priority,
      channel: input.channel ?? "web",
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail ?? null,
      assigneeId: input.assigneeId ?? null,
      contactId: input.contactId ?? null,
      companyId: input.companyId ?? null,
      tags: input.tags ?? [],
      slaDueAt: slaDue(priority, nowMs),
      resolvedAt: status === "resolved" ? now : null,
      closedAt: status === "closed" ? now : null,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("ticket", org, rec);
    await this.writeCrmActivity(org, rec, userId);
    void emitKernel("hd.ticket.created", { id: rec.id, number: rec.number, organizationId: org });
    return rec;
  },

  async updateTicket(org: string, id: string, patch: Partial<HdTicketUpsertInput>, userId: string | null): Promise<HdTicket | null> {
    const cur = await readOwned<HdTicket>("ticket", org, id);
    if (!cur) return null;
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const next: HdTicket = {
      ...cur,
      ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
      ...(patch.description !== undefined ? { description: patch.description ?? null } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority, slaDueAt: slaDue(patch.priority, nowMs) } : {}),
      ...(patch.channel !== undefined ? { channel: patch.channel } : {}),
      ...(patch.requesterName !== undefined ? { requesterName: patch.requesterName } : {}),
      ...(patch.requesterEmail !== undefined ? { requesterEmail: patch.requesterEmail ?? null } : {}),
      ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId ?? null } : {}),
      ...(patch.contactId !== undefined ? { contactId: patch.contactId ?? null } : {}),
      ...(patch.companyId !== undefined ? { companyId: patch.companyId ?? null } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      updatedAt: now,
    };
    await writeItem("ticket", org, next);
    await this.writeCrmActivity(org, next, userId);
    void emitKernel("hd.ticket.updated", { id, organizationId: org });
    return next;
  },

  async deleteTicket(org: string, id: string): Promise<boolean> {
    for (const c of await this.listComments(org, { ticketId: id })) await deleteItem("comment", org, c.id);
    const ok = await deleteItem("ticket", org, id);
    if (ok) void emitKernel("hd.ticket.deleted", { id, organizationId: org });
    return ok;
  },

  /** Assign (or unassign with null) — pure, no fabrication. */
  async assignTicket(org: string, id: string, input: HdAssignInput, userId: string | null): Promise<HdTicket | null> {
    const cur = await readOwned<HdTicket>("ticket", org, id);
    if (!cur) return null;
    const next: HdTicket = { ...cur, assigneeId: input.assigneeId, updatedAt: new Date().toISOString() };
    await writeItem("ticket", org, next);
    void emitKernel("hd.ticket.assigned", { id, organizationId: org, assigneeId: input.assigneeId });
    return next;
  },

  /**
   * Status transition with the honest lifecycle. `resolvedAt`/`closedAt`
   * stamped only on the actual transition; re-transitions are no-ops.
   */
  async transitionTicket(org: string, id: string, input: HdTransitionInput, userId: string | null): Promise<HdTicket | null> {
    const cur = await readOwned<HdTicket>("ticket", org, id);
    if (!cur) return null;
    if (cur.status === input.status) return cur; // idempotent no-op
    if (!TRANSITIONS[cur.status].has(input.status)) {
      throw new Error(`INVALID_TRANSITION: ${cur.status} → ${input.status}`);
    }
    const now = new Date().toISOString();
    const next: HdTicket = {
      ...cur,
      status: input.status,
      resolvedAt: input.status === "resolved" ? now : input.status === "closed" ? cur.resolvedAt ?? now : null,
      closedAt: input.status === "closed" ? now : null,
      updatedAt: now,
    };
    await writeItem("ticket", org, next);
    void emitKernel("hd.ticket.transitioned", { id, organizationId: org, from: cur.status, to: input.status });
    return next;
  },

  // ── Comments (timeline) ───────────────────────────────────────────
  async listComments(org: string, filter?: { ticketId?: string }): Promise<HdComment[]> {
    const ids = await listIds("comment", org);
    const out: HdComment[] = [];
    for (const id of ids) {
      const c = await readOwned<HdComment>("comment", org, id);
      if (!c) continue;
      if (filter?.ticketId && c.ticketId !== filter.ticketId) continue;
      out.push(c);
    }
    return out.sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1));
  },

  async createComment(org: string, ticketId: string, input: HdCommentCreateInput, userId: string | null): Promise<HdComment | null> {
    const ticket = await readOwned<HdTicket>("ticket", org, ticketId);
    if (!ticket) return null;
    const rec: HdComment = {
      id: uid("hdc-"),
      organizationId: org,
      ticketId,
      authorName: input.authorName,
      authorId: userId,
      body: input.body,
      internal: input.internal ?? false,
      createdAt: new Date().toISOString(),
    };
    await writeItem("comment", org, rec);
    void emitKernel("hd.comment.created", { id: rec.id, ticketId, organizationId: org, internal: rec.internal });
    return rec;
  },

  async deleteComment(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("comment", org, id);
    if (ok) void emitKernel("hd.comment.deleted", { id, organizationId: org });
    return ok;
  },

  // ── Detail & rollup ───────────────────────────────────────────────
  async getTicketDetail(org: string, id: string): Promise<HdTicketDetail | null> {
    const ticket = await readOwned<HdTicket>("ticket", org, id);
    if (!ticket) return null;
    return { ...ticket, comments: await this.listComments(org, { ticketId: id }) };
  },

  /** Best-effort CRM activity when the ticket references a CRM record. */
  async writeCrmActivity(org: string, ticket: HdTicket, userId: string | null): Promise<void> {
    if (!ticket.contactId && !ticket.companyId) return;
    try {
      const { CrmService } = await import("../crm/crm.service.js");
      await CrmService.createActivity(org, {
        kind: "note",
        subject: `Ticket ${ticket.number}: ${ticket.subject}`,
        body: `${ticket.description ?? ""}\n\nStatus: ${ticket.status} · Priority: ${ticket.priority}`.slice(0, 8000),
        contactId: ticket.contactId,
        companyId: ticket.companyId,
      }, userId);
    } catch {
      /* best effort — never fail the ticket write because CRM is down */
    }
  },

  async rollup(org: string): Promise<HdRollup> {
    const tickets = await this.listTickets(org);
    const now = Date.now();
    const open = tickets.filter((t) => HD_OPEN_STATUSES.has(t.status));
    const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed");
    const overdue = open.filter((t) => t.slaDueAt && new Date(t.slaDueAt).getTime() < now);
    const unassigned = open.filter((t) => !t.assigneeId);

    const byPriority = (["low", "medium", "high", "urgent"] as HdPriority[]).map((priority) => ({
      priority,
      count: tickets.filter((t) => t.priority === priority).length,
    }));

    // SLA compliance measured on tickets that were resolved, against the
    // stored SLA due date at the time — never invented.
    const resolvedClosed = tickets.filter((t) => t.status === "resolved" || t.status === "closed");
    const measured = resolvedClosed.filter((t) => t.resolvedAt && t.slaDueAt);
    const slaCompliancePct =
      measured.length > 0
        ? measured.filter((t) => new Date(t.resolvedAt!).getTime() <= new Date(t.slaDueAt!).getTime()).length / measured.length
        : null;

    const durations = resolvedClosed
      .filter((t) => t.resolvedAt)
      .map((t) => (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 3_600_000);
    const avgResolutionHours = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : null;

    const assigneeMap = new Map<string | null, number>();
    for (const t of open) assigneeMap.set(t.assigneeId, (assigneeMap.get(t.assigneeId) ?? 0) + 1);
    const byAssignee = [...assigneeMap.entries()].map(([assigneeId, count]) => ({ assigneeId, count }));

    const recentTickets = tickets.slice(0, 6);
    const stamps = tickets[0]?.createdAt ?? null;

    return {
      counts: {
        tickets: tickets.length,
        open: open.length,
        resolved: resolved.length,
        closed: tickets.filter((t) => t.status === "closed").length,
        overdue: overdue.length,
        unassigned: unassigned.length,
      },
      byPriority,
      slaCompliancePct,
      avgResolutionHours,
      byAssignee,
      recentTickets,
      lastUpdatedAt: stamps,
    };
  },

  // ── Idempotent demo seed (opt-in only) ─────────────────────────────
  async ensureDemoSeed(logger?: { info?: (...a: any[]) => void }): Promise<boolean> {
    const demoOrg = "org-demo-hd";
    const existing = await this.listTickets(demoOrg);
    if (existing.length > 0) return false;

    const t1 = await this.createTicket(demoOrg, {
      subject: "Cannot log in after password reset", priority: "high", channel: "email",
      requesterName: "Ada Okafor", requesterEmail: "ada.okafor@acme.example.com",
      contactId: "crmc-demo", tags: ["auth", "login"],
    }, "user-support");
    await this.createTicket(demoOrg, {
      subject: "Invoice #4412 not showing in billing", priority: "medium", channel: "web",
      requesterName: "Chidi Eze", requesterEmail: "chidi.eze@northwind.example.com",
      assigneeId: "user-support", tags: ["billing"],
    }, "user-support");
    await this.createTicket(demoOrg, {
      subject: "Data export stuck on large workspace", priority: "urgent", channel: "chat",
      requesterName: "Zainab Bello", requesterEmail: "zainab.bello@vertex.example.com",
      tags: ["export"],
    }, "user-support");
    const resolvedTicket = await this.createTicket(demoOrg, {
      subject: "How do I invite team members?", priority: "low", channel: "web",
      requesterName: "Emeka Nwosu", requesterEmail: "emeka.nwosu@acme.example.com",
      tags: ["onboarding"],
    }, "user-support");
    await this.transitionTicket(demoOrg, resolvedTicket.id, { status: "resolved" }, "user-support");
    await this.createTicket(demoOrg, {
      subject: "Feature request: CSV export for CRM", priority: "low", channel: "web",
      requesterName: "Amina Yusuf", requesterEmail: "amina.yusuf@northwind.example.com",
      tags: ["feature-request"],
    }, "user-support");

    await this.createComment(demoOrg, t1.id, { authorName: "Support Team", body: "Reset the password and confirmed access is restored.", internal: false }, "user-support");
    await this.createComment(demoOrg, t1.id, { authorName: "Support Team", body: "Escalated to identity team.", internal: true }, "user-support");
    await this.createComment(demoOrg, resolvedTicket.id, { authorName: "Support Team", body: "Sent the invite guide by email.", internal: false }, "user-support");

    logger?.info?.("[helpdesk] demo seed complete (org-demo-hd): 5 tickets, 3 comments");
    return true;
  },
};
