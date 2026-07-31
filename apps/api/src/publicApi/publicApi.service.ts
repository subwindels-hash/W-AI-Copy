import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "../services/workspace.service.js";
import { z } from "zod";
import { ApiKeyScope } from "@prisma/client";

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(["READ", "WRITE", "ADMIN"])).default(["READ"]),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export const UpdateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.enum(["READ", "WRITE", "ADMIN"])).optional(),
  revoked: z.boolean().optional(),
});

function generateToken(): { plain: string; prefix: string; hash: string } {
  const buf = randomBytes(24);
  const plain = `wnd_${buf.toString("base64url")}`;
  const prefix = plain.slice(0, 11);
  const hash = createHash("sha256").update(plain).digest("hex");
  return { plain, prefix, hash };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function listApiKeys(userId: string) {
  const ctx = await resolveUserContext(userId);
  const keys = await prisma.apiKey.findMany({
    where: { organizationId: ctx.organizationId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { include: { profile: true } } },
  });
  return keys.map((k) => ({
    id: k.id, name: k.name, keyPrefix: k.keyPrefix,
    scopes: k.scopes,
    lastUsedAt: k.lastUsedAt, expiresAt: k.expiresAt,
    createdBy: { id: k.createdBy.id, displayName: k.createdBy.profile?.displayName ?? k.createdBy.email },
    createdAt: k.createdAt,
  }));
}

export async function createApiKey(userId: string, input: z.infer<typeof CreateApiKeySchema>) {
  const ctx = await resolveUserContext(userId);
  const { plain, prefix, hash } = generateToken();
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86_400_000)
    : null;
  const k = await prisma.apiKey.create({
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
  // One-time display of the plaintext key
  return { id: k.id, name: k.name, key: plain, keyPrefix: prefix, scopes: k.scopes, expiresAt: k.expiresAt, createdAt: k.createdAt };
}

export async function revokeApiKey(userId: string, id: string) {
  const ctx = await resolveUserContext(userId);
  const existing = await prisma.apiKey.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!existing) throw AppError.notFound("API key not found");
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
}

export async function verifyApiKey(token: string) {
  if (!token?.startsWith("wnd_")) return null;
  const hash = createHash("sha256").update(token).digest("hex");
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    include: { organization: true, createdBy: true },
  });
  if (!key) return null;
  if (key.revokedAt) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { key, user: key.createdBy, organization: key.organization, scopes: key.scopes };
}
