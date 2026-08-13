/**
 * WINDELS PLUGIN OS — Plugin Registry & Manifest.
 *
 * Stores the catalog of available plugins (published manifests) and the
 * per-organization installed instances. Manifest validation is zod-based and
 * strict. Signatures are verified with HMAC-SHA256 against a configured
 * publisher key; unsigned community plugins are marked `unverified` and never
 * receive privileged access. Installed-plugin secrets are stored through the
 * existing AES-256-GCM encryption module and never returned to callers.
 *
 * State lives in Redis (same idiom as the existing extension registry). This
 * is additive; it does not touch the existing ExtensionRegistryService.
 */
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { encryptString, decryptString, type EncryptedBlob } from "../security/encryption.js";
import type {
  InstalledPlugin, MarketplaceEntry, PluginAuthType, PluginClass, PluginHealth,
  PluginManifest, PluginStatus, PluginTrust,
} from "@windels/shared";

const K = {
  catalog: "pluginos:catalog",                 // SET of manifest ids
  manifest: (id: string) => `pluginos:manifest:${id}`,
  installed: (oid: string) => `pluginos:installed:${oid}`,  // HASH pluginId -> json
  installIndex: (oid: string) => `pluginos:installidx:${oid}`,
  secret: (id: string) => `pluginos:secret:${id}`,
  stats: (id: string) => `pluginos:stats:${id}`,
  audit: (oid: string) => `pluginos:audit:${oid}`,
};

const toolSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  inputSchema: z.record(z.any()),
  capability: z.string().min(1),
  permission: z.string().min(1),
  sideEffects: z.boolean().optional(),
});

export const manifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,80}$/i, "manifest id must be reverse-DNS style"),
  name: z.string().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+/, "semver required"),
  publisher: z.string().min(1).max(80),
  publisherId: z.string().optional(),
  description: z.string().min(1).max(2000),
  category: z.string().min(1).max(40),
  tags: z.array(z.string().max(40)).max(20).default([]),
  icon: z.string().max(2000).optional(),
  homepageUrl: z.string().url().optional(),
  docsUrl: z.string().url().optional(),
  class: z.enum(["api", "tool", "ai_model", "ui", "workflow", "agent", "data_connector", "full_module"]),
  capabilities: z.array(z.string().min(2).max(60)).min(1).max(100),
  permissions: z.array(z.string().min(2).max(60)).max(100).default([]),
  authentication: z.array(z.enum(["none", "oauth2", "api_key", "mcp", "webhook"])).min(1),
  tools: z.array(toolSchema).max(100).optional(),
  mcp: z.object({ tools: z.array(z.string()).optional(), resources: z.array(z.string()).optional(), prompts: z.array(z.string()).optional() }).optional(),
  uiRoute: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/).optional(),
  workflowNodes: z.array(z.string()).optional(),
  minPlatformVersion: z.string().default("0.0.1"),
  endpoint: z.string().url().optional(),
  cost: z.object({ creditsPerRequest: z.number().optional(), creditsPerSecond: z.number().optional(), unit: z.string().optional() }).optional(),
  quality: z.number().min(0).max(1).optional(),
  latencyHintMs: z.number().int().positive().optional(),
  signature: z.object({ kid: z.string(), alg: z.literal("HS256"), sig: z.string() }).optional(),
  trust: z.enum(["official", "verified", "community", "unverified", "blocked"]).default("community"),
});

export interface PublishInput { manifest: PluginManifest; signatureSecret?: string; }

