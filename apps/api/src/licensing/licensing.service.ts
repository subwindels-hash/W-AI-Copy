/**
 * Session 52 — AI Licensing & Monetization Platform (V8.4 §7).
 * Monetizable assets: models/employees/agents/skills/workflows/voices/prompts/
 * knowledge/templates/connectors/plugins/digital-humans. Billing models:
 * subscription/usage/revenue_share/enterprise_license/royalty. Keys: lic:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { BILLING_MODELS, BillingModel, LicensableAssetType, LicensedAsset, LicenseGrant, LicensingDashboard, RoyaltyEntry } from "@windels/shared";

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
const j = (s: string | null) => (s ? JSON.parse(s) : null);
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

const SEED_ASSETS: Array<{ type: LicensableAssetType; externalAssetId: string; name: string; billingModel: BillingModel; priceCents: number }> = [
  { type: "voice_pack", externalAssetId: "vf:aria-pro", name: "Aria Pro Voice Pack", billingModel: "subscription", priceCents: 499 },
  { type: "industry_template", externalAssetId: "tpl:finance-agent", name: "Finance Agent Template", billingModel: "enterprise_license", priceCents: 99000 },
  { type: "ai_skill", externalAssetId: "skill:invoice-ocr", name: "Invoice OCR Skill", billingModel: "usage", priceCents: 1 },
  { type: "plugin", externalAssetId: "plugin:slack", name: "Slack Connector Plugin", billingModel: "subscription", priceCents: 999 },
];

async function emitKernel(kind: string, payload: any) {
  try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ source: "licensing", kind, payload }); } catch {}
}

export const LicensingService = {
  async ensureBootstrapped(logger?: any, oid = "org-windels", userId = "user-admin") {
    if (await redis.exists(K.assets(oid))) return;
    for (const a of SEED_ASSETS) await this.register({ ...a, ownerId: userId, organizationId: oid });
    await redis.hset(K.metrics(oid), "revenue30d", "0", "revenueAll", "0", "pending", "0");
    logger?.info?.("[licensing] bootstrap complete", { assets: SEED_ASSETS.length });
  },

  async dashboard(oid = "org-windels"): Promise<LicensingDashboard> {
    const assets = await this.listAssets(oid);
    const grants = await this.listGrants(oid);
    const active = grants.filter(g=>g.status==="active").length;
    const m = await redis.hgetall(K.metrics(oid));
    const byModel: Record<BillingModel, number> = Object.fromEntries(BILLING_MODELS.map(b=>[b,0])) as Record<BillingModel,number>;
    for (const a of assets) byModel[a.billingModel]++;
    const top = assets.slice().sort((a,b)=>b.revenueCents30d-a.revenueCents30d).slice(0,5).map(a=>({ id: a.id, name: a.name, type: a.type, revenueCents30d: a.revenueCents30d }));
    return {
      totalAssets: assets.length, listedAssets: assets.filter(a=>a.status==="listed").length,
      activeLicenses: active, revenueCents30d: Number(m.revenue30d||"0"), revenueCentsAllTime: Number(m.revenueAll||"0"),
      payoutsPendingCents: Number(m.pending||"0"), topAssets: top, byBillingModel: byModel,
    };
  },

  async register(input: { type: LicensableAssetType; externalAssetId: string; name: string; description?: string; billingModel: BillingModel; priceCents: number; currency?: string; revenueSharePct?: number; royaltyPct?: number; termsUrl?: string; ownerId: string; organizationId?: string }): Promise<LicensedAsset> {
    const oid = input.organizationId || "org-windels";
    const id = uid("la-"); const now = new Date().toISOString();
    const asset: LicensedAsset = {
      id, organizationId: oid, type: input.type, externalAssetId: input.externalAssetId,
      name: input.name, description: input.description || "", ownerId: input.ownerId,
      billingModel: input.billingModel, priceCents: input.priceCents, currency: input.currency || "USD",
      revenueSharePct: input.revenueSharePct, royaltyPct: input.royaltyPct, termsUrl: input.termsUrl,
      status: "listed", listings: 0, revenueCents30d: 0, createdAt: now, updatedAt: now,
    };
    await redis.hset(K.asset(oid,id), "_doc", s2(asset));
    await redis.sadd(K.assets(oid), id);
    emitKernel("licensing.asset.registered", { organizationId: oid, assetId: id, type: input.type });
    return asset;
  },

  async listAssets(oid = "org-windels"): Promise<LicensedAsset[]> {
    const ids = await redis.smembers(K.assets(oid));
    const out: LicensedAsset[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.asset(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  },

  async grant(input: { assetId: string; licenseeOrgId: string; expiresAt?: string; organizationId?: string }): Promise<LicenseGrant> {
    const oid = input.organizationId || "org-windels";
    const ar = await redis.hgetall(K.asset(oid,input.assetId));
    if (!ar._doc) throw Object.assign(new Error("asset not found"), { status: 404 });
    const a: LicensedAsset = JSON.parse(ar._doc);
    const id = uid("lg-");
    const g: LicenseGrant = {
      id, organizationId: oid, assetId: input.assetId, licenseeOrgId: input.licenseeOrgId,
      billingModel: a.billingModel, startedAt: new Date().toISOString(), expiresAt: input.expiresAt,
      status: "active", usageCount: 0, spendCents: 0,
    };
    await redis.hset(K.grant(oid,id), "_doc", s2(g));
    await redis.sadd(K.grants(oid), id);
    await redis.sadd(K.assetGrants(oid,input.assetId), id);
    await redis.hincrby(K.asset(oid,input.assetId), "listings", 1);
    // update listings count in doc
    a.listings = (a.listings||0) + 1; a.updatedAt = new Date().toISOString();
    await redis.hset(K.asset(oid,input.assetId), "_doc", s2(a));
    return g;
  },

  async recordUsage(input: { grantId: string; usageCents?: number; organizationId?: string }): Promise<RoyaltyEntry> {
    const oid = input.organizationId || "org-windels";
    const usageCents = input.usageCents ?? 1;
    const gr = await redis.hgetall(K.grant(oid, input.grantId));
    if (!gr._doc) throw Object.assign(new Error("grant not found"), { status: 404 });
    const g: LicenseGrant = JSON.parse(gr._doc);
    g.usageCount = (g.usageCount||0) + 1; g.spendCents = (g.spendCents||0) + usageCents;
    await redis.hset(K.grant(oid,input.grantId), "_doc", s2(g));
    const ar = await redis.hgetall(K.asset(oid,g.assetId));
    const a: LicensedAsset = ar._doc ? JSON.parse(ar._doc) : { revenueSharePct: 10 } as any;
    const platformFee = Math.round(usageCents*0.2);
    const revSharePct = a.revenueSharePct ?? 10;
    const revShare = Math.round(usageCents*revSharePct/100);
    const owner = usageCents - platformFee - revShare;
    if (ar._doc) { a.revenueCents30d = (a.revenueCents30d||0)+usageCents; a.updatedAt = new Date().toISOString(); await redis.hset(K.asset(oid,g.assetId),"_doc",s2(a)); }
    await redis.hincrby(K.metrics(oid),"revenue30d", usageCents);
    await redis.hincrby(K.metrics(oid),"revenueAll", usageCents);
    await redis.hincrby(K.metrics(oid),"pending", owner);
    const rid = uid("roy-");
    const period = new Date().toISOString().slice(0,7);
    const entry: RoyaltyEntry = { id: rid, assetId: g.assetId, period, grossCents: usageCents, platformFeeCents: platformFee, revenueShareCents: revShare, ownerPayoutCents: owner, paid: false };
    await redis.hset(K.royalty(oid,rid), "_doc", s2(entry));
    await redis.zadd(K.royalties(oid), Date.now(), rid);
    emitKernel("licensing.usage.recorded", { organizationId: oid, grantId: input.grantId, usageCents });
    return entry;
  },

  async listGrants(oid = "org-windels"): Promise<LicenseGrant[]> {
    const ids = await redis.smembers(K.grants(oid));
    const out: LicenseGrant[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.grant(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out;
  },
};

export default LicensingService;
