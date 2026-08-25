/**
 * User GitHub connector.
 *
 * Users connect their own GitHub account via OAuth App or a Personal Access
 * Token. The token is verified against api.github.com before storage and kept
 * as an AES-256-GCM envelope. Reads return a masked token only.
 *
 * Keys (org sits in the segment after the two-part prefix):
 *   ghc:conn:<org>:<userId>
 *   ghc:idx:<org>
 * OAuth CSRF state is short-lived and has no org (issued before callback):
 *   ghc:state:<nonce>
 */
import { randomBytes } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { logger } from "../config/logger.js";
import { prisma } from "../db/client.js";
import {
  currentEncryptionKeyId,
  decryptString,
  encryptString,
  isEncryptedBlob,
  maskSecret,
  type EncryptedBlob,
} from "../security/encryption.js";
import { resolvePlatformApi } from "../sitePlatform/platformApis.runtime.js";
import { GithubClient } from "../aiEngineering/github.service.js";
import {
  GITHUB_API_BASE,
  GITHUB_AUTHORIZATION_ENDPOINT,
  GITHUB_CALLBACK_PATH,
  GITHUB_CONFIG_NOTE,
  GITHUB_CONNECT_NOTE,
  GITHUB_OAUTH_SCOPES,
  GITHUB_TOKEN_ENDPOINT,
  maskGithubClientId,
  type GithubConnectionPublic,
  type GithubConnectorStatus,
  type GithubOauthConfigStatus,
  type GithubRemoteRepo,
} from "@windels/shared/githubConnector";

const STATE_TTL = 600;
const K = {
  conn: (oid: string, uid: string) => `ghc:conn:${oid}:${uid}`,
  idx: (oid: string) => `ghc:idx:${oid}`,
  state: (s: string) => `ghc:state:${s}`,
};

interface StoredGithubUserConnection {
  userId: string;
  organizationId: string;
  method: "oauth" | "pat";
  status: "connected" | "failed" | "disconnected";
  login: string;
  profileUrl: string | null;
  avatarUrl: string | null;
  organizations: string[];
  scopes: string[];
  tokenMasked: string;
  credentialVersion: number;
  connectedAt: string;
  updatedAt: string;
  lastVerifiedAt: string;
  tokenEnc?: EncryptedBlob;
  refreshEnc?: EncryptedBlob;
}

function defaultRedirectUri(): string {
  const explicit = process.env.GITHUB_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const origin = (process.env.WINDELS_PUBLIC_API_ORIGIN || `http://localhost:${process.env.API_PORT || 4000}`).replace(/\/$/, "");
  return `${origin}${GITHUB_CALLBACK_PATH}`;
}

function frontendOrigin(): string {
  return (process.env.WINDELS_WEB_ORIGIN || process.env.API_CORS_ORIGIN || "http://localhost:5173").split(",")[0]!.trim();
}

export function resolveGithubOauthConfig(): {
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string;
  oauthReady: boolean;
} {
  const idSlot = resolvePlatformApi("github-client-id", "GITHUB_CLIENT_ID");
  const secretSlot = resolvePlatformApi("github-oauth", "GITHUB_CLIENT_SECRET");
  const clientId = (idSlot.apiKey || process.env.GITHUB_CLIENT_ID || "").trim() || null;
  const clientSecret = (secretSlot.apiKey || process.env.GITHUB_CLIENT_SECRET || "").trim() || null;
  const redirectUri = defaultRedirectUri();
  return { clientId, clientSecret, redirectUri, oauthReady: Boolean(clientId && clientSecret && redirectUri) };
}

export function githubOauthStatus(): GithubOauthConfigStatus {
  const cfg = resolveGithubOauthConfig();
  const missing: string[] = [];
  if (!cfg.clientId) missing.push("GITHUB_CLIENT_ID");
  if (!cfg.clientSecret) missing.push("GITHUB_CLIENT_SECRET");
  return {
    oauthReady: cfg.oauthReady,
    clientIdPresent: Boolean(cfg.clientId),
    clientIdMasked: cfg.clientId ? maskGithubClientId(cfg.clientId) : null,
    clientSecretPresent: Boolean(cfg.clientSecret),
    redirectUri: cfg.redirectUri,
    expectedCallbackPath: GITHUB_CALLBACK_PATH,
    scopes: [...GITHUB_OAUTH_SCOPES],
    authorizationEndpoint: GITHUB_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: GITHUB_TOKEN_ENDPOINT,
    patConnectAvailable: true,
    ready: cfg.oauthReady,
    checkedAt: new Date().toISOString(),
    note: GITHUB_CONFIG_NOTE,
    missing,
  };
}