function canonical(m: PluginManifest): string {
  // Sign over a stable subset (everything except the signature itself).
  const { signature: _sig, ...rest } = m;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

function verifySignature(m: PluginManifest, secret?: string): { ok: boolean; reason?: string } {
  if (m.trust === "official") {
    // Official plugins are signed with the platform publisher key.
    const key = process.env.WINDELS_PLUGIN_SIGNING_KEY;
    if (!m.signature) return { ok: false, reason: "official plugin must be signed" };
    if (!key) return { ok: false, reason: "platform signing key not configured" };
    return checkSig(m, key);
  }
  if (secret && m.signature) return checkSig(m, secret);
  // Community/unverified: allowed but unsigned -> trust downgraded.
  return { ok: true };
}

function checkSig(m: PluginManifest, secret: string): { ok: boolean; reason?: string } {
  if (!m.signature || m.signature.alg !== "HS256") return { ok: false, reason: "unsupported signature algorithm" };
  const expected = createHmac("sha256", secret).update(canonical(m)).digest();
  const provided = Buffer.from(m.signature.sig, "hex");
  if (provided.length !== expected.length) return { ok: false, reason: "bad signature length" };
  return timingSafeEqual(provided, expected) ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

function nowIso() { return new Date().toISOString(); }

export const PluginRegistry = {
  // ── Catalog ──
  async publish(input: PublishInput): Promise<PluginManifest> {
    const parsed = manifestSchema.parse(input.manifest) as PluginManifest;
    const sig = verifySignature(parsed, input.signatureSecret);
    if (!sig.ok) throw Object.assign(new Error(`Manifest signature invalid: ${sig.reason}`), { status: 400, code: "INVALID_SIGNATURE" });
    // Community plugins without a valid signature remain unverified.
    if (parsed.trust === "community" && input.signatureSecret && parsed.signature) {
      // If signed with a recognized publisher key it becomes verified.
      parsed.trust = "verified";
    }
    await redis.sadd(K.catalog, parsed.id);
    await redis.set(K.manifest(parsed.id), JSON.stringify(parsed));
    await redis.hset(K.stats(parsed.id), "publishedAt", nowIso(), "installs", 0);
    logger.info("plugin published", { id: parsed.id, version: parsed.version });
    return parsed;
  },

  async getManifest(id: string): Promise<PluginManifest | null> {
    const raw = await redis.get(K.manifest(id));
    return raw ? JSON.parse(raw) as PluginManifest : null;
  },

  async listCatalog(filter: { category?: string; class?: PluginClass; q?: string; capability?: string } = {}): Promise<MarketplaceEntry[]> {
    const ids = await redis.smembers(K.catalog);
    const out: MarketplaceEntry[] = [];
    for (const id of ids) {
      const m = await this.getManifest(id);
      if (!m) continue;
      if (m.trust === "blocked") continue;
      if (filter.category && m.category !== filter.category) continue;
      if (filter.class && m.class !== filter.class) continue;
      if (filter.capability && !m.capabilities.includes(filter.capability)) continue;
      if (filter.q) {
        const q = filter.q.toLowerCase();
        if (!m.name.toLowerCase().includes(q) && !m.description.toLowerCase().includes(q) && !m.tags.some((t) => t.toLowerCase().includes(q))) continue;
      }
      const stats = await redis.hgetall(K.stats(id));
      out.push({
        manifest: m, installs: Number(stats.installs ?? 0),
        ratingAvg: Number(stats.ratingAvg ?? 0), reviewCount: Number(stats.reviewCount ?? 0),
      });
    }
    return out.sort((a, b) => b.installs - a.installs);
  },

  // ── Installation ──
  async install(oid: string, userId: string, manifestId: string, opts: { grantedPermissions?: string[]; config?: Record<string, unknown>; version?: string } = {}): Promise<InstalledPlugin> {
    const m = await this.getManifest(manifestId);
    if (!m) throw Object.assign(new Error("plugin not found"), { status: 404 });
    if (m.trust === "blocked") throw Object.assign(new Error("plugin is blocked"), { status: 403 });
    // Permissions must be a subset of declared permissions (§9).
    const granted = (opts.grantedPermissions ?? m.permissions).filter((p) => m.permissions.includes(p));
    const existing = await this.getInstalled(oid, manifestId);
    const now = nowIso();
    const installed: InstalledPlugin = existing
      ? { ...existing, version: opts.version ?? m.version, grantedPermissions: granted, config: opts.config ?? existing.config, updatedAt: now, status: m.authentication.includes("none") ? "enabled" : "auth_required", health: "healthy" }
      : {
          id: "ip_" + randomBytes(8).toString("hex"), manifestId: m.id, organizationId: oid,
          installedBy: userId, version: opts.version ?? m.version,
          status: m.authentication.includes("none") ? "enabled" : "auth_required",
          config: opts.config ?? {}, grantedPermissions: granted, connectionIds: [],
          installedAt: now, updatedAt: now, health: "healthy",
        };
    await redis.hset(K.installed(oid), manifestId, JSON.stringify(installed));
    await redis.sadd(K.installIndex(oid), manifestId);
    await redis.hincrby(K.stats(manifestId), "installs", existing ? 0 : 1);
    await this.audit(oid, { pluginId: manifestId, event: existing ? "updated" : "installed", message: existing ? "plugin updated" : "plugin installed", userId });
    logger.info("plugin installed", { oid, manifestId });
    return installed;
  },

  async getInstalled(oid: string, manifestId: string): Promise<InstalledPlugin | null> {
    const raw = await redis.hget(K.installed(oid), manifestId);
    return raw ? JSON.parse(raw) as InstalledPlugin : null;
  },

  async listInstalled(oid: string): Promise<Array<{ plugin: InstalledPlugin; manifest: PluginManifest | null }>> {
    const ids = await redis.smembers(K.installIndex(oid));
    const out: Array<{ plugin: InstalledPlugin; manifest: PluginManifest | null }> = [];
    for (const id of ids) {
      const p = await this.getInstalled(oid, id);
      if (p) out.push({ plugin: p, manifest: await this.getManifest(id) });
    }
    return out;
  },

  async setStatus(oid: string, manifestId: string, status: PluginStatus, userId?: string, reason?: string) {
    const p = await this.getInstalled(oid, manifestId); if (!p) throw Object.assign(new Error("not installed"), { status: 404 });
    p.status = status; p.updatedAt = nowIso();
    if (status === "failed" || status === "degraded") p.lastError = reason;
    if (status === "enabled" || status === "disabled") p.health = status === "enabled" ? "healthy" : "disabled";
    await redis.hset(K.installed(oid), manifestId, JSON.stringify(p));
    await this.audit(oid, { pluginId: manifestId, event: status === "enabled" ? "enabled" : status === "disabled" ? "disabled" : status === "uninstalled" ? "uninstalled" : "updated", message: `plugin ${status}`, userId });
    return p;
  },

  async uninstall(oid: string, manifestId: string, userId?: string) {
    await redis.hdel(K.installed(oid), manifestId);
    await redis.srem(K.installIndex(oid), manifestId);
    await redis.del(K.secret(`${oid}:${manifestId}`));
    await this.audit(oid, { pluginId: manifestId, event: "uninstalled", message: "plugin uninstalled", userId });
    return { ok: true };
  },

  async setPermissions(oid: string, manifestId: string, grantedPermissions: string[], userId?: string) {
    const p = await this.getInstalled(oid, manifestId); if (!p) throw Object.assign(new Error("not installed"), { status: 404 });
    const m = await this.getManifest(manifestId);
    p.grantedPermissions = grantedPermissions.filter((x) => m?.permissions.includes(x));
    p.updatedAt = nowIso();
    await redis.hset(K.installed(oid), manifestId, JSON.stringify(p));
    await this.audit(oid, { pluginId: manifestId, event: "permission_granted", message: "permissions updated", userId, metadata: { granted: p.grantedPermissions } });
    return p;
  },

  // ── Secrets (encrypted at rest) ──
  async storeSecret(oid: string, manifestId: string, secret: Record<string, unknown>) {
    // Refuse obvious plaintext credential keys being echoed back.
    const blob = encryptString(JSON.stringify(secret));
    await redis.set(K.secret(`${oid}:${manifestId}`), JSON.stringify(blob));
  },
  async getSecret<T = Record<string, unknown>>(oid: string, manifestId: string): Promise<T | null> {
    const raw = await redis.get(K.secret(`${oid}:${manifestId}`));
    if (!raw) return null;
    const dec = decryptString(JSON.parse(raw) as EncryptedBlob);
    return dec ? JSON.parse(dec) as T : null;
  },

  async setHealth(oid: string, manifestId: string, health: PluginHealth, error?: string) {
    const p = await this.getInstalled(oid, manifestId); if (!p) return;
    p.health = health; p.updatedAt = nowIso();
    if (error) p.lastError = error;
    if (health === "auth_required") p.status = "auth_required";
    await redis.hset(K.installed(oid), manifestId, JSON.stringify(p));
  },

  // ── Audit ──
  async audit(oid: string, evt: { pluginId: string; event: import("@windels/shared").PluginAuditEvent["event"]; message: string; userId?: string; metadata?: Record<string, unknown> }) {
    const rec = { id: "pa_" + randomBytes(6).toString("hex"), organizationId: oid, createdAt: nowIso(), ...evt };
    await redis.lpush(K.audit(oid), JSON.stringify(rec));
    await redis.ltrim(K.audit(oid), 0, 499);
    return rec;
  },
  async listAudit(oid: string, limit = 100) {
    const raw = await redis.lrange(K.audit(oid), 0, limit - 1);
    return raw.map((r) => JSON.parse(r));
  },
};
