/**
 * Admin API Control Center services.
 *
 * Super Admin controls for the Developer / API Platform: approve or suspend
 * developer applications, enable/disable API products and endpoints, adjust
 * product pricing and rate limits, and view platform-wide usage. Every action
 * is audited. These operate across organizations (platform scope).
 */
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { auditService } from "../audit/audit.service.js";
import type { ApiProductRow } from "@windels/shared/developerPlatform";

function iso(v: unknown): string | null {
  return v instanceof Date ? v.toISOString() : v ? String(v) : null;
}

async function audit(adminId: string, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown> = {}) {
  await auditService.log({
    organizationId: undefined,
    userId: adminId,
    action: action as any,
    resourceType: resourceType as any,
    resourceId,
    metadata,
  });
}

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

/* ── Platform-wide catalog & endpoints ─────────────────────────────────── */

/** All API products (including disabled), across the platform. */
export async function adminListProducts(adminId: string): Promise<Array<ApiProductRow & { organizationSlug: string | null }>> {
  const rows = await prisma.apiProduct.findMany({ orderBy: { category: "asc" } });
  return Promise.all((rows as any[]).map(async (r) => ({
    ...(await toProductRow(r)),
    organizationSlug: r.organization ? r.organization.slug : null,
  })));
}

export async function adminSetProductEnabled(
  adminId: string,
  productId: string,
  enabled: boolean,
): Promise<ApiProductRow> {
  const p = await prisma.apiProduct.findUnique({ where: { id: productId } });
  if (!p) throw AppError.notFound("API product not found");
  const updated = await prisma.apiProduct.update({ where: { id: productId }, data: { enabled } });
  await audit(adminId, "system.config_change", "integration", productId, { field: "enabled", value: enabled, slug: p.slug });
  return toProductRow(updated);
}

export async function adminUpdateProduct(
  adminId: string,
  productId: string,
  input: { rateLimitPerMin?: number; basePriceUsd?: number; requiredScopes?: string[]; name?: string; description?: string },
): Promise<ApiProductRow> {
  const p = await prisma.apiProduct.findUnique({ where: { id: productId } });
  if (!p) throw AppError.notFound("API product not found");
  const data: Record<string, unknown> = {};
  if (input.rateLimitPerMin !== undefined) data.rateLimitPerMin = input.rateLimitPerMin;
  if (input.basePriceUsd !== undefined) data.basePriceUsd = input.basePriceUsd;
  if (input.requiredScopes !== undefined) data.requiredScopes = input.requiredScopes;
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  const updated = await prisma.apiProduct.update({ where: { id: productId }, data });
  await audit(adminId, "system.config_change", "integration", productId, { slug: p.slug, changes: Object.keys(data) });
  return toProductRow(updated);
}

/* ── Developer applications (platform view) ────────────────────────────── */

export interface AdminAppRow {
  id: string;
  name: string;
  description: string | null;
  environment: string;
  active: boolean;
  productionApproved: boolean;
  organizationName: string;
  ownerName: string | null;
  apiKeyCount: number;
  createdAt: string;
}

export async function adminListApps(adminId: string): Promise<AdminAppRow[]> {
  const apps = await prisma.developerApp.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      organization: true,
      owner: { include: { profile: true } },
      _count: { select: { apiKeys: true } },
    },
  });
  return (apps as any[]).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description ?? null,
    environment: a.environment,
    active: a.active,
    productionApproved: a.productionApproved,
    organizationName: a.organization.name,
    ownerName: a.owner.profile?.displayName ?? a.owner.email ?? null,
    apiKeyCount: a._count.apiKeys,
    createdAt: iso(a.createdAt) ?? "",
  }));
}

export async function adminSetAppApproved(
  adminId: string,
  appId: string,
  productionApproved: boolean,
): Promise<AdminAppRow> {
  const app = await prisma.developerApp.findUnique({ where: { id: appId } });
  if (!app) throw AppError.notFound("Application not found");
  await prisma.developerApp.update({ where: { id: appId }, data: { productionApproved } });
  await audit(adminId, "authz.permission_grant", "integration", appId, { productionApproved, appName: app.name });
  return (await adminListApps(adminId)).find((a) => a.id === appId)!;
}

export async function adminSetAppActive(
  adminId: string,
  appId: string,
  active: boolean,
): Promise<AdminAppRow> {
  const app = await prisma.developerApp.findUnique({ where: { id: appId } });
  if (!app) throw AppError.notFound("Application not found");
  await prisma.developerApp.update({ where: { id: appId }, data: { active } });
  await audit(adminId, "authz.permission_revoke", "integration", appId, { active, appName: app.name });
  return (await adminListApps(adminId)).find((a) => a.id === appId)!;
}

/* ── Platform-wide usage (all orgs) ────────────────────────────────────── */

export async function adminUsageSummary(adminId: string, days = 7) {
  const since = new Date(Date.now() - days * 86400000);
  const [total, failed, ok, byChannel, byEndpoint, orgs, tokens] = await Promise.all([
    prisma.apiUsageRecord.count({ where: { createdAt: { gte: since } } }),
    prisma.apiUsageRecord.count({ where: { createdAt: { gte: since }, status: { gte: 400 } } }),
    prisma.apiUsageRecord.count({ where: { createdAt: { gte: since }, status: { lt: 400 } } }),
    prisma.apiUsageRecord.groupBy({ by: ["channel"], where: { createdAt: { gte: since } }, _count: { id: true } }),
    prisma.apiUsageRecord.groupBy({ by: ["endpoint"], where: { createdAt: { gte: since } }, _count: { id: true } }),
    prisma.apiUsageRecord.groupBy({ by: ["organizationId"], where: { createdAt: { gte: since } }, _count: { id: true } }),
    prisma.apiUsageRecord.aggregate({ where: { createdAt: { gte: since } }, _sum: { tokensIn: true, tokensOut: true, aiCostMicros: true, durationMs: true } }),
  ]);
  const orgRows = await prisma.organization.findMany({
    where: { id: { in: orgs.map((o: any) => o.organizationId).filter(Boolean) } },
    select: { id: true, name: true },
  });
  const orgNameById = new Map(orgRows.map((o) => [o.id, o.name]));
  const sum = (tokens as any)._sum ?? {};
  const durationCount = (await prisma.apiUsageRecord.count({ where: { createdAt: { gte: since }, durationMs: { gt: 0 } } }));
  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    totalRequests: total,
    successfulRequests: ok,
    failedRequests: failed,
    errorRatePct: total ? Math.round((failed / total) * 1000) / 10 : null,
    avgDurationMs: durationCount && total ? Math.round((sum.durationMs ?? 0) / total) : null,
    totalTokensIn: sum.tokensIn ?? 0,
    totalTokensOut: sum.tokensOut ?? 0,
    estimatedCostUsd: ((sum.tokensIn ?? 0) / 1e6) * 0.6 + ((sum.tokensOut ?? 0) / 1e6) * 2.4,
    byChannel: byChannel.map((c: any) => ({ channel: c.channel, count: c._count.id })),
    byEndpoint: byEndpoint.map((e: any) => ({ endpoint: e.endpoint, count: e._count.id })).sort((a: any, b: any) => b.count - a.count),
    byOrg: orgs.map((o: any) => ({ organizationId: o.organizationId, organizationName: orgNameById.get(o.organizationId) ?? null, count: o._count.id })).sort((a: any, b: any) => b.count - a.count),
  };
}
