/**
 * Session 52 — AI Licensing & Monetization Platform (V8.4 §7).
 * Monetizable assets: models/employees/agents/skills/workflows/voices/prompts/
 * knowledge/templates/connectors/plugins/digital-humans. Billing models:
 * subscription/usage/revenue_share/enterprise_license/royalty. Keys: lic:*
 *
 * S164 — this module records revenue, computes fee splits and accrues payout
 * liabilities. Every one of those paths was wrong:
 *
 *  1. All six routes called the service with no organization, so everything
 *     fell through to `oid = "org-windels"`. One tenant's metered usage
 *     incremented ANOTHER tenant's revenue and pending-payout balance.
 *  2. `revenueCents30d` was a counter that was never decayed — a lifetime
 *     total labelled "30d", always exactly equal to `revenueCentsAllTime`.
 *  3. `pending` only ever grew. There was no payout path at all, and
 *     `RoyaltyEntry.paid` was written `false` and never set true.
 *  4. Royalty entries were written to `lic:r`/`lic:rs` and read by nothing —
 *     the record of what is owed to whom was write-only dead data.
 *  5. A grant pointing at a missing asset fabricated `{ revenueSharePct: 10 }`
 *     and billed anyway.
 *  6. The 20% platform fee was a bare literal, declared nowhere.
 *  7. Grants never expired: `expiresAt` was stored and never compared, so an
 *     expired or canceled grant stayed active and remained billable.
 *
 * Revenue is now derived from the royalty ledger rather than from counters,
 * which makes the 30-day window real and the pending balance settleable.
 *
 * NOT CLAIMED: no payment processor is wired. Settling a payout marks the
 * ledger; no money moves.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import {
  BILLING_MODELS, PLATFORM_FEE_PCT,
  type BillingModel, type LicensableAssetType, type LicensedAsset,
  type LicenseGrant, type LicensingDashboard, type RoyaltyEntry,
} from "@windels/shared";

const K = {
  asset: (oid: string, id: string) => `lic:a:${oid}:${id}`,
  assets: (oid: string) => `lic:as:${oid}`,
  grant: (oid: string, id: string) => `lic:g:${oid}:${id}`,
  grants: (oid: string) => `lic:gs:${oid}`,
  assetGrants: (oid: string, aid: string) => `lic:ag:${oid}:${aid}`,
  royalty: (oid: string, id: string) => `lic:r:${oid}:${id}`,
  royalties: (oid: string) => `lic:rs:${oid}`,
  metrics: (oid: string) => `lic:m:${oid}`,
};
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

const SEED_ASSETS: Array<{ type: LicensableAssetType; externalAssetId: string; name: string; billingModel: BillingModel; priceCents: number }> = [
  { type: "voice_pack", externalAssetId: "vf:aria-pro", name: "Aria Pro Voice Pack", billingModel: "subscription", priceCents: 499 },
  { type: "industry_template", externalAssetId: "tpl:finance-agent", name: "Finance Agent Template", billingModel: "enterprise_license", priceCents: 99000 },
  { type: "ai_skill", externalAssetId: "skill:invoice-ocr", name: "Invoice OCR Skill", billingModel: "usage", priceCents: 1 },
  { type: "plugin", externalAssetId: "plugin:slack", name: "Slack Connector Plugin", billingModel: "subscription", priceCents: 999 },
];

async function emitKernel(kind: string, payload: any) {
  try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ source: "licensing", kind, payload }); } catch {}
}

/**
 * S164 — a grant is billable only while it is genuinely in force. `expiresAt`
 * was previously stored and never compared, so a grant past its expiry stayed
 * "active" in the dashboard and `recordUsage` kept charging against it.
 */
function effectiveStatus(g: LicenseGrant, now = Date.now()): LicenseGrant["status"] {
  if (g.status === "canceled" || g.status === "expired") return g.status;
  if (g.expiresAt && new Date(g.expiresAt).getTime() < now) return "expired";
  return g.status;
}

