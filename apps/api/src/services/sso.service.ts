import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import { z } from "zod";
import { encryptString, decryptString, maskSecret, isEncryptedBlob, EncryptedBlob } from "../security/encryption.js";

export const SsoConfigSchema = z.object({
  provider: z.enum(["saml", "oidc", "google", "microsoft"]),
  entryPoint: z.string().url().optional(),
  issuer: z.string().optional(),
  cert: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  domains: z.array(z.string()).default([]),
  enabled: z.boolean().default(false),
});

function wrapSecret(s: string | null | undefined): string | null {
  if (!s) return null;
  if (isEncryptedBlob(s)) return s as unknown as string; // legacy already-encrypted JSON string
  if (typeof s === "string" && s.startsWith("enc.v1|")) return s;
  const blob = encryptString(s);
  // Serialize envelope with a prefix so we can detect legacy plaintext.
  return "enc.v1|" + JSON.stringify(blob);
}
function unwrapSecret(s: any): string | null {
  if (!s) return null;
  if (typeof s === "string") {
    if (s.startsWith("enc.v1|")) {
      try {
        const blob = JSON.parse(s.slice("enc.v1|".length));
        return decryptString(blob);
      } catch { return null; }
    }
    return s; // legacy plaintext
  }
  if (isEncryptedBlob(s)) return decryptString(s);
  return null;
}

export async function getSsoConfig(userId: string) {
  const ctx = await resolveUserContext(userId);
  const cfg = await prisma.ssoConfig.findUnique({ where: { organizationId: ctx.organizationId } });
  if (!cfg) return { configured: false, provider: null, domains: [], enabled: false };
  const clientSecret = unwrapSecret((cfg as any).clientSecret);
  const cert = unwrapSecret((cfg as any).cert);
  return {
    configured: true,
    id: cfg.id, provider: cfg.provider, domains: cfg.domains, enabled: cfg.enabled,
    hasEntryPoint: !!cfg.entryPoint, hasCert: !!cert,
    hasClientId: !!cfg.clientId, hasClientSecret: !!clientSecret,
    clientSecretMasked: clientSecret ? maskSecret(clientSecret) : null,
  };
}

export async function upsertSsoConfig(userId: string, input: z.infer<typeof SsoConfigSchema>) {
  const ctx = await resolveUserContext(userId);
  const actor = await prisma.user.findUnique({ where: { id: userId } });
  if (!actor || (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN")) {
    throw AppError.forbidden("Only admins can configure SSO");
  }
  const existing = await prisma.ssoConfig.findUnique({ where: { organizationId: ctx.organizationId } });

  const data: any = {
    provider: input.provider,
    entryPoint: input.entryPoint ?? null,
    issuer: input.issuer ?? null,
    cert: input.cert ? wrapSecret(input.cert) : (existing ? undefined : null),
    clientId: input.clientId ?? null,
    clientSecret: input.clientSecret ? wrapSecret(input.clientSecret) : undefined,
    domains: input.domains,
    enabled: input.enabled,
  };

  if (existing) {
    // Don't overwrite secrets with null/empty if not provided
    if (!input.clientSecret) {
      // keep existing
      delete data.clientSecret;
    }
    if (!input.cert) delete data.cert;
    return prisma.ssoConfig.update({ where: { organizationId: ctx.organizationId }, data });
  }
  // Creating fresh — null out undefined secrets
  if (data.clientSecret === undefined) data.clientSecret = null;
  if (data.cert === undefined) data.cert = null;
  return prisma.ssoConfig.create({ data: { organizationId: ctx.organizationId, ...data } });
}

export async function disableSso(userId: string) {
  const ctx = await resolveUserContext(userId);
  const actor = await prisma.user.findUnique({ where: { id: userId } });
  if (!actor || (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN")) throw AppError.forbidden("Only admins can disable SSO");
  await prisma.ssoConfig.update({ where: { organizationId: ctx.organizationId }, data: { enabled: false } });
}

// Lookup by domain (used on login page to redirect)
export async function lookupSsoByDomain(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  const cfg = await prisma.ssoConfig.findFirst({
    where: { enabled: true, domains: { has: domain } },
  });
  if (!cfg) return null;
  return { provider: cfg.provider, entryPoint: cfg.entryPoint, clientId: cfg.clientId };
}

/** Internal helper for SSO flow: read full decrypted config. */
export async function getSsoConfigForAuth(organizationId: string) {
  const cfg = await prisma.ssoConfig.findUnique({ where: { organizationId } });
  if (!cfg) return null;
  return {
    ...cfg,
    clientSecret: unwrapSecret((cfg as any).clientSecret),
    cert: unwrapSecret((cfg as any).cert),
  };
}
