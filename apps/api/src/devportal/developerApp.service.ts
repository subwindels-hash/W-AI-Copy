/**
 * Developer application & API product services.
 *
 * Organizations create one or more developer applications; each application
 * can own API keys and subscribe to API products. This is additive to the
 * existing Session 104 API-key service and the Session 120 gateway.
 */
import { z } from "zod";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "../services/workspace.service.js";
import { auditService } from "../audit/audit.service.js";
import type {
  DeveloperAppCreateInput,
  DeveloperAppUpdateInput,
  DeveloperAppRow,
  ApiProductRow,
  ApiSubscriptionRow,
} from "@windels/shared/developerPlatform";

function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v ?? "");
}

function isoOrNull(v: unknown): string | null {
  return v ? iso(v) : null;
}

async function audit(organizationId: string, userId: string, action: string, resourceId: string, metadata: Record<string, unknown> = {}) {
  await auditService.logFromRequest(
    action as any,
    { user: { id: userId, organizationId } },
    "integration",
    resourceId,
    metadata,
  );
}

async function requireAppAccess(userId: string, appId: string) {
  const ctx = await resolveUserContext(userId);
  const app = await prisma.developerApp.findFirst({
    where: { id: appId, organizationId: ctx.organizationId },
  });
  if (!app) throw AppError.notFound("Application not found");
  return { app, ctx };
}

export async function listDeveloperApps(userId: string): Promise<DeveloperAppRow[]> {
  const ctx = await resolveUserContext(userId);
  const apps = await prisma.developerApp.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    include: { owner: { include: { profile: true } }, _count: { select: { apiKeys: true } } },
  });
  return (apps as any[]).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description ?? null,
    logoUrl: a.logoUrl ?? null,
    environment: a.environment,
    redirectUrls: a.redirectUrls ?? [],
    allowedScopes: a.allowedScopes ?? [],
    active: a.active,
    productionApproved: a.productionApproved,
    apiKeyCount: a._count.apiKeys,
    owner: { id: a.ownerId, displayName: a.owner.profile?.displayName ?? a.owner.email },
    createdAt: iso(a.createdAt),
    updatedAt: iso(a.updatedAt),
  }));
}

export async function createDeveloperApp(userId: string, input: DeveloperAppCreateInput): Promise<DeveloperAppRow> {
  const ctx = await resolveUserContext(userId);
  const app = await prisma.developerApp.create({
    data: {
      organizationId: ctx.organizationId,
      ownerId: userId,
      name: input.name,
      description: input.description ?? null,
      logoUrl: input.logoUrl ?? null,
      environment: input.environment,
      redirectUrls: input.redirectUrls ?? [],
      allowedScopes: input.allowedScopes ?? [],
    },
    include: { owner: { include: { profile: true } }, _count: { select: { apiKeys: true } } },
  });
  await audit(ctx.organizationId, userId, "data.create", app.id, { name: app.name, environment: app.environment });
  return {
    id: app.id,
    name: app.name,
    description: app.description ?? null,
    logoUrl: app.logoUrl ?? null,
    environment: app.environment,
    redirectUrls: app.redirectUrls ?? [],
    allowedScopes: app.allowedScopes ?? [],
    active: app.active,
    productionApproved: app.productionApproved,
    apiKeyCount: 0,
    owner: { id: userId, displayName: app.owner.profile?.displayName ?? app.owner.email },
    createdAt: iso(app.createdAt),
    updatedAt: iso(app.updatedAt),
  };
}

export async function updateDeveloperApp(userId: string, appId: string, input: DeveloperAppUpdateInput): Promise<DeveloperAppRow> {
  const { app, ctx } = await requireAppAccess(userId, appId);
  const updated = await prisma.developerApp.update({
    where: { id: app.id },
    data: input,
    include: { owner: { include: { profile: true } }, _count: { select: { apiKeys: true } } },
  });
  await audit(ctx.organizationId, userId, "data.update", app.id, { changes: Object.keys(input) });
  return {
    id: updated.id,
    name: updated.name,
    description: updated.description ?? null,
    logoUrl: updated.logoUrl ?? null,
    environment: updated.environment,
    redirectUrls: updated.redirectUrls ?? [],
    allowedScopes: updated.allowedScopes ?? [],
    active: updated.active,
    productionApproved: updated.productionApproved,
    apiKeyCount: updated._count.apiKeys,
    owner: { id: updated.ownerId, displayName: updated.owner.profile?.displayName ?? updated.owner.email },
    createdAt: iso(updated.createdAt),
    updatedAt: iso(updated.updatedAt),
  };
}

