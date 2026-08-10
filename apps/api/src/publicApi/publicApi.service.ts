import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "../services/workspace.service.js";
import type { z } from "zod";
import { ApiKeyScope } from "@prisma/client";
import {
  AkApiKeyCreateSchema,
  AkApiKeyUpdateSchema,
} from "@windels/shared/apiKeys";
import type {
  AkApiKeyCreated,
  AkApiKeyListQuery,
  AkApiKeyMutation,
  AkApiKeyRow,
  AkScope,
} from "@windels/shared/apiKeys";

// Backwards-compatible names retained for the existing developer and apikey routes.
export const CreateApiKeySchema = AkApiKeyCreateSchema;
export const UpdateApiKeySchema = AkApiKeyUpdateSchema;

function generateToken(): { plain: string; prefix: string; hash: string } {
  const buf = randomBytes(24);
  const plain = `wnd_${buf.toString("base64url")}`;
  const prefix = plain.slice(0, 11);
  const hash = createHash("sha256").update(plain).digest("hex");
  return { plain, prefix, hash };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function scopesOf(scopes: unknown): AkScope[] {
  return (Array.isArray(scopes) ? scopes : []) as AkScope[];
}

function serializeKey(key: any): AkApiKeyRow {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: scopesOf(key.scopes),
    granularScopes: Array.isArray(key.granularScopes) ? key.granularScopes : [],
    appId: key.appId ?? null,
    environment: key.environment ?? "production",
    ipRestrictions: Array.isArray(key.ipRestrictions) ? key.ipRestrictions : [],
    lastUsedAt: iso(key.lastUsedAt),
    expiresAt: iso(key.expiresAt),
    revoked: Boolean(key.revokedAt),
    revokedAt: iso(key.revokedAt),
    createdBy: {
      id: key.createdBy.id,
      displayName: key.createdBy.profile?.displayName ?? key.createdBy.email,
    },
    createdAt: iso(key.createdAt)!,
  };
}

async function audit(organizationId: string, userId: string, action: string, resourceId: string, metadata: Record<string, unknown> = {}) {
  await prisma.auditLog.create({
    data: { organizationId, userId, action, resourceType: "ApiKey", resourceId, metadata },
  });
}

export async function listApiKeys(userId: string, input: AkApiKeyListQuery = { includeRevoked: false }): Promise<AkApiKeyRow[]> {
  const ctx = await resolveUserContext(userId);
  const keys = await prisma.apiKey.findMany({
    where: { organizationId: ctx.organizationId, ...(input.includeRevoked ? {} : { revokedAt: null }) },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { include: { profile: true } } },
  });
  return keys.map(serializeKey);
}

export async function getApiKey(userId: string, id: string): Promise<AkApiKeyRow> {
  const ctx = await resolveUserContext(userId);
  const key = await prisma.apiKey.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { createdBy: { include: { profile: true } } },
  });
  if (!key) throw AppError.notFound("API key not found");
  return serializeKey(key);
}

export async function createApiKey(userId: string, input: z.infer<typeof CreateApiKeySchema>): Promise<AkApiKeyCreated> {
  const ctx = await resolveUserContext(userId);
  const { plain, prefix, hash } = generateToken();
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86_400_000)
    : null;
  // If an application is requested, verify it belongs to the caller's org.
  let appId: string | null = null;
  if (input.appId) {
    const app = await prisma.developerApp.findFirst({
      where: { id: input.appId, organizationId: ctx.organizationId },
    });
    if (!app) throw AppError.notFound("Application not found");
    appId = app.id;
  }
  const key = await prisma.apiKey.create({
    data: {
      organizationId: ctx.organizationId,
      createdById: userId,
      name: input.name,
      keyPrefix: prefix,
      keyHash: hash,
      scopes: input.scopes as ApiKeyScope[],
      granularScopes: input.granularScopes ?? [],
      appId,
      environment: input.environment ?? "production",
      ipRestrictions: input.ipRestrictions ?? [],
      expiresAt,
    },
  });
  await audit(ctx.organizationId, userId, "admin.apikey.created", key.id, {
    scopes: input.scopes,
    granularScopes: input.granularScopes ?? [],
    appId,
    environment: input.environment ?? "production",
    expiresAt: iso(expiresAt),
  });
  // Plaintext is deliberately returned once and is never persisted.
  return {
    id: key.id,
    name: key.name,
    key: plain,
    keyPrefix: prefix,
    scopes: scopesOf(key.scopes),
    granularScopes: key.granularScopes ?? [],
    environment: key.environment ?? "production",
    expiresAt: iso(key.expiresAt),
    createdAt: iso(key.createdAt)!,
  };
}

