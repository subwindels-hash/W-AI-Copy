/**
 * Session 77B — Publishing pipeline: OAuth token store.
 *
 * Tokens are stored per owner per platform, AES-256-GCM encrypted at rest via
 * the Slice 112 envelope helper (`encryptJson`/`decryptJson`). Two ownership
 * scopes exist:
 *   - user scope: `pub:tok:<uid>:<platform>`   — the account of one user.
 *   - org scope:  `pub:tok:org:<oid>:<platform>` — an org-shared account any
 *     authorized member can publish with (org-shared connections).
 * Connections are never global: a job always resolves the token of its
 * configured scope (`job.tokenScope`, default "user").
 */
import { redisCmd as redis } from "../../db/redis.js";
import { encryptJson, decryptJson, isEncryptedBlob } from "../../security/encryption.js";
import { logger } from "../../config/logger.js";
import {
  PLATFORM_ADAPTERS, loadOAuthConfig, PlatformPublishError, type FetchImpl, type RawTokenSet,
} from "./platforms.js";
import type { PubPlatformId, PubConnectionStatus } from "@windels/shared";

export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  /** ISO expiry (access token). Absent = non-expiring. */
  expiresAt?: string;
  scope?: string;
  tokenType?: string;
  obtainedAt: string;
  /** Set when a refresh attempt failed — connection needs re-auth. */
  revoked?: boolean;
}

const tokKey = (uid: string, p: PubPlatformId) => `pub:tok:${uid}:${p}`;
const orgTokKey = (oid: string, p: PubPlatformId) => `pub:tok:org:${oid}:${p}`;
const REFRESH_SKEW_MS = 90_000;

function buildStoredToken(raw: RawTokenSet, previous?: StoredToken | null): StoredToken {
  return {
    accessToken: raw.accessToken,
    refreshToken: raw.refreshToken ?? previous?.refreshToken,
    expiresAt: raw.expiresInSec ? new Date(Date.now() + raw.expiresInSec * 1000).toISOString() : previous?.expiresAt,
    scope: raw.scope ?? previous?.scope,
    tokenType: raw.tokenType ?? previous?.tokenType,
    obtainedAt: new Date().toISOString(),
  };
}

function readStored<T extends StoredToken>(raw: string): T | null {
  try {
    const parsed = JSON.parse(raw);
    if (isEncryptedBlob(parsed)) return decryptJson<T>(parsed);
    // Legacy plaintext records (pre-encryption deployments) are migrated on next refresh.
    return parsed as T;
  } catch {
    return null;
  }
}

export async function saveToken(userId: string, platform: PubPlatformId, raw: RawTokenSet, previous?: StoredToken | null, kv: Pick<typeof redis, "set" | "get"> = redis): Promise<StoredToken> {
  const stored = buildStoredToken(raw, previous);
  await kv.set(tokKey(userId, platform), JSON.stringify(encryptJson(stored)));
  return stored;
}

export async function getToken(userId: string, platform: PubPlatformId, kv: Pick<typeof redis, "get"> = redis): Promise<StoredToken | null> {
  const raw = await kv.get(tokKey(userId, platform));
  return raw ? readStored<StoredToken>(raw) : null;
}

export async function deleteToken(userId: string, platform: PubPlatformId, kv: Pick<typeof redis, "del"> = redis): Promise<void> {
  await kv.del(tokKey(userId, platform));
}

export async function saveOrgToken(orgId: string, platform: PubPlatformId, raw: RawTokenSet, previous?: StoredToken | null, kv: Pick<typeof redis, "set" | "get"> = redis): Promise<StoredToken> {
  const stored = buildStoredToken(raw, previous);
  await kv.set(orgTokKey(orgId, platform), JSON.stringify(encryptJson(stored)));
  return stored;
}

export async function getOrgToken(orgId: string, platform: PubPlatformId, kv: Pick<typeof redis, "get"> = redis): Promise<StoredToken | null> {
  const raw = await kv.get(orgTokKey(orgId, platform));
  return raw ? readStored<StoredToken>(raw) : null;
}

export async function deleteOrgToken(orgId: string, platform: PubPlatformId, kv: Pick<typeof redis, "del"> = redis): Promise<void> {
  await kv.del(orgTokKey(orgId, platform));
}

