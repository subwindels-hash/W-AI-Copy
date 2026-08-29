/**
 * Security — Rate limiting (Slices 110, 113).
 *
 * Token-bucket rate limiter. Buckets are stored in Redis so limits are shared
 * across processes; falls back to an in-memory LRU if Redis is down.
 *
 * Each "limit" is a (keyPrefix, maxTokens, refillPerSecond) tuple. The limiter
 * deducts a token per request and returns {allowed, remaining, retryAfterMs}.
 */
import { redis } from "../db/redis.js";

interface Limit {
  key: string;         // e.g. "ip:login:" or "user:"
  max: number;         // burst size
  refillPerSec: number;
  blockSeconds?: number; // extra block window on exhaustion
}

const memoryBuckets = new Map<string, { tokens: number; lastRefill: number; blockedUntil?: number }>();

function memoryTake(key: string, limit: Limit, cost = 1) {
  const now = Date.now();
  let b = memoryBuckets.get(key);
  if (!b) {
    b = { tokens: limit.max, lastRefill: now };
    memoryBuckets.set(key, b);
  } else {
    const elapsed = (now - b.lastRefill) / 1000;
    b.tokens = Math.min(limit.max, b.tokens + elapsed * limit.refillPerSec);
    b.lastRefill = now;
  }
  if (b.blockedUntil && now < b.blockedUntil) {
    return { allowed: false, remaining: 0, retryAfterMs: b.blockedUntil - now };
  }
  b.tokens -= cost;
  if (b.tokens < 0) {
    if (limit.blockSeconds) b.blockedUntil = now + limit.blockSeconds * 1000;
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(1000, Math.ceil((-b.tokens) / limit.refillPerSec) * 1000) };
  }
  return { allowed: true, remaining: Math.floor(b.tokens), retryAfterMs: 0 };
}

// Caps memory buckets to avoid leaks.
setInterval(() => {
  if (memoryBuckets.size > 5000) {
    const keys = Array.from(memoryBuckets.keys()).slice(0, 1000);
    keys.forEach((k) => memoryBuckets.delete(k));
  }
}, 60_000).unref?.();

export async function takeToken(limit: Limit, identifier: string, cost = 1) {
  const key = limit.key + identifier;
  // Try Redis first (Lua script for atomic get/refill/deduct).
  try {
    const lua = `
      local now = tonumber(ARGV[1])
      local max = tonumber(ARGV[2])
      local refill = tonumber(ARGV[3])
      local cost = tonumber(ARGV[4])
      local blockSec = tonumber(ARGV[5])
      local data = redis.call('HMGET', KEYS[1], 't', 'r', 'b')
      local tokens = tonumber(data[1])
      local last = tonumber(data[2])
      local blocked = tonumber(data[3])
      if blocked ~= nil and blocked > now then
        return {0, 0, blocked - now}
      end
      if tokens == nil then tokens = max; last = now end
      local elapsed = (now - last) / 1000.0
      tokens = math.min(max, tokens + elapsed * refill)
      last = now
      tokens = tokens - cost
      local retry = 0
      local blockedUntil = 0
      local allowed = 1
      if tokens < 0 then
        allowed = 0
        retry = math.ceil((-tokens) / refill) * 1000
        if blockSec > 0 then blockedUntil = now + blockSec * 1000 end
        tokens = 0
      end
      redis.call('HMSET', KEYS[1], 't', tostring(tokens), 'r', tostring(last), 'b', tostring(blockedUntil))
      redis.call('EXPIRE', KEYS[1], 3600)
      return {allowed, tostring(math.floor(tokens)), tostring(retry)}
    `;
    const res = (await redis.eval(lua, 1, key, String(Date.now()), String(limit.max), String(limit.refillPerSec), String(cost), String(limit.blockSeconds ?? 0))) as any[];
    return { allowed: res[0] === 1, remaining: Number(res[1]), retryAfterMs: Number(res[2]) };
  } catch {
    // Redis down — degrade to in-memory.
    return memoryTake(key, limit, cost);
  }
}

// ─── Predefined limits ────────────────────────────────────────

export const Limits = {
  login: { key: "rl:login:ip:", max: 10, refillPerSec: 1 / 6, blockSeconds: 300 },             // 10/min, block 5min on flood
  register: { key: "rl:register:ip:", max: 5, refillPerSec: 1 / 30, blockSeconds: 600 },       // 5/30s equivalent → 5/hour
  apiGlobal: { key: "rl:api:ip:", max: 300, refillPerSec: 10, blockSeconds: 30 },               // 600/min burst
  chat: { key: "rl:chat:user:", max: 60, refillPerSec: 1, blockSeconds: 60 },                   // 1/s sustained
  workflowRun: { key: "rl:wfrun:user:", max: 30, refillPerSec: 1 / 2, blockSeconds: 120 },       // 30/min
  webhookIngest: { key: "rl:webhook:ip:", max: 60, refillPerSec: 2, blockSeconds: 60 },
  passwordReset: { key: "rl:pwd:ip:", max: 5, refillPerSec: 1 / 60, blockSeconds: 600 },
  publicApi: { key: "rl:pubapi:key:", max: 600, refillPerSec: 10, blockSeconds: 60 },            // 600/min for API keys
  ai: { key: "rl:ai:user:", max: 80, refillPerSec: 2, blockSeconds: 30 },
  // Module 1 additions:
  tokenRefresh: { key: "rl:refresh:ip:", max: 20, refillPerSec: 1 / 10, blockSeconds: 300 },   // 20 per 10min, block 5min on abuse
  admin: { key: "rl:admin:user:", max: 120, refillPerSec: 5, blockSeconds: 30 },               // Relaxed for admin operations
  sseConnect: { key: "rl:sse:ip:", max: 5, refillPerSec: 1 / 30, blockSeconds: 60 },           // Max 5 SSE connections per IP
  mfa: { key: "rl:mfa:ip:", max: 10, refillPerSec: 1 / 6, blockSeconds: 300 },                 // Same as login — MFA is part of auth
  contact: { key: "rl:contact:ip:", max: 10, refillPerSec: 1 / 60, blockSeconds: 600 },        // Contact form / AI chat anti-spam
  contactAdmin: { key: "rl:contactadmin:user:", max: 200, refillPerSec: 10, blockSeconds: 30 },
  payment: { key: "rl:payment:user:", max: 30, refillPerSec: 0.5, blockSeconds: 60 },       // payment creation/monitor mutations
  paymentStatus: { key: "rl:paymentstatus:user:", max: 120, refillPerSec: 2, blockSeconds: 30 },
  reviews: { key: "rl:reviews:ip:", max: 10, refillPerSec: 1 / 120, blockSeconds: 600 },          // Platform review write anti-spam
  reviewsWrite: { key: "rl:reviewswrite:user:", max: 10, refillPerSec: 1 / 60, blockSeconds: 120 },
  // Paid provider calls: user-scoped, intentionally tighter than global API.
  leadDiscovery: { key: "rl:lead-discovery:user:", max: 20, refillPerSec: 1 / 30, blockSeconds: 300 },
} satisfies Record<string, Limit>;

export type LimitName = keyof typeof Limits;
