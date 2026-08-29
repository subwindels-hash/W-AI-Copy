/**
 * WINDELS PLUGIN OS — Connections.
 *
 * Manages per-plugin authentication: OAuth2 (authorization URL + token
 * exchange), API-key secrets (encrypted at rest via the existing encryption
 * module), and MCP server endpoints. OAuth state is single-use and short-lived
 * to prevent CSRF. Secrets are never returned to callers — only a
 * `credentialRef` and a redacted summary.
 */
import { randomBytes, createHash } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { encryptString, decryptString, type EncryptedBlob } from "../security/encryption.js";
import { PluginRegistry } from "./pluginRegistry.js";
import type { ConnectionStatus, ConnectionType, PluginConnection } from "@windels/shared";

const K = {
  list: (oid: string) => `pluginos:conns:${oid}`,
  detail: (oid: string, id: string) => `pluginos:conn:${oid}:${id}`,
  oauthState: (state: string) => `pluginos:oauthstate:${state}`,
  secretBlob: (id: string) => `pluginos:connsecret:${id}`,
};
const STATE_TTL = 600;
function nowIso() { return new Date().toISOString(); }

function redact(s: string | undefined): string | undefined {
  if (!s) return undefined;
  if (s.length <= 6) return "••••";
  return `${s.slice(0, 3)}…${s.slice(-2)}`;
}

