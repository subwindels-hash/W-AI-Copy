/**
 * Service-to-service authentication middleware.
 *
 * Issues and verifies short-lived signed JWTs scoped to a specific service
 * audience and permission set. Supports rotation via a server-side key version
 * and revocation via Redis.
 *
 * Usage:
 *   - Issue a service token (server-internal only):
 *       const tok = await ServiceToken.issue({ service: "trading-intel", aud: "market-data", scopes: ["quotes:read"], ttlSec: 300 });
 *   - Protect a route with a required audience/scope:
 *       router.get("/feeds", serviceAuth({ aud: "market-data", require: ["quotes:read"] }), handler);
 */
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { env } from "../config/env.js";
import type { Request, Response, NextFunction } from "express";

const REV_PREFIX = "svc:rev:";
const KEY_PREFIX = "svc:key:";
const DEFAULT_TTL = 300; // 5 minutes
const MAX_TTL = 3600;    // 1 hour

interface ServiceTokenPayload {
  sub: string;          // service id
  aud: string;          // audience / target service
  scp: string[];        // scopes
  jti: string;          // unique token id (for revocation)
  kv: number;           // key version
  iat: number;
  exp: number;
  iss: string;
}

interface IssueOpts {
  service: string;
  aud: string;
  scopes: string[];
  ttlSec?: number;
}

async function getCurrentKeyVersion(): Promise<number> {
  const v = await redis.get("svc:key:version");
  return v ? Number(v) : 1;
}

async function getSecret(version: number): Promise<string> {
  // Try Redis-cached key first; fall back to env-derived base + version salt so keys
  // rotate deterministically. In production, supply WINDELS_SERVICE_KEY_SECRET env.
  const cached = await redis.get(`${KEY_PREFIX}${version}`);
  if (cached) return cached;
    const base = process.env.WINDELS_SERVICE_KEY_SECRET || env.JWT_SECRET;
  const derived = base + ":v" + version;
  await (redis as any).set(`${KEY_PREFIX}${version}`, derived, "EX", 60*60*24*30);
  return derived;
}
async function setVersion(v: number) { await (redis as any).set("svc:key:version", String(v)); }
async function setRevocation(jti: string, ttlSec: number) { await (redis as any).set(REV_PREFIX + jti, "1", "EX", ttlSec); }

export const ServiceToken = {
  async issue(opts: IssueOpts): Promise<{ token: string; jti: string; expiresAt: number }> {
    const ttl = Math.min(MAX_TTL, Math.max(15, opts.ttlSec ?? DEFAULT_TTL));
    const kv = await getCurrentKeyVersion();
    const secret = await getSecret(kv);
    const jti = randomBytes(12).toString("hex");
    const now = Math.floor(Date.now()/1000);
    const payload: ServiceTokenPayload = {
      sub: opts.service, aud: opts.aud, scp: opts.scopes, jti, kv,
      iat: now, exp: now + ttl, iss: env.JWT_ISSUER,
    };
    const token = jwt.sign(payload, secret, { algorithm: "HS256" });
    return { token, jti, expiresAt: payload.exp };
  },

  async verify(token: string, expectedAud?: string, requiredScopes?: string[]): Promise<ServiceTokenPayload> {
    // Try current version first; fall back to version-1 to allow rotation overlap.
    const versions = [await getCurrentKeyVersion()];
    if (versions[0]! > 1) versions.push(versions[0]! - 1);
    let lastErr: unknown = null;
    for (const v of versions) {
      try {
        const secret = await getSecret(v);
        const decoded = jwt.verify(token, secret, { issuer: env.JWT_ISSUER, algorithms: ["HS256"] }) as ServiceTokenPayload;
        if (expectedAud && decoded.aud !== expectedAud) {
          throw AppError.forbidden("Service token audience mismatch");
        }
        if (requiredScopes?.length && !requiredScopes.every(s => decoded.scp.includes(s))) {
          throw AppError.forbidden("Service token missing required scope");
        }
        // Check revocation.
        const rev = await redis.get(REV_PREFIX + decoded.jti);
        if (rev) throw AppError.forbidden("Service token revoked");
        return decoded;
      } catch (e) {
        lastErr = e;
        if (e instanceof AppError) throw e; // hard authz failures are fatal
      }
    }
    throw lastErr instanceof AppError ? lastErr : AppError.unauthorized("Invalid service token");
  },

  async revoke(jti: string, ttlSec = 60*60*24): Promise<void> {
    await (redis as any).set(REV_PREFIX + jti, "1", "EX", ttlSec);
  },

  async rotateKey(): Promise<number> {
    const v = await getCurrentKeyVersion();
    const next = v + 1;
    await (redis as any).set("svc:key:version", String(next));
    // Generate a new random key secret for the next version.
    const fresh = randomBytes(32).toString("hex");
    await (redis as any).set(`${KEY_PREFIX}${next}`, fresh, "EX", 60*60*24*30);
    return next;
  },
};

export function serviceAuth(opts: { aud?: string; scopes?: string[] }) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers["x-service-authorization"] || req.headers.authorization;
    const raw = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!raw) return next(AppError.unauthorized("Service token required"));
    try {
      const payload = await ServiceToken.verify(raw, opts.aud, opts.scopes);
      (req as any).service = { id: payload.sub, aud: payload.aud, scopes: payload.scp, jti: payload.jti };
      next();
    } catch (e) { next(e); }
  };
}

export default ServiceToken;
