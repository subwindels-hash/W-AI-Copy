/**
 * LicensingService — Slice 251: Enterprise Licensing.
 * Signed license keys with tier/seats/expiry, entitlement checks.
 */
import { randomUUID } from "node:crypto";
import { createHmac } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { License, LicenseStatus, LicenseTier } from "@windels/shared";

const LIST   = "psvc:licenses";
const DETAIL = (id: string) => `psvc:license:${id}`;
const BY_KEY = "psvc:license:key";

const SER = <T>(v: T) => JSON.stringify(v);
function iso(days = 365): string { const d = new Date(Date.now() + days*86400_000); return d.toISOString(); }
function now() { return new Date().toISOString(); }

const SECRET = process.env.LICENSE_SECRET ?? "windels-license-dev-secret";
function sign(payload: string): string { return createHmac("sha256", SECRET).update(payload).digest("hex"); }

export const LicensingService = {
  async list(filter?: { status?: LicenseStatus; tier?: LicenseTier }): Promise<License[]> {
    const ids = await redis.smembers(LIST);
    const out: License[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (!raw) continue;
      const l = JSON.parse(raw) as License;
      if (filter?.status && l.status !== filter.status) continue;
      if (filter?.tier && l.tier !== filter.tier) continue;
      out.push(this.refreshStatus(l));
    }
    return out;
  },

  refreshStatus(l: License): License {
    const today = Date.now();
    const exp = new Date(l.expiresAt).getTime();
    if (l.status === "revoked" || l.status === "suspended") return l;
    if (exp < today) l.status = "expired";
    else if (exp - today < 30*86400_000 && l.status === "active") { /* expiring soon, keep active */ }
    return l;
  },

  async get(id: string): Promise<License | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? this.refreshStatus(JSON.parse(raw) as License) : null;
  },

  async findByKey(key: string): Promise<License | null> {
    const id = await redis.hget(BY_KEY, key);
    return id ? this.get(id) : null;
  },

  async issue(input: {
    holder: string; tenantId: string; tier: LicenseTier; seats: number;
    daysValid?: number; features?: string[]; flags?: Record<string, boolean>;
    capabilities?: string[]; autoRenew?: boolean;
  }): Promise<License> {
    const id = randomUUID();
    const key = `WLNS-${randomUUID().replace(/-/g,"").slice(0,20).toUpperCase()}`;
    const l: License = {
      id, key, holder: input.holder, tenantId: input.tenantId,
      tier: input.tier, seats: input.seats, seatsUsed: 0,
      issuedAt: now(), expiresAt: iso(input.daysValid ?? 365),
      status: "active",
      features: input.features ?? ["core"],
      flags: input.flags ?? {},
      capabilities: input.capabilities ?? ["*"],
      signature: "", autoRenew: input.autoRenew ?? true,
    };
    l.signature = sign(`${l.key}:${l.tier}:${l.seats}:${l.expiresAt}`);
    await redis.set(DETAIL(id), SER(l));
    await redis.sadd(LIST, id);
    await redis.hset(BY_KEY, l.key, id);
    return l;
  },

  async revoke(id: string): Promise<License | null> {
    const l = await this.get(id);
    if (!l) return null;
    l.status = "revoked";
    await redis.set(DETAIL(id), SER(l));
    return l;
  },

  async verify(key: string): Promise<{ valid: boolean; license?: License; reason?: string }> {
    const l = await this.findByKey(key);
    if (!l) return { valid: false, reason: "not_found" };
    const sig = sign(`${l.key}:${l.tier}:${l.seats}:${l.expiresAt}`);
    if (sig !== l.signature) return { valid: false, reason: "bad_signature", license: l };
    if (l.status !== "active" && l.status !== "trial") return { valid: false, reason: l.status, license: l };
    if (new Date(l.expiresAt).getTime() < Date.now()) return { valid: false, reason: "expired", license: l };
    return { valid: true, license: l };
  },

  async counts(): Promise<{ total: number; active: number; trial: number; expired: number; expiring30d: number }> {
    const all = await this.list();
    const in30 = Date.now() + 30*86400_000;
    return {
      total: all.length,
      active: all.filter(l=>l.status==="active").length,
      trial: all.filter(l=>l.status==="trial").length,
      expired: all.filter(l=>l.status==="expired").length,
      expiring30d: all.filter(l=>l.status==="active" && new Date(l.expiresAt).getTime() < in30).length,
    };
  },
};