export async function updateApiKey(userId: string, id: string, input: z.infer<typeof UpdateApiKeySchema>): Promise<AkApiKeyMutation> {
  const ctx = await resolveUserContext(userId);
  const existing = await prisma.apiKey.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!existing) throw AppError.notFound("API key not found");
  if (existing.revokedAt) throw AppError.conflict("Revoked API keys cannot be changed");
  if (input.revoked === false) throw AppError.badRequest("An active API key is not revoked");
  // Session 120 — renewal path: an expiring (even expired-but-not-revoked)
  // key can be extended from now. Revoked keys remain immutable.
  const expiresAt =
    input.expiresInDays !== undefined
      ? new Date(Date.now() + input.expiresInDays * 86_400_000)
      : undefined;
  // If the app binding changes, verify it belongs to the caller's org.
  if (input.appId !== undefined && input.appId !== null) {
    const app = await prisma.developerApp.findFirst({
      where: { id: input.appId, organizationId: ctx.organizationId },
    });
    if (!app) throw AppError.notFound("Application not found");
  }
  const key = await prisma.apiKey.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.scopes !== undefined ? { scopes: input.scopes as ApiKeyScope[] } : {}),
      ...(input.granularScopes !== undefined ? { granularScopes: input.granularScopes } : {}),
      ...(input.appId !== undefined ? { appId: input.appId } : {}),
      ...(input.environment !== undefined ? { environment: input.environment } : {}),
      ...(input.ipRestrictions !== undefined ? { ipRestrictions: input.ipRestrictions } : {}),
      ...(input.revoked === true ? { revokedAt: new Date() } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    },
  });
  await audit(ctx.organizationId, userId, input.revoked === true ? "admin.apikey.revoked" : "admin.apikey.updated", id, {
    ...(input.name !== undefined ? { nameChanged: true } : {}),
    ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
    ...(input.granularScopes !== undefined ? { granularScopes: input.granularScopes } : {}),
    ...(input.environment !== undefined ? { environment: input.environment } : {}),
    ...(expiresAt !== undefined ? { expiresInDays: input.expiresInDays, expiresAt: iso(expiresAt) } : {}),
  });
  return {
    id: key.id,
    name: key.name,
    scopes: scopesOf(key.scopes),
    granularScopes: key.granularScopes ?? [],
    environment: key.environment ?? "production",
    revoked: Boolean(key.revokedAt),
    revokedAt: iso(key.revokedAt),
    expiresAt: iso(key.expiresAt),
  };
}

/**
 * Session 120 — hard-delete an API key row.
 *
 * Before this session the HTTP DELETE endpoint silently *revoked* instead of
 * deleting, and there was no way to permanently remove a key row — revoked
 * keys accumulated forever. This is the correction path: the row is removed
 * (the token dies immediately), the audit trail keeps `admin.apikey.deleted`,
 * and the usage ledger keeps the key's historical counts with null
 * identifiers rather than dropping them.
 */
export async function deleteApiKey(userId: string, id: string): Promise<{ id: string; deleted: true }> {
  const ctx = await resolveUserContext(userId);
  const existing = await prisma.apiKey.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!existing) throw AppError.notFound("API key not found");
  await prisma.apiKey.delete({ where: { id } });
  await audit(ctx.organizationId, userId, "admin.apikey.deleted", id, {
    wasRevoked: Boolean(existing.revokedAt),
    keyPrefix: existing.keyPrefix,
  });
  return { id, deleted: true };
}

export async function revokeApiKey(userId: string, id: string): Promise<AkApiKeyMutation> {
  return updateApiKey(userId, id, { revoked: true });
}

export async function verifyApiKey(token: string) {
  if (!token?.startsWith("wnd_")) return null;
  const hash = hashToken(token);
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    include: { organization: true, createdBy: true },
  });
  if (!key) return null;
  if (key.revokedAt) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  // The granular scopes are authoritative when present; legacy READ/WRITE/ADMIN
  // remain for backwards compatibility (a key with no granular scopes still
  // works exactly as before).
  return {
    key,
    user: key.createdBy,
    organization: key.organization,
    scopes: scopesOf(key.scopes),
    granularScopes: Array.isArray((key as any).granularScopes) ? (key as any).granularScopes : [],
    appId: (key as any).appId ?? null,
    environment: (key as any).environment ?? "production",
    ipRestrictions: Array.isArray((key as any).ipRestrictions) ? (key as any).ipRestrictions : [],
  };
}