function publicConnection(record: StoredGithubUserConnection | null): GithubConnectionPublic {
  if (!record) {
    return {
      connected: false,
      method: null,
      status: "disconnected",
      login: null,
      profileUrl: null,
      avatarUrl: null,
      organizations: [],
      scopes: [],
      tokenMasked: null,
      credentialVersion: 0,
      connectedAt: null,
      updatedAt: null,
      lastVerifiedAt: null,
    };
  }
  return {
    connected: record.status === "connected",
    method: record.method,
    status: record.status,
    login: record.login,
    profileUrl: record.profileUrl,
    avatarUrl: record.avatarUrl,
    organizations: record.organizations,
    scopes: record.scopes,
    tokenMasked: record.tokenMasked,
    credentialVersion: record.credentialVersion,
    connectedAt: record.connectedAt,
    updatedAt: record.updatedAt,
    lastVerifiedAt: record.lastVerifiedAt,
  };
}

async function loadStored(oid: string, uid: string): Promise<{ record: StoredGithubUserConnection; token: string } | null> {
  const raw = await redis.hget(K.conn(oid, uid), "doc");
  if (!raw) return null;
  let record: StoredGithubUserConnection;
  try { record = JSON.parse(raw) as StoredGithubUserConnection; }
  catch { throw AppError.internal("Stored GitHub connection is invalid"); }
  if (!record.tokenEnc || !isEncryptedBlob(record.tokenEnc)) {
    throw AppError.internal("GitHub credential cannot be decrypted; reconnect this account");
  }
  const token = decryptString(record.tokenEnc);
  if (!token) throw AppError.internal("GitHub credential cannot be decrypted; reconnect this account");
  if (record.tokenEnc.kid !== currentEncryptionKeyId()) {
    record = { ...record, tokenEnc: encryptString(token), updatedAt: new Date().toISOString() };
    await redis.hset(K.conn(oid, uid), "doc", JSON.stringify(record));
  }
  return { record, token };
}

async function persist(record: StoredGithubUserConnection): Promise<void> {
  await redis.hset(K.conn(record.organizationId, record.userId), "doc", JSON.stringify(record));
  await redis.sadd(K.idx(record.organizationId), record.userId);
}

