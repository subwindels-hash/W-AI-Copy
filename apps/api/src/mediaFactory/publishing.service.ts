/**
 * Publishing service — Session 77B orchestrator.
 *
 * Real OAuth connect (authorize URL → code exchange → encrypted token store),
 * org-scoped publish jobs with scheduling/retry/audit via the job engine,
 * platform status reporting, and (completion pass) webhook status sync,
 * browser-side direct upload, and org-shared connections. Success is never
 * faked: without OAuth client configuration the connect flow reports PLATFORM
 * CREDENTIALS REQUIRED, and without a connected account publish jobs fail with
 * NOT_CONNECTED and the exact remediation.
 *
 * Tokens: `pub:tok:<uid>:<platform>` (user scope) + `pub:tok:org:<oid>:<platform>`
 * (org scope, org-shared connections).
 * Jobs/audit: `pub:<oid>:*` (org-scoped, per cross-cutting rule 2).
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import {
  PLATFORM_ADAPTERS, PUB_PLATFORM_IDS, buildAuthorizeUrl, loadOAuthConfig, isPubPlatform,
  type FetchImpl,
} from "./publishing/platforms.js";
import {
  saveToken, getToken, deleteToken, connectionStatus,
  saveOrgToken, getOrgToken, deleteOrgToken, orgConnectionStatus,
} from "./publishing/tokens.js";
import { publishEngine } from "./publishing/publishJobs.js";
import { registerWebhook, getWebhookConfig, listWebhooks, deleteWebhook } from "./publishing/webhooks.js";
import { saveUpload as persistUpload, listUploads, deleteUploadFile, MEDIA_CACHE_DIR, type UploadDeps } from "./publishing/uploads.js";
import type {
  PubConnectionStatus, PubJob, PubJobStatus, PubOAuthStart, PubPlatformCallbackUpdate,
  PubPlatformId, PubPlatformInfo, PubPublishInput, PubTokenScope, PubUploadRecord, PubWebhookConfig,
  PubWebhookRegistration,
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
  /** "user" (default) or "org" — where the exchanged token is stored. */
  scope?: PubTokenScope;
  /** Resolved at connect start for org scope. */
  orgId?: string;
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

  /** Platform catalog with per-user + org-shared connection state and platform constraints. */
  async platformsForUser(userId: string): Promise<PubPlatformInfo[]> {
    const oid = await orgIdFor(userId);
    const out: PubPlatformInfo[] = [];
    for (const id of PUB_PLATFORM_IDS) {
      const c = loadOAuthConfig(id);
      const st = await connectionStatus(userId, id);
      const ost = oid ? await orgConnectionStatus(oid, id) : null;
      const constraints = PLATFORM_ADAPTERS[id].constraints;
      out.push({
        id,
        configured: !!(c.clientId && c.clientSecret),
        connected: st.connected,
        needsReauth: st.needsReauth,
        orgConnected: !!ost?.connected,
        orgNeedsReauth: !!ost?.needsReauth,
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

  /** Org-shared connection status for every platform (org-scoped tokens). */
  async orgConnections(oid: string): Promise<Record<PubPlatformId, PubConnectionStatus>> {
    const out = {} as Record<PubPlatformId, PubConnectionStatus>;
    for (const id of PUB_PLATFORM_IDS) out[id] = await orgConnectionStatus(oid, id);
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
   * Begin OAuth: stores a 15-minute state doc (userId, platform, scope, PKCE
   * verifier for X) and returns the provider authorize URL to open. Scope
   * "org" stores the exchanged token org-wide (org-shared connection).
   */
  async startOAuth(userId: string, platform: PubPlatformId, opts: { scope?: PubTokenScope } = {}, fetchImpl?: FetchImpl): Promise<PubOAuthStart> {
    if (!isPubPlatform(platform)) throw AppError.badRequest(`Unknown platform ${platform}`, { code: "BAD_PLATFORM" });
    const scope: PubTokenScope = opts.scope === "org" ? "org" : "user";
    const c = loadOAuthConfig(platform);
    const redirectUri = defaultRedirectUri();
    const state = randomUUID();
    const needsPkce = !!PLATFORM_ADAPTERS[platform].oauth.pkce;
    const pkce = needsPkce ? pkcePair() : null;
    const oid = await orgIdFor(userId);
    if (scope === "org" && !oid) throw AppError.badRequest("Org-scoped connect requires an organization membership.", { code: "ORG_REQUIRED" });
    const doc: OAuthStateDoc = { userId, platform, redirectUri, scope, ...(oid ? { orgId: oid } : {}), ...(pkce ? { codeVerifier: pkce.verifier } : {}) };
    await redis.set(stateKey(state), JSON.stringify(doc), "EX", STATE_TTL_SEC);

    if (oid) await publishEngine.audit(oid, "connect.start", userId, { platform, detail: `scope=${scope}` });

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
   * the initiator), exchanges the code for tokens, encrypts and stores them —
   * into the user or org token slot per the connect flow's scope.
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
      const scope = st.scope === "org" ? "org" : "user";
      if (scope === "org") {
        if (!st.orgId) throw AppError.badRequest("Org-scoped OAuth state is missing the org binding.", { code: "BAD_STATE" });
        await saveOrgToken(st.orgId, st.platform, tokens);
        if (oid) await publishEngine.audit(oid, "connect.success", actorUserId, { platform: st.platform, detail: `scope=org ${tokens.scope ?? ""}`.trim() });
        return orgConnectionStatus(st.orgId, st.platform);
      }
      await saveToken(actorUserId, st.platform, tokens);
      if (oid) await publishEngine.audit(oid, "connect.success", actorUserId, { platform: st.platform, detail: `scope=user ${tokens.scope ?? ""}`.trim() });
      return connectionStatus(actorUserId, st.platform);
    } catch (e) {
      if (oid) await publishEngine.audit(oid, "connect.failed", actorUserId, { platform: st.platform, detail: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },

  async disconnect(userId: string, platform: PubPlatformId, scope: PubTokenScope = "user"): Promise<void> {
    if (!isPubPlatform(platform)) throw AppError.badRequest(`Unknown platform ${platform}`, { code: "BAD_PLATFORM" });
    if (scope === "org") {
      const oid = await orgIdFor(userId);
      if (!oid) throw AppError.badRequest("Org-scoped disconnect requires an organization membership.", { code: "ORG_REQUIRED" });
      await deleteOrgToken(oid, platform);
      if (oid) await publishEngine.audit(oid, "disconnect", userId, { platform, detail: "scope=org" });
      return;
    }
    await deleteToken(userId, platform);
    const oid = await orgIdFor(userId);
    if (oid) await publishEngine.audit(oid, "disconnect", userId, { platform, detail: "scope=user" });
  },

  async status(userId: string, platform: PubPlatformId, scope: PubTokenScope = "user"): Promise<PubConnectionStatus> {
    if (!isPubPlatform(platform)) throw AppError.badRequest(`Unknown platform ${platform}`, { code: "BAD_PLATFORM" });
    if (scope === "org") {
      const oid = await orgIdFor(userId);
      if (!oid) throw AppError.badRequest("Org-scoped status requires an organization membership.", { code: "ORG_REQUIRED" });
      return orgConnectionStatus(oid, platform);
    }
    return connectionStatus(userId, platform);
  },

  /** Connected org users see at-a-glance whether any account works. */
  async isConnected(userId: string, platform: PubPlatformId): Promise<boolean> {
    return !!(await getToken(userId, platform));
  },

  /* ── Jobs (org-scoped) ──────────────────────────────────────────── */

  async createPublishJob(oid: string, userId: string, platform: PubPlatformId, input: PubPublishInput, opts: { tokenScope?: PubTokenScope } = {}) {
    if (!isPubPlatform(platform)) throw AppError.badRequest(`Unknown platform ${platform}`, { code: "BAD_PLATFORM" });
    const tokenScope: PubTokenScope = opts.tokenScope === "org" ? "org" : "user";
    const connected = tokenScope === "org" ? await getOrgToken(oid, platform) : await getToken(userId, platform);
    if (!connected) {
      throw AppError.badRequest(
        tokenScope === "org"
          ? `No org-shared ${platform} account connected — an admin must connect one (scope=org) first.`
          : `${platform} account not connected — complete OAuth connect first.`,
        { code: "NOT_CONNECTED" },
      );
    }
    return publishEngine.createJob(oid, userId, platform, input, { tokenScope });
  },

  listJobs: (oid: string, opts: { status?: PubJobStatus; platform?: PubPlatformId; limit?: number }) => publishEngine.listJobs(oid, opts),
  getJob: (oid: string, id: string): Promise<PubJob> => publishEngine.getJob(oid, id),
  retryJob: (oid: string, id: string, actor: string) => publishEngine.retryJob(oid, id, actor),
  cancelJob: (oid: string, id: string, actor: string) => publishEngine.cancelJob(oid, id, actor),
  listAudit: (oid: string, limit?: number) => publishEngine.listAudit(oid, limit),
  findJobByPlatformRef: (oid: string, platform: PubPlatformId, ref: string) => publishEngine.findJobByPlatformRef(oid, platform, ref),
  applyPlatformWebhook: (oid: string, jobId: string, update: PubPlatformCallbackUpdate) => publishEngine.applyPlatformWebhook(oid, jobId, update),

  /* ── Webhook status sync (platform → job) ──────────────────────── */

  registerWebhook: (oid: string, platform: PubPlatformId): Promise<PubWebhookRegistration> => registerWebhook(oid, platform),
  webhookConfig: (oid: string, platform: PubPlatformId) => getWebhookConfig(oid, platform),
  listWebhooks: (oid: string): Promise<PubWebhookConfig[]> => listWebhooks(oid, redis, PUB_PLATFORM_IDS),
  deleteWebhook: (oid: string, platform: PubPlatformId) => deleteWebhook(oid, platform),

  /* ── Browser-side direct upload (org-scoped files) ─────────────── */

  saveUpload(oid: string, userId: string, file: { buffer: Buffer; mimetype: string; originalname: string; size: number }, deps?: UploadDeps): Promise<PubUploadRecord> {
    return persistUpload(oid, userId, file, deps);
  },
  listUploads: (oid: string, limit = 100): Promise<PubUploadRecord[]> => listUploads(oid, limit),
  async deleteUpload(oid: string, file: string): Promise<void> {
    const jobs = await publishEngine.listJobs(oid, { limit: 200 });
    const ref = `/render/${path.basename(file)}`;
    const inUse = jobs.some((j) => ["queued", "scheduled", "uploading"].includes(j.status) && (j.input.mediaUrl ?? j.input.videoUrl ?? "").includes(ref));
    if (inUse) throw AppError.conflict("This file is referenced by an active publish job — publish or cancel it first.");
    await deleteUploadFile(oid, file);
  },
  uploadsDir: MEDIA_CACHE_DIR,
};

export default PublishingService;