export async function connectionStatus(userId: string, platform: PubPlatformId, kv: Pick<typeof redis, "get"> = redis): Promise<PubConnectionStatus> {
  const t = await getToken(userId, platform, kv);
  return toConnectionStatus(t);
}

export async function orgConnectionStatus(orgId: string, platform: PubPlatformId, kv: Pick<typeof redis, "get"> = redis): Promise<PubConnectionStatus> {
  const t = await getOrgToken(orgId, platform, kv);
  return toConnectionStatus(t);
}

function toConnectionStatus(t: StoredToken | null): PubConnectionStatus {
  if (!t) return { connected: false, needsReauth: false, hasRefreshToken: false };
  return {
    connected: !t.revoked,
    needsReauth: !!t.revoked,
    scope: t.scope,
    expiresAt: t.expiresAt,
    hasRefreshToken: !!t.refreshToken,
  };
}

/**
 * Refreshes a stored token when it expires within 90 seconds and rewrites it
 * in place. On refresh failure the stored token is marked revoked so the
 * connection surfaces as "reconnect needed" and jobs fail permanently.
 */
async function refreshIfNeeded(
  stored: StoredToken,
  platform: PubPlatformId,
  key: string,
  kv: Pick<typeof redis, "get" | "set">,
  fetchImpl?: FetchImpl,
): Promise<string> {
  if (stored.revoked) throw new PlatformPublishError("REAUTH_REQUIRED", `${platform} connection was revoked or refresh previously failed. Reconnect the account.`, true);
  const exp = stored.expiresAt ? Date.parse(stored.expiresAt) : Number.POSITIVE_INFINITY;
  if (exp - Date.now() > REFRESH_SKEW_MS) return stored.accessToken;
  if (!stored.refreshToken) {
    if (Number.isFinite(exp)) {
      throw new PlatformPublishError("TOKEN_EXPIRED", `${platform} access token expired and no refresh token is stored. Reconnect the account.`, true);
    }
    return stored.accessToken; // non-expiring token
  }
  const cfg = loadOAuthConfig(platform);
  const adapter = PLATFORM_ADAPTERS[platform];
  try {
    const raw = await adapter.refreshToken({ refreshToken: stored.refreshToken, clientId: cfg.clientId ?? "", clientSecret: cfg.clientSecret }, fetchImpl);
    const saved = buildStoredToken(raw, stored);
    await kv.set(key, JSON.stringify(encryptJson(saved)));
    return saved.accessToken;
  } catch (e) {
    await kv.set(key, JSON.stringify(encryptJson({ ...stored, revoked: true } satisfies StoredToken)));
    logger.warn("publishing token refresh failed", { platform, key: key.replace(/:\w{4,}$/, ":<id>") });
    throw new PlatformPublishError("REFRESH_FAILED", `${platform} token refresh failed${e instanceof Error ? ` — ${e.message}` : ""}. Reconnect the account.`, true);
  }
}

/**
 * Returns a valid access token for a user-scoped connection, refreshing when
 * the stored token expires within 90 seconds. Throws a permanent
 * PlatformPublishError when the account is not connected or the refresh fails.
 */
export async function ensureFreshToken(
  userId: string,
  platform: PubPlatformId,
  kv: Pick<typeof redis, "get" | "set"> = redis,
  fetchImpl?: FetchImpl,
): Promise<string> {
  const t = await getToken(userId, platform, kv);
  if (!t) throw new PlatformPublishError("NOT_CONNECTED", `No connected ${platform} account for this user. Complete OAuth connect first.`, true);
  return refreshIfNeeded(t, platform, tokKey(userId, platform), kv, fetchImpl);
}

/** Same contract as ensureFreshToken but for an org-shared (org-scoped) connection. */
export async function ensureFreshOrgToken(
  orgId: string,
  platform: PubPlatformId,
  kv: Pick<typeof redis, "get" | "set"> = redis,
  fetchImpl?: FetchImpl,
): Promise<string> {
  const t = await getOrgToken(orgId, platform, kv);
  if (!t) throw new PlatformPublishError("NOT_CONNECTED", `No org-shared ${platform} account connected for this organization. An admin must connect one first.`, true);
  return refreshIfNeeded(t, platform, orgTokKey(orgId, platform), kv, fetchImpl);
}