export const LicensingService = {
  /**
   * S164 — seeding is opt-in. These four assets were registered as owned,
   * listed IP on every boot; a marketplace catalogue that nobody published is
   * indistinguishable from one that was.
   */
  async ensureBootstrapped(logger?: any, oid = "org-windels", userId = "user-admin") {
    if (await redis.exists(K.assets(oid))) return;
    if (!demoDataEnabled()) return skipDemoSeed("licensing", logger);
    for (const a of SEED_ASSETS) {
      await this.register({ ...a, ownerId: userId, organizationId: oid, source: "demo_seed" });
    }
    logger?.info?.("[licensing] demo seed complete", { assets: SEED_ASSETS.length });
  },

  /** S164 — the royalty ledger, newest first. Previously written and never read. */
  async listRoyalties(oid: string, limit = 200): Promise<RoyaltyEntry[]> {
    const ids = await redis.zrange(K.royalties(oid), -limit, -1, "REV");
    const out: RoyaltyEntry[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.royalty(oid, id));
      if (r._doc) out.push(JSON.parse(r._doc));
    }
    return out;
  },

  async dashboard(oid: string): Promise<LicensingDashboard> {
    const assets = await this.listAssets(oid);
    const grants = await this.listGrants(oid);
    const royalties = await this.listRoyalties(oid, 1000);
    const active = grants.filter((g) => g.status === "active").length;

    // S164: revenue is summed from the ledger, so the window is real.
    const since = Date.now() - THIRTY_DAYS_MS;
    let rev30 = 0, revAll = 0, pending = 0, paid = 0;
    for (const r of royalties) {
      revAll += r.grossCents;
      if (new Date(r.at).getTime() >= since) rev30 += r.grossCents;
      if (r.paid) paid += r.ownerPayoutCents; else pending += r.ownerPayoutCents;
    }

    const byModel: Record<BillingModel, number> = Object.fromEntries(BILLING_MODELS.map((b) => [b, 0])) as Record<BillingModel, number>;
    for (const a of assets) byModel[a.billingModel]++;
    const top = assets.slice()
      .sort((a, b) => b.revenueCents30d - a.revenueCents30d)
      .slice(0, 5)
      .map((a) => ({ id: a.id, name: a.name, type: a.type, revenueCents30d: a.revenueCents30d }));

    return {
      totalAssets: assets.length,
      listedAssets: assets.filter((a) => a.status === "listed").length,
      activeLicenses: active,
      revenueCents30d: rev30,
      revenueCentsAllTime: revAll,
      payoutsPendingCents: pending,
      payoutsPaidCents: paid,
      topAssets: top,
      byBillingModel: byModel,
      // No payment processor is wired; settling marks the ledger only.
      payoutsSettleable: false,
    };
  },

  async register(input: { type: LicensableAssetType; externalAssetId: string; name: string; description?: string; billingModel: BillingModel; priceCents: number; currency?: string; revenueSharePct?: number; royaltyPct?: number; termsUrl?: string; ownerId: string; organizationId: string; source?: LicensedAsset["source"] }): Promise<LicensedAsset> {
    const oid = input.organizationId;
    const id = uid("la-"); const now = new Date().toISOString();
    const asset: LicensedAsset = {
      id, organizationId: oid, type: input.type, externalAssetId: input.externalAssetId,
      name: input.name, description: input.description || "", ownerId: input.ownerId,
      billingModel: input.billingModel, priceCents: input.priceCents, currency: input.currency || "USD",
      revenueSharePct: input.revenueSharePct, royaltyPct: input.royaltyPct, termsUrl: input.termsUrl,
      status: "listed", listings: 0,
      revenueCents30d: 0, revenueCentsAllTime: 0,
      source: input.source ?? "operator_registered",
      createdAt: now, updatedAt: now,
    };
    await redis.hset(K.asset(oid, id), "_doc", s2(asset));
    await redis.sadd(K.assets(oid), id);
    emitKernel("licensing.asset.registered", { organizationId: oid, assetId: id, type: input.type });
    return asset;
  },

  async listAssets(oid: string): Promise<LicensedAsset[]> {
    const ids = await redis.smembers(K.assets(oid));
    const out: LicensedAsset[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.asset(oid, id)); if (r._doc) out.push(JSON.parse(r._doc)); }

    // S164: per-asset revenue is derived from the ledger so the 30-day figure
    // is a window rather than a running total that never decays.
    const royalties = await this.listRoyalties(oid, 1000);
    const since = Date.now() - THIRTY_DAYS_MS;
    const win = new Map<string, number>(); const life = new Map<string, number>();
    for (const r of royalties) {
      life.set(r.assetId, (life.get(r.assetId) ?? 0) + r.grossCents);
      if (new Date(r.at).getTime() >= since) win.set(r.assetId, (win.get(r.assetId) ?? 0) + r.grossCents);
    }
    for (const a of out) {
      a.revenueCents30d = win.get(a.id) ?? 0;
      a.revenueCentsAllTime = life.get(a.id) ?? 0;
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async grant(input: { assetId: string; licenseeOrgId: string; expiresAt?: string; organizationId: string }): Promise<LicenseGrant> {
    const oid = input.organizationId;
    const ar = await redis.hgetall(K.asset(oid, input.assetId));
    if (!ar._doc) throw Object.assign(new Error("asset not found"), { status: 404 });
    const a: LicensedAsset = JSON.parse(ar._doc);
    const id = uid("lg-");
    const g: LicenseGrant = {
      id, organizationId: oid, assetId: input.assetId, licenseeOrgId: input.licenseeOrgId,
      billingModel: a.billingModel, startedAt: new Date().toISOString(), expiresAt: input.expiresAt,
      status: "active", usageCount: 0, spendCents: 0,
    };
    await redis.hset(K.grant(oid, id), "_doc", s2(g));
    await redis.sadd(K.grants(oid), id);
    await redis.sadd(K.assetGrants(oid, input.assetId), id);
    a.listings = (a.listings || 0) + 1; a.updatedAt = new Date().toISOString();
    await redis.hset(K.asset(oid, input.assetId), "_doc", s2(a));
    return g;
  },

  /** S164 — cancel a grant so it stops counting as active and stops billing. */
  async cancelGrant(input: { grantId: string; organizationId: string }): Promise<LicenseGrant> {
    const oid = input.organizationId;
    const gr = await redis.hgetall(K.grant(oid, input.grantId));
    if (!gr._doc) throw Object.assign(new Error("grant not found"), { status: 404 });
    const g: LicenseGrant = JSON.parse(gr._doc);
    g.status = "canceled";
    await redis.hset(K.grant(oid, input.grantId), "_doc", s2(g));
    return g;
  },

  async recordUsage(input: { grantId: string; usageCents?: number; organizationId: string }): Promise<RoyaltyEntry> {
    const oid = input.organizationId;
    const usageCents = input.usageCents ?? 1;
    const gr = await redis.hgetall(K.grant(oid, input.grantId));
    if (!gr._doc) throw Object.assign(new Error("grant not found"), { status: 404 });
    const g: LicenseGrant = JSON.parse(gr._doc);

    // S164: a grant that is canceled or past its expiry is not billable. This
    // was never checked, so an expired grant kept accruing charges.
    const eff = effectiveStatus(g);
    if (eff !== "active" && eff !== "trial") {
      if (g.status !== eff) { g.status = eff; await redis.hset(K.grant(oid, input.grantId), "_doc", s2(g)); }
      throw Object.assign(new Error(`grant is ${eff}`), { status: 409 });
    }

    // S164: the asset must exist. This used to fall back to a fabricated
    // `{ revenueSharePct: 10 }` and record the transaction regardless.
    const ar = await redis.hgetall(K.asset(oid, g.assetId));
    if (!ar._doc) throw Object.assign(new Error("asset not found for grant"), { status: 404 });
    const a: LicensedAsset = JSON.parse(ar._doc);

    g.usageCount = (g.usageCount || 0) + 1; g.spendCents = (g.spendCents || 0) + usageCents;
    await redis.hset(K.grant(oid, input.grantId), "_doc", s2(g));

    const platformFee = Math.round(usageCents * PLATFORM_FEE_PCT / 100);
    // S164: 0, not an invented 10%, when the asset declares no share.
    const revSharePct = a.revenueSharePct ?? 0;
    const revShare = Math.round(usageCents * revSharePct / 100);
    const owner = usageCents - platformFee - revShare;

    a.updatedAt = new Date().toISOString();
    await redis.hset(K.asset(oid, g.assetId), "_doc", s2(a));
    // Lifetime counter retained for operators reading Redis directly; the
    // dashboard no longer derives anything from it.
    await redis.hincrby(K.metrics(oid), "revenueAll", usageCents);

    const rid = uid("roy-");
    const at = new Date().toISOString();
    const entry: RoyaltyEntry = {
      id: rid, grantId: input.grantId, assetId: g.assetId, period: at.slice(0, 7),
      grossCents: usageCents, platformFeeCents: platformFee, revenueShareCents: revShare,
      ownerPayoutCents: owner, platformFeePct: PLATFORM_FEE_PCT, revenueSharePct: revSharePct,
      paid: false, at,
    };
    await redis.hset(K.royalty(oid, rid), "_doc", s2(entry));
    await redis.zadd(K.royalties(oid), Date.now(), rid);
    emitKernel("licensing.usage.recorded", { organizationId: oid, grantId: input.grantId, usageCents });
    return entry;
  },

  /**
   * S164 — settle outstanding payouts.
   *
   * `pending` previously only ever grew: nothing could mark a royalty paid, so
   * the dashboard showed a liability that could never be discharged. This
   * marks ledger entries and moves no money — no payment processor is wired.
   */
  async settlePayouts(input: { organizationId: string; royaltyIds?: string[] }): Promise<{ settled: number; centsSettled: number; moneyMoved: false }> {
    const oid = input.organizationId;
    const all = await this.listRoyalties(oid, 1000);
    const target = input.royaltyIds?.length
      ? all.filter((r) => input.royaltyIds!.includes(r.id))
      : all;
    const now = new Date().toISOString();
    let settled = 0, cents = 0;
    for (const r of target) {
      if (r.paid) continue;
      r.paid = true; r.paidAt = now;
      await redis.hset(K.royalty(oid, r.id), "_doc", s2(r));
      settled++; cents += r.ownerPayoutCents;
    }
    emitKernel("licensing.payouts.settled", { organizationId: oid, settled, centsSettled: cents });
    return { settled, centsSettled: cents, moneyMoved: false };
  },

  async listGrants(oid: string): Promise<LicenseGrant[]> {
    const ids = await redis.smembers(K.grants(oid));
    const out: LicenseGrant[] = [];
    const now = Date.now();
    for (const id of ids) {
      const r = await redis.hgetall(K.grant(oid, id));
      if (!r._doc) continue;
      const g: LicenseGrant = JSON.parse(r._doc);
      // S164: reflect expiry on read, and persist the transition once.
      const eff = effectiveStatus(g, now);
      if (eff !== g.status) { g.status = eff; await redis.hset(K.grant(oid, id), "_doc", s2(g)); }
      out.push(g);
    }
    return out;
  },
};

export default LicensingService;
