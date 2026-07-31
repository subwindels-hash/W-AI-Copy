/**
 * Session 77B — Publishing pipeline: OAuth token store.
 *
 * Tokens are stored per user per platform under `pub:tok:<uid>:<platform>`,
 * AES-256-GCM encrypted at rest via the Slice 112 envelope helper
 * (`encryptJson`/`decryptJson`). Connections are never global: a job always
 * resolves the token of its owning user.
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
const REFRESH_SKEW_MS = 90_000;

export async function saveToken(userId: string, platform: PubPlatformId, raw: RawTokenSet, previous?: StoredToken | null, kv: Pick<typeof redis, "set" | "get"> = redis): Promise<StoredToken> {
  const stored: StoredToken = {
    accessToken: raw.accessToken,
    refreshToken: raw.refreshToken ?? previous?.refreshToken,
    expiresAt: raw.expiresInSec ? new Date(Date.now() + raw.expiresInSec * 1000).toISOString() : previous?.expiresAt,
    scope: raw.scope ?? previous?.scope,
    tokenType: raw.tokenType ?? previous?.tokenType,
    obtainedAt: new Date().toISOString(),
  };
  await kv.set(tokKey(userId, platform), JSON.stringify(encryptJson(stored)));
  return stored;
}

export async function getToken(userId: string, platform: PubPlatformId, kv: Pick<typeof redis, "get"> = redis): Promise<StoredToken | null> {
  const raw = await kv.get(tokKey(userId, platform));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isEncryptedBlob(parsed)) return decryptJson<StoredToken>(parsed);
    // Legacy plaintext records (pre-encryption deployments) are migrated on next refresh.
    return parsed as StoredToken;
  } catch {
    return null;
  }
}

export async function deleteToken(userId: string, platform: PubPlatformId, kv: Pick<typeof redis, "del"> = redis): Promise<void> {
  await kv.del(tokKey(userId, platform));
}

export async function connectionStatus(userId: string, platform: PubPlatformId, kv: Pick<typeof redis, "get"> = redis): Promise<PubConnectionStatus> {
  const t = await getToken(userId, platform, kv);
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
 * Returns a valid access token, refreshing when the stored token expires
 * within 90 seconds. Throws a permanent PlatformPublishError when the account
 * is not connected or the refresh fails (job must fail, not retry forever).
 */
export async function ensureFreshToken(
  userId: string,
  platform: PubPlatformId,
  kv: Pick<typeof redis, "get" | "set"> = redis,
  fetchImpl?: FetchImpl,
): Promise<string> {
  const t = await getToken(userId, platform, kv);
  if (!t) throw new PlatformPublishError("NOT_CONNECTED", `No connected ${platform} account for this user. Complete OAuth connect first.`, true);
  if (t.revoked) throw new PlatformPublishError("REAUTH_REQUIRED", `${platform} connection was revoked or refresh previously failed. Reconnect the account.`, true);
  const exp = t.expiresAt ? Date.parse(t.expiresAt) : Number.POSITIVE_INFINITY;
  if (exp - Date.now() > REFRESH_SKEW_MS) return t.accessToken;
  if (!t.refreshToken) {
    if (Number.isFinite(exp)) {
      throw new PlatformPublishError("TOKEN_EXPIRED", `${platform} access token expired and no refresh token is stored. Reconnect the account.`, true);
    }
    return t.accessToken; // non-expiring token
  }
  const cfg = loadOAuthConfig(platform);
  const adapter = PLATFORM_ADAPTERS[platform];
  try {
    const raw = await adapter.refreshToken({ refreshToken: t.refreshToken, clientId: cfg.clientId ?? "", clientSecret: cfg.clientSecret }, fetchImpl);
    const saved = await saveToken(userId, platform, raw, t, kv);
    logger.info("publishing token refreshed", { platform, userId });
    return saved.accessToken;
  } catch (e) {
    // Mark the connection revoked in-place (saveToken always clears `revoked`
    // because a successful save implies a healthy token).
    await kv.set(tokKey(userId, platform), JSON.stringify(encryptJson({ ...t, revoked: true } satisfies StoredToken)));
    logger.warn("publishing token refresh failed", { platform, userId, err: e instanceof Error ? e.message : String(e) });
    throw new PlatformPublishError("REFRESH_FAILED", `${platform} token refresh failed${e instanceof Error ? ` — ${e.message}` : ""}. Reconnect the account.`, true);
  }
}