export async function deleteDeveloperApp(userId: string, appId: string): Promise<{ deleted: true; id: string }> {
  const { app, ctx } = await requireAppAccess(userId, appId);
  // API keys linked to the app are detached (SetNull) but preserved.
  await prisma.developerApp.delete({ where: { id: app.id } });
  await audit(ctx.organizationId, userId, "data.delete", app.id, { name: app.name });
  return { deleted: true, id: app.id };
}

/* ── API products (marketplace catalog) ────────────────────────────────── */

async function toProductRow(p: any): Promise<ApiProductRow> {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    description: p.description ?? null,
    version: p.version,
    requiredScopes: p.requiredScopes ?? [],
    basePriceUsd: p.basePriceUsd ?? 0,
    enabled: p.enabled,
    rateLimitPerMin: p.rateLimitPerMin ?? 60,
    docsUrl: p.docsUrl ?? null,
    example: p.example ?? {},
  };
}

/** Default marketplace catalog (global, org-agnostic). Seeded idempotently. */
const DEFAULT_PRODUCTS: Array<{ slug: string; name: string; category: string; description: string; requiredScopes: string[]; rateLimitPerMin: number; basePriceUsd: number }> = [
  { slug: "ai", name: "AI Completion", category: "agents", description: "Call the WINDELS AI runtime for completions.", requiredScopes: ["ai:read", "ai:execute"], rateLimitPerMin: 120, basePriceUsd: 0.6 },
  { slug: "agents", name: "AI Agents", category: "agents", description: "List and execute WINDELS AI agents.", requiredScopes: ["agents:read", "agents:execute"], rateLimitPerMin: 60, basePriceUsd: 1.0 },
  { slug: "workforce", name: "AI Workforce", category: "workforce", description: "Interact with the AI workforce and its agents.", requiredScopes: ["agents:read", "agents:execute"], rateLimitPerMin: 60, basePriceUsd: 1.0 },
  { slug: "workflows", name: "Workflow Automation", category: "workflows", description: "Create, trigger and monitor workflows.", requiredScopes: ["workflows:read", "workflows:execute"], rateLimitPerMin: 60, basePriceUsd: 1.0 },
  { slug: "trading", name: "Trading Intelligence", category: "trading", description: "Market analysis and trading signals (analysis only, not a brokerage).", requiredScopes: ["trading:read"], rateLimitPerMin: 30, basePriceUsd: 2.0 },
  { slug: "knowledge", name: "Knowledge AI", category: "knowledge", description: "Search approved organization knowledge.", requiredScopes: ["knowledge:read", "search:read"], rateLimitPerMin: 120, basePriceUsd: 0.5 },
  { slug: "media", name: "Media Generation", category: "media", description: "Image, audio and video generation.", requiredScopes: ["media:generate", "documents:generate"], rateLimitPerMin: 20, basePriceUsd: 3.0 },
  { slug: "voice", name: "Voice AI", category: "voice", description: "Voice synthesis and generation.", requiredScopes: ["voice:generate"], rateLimitPerMin: 20, basePriceUsd: 2.0 },
  { slug: "analytics", name: "Analytics & Usage", category: "business", description: "Read analytics and usage metrics.", requiredScopes: ["analytics:read"], rateLimitPerMin: 120, basePriceUsd: 0.5 },
  { slug: "billing", name: "Billing & Invoices", category: "business", description: "Read billing and invoice data.", requiredScopes: ["billing:read"], rateLimitPerMin: 120, basePriceUsd: 0.5 },
  { slug: "search", name: "Enterprise Search", category: "search", description: "Search across approved organization records.", requiredScopes: ["search:read"], rateLimitPerMin: 120, basePriceUsd: 0.5 },
  { slug: "marketplace", name: "Marketplace", category: "marketplace", description: "Discover and manage marketplace products.", requiredScopes: ["marketplace:read", "marketplace:write"], rateLimitPerMin: 60, basePriceUsd: 0.5 },
  { slug: "nfc", name: "NFC Card Manager", category: "hardware", description: "Orchestrate authorized NFC reads and capability-checked, read-back-verified NDEF operations through a local WINDELS hardware adapter.", requiredScopes: ["nfc:read", "nfc:write"], rateLimitPerMin: 30, basePriceUsd: 0.5 },
];

