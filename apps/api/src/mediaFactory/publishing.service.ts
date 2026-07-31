/**
 * Publishing service — Session 77B orchestrator.
 *
 * Real OAuth connect (authorize URL → code exchange → encrypted token store),
 * org-scoped publish jobs with scheduling/retry/audit via the job engine,
 * and platform status reporting. Success is never faked: without OAuth client
 * configuration the connect flow reports PLATFORM CREDENTIALS REQUIRED, and
 * without a connected account publish jobs fail with NOT_CONNECTED and the
 * exact remediation.
 *
 * Tokens: `pub:tok:<uid>:<platform>` (encrypted, user-scoped).
 * Jobs/audit: `pub:<oid>:*` (org-scoped, per cross-cutting rule 2).
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import {
  PLATFORM_ADAPTERS, PUB_PLATFORM_IDS, buildAuthorizeUrl, loadOAuthConfig, isPubPlatform,
  type FetchImpl,
} from "./publishing/platforms.js";
import { saveToken, getToken, deleteToken, connectionStatus } from "./publishing/tokens.js";
import { publishEngine } from "./publishing/publishJobs.js";
import type {
  PubConnectionStatus, PubJob, PubJobStatus, PubOAuthStart, PubPlatformId, PubPlatformInfo, PubPublishInput,
} from "@windels/shared";

export { publishEngine };
export type { PubPlatformId };

const stateKey = (state: string) => `pub:oauth:${state}`;
const STATE_TTL_SEC = 15 * 60;

interface OAuthStateDoc {
  userId: string;
  platform: PubPlatformId;
  redirectUri: string;
  codeVerifier?: string;
}

function defaultRedirectUri(): string {
  return (
    process.env.PUBLISH_REDIRECT_URI ??
    (process.env.PUBLIC_WEB_URL ? `${process.env.PUBLIC_WEB_URL.replace(/\/$/, "")}/media` : "http://localhost:5173/media")
  );
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function orgIdFor(userId: string): Promise<string | null> {
  try {
    const { resolveUserContext } = await import("../services/workspace.service.js");
    const ctx = await resolveUserContext(userId);
    return ctx.organizationId;
  } catch {
    return null; // audit is best-effort; never block token flows on org resolution
  }
}

export const PublishingService = {
  platformIds: PUB_PLATFORM_IDS,

  /** Platform catalog with per-user connection state and platform constraints. */
  async platformsForUser(userId: string): Promise<PubPlatformInfo[]> {
    const out: PubPlatformInfo[] = [];
    for (const id of PUB_PLATFORM_IDS) {
      const c = loadOAuthConfig(id);
      const st = await connectionStatus(userId, id);
      const constraints = PLATFORM_ADAPTERS[id].constraints;
      out.push({
        id,
        configured: !!(c.clientId && c.clientSecret),
        connected: st.connected,
        needsReauth: st.needsReauth,
        scope: c.scope,
        expiresAt: st.expiresAt,
        requiresMedia: constraints.requiresMedia,
        maxTitle: constraints.maxTitle,
        maxDescription: constraints.maxDescription,
        maxMediaMB: constraints.maxMediaMB,
      });
    }
    return out;
  },

  /** Legacy status view (no user in scope) — used by older UI. */
  platforms(): Array<{ id: PubPlatformId; scope: string; configured: boolean }> {
    return PUB_PLATFORM_IDS.map((id) => {
      const c = loadOAuthConfig(id);
      return { id, scope: c.scope, configured: !!(c.clientId && c.clientSecret) };
    });
  },

  /**
   * Begin OAuth: stores a 15-minute state doc (userId, platform, PKCE
   * verifier for X) and returns the provider authorize URL to open.
   */
  async startOAuth(userId: string, platform: PubPlatformId, fetchImpl?: FetchImpl): Promise<PubOAuthStart> {
    if (!isPubPlatform(platform)) throw AppError.badRequest(`Unknown platform ${platform}`, { code: "BAD_PLATFORM" });
    const c = loadOAuthConfig(platform);
    const redirectUri = defaultRedirectUri();
    const state = randomUUID();
    const needsPkce = !!PLATFORM_ADAPTERS[platform].oauth.pkce;
    const pkce = needsPkce ? pkcePair() : null;
    const doc: OAuthStateDoc = { userId, platform, redirectUri, ...(pkce ? { codeVerifier: pkce.verifier } : {}) };
    await redis.set(stateKey(state), JSON.stringify(doc), "EX", STATE_TTL_SEC);

    const oid = await orgIdFor(userId);
    if (oid) await publishEngine.audit(oid, "connect.start", userId, { platform });

    if (!c.clientId || !c.clientSecret) {
      return { state, redirectUri, error: "PLATFORM CREDENTIALS REQUIRED — set the OAuth client id/secret env vars for this platform to enable account connect." };
    }
    return {
      state,
      redirectUri,
      authUrl: buildAuthorizeUrl(platform, { clientId: c.clientId, redirectUri, state, codeChallenge: pkce?.challenge }),
    };
  },

  /**
   * Complete OAuth: validates the one-time state (and that the actor matches
   * the initiator), exchanges the code for tokens, encrypts and stores them.
   */
  async completeOAuth(input: { code: string; state: string }, actorUserId: string, fetchImpl?: FetchImpl): Promise<PubConnectionStatus> {
    const raw = await redis.get(stateKey(input.state));
    if (!raw) throw AppError.badRequest("OAuth state not found or expired — restart the connect flow.", { code: "BAD_STATE" });
    await redis.del(stateKey(input.state)); // one-time use
    const st = JSON.parse(raw) as OAuthStateDoc;
    if (st.userId !== actorUserId) throw AppError.forbidden("OAuth state belongs to a different user");

    const c = loadOAuthConfig(st.platform);
    if (!c.clientId) throw AppError.badRequest("PLATFORM CREDENTIALS REQUIRED — OAuth client not configured.", { code: "MISSING_CREDENTIALS" });
    const oid = await orgIdFor(actorUserId);
    try {
      const tokens = await PLATFORM_ADAPTERS[st.platform].exchangeCode({
        code: input.code,
        redirectUri: st.redirectUri,
        clientId: c.clientId,
        clientSecret: c.clientSecret,
        codeVerifier: st.codeVerifier,
      }, fetchImpl);
      await saveToken(actorUserId, st.platform, tokens);
      if (oid) await publishEngine.audit(oid, "connect.success", actorUserId, { platform: st.platform, detail: tokens.scope });
      return connectionStatus(actorUserId, st.platform);
    } catch (e) {
      if (oid) await publishEngine.audit(oid, "connect.failed", actorUserId, { platform: st.platform, detail: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },

  async disconnect(userId: string, platform: PubPlatformId): Promise<void> {
    if (!isPubPlatform(platform)) throw AppError.badRequest(`Unknown platform ${platform}`, { code: "BAD_PLATFORM" });
    await deleteToken(userId, platform);
    const oid = await orgIdFor(userId);
    if (oid) await publishEngine.audit(oid, "disconnect", userId, { platform });
  },

  async status(userId: string, platform: PubPlatformId): Promise<PubConnectionStatus> {
    if (!isPubPlatform(platform)) throw AppError.badRequest(`Unknown platform ${platform}`, { code: "BAD_PLATFORM" });
    return connectionStatus(userId, platform);
  },

  /** Connected org users see at-a-glance whether any account works. */
  async isConnected(userId: string, platform: PubPlatformId): Promise<boolean> {
    return !!(await getToken(userId, platform));
  },

  /* ── Jobs (org-scoped) ──────────────────────────────────────────── */

  async createPublishJob(oid: string, userId: string, platform: PubPlatformId, input: PubPublishInput) {
    if (!isPubPlatform(platform)) throw AppError.badRequest(`Unknown platform ${platform}`, { code: "BAD_PLATFORM" });
    const connected = await getToken(userId, platform);
    if (!connected) throw AppError.badRequest(`${platform} account not connected — complete OAuth connect first.`, { code: "NOT_CONNECTED" });
    return publishEngine.createJob(oid, userId, platform, input);
  },

  listJobs: (oid: string, opts: { status?: PubJobStatus; platform?: PubPlatformId; limit?: number }) => publishEngine.listJobs(oid, opts),
  getJob: (oid: string, id: string): Promise<PubJob> => publishEngine.getJob(oid, id),
  retryJob: (oid: string, id: string, actor: string) => publishEngine.retryJob(oid, id, actor),
  cancelJob: (oid: string, id: string, actor: string) => publishEngine.cancelJob(oid, id, actor),
  listAudit: (oid: string, limit?: number) => publishEngine.listAudit(oid, limit),
};

export default PublishingService;
