/**
 * Session 77B completion pass — publish-job webhook status sync.
 *
 * Platforms (YouTube etc.) accept a post then process it asynchronously
 * ("processing" → "available", or sometimes "rejected"). This module lets an
 * org register a per-platform callback endpoint + HMAC secret, verify inbound
 * platform notifications (sha256 via `X-Windels-Signature`, or sha1 via
 * `X-Hub-Signature` for PubSubHubbub-style hubs), and sync the update onto the
 * matching publish job via the job engine's `applyPlatformWebhook`.
 *
 * Callback URL (returned at registration, includes ?oid=<orgId>):
 *   POST {PUBLISH_WEBHOOK_BASE_URL}/media-factory/publishing/webhooks/:platform/callback?oid=<orgId>
 *
 * Body (JSON): { postId|videoId, status: processing|processed|available|uploaded|failed|rejected, reason?, availableAt? }
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { redisCmd as redis } from "../../db/redis.js";
import { encryptJson, decryptJson, isEncryptedBlob } from "../../security/encryption.js";
import type { PubPlatformCallbackUpdate, PubPlatformId, PubWebhookConfig, PubWebhookRegistration } from "@windels/shared";

export type WebhookKv = Pick<typeof redis, "get" | "set" | "del">;

const whKey = (oid: string, p: PubPlatformId) => `pub:${oid}:wh:${p}`;

/** Public base of the API the platform hub must be able to reach. */
export function webhookBaseUrl(): string {
  return (
    process.env.PUBLISH_WEBHOOK_BASE_URL ??
    (process.env.PUBLIC_API_URL ? process.env.PUBLIC_API_URL.replace(/\/$/, "") : "http://localhost:4000/api/v1")
  );
}

/**
 * Registers (or rotates) the org's webhook secret + callback URL for a
 * platform. The full secret is returned exactly once; subsequent reads via
 * `getWebhookConfig` return it too (callers must mask before sending to the
 * client). Stored AES-256-GCM encrypted, consistent with OAuth tokens.
 */
export async function registerWebhook(oid: string, platform: PubPlatformId, kv: WebhookKv = redis): Promise<PubWebhookRegistration> {
  const secret = randomBytes(32).toString("hex");
  const callbackUrl = `${webhookBaseUrl()}/media-factory/publishing/webhooks/${platform}/callback?oid=${encodeURIComponent(oid)}`;
  const cfg: PubWebhookConfig = { platform, callbackUrl, secret, enabled: true, createdAt: new Date().toISOString() };
  await kv.set(whKey(oid, platform), JSON.stringify(encryptJson(cfg)));
  return { ...cfg };
}

export async function getWebhookConfig(oid: string, platform: PubPlatformId, kv: Pick<typeof redis, "get"> = redis): Promise<PubWebhookConfig | null> {
  const raw = await kv.get(whKey(oid, platform));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isEncryptedBlob(parsed) ? decryptJson<PubWebhookConfig>(parsed) : (parsed as PubWebhookConfig);
  } catch {
    return null;
  }
}

/** Lists the org's webhook configs with the secret masked (last 4 hex chars). */
export async function listWebhooks(oid: string, kv: Pick<typeof redis, "get"> = redis, platforms: readonly PubPlatformId[]): Promise<PubWebhookConfig[]> {
  const out: PubWebhookConfig[] = [];
  for (const p of platforms) {
    const cfg = await getWebhookConfig(oid, p, kv);
    if (!cfg) continue;
    out.push({ ...cfg, secret: `••••${cfg.secret.slice(-4)}` });
  }
  return out;
}

export async function deleteWebhook(oid: string, platform: PubPlatformId, kv: WebhookKv = redis): Promise<void> {
  await kv.del(whKey(oid, platform));
}

/**
 * Constant-time HMAC verification of an inbound platform callback.
 * Accepts `X-Windels-Signature: sha256=<hex>` (our generic format) or
 * `X-Hub-Signature: sha1=<hex>` (PubSubHubbub-compatible).
 */
export function verifySignature(secret: string, rawBody: Buffer, headers: Record<string, unknown>): boolean {
  const provided = String(headers["x-windels-signature"] ?? headers["x-hub-signature"] ?? "");
  if (!provided) return false;
  const [algoRaw, hex] = provided.split("=", 2);
  const algo = algoRaw === "sha1" ? "sha1" : "sha256";
  const digest = createHmac(algo, secret).update(rawBody).digest();
  const given = Buffer.from(hex ?? "", "hex");
  return given.length === digest.length && timingSafeEqual(given, digest);
}

/** Org id for a callback: `?oid=` query param first, `X-Windels-Org` header second. */
export function resolveCallbackOrgId(query: Record<string, unknown>, headers: Record<string, unknown>): string | null {
  const q = typeof query.oid === "string" && query.oid.trim() ? query.oid.trim() : null;
  if (q) return q;
  const h = typeof headers["x-windels-org"] === "string" && headers["x-windels-org"].trim() ? headers["x-windels-org"].trim() : null;
  return h;
}

/** Narrow a parsed callback body to the typed update (route validates shape with Zod). */
export function toCallbackUpdate(body: PubPlatformCallbackUpdate): PubPlatformCallbackUpdate {
  return body;
}