export async function seedDefaultProducts(): Promise<number> {
  const existing = await prisma.apiProduct.count({ where: { organizationId: null } });
  if (existing > 0) return 0;
  let created = 0;
  for (const p of DEFAULT_PRODUCTS) {
    const exists = await prisma.apiProduct.findFirst({ where: { organizationId: null, slug: p.slug } });
    if (exists) continue;
    await prisma.apiProduct.create({
      data: { organizationId: null, ...p, version: "v1", enabled: true },
    });
    created += 1;
  }
  return created;
}

export async function listApiProducts(userId: string): Promise<ApiProductRow[]> {
  const ctx = await resolveUserContext(userId);
  await seedDefaultProducts();
  const rows = await prisma.apiProduct.findMany({
    where: { OR: [{ organizationId: ctx.organizationId }, { organizationId: null }], enabled: true },
    orderBy: { category: "asc" },
  });
  return Promise.all((rows as any[]).map(toProductRow));
}

export async function getApiProduct(userId: string, productId: string): Promise<ApiProductRow> {
  const ctx = await resolveUserContext(userId);
  const p = await prisma.apiProduct.findFirst({
    where: { id: productId, OR: [{ organizationId: ctx.organizationId }, { organizationId: null }], enabled: true },
  });
  if (!p) throw AppError.notFound("API product not found");
  return toProductRow(p);
}

export async function subscribeToProduct(
  userId: string,
  input: { appId?: string; productId: string },
): Promise<ApiSubscriptionRow> {
  const ctx = await resolveUserContext(userId);
  const product = await prisma.apiProduct.findFirst({
    where: { id: input.productId, OR: [{ organizationId: ctx.organizationId }, { organizationId: null }], enabled: true },
  });
  if (!product) throw AppError.notFound("API product not found");
  let appId: string | null = null;
  if (input.appId) {
    const app = await prisma.developerApp.findFirst({ where: { id: input.appId, organizationId: ctx.organizationId } });
    if (!app) throw AppError.notFound("Application not found");
    appId = app.id;
  }
  const existing = await prisma.apiSubscription.findFirst({
    where: { appId, productId: product.id, organizationId: ctx.organizationId },
  });
  let sub;
  if (existing) {
    sub = await prisma.apiSubscription.update({ where: { id: existing.id }, data: { status: "active" } });
  } else {
    sub = await prisma.apiSubscription.create({
      data: { organizationId: ctx.organizationId, appId, productId: product.id, status: "active" },
    });
  }
  await audit(ctx.organizationId, userId, "data.create", sub.id, { productId: product.id, appId });
  const prod = await toProductRow(product);
  return { id: sub.id, appId, product: prod, status: sub.status, quota: sub.quota ?? 0, usedThisMonth: sub.usedThisMonth ?? 0 };
}

export async function listSubscriptions(userId: string): Promise<ApiSubscriptionRow[]> {
  const ctx = await resolveUserContext(userId);
  const subs = await prisma.apiSubscription.findMany({
    where: { organizationId: ctx.organizationId },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });
  return Promise.all((subs as any[]).map(async (s) => ({
    id: s.id,
    appId: s.appId,
    product: await toProductRow(s.product),
    status: s.status,
    quota: s.quota ?? 0,
    usedThisMonth: s.usedThisMonth ?? 0,
  })));
}

export async function cancelSubscription(userId: string, subscriptionId: string): Promise<{ id: string; status: string }> {
  const ctx = await resolveUserContext(userId);
  const sub = await prisma.apiSubscription.findFirst({ where: { id: subscriptionId, organizationId: ctx.organizationId } });
  if (!sub) throw AppError.notFound("Subscription not found");
  const updated = await prisma.apiSubscription.update({ where: { id: sub.id }, data: { status: "cancelled" } });
  return { id: updated.id, status: updated.status };
}