async function verifyToken(token: string, fetchFn: typeof fetch): Promise<{ login: string; orgs: string[]; profileUrl: string | null; avatarUrl: string | null }> {
  const client = new GithubClient(token, fetchFn, GITHUB_API_BASE);
  let verified: { login: string; orgs: string[] };
  try {
    verified = await client.verify();
  } catch (error) {
    logger.warn("[github-connector] credential verification failed", { status: (error as AppError).status });
    if ((error as AppError).status === 401) throw AppError.unauthorized("GitHub rejected the supplied credential");
    throw error;
  }
  let profileUrl: string | null = `https://github.com/${verified.login}`;
  let avatarUrl: string | null = null;
  try {
    const res = await fetchFn(`${GITHUB_API_BASE}/user`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (res.ok) {
      const body = await res.json() as { html_url?: string; avatar_url?: string };
      profileUrl = body.html_url ?? profileUrl;
      avatarUrl = body.avatar_url ?? null;
    }
  } catch { /* profile extras are optional */ }
  return { ...verified, profileUrl, avatarUrl };
}

export const GithubConnectorService = {
  status(oid: string, uid: string, fetchFn?: typeof fetch): Promise<GithubConnectorStatus> {
    return this.getStatus(oid, uid, fetchFn);
  },

  async getStatus(oid: string, uid: string, _fetchFn: typeof fetch = fetch): Promise<GithubConnectorStatus> {
    const loaded = await loadStored(oid, uid).catch(() => null);
    return {
      config: githubOauthStatus(),
      connection: publicConnection(loaded?.record ?? null),
      connectNote: GITHUB_CONNECT_NOTE,
    };
  },

  async startOauth(oid: string, uid: string, returnTo?: string): Promise<{ url: string; state: string }> {
    const cfg = resolveGithubOauthConfig();
    if (!cfg.oauthReady || !cfg.clientId) {
      throw AppError.badRequest(
        "GitHub OAuth is not configured. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and GITHUB_REDIRECT_URI, or add them in Super Admin → Site control → APIs. You can still connect with a Personal Access Token.",
      );
    }
    const state = randomBytes(24).toString("base64url");
    await redis.set(K.state(state), JSON.stringify({
      userId: uid,
      organizationId: oid,
      returnTo: returnTo && returnTo.startsWith("/") ? returnTo : "/app/github",
      createdAt: Date.now(),
    }), "EX", STATE_TTL);
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      scope: GITHUB_OAUTH_SCOPES.join(" "),
      state,
      allow_signup: "false",
    });
    return { url: `${GITHUB_AUTHORIZATION_ENDPOINT}?${params.toString()}`, state };
  },

  async handleOauthCallback(input: { code: string; state: string }, fetchFn: typeof fetch = fetch): Promise<{ returnTo: string }> {
    const cfg = resolveGithubOauthConfig();
    if (!cfg.oauthReady || !cfg.clientId || !cfg.clientSecret) {
      throw AppError.badRequest("GitHub OAuth is not configured on this instance");
    }
    const raw = await redis.get(K.state(input.state));
    if (!raw) throw AppError.badRequest("Invalid or expired GitHub OAuth state");
    await redis.del(K.state(input.state));
    const st = JSON.parse(raw) as { userId: string; organizationId: string; returnTo: string };
    const tokRes = await fetchFn(GITHUB_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code: input.code,
        redirect_uri: cfg.redirectUri,
      }),
    });
    if (!tokRes.ok) {
      const t = await tokRes.text().catch(() => "");
      throw AppError.badRequest(`GitHub token exchange failed: HTTP ${tokRes.status} ${t.slice(0, 160)}`);
    }
    const tokens = await tokRes.json() as { access_token?: string; refresh_token?: string; scope?: string; error?: string; error_description?: string };
    if (!tokens.access_token) {
      throw AppError.badRequest(tokens.error_description || tokens.error || "GitHub did not return an access token");
    }
    await this.saveVerified(st.organizationId, st.userId, {
      token: tokens.access_token,
      refreshToken: tokens.refresh_token,
      method: "oauth",
      scopes: (tokens.scope || GITHUB_OAUTH_SCOPES.join(",")).split(/[,\s]+/).filter(Boolean),
    }, fetchFn);
    return { returnTo: st.returnTo || "/app/github" };
  },

  async connectPat(oid: string, uid: string, token: string, fetchFn: typeof fetch = fetch): Promise<GithubConnectionPublic> {
    return this.saveVerified(oid, uid, { token, method: "pat", scopes: [...GITHUB_OAUTH_SCOPES] }, fetchFn);
  },

  async saveVerified(
    oid: string,
    uid: string,
    input: { token: string; refreshToken?: string; method: "oauth" | "pat"; scopes: string[] },
    fetchFn: typeof fetch = fetch,
  ): Promise<GithubConnectionPublic> {
    const verified = await verifyToken(input.token, fetchFn);
    const now = new Date().toISOString();
    const existing = await loadStored(oid, uid).catch(() => null);
    const record: StoredGithubUserConnection = {
      userId: uid,
      organizationId: oid,
      method: input.method,
      status: "connected",
      login: verified.login,
      profileUrl: verified.profileUrl,
      avatarUrl: verified.avatarUrl,
      organizations: verified.orgs,
      scopes: input.scopes,
      tokenMasked: maskSecret(input.token),
      credentialVersion: (existing?.record.credentialVersion ?? 0) + 1,
      connectedAt: existing?.record.connectedAt ?? now,
      updatedAt: now,
      lastVerifiedAt: now,
      tokenEnc: encryptString(input.token),
      refreshEnc: input.refreshToken ? encryptString(input.refreshToken) : existing?.record.refreshEnc,
    };
    await persist(record);
    await prisma.auditLog.create({
      data: {
        userId: uid,
        action: "user.github.connected",
        resourceType: "GithubConnection",
        resourceId: uid,
        metadata: { method: input.method, login: verified.login, credentialVersion: record.credentialVersion },
      },
    }).catch(() => {});
    logger.info("[github-connector] GitHub account connected", { organizationId: oid, userId: uid, method: input.method, login: verified.login });
    return publicConnection(record);
  },

  async verify(oid: string, uid: string, fetchFn: typeof fetch = fetch): Promise<GithubConnectionPublic> {
    const loaded = await loadStored(oid, uid);
    if (!loaded) throw AppError.badRequest("GitHub is not connected");
    const verified = await verifyToken(loaded.token, fetchFn);
    const now = new Date().toISOString();
    const next: StoredGithubUserConnection = {
      ...loaded.record,
      login: verified.login,
      profileUrl: verified.profileUrl,
      avatarUrl: verified.avatarUrl,
      organizations: verified.orgs,
      status: "connected",
      lastVerifiedAt: now,
      updatedAt: now,
    };
    await persist(next);
    return publicConnection(next);
  },

  async disconnect(oid: string, uid: string): Promise<boolean> {
    if (!(await redis.hget(K.conn(oid, uid), "doc"))) return false;
    await redis.del(K.conn(oid, uid));
    await redis.srem(K.idx(oid), uid);
    await prisma.auditLog.create({
      data: { userId: uid, action: "user.github.disconnected", resourceType: "GithubConnection", resourceId: uid, metadata: {} },
    }).catch(() => {});
    logger.info("[github-connector] GitHub account disconnected", { organizationId: oid, userId: uid });
    return true;
  },

  async listRepos(oid: string, uid: string, fetchFn: typeof fetch = fetch): Promise<GithubRemoteRepo[]> {
    const loaded = await loadStored(oid, uid);
    if (!loaded) throw AppError.badRequest("GitHub is not connected");
    const client = new GithubClient(loaded.token, fetchFn, GITHUB_API_BASE);
    return client.listRepos();
  },

  frontendRedirect(returnTo: string, query: Record<string, string>): string {
    const dest = returnTo.startsWith("/") ? returnTo : "/app/github";
    const params = new URLSearchParams(query);
    return `${frontendOrigin()}${dest}?${params.toString()}`;
  },
};

export const _githubConnectorTest = { K, loadStored };
