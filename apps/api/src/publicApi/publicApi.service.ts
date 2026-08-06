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
  const key = await prisma.apiKey.create({
    data: {
      organizationId: ctx.organizationId,
      createdById: userId,
      name: input.name,
      keyPrefix: prefix,
      keyHash: hash,
      scopes: input.scopes as ApiKeyScope[],
      expiresAt,
    },
  });
  await audit(ctx.organizationId, userId, "admin.apikey.created", key.id, { scopes: input.scopes, expiresAt: iso(expiresAt) });
  // Plaintext is deliberately returned once and is never persisted.
  return { id: key.id, name: key.name, key: plain, keyPrefix: prefix, scopes: scopesOf(key.scopes), expiresAt: iso(key.expiresAt), createdAt: iso(key.createdAt)! };
}

export async function updateApiKey(userId: string, id: string, input: z.infer<typeof UpdateApiKeySchema>): Promise<AkApiKeyMutation> {
  const ctx = await resolveUserContext(userId);
  const existing = await prisma.apiKey.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!existing) throw AppError.notFound("API key not found");
  if (existing.revokedAt) throw AppError.conflict("Revoked API keys cannot be changed");
  if (input.revoked === false) throw AppError.badRequest("An active API key is not revoked");
  const key = await prisma.apiKey.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.scopes !== undefined ? { scopes: input.scopes as ApiKeyScope[] } : {}),
      ...(input.revoked === true ? { revokedAt: new Date() } : {}),
    },
  });
  await audit(ctx.organizationId, userId, input.revoked === true ? "admin.apikey.revoked" : "admin.apikey.updated", id, {
    ...(input.name !== undefined ? { nameChanged: true } : {}),
    ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
  });
  return { id: key.id, name: key.name, scopes: scopesOf(key.scopes), revoked: Boolean(key.revokedAt), revokedAt: iso(key.revokedAt) };
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
  return { key, user: key.createdBy, organization: key.organization, scopes: scopesOf(key.scopes) };
}
