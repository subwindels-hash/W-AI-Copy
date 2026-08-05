/**
 * Session 61 — Enterprise Data & Knowledge Marketplace.
 * The general-purpose marketplace (completes S40.1 stub); shared
 * licensing primitives for S41.9 Voice Marketplace + S52 Licensing.
 * Keys: dmp:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import {
  MarketplaceAsset, MktAssetKind, MktAssetStatus, MktLicenseModel,
  MarketplaceInstall, DmDashboard, MKT_ASSET_KINDS, MKT_LICENSE_MODELS,
} from "@windels/shared";
import { makeRng } from "../utils/detRng.js";

// Deterministic demo RNG — stable per (module, seed) so dashboard
// reads return the same numbers within a running process.
const _rng = makeRng('dataMarketplace');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }

const K = {
  a: (oid:string,id:string)=>`dmp:a:${oid}:${id}`,
  as: (oid:string)=>`dmp:as:${oid}`,
  i: (oid:string,id:string)=>`dmp:i:${oid}:${id}`,
  is: (oid:string)=>`dmp:is:${oid}`,
  rev: (oid:string)=>`dmp:rev:${oid}`,
};
const s2 = (o:any)=>JSON.stringify(o);
const uid = (p:string)=>p+randomUUID().slice(0,8);

const SEED: Array<{name:string;kind:MktAssetKind;publisher:string;desc:string;license:MktLicenseModel;price?:number;tags:string[];compliance:string[];rows?:number;sizeMb?:number}> = [
  {name:"Global Financial News Corpus",kind:"dataset",publisher:"WINDELS Data Co-op",desc:"30 years of curated financial news with entity tags.",license:"subscription",price:299,tags:["finance","news","nlp"],compliance:["gdpr"],rows:12_000_000,sizeMb:4200},
  {name:"Support Resolution RAG Pack",kind:"rag_collection",publisher:"WINDELS",desc:"Pre-chunked support tickets + resolutions for CS agents.",license:"subscription",price:99,tags:["support","rag","cs"],compliance:["soc2"],rows:420_000,sizeMb:820},
  {name:"Prompt Library — Exec Assistants",kind:"prompt_library",publisher:"Community",desc:"250 battle-tested prompts for exec-assistant agents.",license:"free",tags:["prompts","exec"],compliance:[]},
  {name:"Industry Model — Finetuned-7B Finance",kind:"industry_model",publisher:"WINDELS",desc:"Finance-domain LoRA adapter for Aria-7B.",license:"enterprise",tags:["finance","lora","model"],compliance:["soc2"],sizeMb:142},
  {name:"Synthetic Customer Churn Dataset",kind:"synthetic_data",publisher:"WINDELS Labs",desc:"1M labeled synthetic customer records for churn modeling.",license:"one_time",price:499,tags:["synthetic","churn","ml"],compliance:["gdpr"],rows:1_000_000,sizeMb:120},
  {name:"Finance KPI Business Template",kind:"business_template",publisher:"Enterprise Pack",desc:"Pre-built KPIs/dashboards for FP&A teams.",license:"one_time",price:79,tags:["finance","template","kpi"],compliance:[]},
  {name:"Healthcare Policy Knowledge Pack",kind:"knowledge_pack",publisher:"MedCore AI",desc:"HIPAA-aligned healthcare policies + procedures.",license:"enterprise",tags:["healthcare","compliance"],compliance:["hipaa"]},
  {name:"EU Public Procurement Open Data",kind:"public_dataset",publisher:"EU Open Data",desc:"Anonymized EU public procurement records 2015-2025.",license:"free",tags:["public","procurement"],compliance:[],rows:8_000_000,sizeMb:2100},
  {name:"Internal Data Exchange — Sales Win/Loss",kind:"internal_exchange",publisher:"Internal Sales Ops",desc:"Private org-only exchange for win/loss analyses.",license:"free",tags:["internal","sales"],compliance:[]},
  {name:"Licensed Geospatial Product NA",kind:"licensed_data_product",publisher:"GeoCore",desc:"Premium geospatial tiles for North America.",license:"royalty",price:1500,tags:["geo","maps"],compliance:[]},
];

export const DataMarketplaceService = {
  async ensureBootstrapped(logger?:any, oid="org-windels", uid0="user-admin"){
    _rng.reseed(`ensureBootstrapped:${logger}`);
    if (await redis.exists(K.as(oid))) return;
    // Synthetic seeding is gated by WINDELS_DEMO_DATA (default off) so a fresh
    // org starts empty and fills from real activity only.
    if (!demoDataEnabled()) return skipDemoSeed("data-marketplace", logger);
    const now = new Date().toISOString();
    for (const s of SEED) {
      const id = uid("ma-");
      const a: MarketplaceAsset = {
        id, organizationId: oid, name: s.name, kind: s.kind, publisher: s.publisher,
        publisherUserId: uid0, description: s.desc, version: "1.0.0",
        licenseModel: s.license,
        priceUsd: s.license==="free"?undefined:s.price,
        royaltyPct: s.license==="royalty"?0.08:undefined,
        subscriptionMonthlyUsd: s.license==="subscription"?s.price:undefined,
        rating: +rand(3.2,4.9).toFixed(2), installs: randInt(12,2400),
        qualityScore: +rand(0.7,0.98).toFixed(2),
        lineageStatus: s.publisher==="WINDELS"?"verified":"self_attested",
        complianceTags: s.compliance, tags: s.tags,
        sizeBytes: s.sizeMb?s.sizeMb*1024*1024:undefined, rows: s.rows,
        signed: true, status: "published", approvedAt: now,
        createdAt: now, updatedAt: now,
      };
      await redis.hset(K.a(oid,id),"_doc",s2(a));
      await redis.sadd(K.as(oid),id);
    }
    logger?.info?.("[data-mp] bootstrap complete",{assets:SEED.length});
  },

  async dashboard(oid="org-windels"): Promise<DmDashboard> {
    if (!(await redis.exists(K.as(oid)))) await this.ensureBootstrapped(undefined, oid);
    const assets = await this.list(oid);
    const installs: MarketplaceInstall[] = [];
    const iids = await redis.smembers(K.is(oid));
    for (const id of iids){const r=await redis.hgetall(K.i(oid,id)); if(r._doc) installs.push(JSON.parse(r._doc));}
    const byKind:any = Object.fromEntries(MKT_ASSET_KINDS.map(k=>[k,0]));
    const byLicense:any = Object.fromEntries(MKT_LICENSE_MODELS.map(k=>[k,0]));
    const tagCount = new Map<string,number>();
    const pubCount = new Map<string,{assets:number;installs:number}>();
    let revenue=0; const now=Date.now();
    for (const a of assets){
      byKind[a.kind]++; byLicense[a.licenseModel]++;
      for (const t of a.tags) tagCount.set(t,(tagCount.get(t)||0)+1);
      const entry = pubCount.get(a.publisher)||{assets:0,installs:0}; entry.assets++; pubCount.set(a.publisher,entry);
    }
    for (const i of installs){
      const a = assets.find(x=>x.id===i.assetId);
      if (a){
        if (a.subscriptionMonthlyUsd && now - new Date(i.installedAt).getTime() < 30*86400000) revenue += a.subscriptionMonthlyUsd;
        if (a.priceUsd && a.licenseModel==="one_time") revenue += a.priceUsd;
        const e = pubCount.get(a.publisher); if (e) e.installs++;
      }
    }
    const categories = Array.from(tagCount.entries()).map(([tag,count])=>({tag,count})).sort((a,b)=>b.count-a.count).slice(0,10);
    const featuredPublishers = Array.from(pubCount.entries()).map(([name,v])=>({name,...v})).sort((a,b)=>b.installs-a.installs).slice(0,5);
    return {
      totalAssets: assets.length,
      published: assets.filter(a=>a.status==="published").length,
      installsTotal: installs.length,
      byKind, byLicense,
      topAssets: [...assets].sort((a,b)=>b.installs-a.installs).slice(0,6),
      recentInstalls: installs.sort((a,b)=>b.installedAt.localeCompare(a.installedAt)).slice(0,8),
      categories, revenue30dUsd: +revenue.toFixed(2),
      featuredPublishers,
    };
  },

  async list(oid="org-windels", kind?:MktAssetKind): Promise<MarketplaceAsset[]> {
    if (!(await redis.exists(K.as(oid)))) await this.ensureBootstrapped(undefined, oid);
    const ids = await redis.smembers(K.as(oid));
    const out: MarketplaceAsset[] = [];
    for (const id of ids){const r=await redis.hgetall(K.a(oid,id)); if(r._doc) out.push(JSON.parse(r._doc));}
    let list = out.filter(a=>a.status==="published");
    if (kind) list = list.filter(a=>a.kind===kind);
    return list.sort((a,b)=>b.installs-a.installs);
  },

  async get(id:string, oid="org-windels"): Promise<MarketplaceAsset|null>{
    if (!(await redis.exists(K.as(oid)))) await this.ensureBootstrapped(undefined, oid);
    const r = await redis.hgetall(K.a(oid,id)); return r._doc?JSON.parse(r._doc):null;
  },

  /**
   * Shared access control and license verification primitive.
   * Leveraged by S61 Data Marketplace, S41.9 Voice Marketplace, and S52 Licensing Platform.
   */
  async checkAccess(assetId: string, oid = "org-windels"): Promise<{ allowed: boolean; reason?: string; licenseModel?: MktLicenseModel }> {
    const a = await this.get(assetId, oid);
    if (!a) return { allowed: false, reason: "asset_not_found" };
    if (a.licenseModel === "free") return { allowed: true, licenseModel: "free" };

    // Check if there is an active install record in the registry
    const iids = await redis.smembers(K.is(oid));
    for (const id of iids) {
      const r = await redis.hgetall(K.i(oid, id));
      if (r._doc) {
        const inst: MarketplaceInstall = JSON.parse(r._doc);
        if (inst.assetId === assetId && inst.status === "installed") {
          return { allowed: true, licenseModel: a.licenseModel };
        }
      }
    }
    return { allowed: false, reason: "no_active_license_install", licenseModel: a.licenseModel };
  },

  async publish(input:{name:string;kind:MktAssetKind;description:string;licenseModel:MktLicenseModel;priceUsd?:number;subscriptionMonthlyUsd?:number;royaltyPct?:number;tags?:string[];complianceTags?:string[];rows?:number;sizeBytes?:number;publisher?:string;organizationId?:string;createdBy:string}): Promise<MarketplaceAsset>{
    const oid = input.organizationId||"org-windels";
    const id = uid("ma-"); const now = new Date().toISOString();
    const a: MarketplaceAsset = {
      id, organizationId:oid, name:input.name, kind:input.kind, publisher:input.publisher||"Internal",
      publisherUserId: input.createdBy, description:input.description, version:"1.0.0",
      licenseModel:input.licenseModel, priceUsd:input.priceUsd, royaltyPct:input.royaltyPct,
      subscriptionMonthlyUsd:input.subscriptionMonthlyUsd,
      rating:0, installs:0, qualityScore:0.75, lineageStatus:"self_attested",
      complianceTags:input.complianceTags||[], tags:input.tags||[],
      sizeBytes:input.sizeBytes, rows:input.rows, signed:false, status:"published",
      approvedAt: now, createdAt:now, updatedAt:now,
    };
    await redis.hset(K.a(oid,id),"_doc",s2(a)); await redis.sadd(K.as(oid),id);
    return a;
  },

  async install(assetId:string, userId:string, oid="org-windels"): Promise<MarketplaceInstall>{
    const a = await this.get(assetId, oid); if(!a) throw Object.assign(new Error("asset not found"),{status:404});
    const id = uid("mi-"); const now = new Date().toISOString();
    const i: MarketplaceInstall = {
      id, assetId, organizationId:oid, installedBy:userId, installedAt:now, version:a.version, status:"installed",
    };
    await redis.hset(K.i(oid,id),"_doc",s2(i)); await redis.sadd(K.is(oid),id);
    a.installs += 1; a.updatedAt = now; await redis.hset(K.a(oid,assetId),"_doc",s2(a));
    return i;
  },

  async review(assetId:string, userId:string, rating:number, comment?:string, oid="org-windels"): Promise<MarketplaceAsset>{
    const a = await this.get(assetId,oid); if(!a) throw Object.assign(new Error("not found"),{status:404});
    // rolling average
    a.rating = +(((a.rating*a.installs) + Math.max(1,Math.min(5,rating)))/(a.installs+1)).toFixed(2);
    a.updatedAt = new Date().toISOString();
    await redis.hset(K.a(oid,assetId),"_doc",s2(a));
    return a;
  },
};
