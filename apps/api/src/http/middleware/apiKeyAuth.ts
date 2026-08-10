import type { Request, Response, NextFunction } from "express";
import { verifyApiKey } from "../../publicApi/publicApi.service.js";
import { recordPublicApiCall } from "../../publicApi/publicApiUsage.service.js";
import { recordUsage } from "../../publicApi/apiUsage.service.js";
import { scopeLegacy } from "@windels/shared/developerPlatform";

const LEGACY = ["READ", "WRITE", "ADMIN"] as const;

/** Simple in-memory sliding-window rate limiter per API key (per minute). */
const rateBuckets = new Map<string, { windowStart: number; count: number }>();
const RATE_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT = 60;

function checkRateLimit(keyId: string, limit: number): { allowed: boolean; current: number; remaining: number; reset: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(keyId);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    rateBuckets.set(keyId, { windowStart: now, count: 1 });
    return { allowed: true, current: 1, remaining: Math.max(0, limit - 1), reset: now + RATE_WINDOW_MS };
  }
  bucket.count += 1;
  const reset = bucket.windowStart + RATE_WINDOW_MS;
  return {
    allowed: bucket.count <= limit,
    current: bucket.count,
    remaining: Math.max(0, limit - bucket.count),
    reset,
  };
}

/** Is the caller's IP within any of the key's allowed CIDRs? */
function ipAllowed(ip: string | undefined, restrictions: string[]): boolean {
  if (!restrictions || restrictions.length === 0) return true;
  if (!ip) return false;
  for (const cidr of restrictions) {
    try {
      const [base, prefixRaw] = cidr.split("/");
      const prefix = prefixRaw ? Number(prefixRaw) : 32;
      if (ipv4InCidr(ip, base, prefix)) return true;
    } catch {
      // invalid CIDR entry — skip
    }
  }
  return false;
}

function ipv4InCidr(ip: string, base: string, prefix: number): boolean {
  const a = ip.split(".").map(Number);
  const b = base.split(".").map(Number);
  if (a.length !== 4 || b.length !== 4) return false;
  const ipInt = (a[0] << 24) + (a[1] << 16) + (a[2] << 8) + a[3];
  const baseInt = (b[0] << 24) + (b[1] << 16) + (b[2] << 8) + b[3];
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  // API keys in query strings are routinely captured in logs, browser history,
  // referrers, and proxies. Public API clients must use Bearer authentication.
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "API key required" } });
  const verified = await verifyApiKey(token);
  if (!verified) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or revoked API key" } });

  // IP restrictions (when the key defines any).
  const clientIp = req.ip ?? req.socket?.remoteAddress;
  if (!ipAllowed(clientIp, verified.ipRestrictions)) {
    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "API key not allowed from this IP address" } });
  }

  // Rate limiting with standard headers (defensive: a minimal `res` mock used
  // in tests may not expose setHeader).
  const limit = verified.granularScopes?.length ? DEFAULT_RATE_LIMIT * 2 : DEFAULT_RATE_LIMIT;
  const rl = checkRateLimit(verified.key.id, limit);
  const setHeader = typeof (res as any).setHeader === "function" ? (k: string, v: string) => res.setHeader(k, v) : () => {};
  setHeader("X-RateLimit-Limit", String(limit));
  setHeader("X-RateLimit-Remaining", String(rl.remaining));
  setHeader("X-RateLimit-Reset", String(Math.ceil(rl.reset / 1000)));
  if (!rl.allowed) {
    setHeader("Retry-After", String(Math.ceil((rl.reset - Date.now()) / 1000)));
    return res.status(429).json({ ok: false, error: { code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" } });
  }

  // Session 120 — best-effort call ledger: never fails or slows the request.
  recordPublicApiCall(verified.key, req.method, req.path, new Date()).catch(() => {});
  (req as any).apiKey = verified.key;
  (req as any).apiKeyScopes = verified.scopes;
  (req as any).apiKeyGranularScopes = verified.granularScopes ?? [];
  (req as any).apiKeyAppId = verified.appId;
  (req as any).apiUser = verified.user;
  (req as any).apiOrganization = verified.organization;

  // Persistent usage ledger: record exactly one row per gateway request when
  // the response finishes, with the real status and latency. Route handlers may
  // enrich the row (tokens/cost/endpoint/channel) via `res.locals.apiUsage`.
  // Defensive: a minimal `res` mock in tests may not expose `on`.
  const started = Date.now();
  if (typeof (res as any).on !== "function") return next();
  res.on("finish", () => {
    const local = (res as any).locals?.apiUsage ?? {};
    recordUsage({
      organizationId: verified.organization.id,
      apiKeyId: verified.key.id,
      appId: verified.appId ?? null,
      userId: verified.user?.id ?? null,
      method: req.method,
      path: req.originalUrl?.split("?")[0] ?? req.path,
      endpoint: local.endpoint ?? req.path.split("/").slice(0, 4).join("/"),
      status: res.statusCode,
      durationMs: Date.now() - started,
      channel: local.channel ?? "gateway",
      productSlug: local.productSlug ?? null,
      tokensIn: local.tokensIn ?? 0,
      tokensOut: local.tokensOut ?? 0,
      aiCostMicros: local.aiCostMicros ?? 0,
      sourceIp: req.ip ?? null,
      environment: verified.environment ?? "production",
      permission: local.permission ?? (verified.granularScopes?.join(",") || verified.scopes?.join(",")),
    }).catch(() => {});
  });
  next();
}

/**
 * Scope guard.
 *
 * `required` is a list of fine-grained capability scopes (e.g.
 * "workflows:read", "agents:execute"). A key is authorized if EITHER:
 *
 *   - it carries granular scopes and contains at least one required scope
 *     (granular scopes are authoritative — a read scope never grants another
 *     product's read endpoint); OR
 *   - it carries only the legacy READ/WRITE/ADMIN scopes, in which case the
 *     requirement is mapped to its legacy equivalent (any `*:read` → READ,
 *     any `*:execute|write|generate` → WRITE/ADMIN), preserving the Session
 *     120 behaviour for existing keys.
 *
 * A key with no scopes at all is denied.
 */
export function requireScope(...required: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const granular: string[] = (req as any).apiKeyGranularScopes ?? [];
    const legacy: string[] = (req as any).apiKeyScopes ?? [];

    if (granular.length > 0) {
      // Granular scopes are authoritative: at least one required scope (or its
      // literal legacy equivalent, for keys that carry both) must be present.
      const ok = required.some((r) => {
        if ((LEGACY as readonly string[]).includes(r)) return legacy.includes(r) || legacy.includes("ADMIN");
        return granular.includes(r);
      });
      if (!ok) {
        return res.status(403).json({
          ok: false,
          error: { code: "FORBIDDEN", message: `API key missing required scope: ${required.join(",")}` },
        });
      }
      return next();
    }

    // Legacy keys: derive the needed legacy scopes from the requirement. A
    // literal legacy requirement ("READ"/"WRITE"/"ADMIN") is used as-is; a
    // granular requirement maps to its legacy equivalent.
    const needed = new Set<string>();
    for (const r of required) {
      if ((LEGACY as readonly string[]).includes(r)) needed.add(r);
      else needed.add(scopeLegacy(r));
    }
    const ok = [...needed].some((n) => legacy.includes(n)) || legacy.includes("ADMIN");
    if (!ok) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: `API key missing required scope: ${required.join(",")}` } });
    }
    next();
  };
}