export const PluginConnections = {
  async list(oid: string): Promise<PluginConnection[]> {
    const ids = await redis.smembers(K.list(oid));
    const out: PluginConnection[] = [];
    for (const id of ids) {
      const raw = await redis.get(K.detail(oid, id));
      if (raw) out.push(JSON.parse(raw));
    }
    return out;
  },

  async get(oid: string, id: string): Promise<PluginConnection | null> {
    const raw = await redis.get(K.detail(oid, id));
    return raw ? JSON.parse(raw) : null;
  },

  /** Store an API-key style connection (secret encrypted at rest). */
  async createApiKey(oid: string, pluginId: string, input: {
    displayName: string; apiKey: string; apiSecret?: string; endpoint?: string;
    scopes?: string[]; metadata?: Record<string, unknown>;
  }): Promise<PluginConnection> {
    const id = "pc_" + randomBytes(8).toString("hex");
    const secret = { apiKey: input.apiKey, apiSecret: input.apiSecret, endpoint: input.endpoint };
    const blob = encryptString(JSON.stringify(secret));
    const conn: PluginConnection = {
      id, organizationId: oid, pluginId, type: "api_key", status: "connected",
      displayName: input.displayName, credentialRef: blob.data.slice(0, 16) + "…",
      scopes: input.scopes, metadata: { ...input.metadata, keyHint: redact(input.apiKey) },
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    await redis.set(K.detail(oid, id), JSON.stringify(conn));
    await redis.sadd(K.list(oid), id);
    // Stash the encrypted blob under the connection-scoped secret key so
    // `resolveSecret(oid, id)` (and `remove`, which deletes the same key) can
    // find it — matching the OAuth/MCP connection paths below. (Previously this
    // wrote to a `pluginos:cred:*` key nothing ever read, leaving API-key
    // secrets unresolvable at runtime.)
    await redis.set(K.secretBlob(id), JSON.stringify(blob));
    await this.attachToPlugin(oid, pluginId, id);
    await PluginRegistry.setStatus(oid, pluginId, "enabled");
    await PluginRegistry.audit(oid, { pluginId, event: "connected", message: `api-key connection ${input.displayName}` });
    return conn;
  },

  /** Begin an OAuth2 flow: returns the authorization URL and a state token. */
  async beginOAuth(oid: string, userId: string, pluginId: string, input: {
    displayName: string; authUrl: string; tokenUrl: string; clientId: string;
    clientSecret: string; scopes: string[]; redirectUri: string;
  }): Promise<{ url: string; state: string }> {
    const state = randomBytes(24).toString("base64url");
    const params = new URLSearchParams({
      response_type: "code", client_id: input.clientId, redirect_uri: input.redirectUri,
      scope: input.scopes.join(" "), state, access_type: "offline", prompt: "consent",
    });
    await redis.set(K.oauthState(state), JSON.stringify({
      oid, userId, pluginId, tokenUrl: input.tokenUrl, clientId: input.clientId, clientSecret: input.clientSecret,
      redirectUri: input.redirectUri, displayName: input.displayName, scopes: input.scopes,
    }), "EX", STATE_TTL);
    return { url: `${input.authUrl}?${params.toString()}`, state };
  },

  /** Complete OAuth2: exchange code for tokens (encrypted at rest). */
  async completeOAuth(code: string, state: string): Promise<PluginConnection> {
    const raw = await redis.get(K.oauthState(state));
    if (!raw) throw Object.assign(new Error("invalid or expired oauth state"), { status: 400 });
    const ctx = JSON.parse(raw);
    const body = new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: ctx.redirectUri,
      client_id: ctx.clientId, client_secret: ctx.clientSecret,
    });
    let tokens: any;
    try {
      const res = await fetch(ctx.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
      if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
      tokens = await res.json();
    } catch (e: any) {
      logger.warn("plugin oauth token exchange failed", { err: e?.message });
      throw Object.assign(new Error("OAuth token exchange failed"), { status: 502 });
    }
    const blob = encryptString(JSON.stringify(tokens));
    const id = "pc_" + randomBytes(8).toString("hex");
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : undefined;
    const conn: PluginConnection = {
      id, organizationId: ctx.oid, pluginId: ctx.pluginId, type: "oauth2",
      status: expiresAt && Date.parse(expiresAt) < Date.now() ? "expired" : "connected",
      displayName: ctx.displayName, credentialRef: blob.data.slice(0, 16) + "…",
      scopes: ctx.scopes, metadata: { accessTokenHint: "stored" }, expiresAt,
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    await redis.set(K.detail(ctx.oid, id), JSON.stringify(conn));
    await redis.set(K.secretBlob(id), JSON.stringify(blob));
    await redis.sadd(K.list(ctx.oid), id);
    await redis.del(K.oauthState(state));
    await this.attachToPlugin(ctx.oid, ctx.pluginId, id);
    await PluginRegistry.setStatus(ctx.oid, ctx.pluginId, "enabled");
    await PluginRegistry.audit(ctx.oid, { pluginId: ctx.pluginId, event: "connected", message: "oauth connected", userId: ctx.userId });
    return conn;
  },

  /** Register an MCP server endpoint (URL-based; auth handled by API key/OAuth attached). */
  async createMcp(oid: string, pluginId: string, input: { displayName: string; endpoint: string; headers?: Record<string, string> }): Promise<PluginConnection> {
    const id = "pc_" + randomBytes(8).toString("hex");
    const blob = encryptString(JSON.stringify({ endpoint: input.endpoint, headers: input.headers ?? {} }));
    const conn: PluginConnection = {
      id, organizationId: oid, pluginId, type: "mcp", status: "connected",
      displayName: input.displayName, credentialRef: blob.data.slice(0, 16) + "…",
      metadata: { endpoint: input.endpoint }, createdAt: nowIso(), updatedAt: nowIso(),
    };
    await redis.set(K.detail(oid, id), JSON.stringify(conn));
    await redis.set(K.secretBlob(id), JSON.stringify(blob));
    await redis.sadd(K.list(oid), id);
    await this.attachToPlugin(oid, pluginId, id);
    await PluginRegistry.setStatus(oid, pluginId, "enabled");
    return conn;
  },

  async disconnect(oid: string, id: string): Promise<void> {
    const conn = await this.get(oid, id);
    if (!conn) return;
    conn.status = "disconnected"; conn.updatedAt = nowIso();
    await redis.set(K.detail(oid, id), JSON.stringify(conn));
    await PluginRegistry.audit(oid, { pluginId: conn.pluginId, event: "disconnected", message: "connection disconnected" });
  },

  async remove(oid: string, id: string): Promise<void> {
    const conn = await this.get(oid, id);
    await redis.del(K.detail(oid, id));
    await redis.srem(K.list(oid), id);
    await redis.del(K.secretBlob(id));
    if (conn) await PluginRegistry.audit(oid, { pluginId: conn.pluginId, event: "disconnected", message: "connection removed" });
  },

  /** Resolve the decrypted secret for runtime use (server-side only). */
  async resolveSecret<T = unknown>(oid: string, id: string): Promise<T | null> {
    const raw = await redis.get(K.secretBlob(id));
    if (!raw) return null;
    const dec = decryptString(JSON.parse(raw) as EncryptedBlob);
    return dec ? JSON.parse(dec) as T : null;
  },

  async attachToPlugin(oid: string, pluginId: string, connId: string) {
    const p = await PluginRegistry.getInstalled(oid, pluginId);
    if (!p) return;
    if (!p.connectionIds.includes(connId)) p.connectionIds.push(connId);
    p.updatedAt = nowIso();
    await redis.hset(`pluginos:installed:${oid}`, pluginId, JSON.stringify(p));
  },
};

// Helper for test determinism.
export function stateKey(state: string) { return K.oauthState(state); }
void createHash; void logger;
