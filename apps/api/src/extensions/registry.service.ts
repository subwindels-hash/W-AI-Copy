/**
 * ExtensionRegistryService — Slices 236 + 244:
 * Central extension registry with full dev→validation→security→test→approval→deploy→version→retire
 * lifecycle, install/enable/disable/review. All other extension-kind services reference entries here.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  Extension, ExtensionKind, ExtensionStatus, ExtensionReview,
  ExtensionVersion, LifecycleStage,
} from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('extensions:registry');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const LIST_KEY     = "ext:extensions";
const BY_SLUG      = "ext:slug";
const INSTALLED    = "ext:installed";
const DETAIL       = (id: string) => `ext:ext:${id}`;
const REVIEWS      = (id: string) => `ext:reviews:${id}`;
const INSTALL_LOG  = "ext:installs:log";

const STAGE_OF: Record<ExtensionStatus, LifecycleStage | null> = {
  draft: "dev", submitted: "validation", validating: "validation",
  security_review: "security_review", testing: "test", approved: "approval",
  published: "deploy", installed: "deploy", enabled: "deploy", disabled: "deploy",
  deprecated: "version", retired: "retire", rejected: null,
};

function iso() { return new Date().toISOString(); }
const SER = <T>(v: T) => JSON.stringify(v);
const pickStatus = (s: ExtensionStatus): Extension => { throw new Error("never"); };

// Transition rules — lifecycle (Slice 244)
const ALLOWED_TRANSITIONS: Record<ExtensionStatus, ExtensionStatus[]> = {
  draft: ["submitted", "retired"],
  submitted: ["validating", "rejected", "draft"],
  validating: ["security_review", "rejected"],
  security_review: ["testing", "rejected"],
  testing: ["approved", "rejected"],
  approved: ["published"],
  published: ["installed", "deprecated"],
  installed: ["enabled", "disabled", "deprecated"],
  enabled: ["disabled"],
  disabled: ["enabled", "deprecated"],
  deprecated: ["retired"],
  retired: [],
  rejected: ["draft"],
};

export const ExtensionRegistryService = {
  async list(filter?: { kind?: ExtensionKind; status?: ExtensionStatus; category?: string; q?: string }): Promise<Extension[]> {
    const ids = await redis.smembers(LIST_KEY);
    const out: Extension[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (!raw) continue;
      const e = JSON.parse(raw) as Extension;
      if (filter?.kind && e.kind !== filter.kind) continue;
      if (filter?.status && e.status !== filter.status) continue;
      if (filter?.category && e.category !== filter.category) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!e.name.toLowerCase().includes(q) && !e.description.toLowerCase().includes(q) && !e.tags.some(t => t.toLowerCase().includes(q))) continue;
      }
      // decorate install state
      const inst = await redis.hget(INSTALLED, id);
      if (inst) {
        const p = JSON.parse(inst);
        e.installed = true;
        e.enabled = p.enabled;
        e.installedVersion = p.version;
        e.installedAt = p.installedAt;
      } else {
        e.installed = false; e.enabled = false;
      }
      out.push(e);
    }
    return out.sort((a,b) => b.installCount - a.installCount);
  },

  async get(id: string): Promise<Extension | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as Extension) : null;
  },

  async getBySlug(slug: string): Promise<Extension | null> {
    const id = await redis.hget(BY_SLUG, slug);
    return id ? this.get(id) : null;
  },

  async register(input: Omit<Extension, "id"|"installCount"|"stars"|"ratingAvg"|"reviewCount"|"versions"|"reviews"|"status"|"lifecycleStage"|"updatedAt"> & { versions?: ExtensionVersion[] }): Promise<Extension> {
    _rng.reseed(`register`);
    const id = randomUUID();
    const now = iso();
    const e: Extension = {
      id, status: "draft", lifecycleStage: "dev",
      installCount: 0, stars: Math.floor(5 + _rng.next()*400), ratingAvg: 4 + _rng.next(), reviewCount: 0,
      versions: input.versions ?? [{ version: input.version, releasedAt: now, changelog: "initial release", minPlatformVersion: input.minPlatformVersion, status: "draft", downloads: 0 }],
      reviews: [],
      updatedAt: now,
      ...input,
    };
    await redis.set(DETAIL(id), SER(e));
    await redis.sadd(LIST_KEY, id);
    await redis.hset(BY_SLUG, e.slug, id);
    return e;
  },

  async transition(id: string, to: ExtensionStatus, actor = "system", note?: string): Promise<Extension | null> {
    const e = await this.get(id);
    if (!e) return null;
    const allowed = ALLOWED_TRANSITIONS[e.status] ?? [];
    if (!allowed.includes(to)) throw new Error(`Invalid transition ${e.status}→${to}`);
    e.status = to;
    const stage = STAGE_OF[to];
    if (stage) e.lifecycleStage = stage;
    e.updatedAt = iso();
    await redis.set(DETAIL(id), SER(e));
    return e;
  },

  async install(id: string, version?: string): Promise<Extension | null> {
    const e = await this.get(id);
    if (!e) return null;
    if (e.status !== "published" && e.status !== "installed" && e.status !== "enabled" && e.status !== "disabled") {
      throw new Error(`Cannot install extension in status ${e.status}`);
    }
    const v = version ?? e.version;
    const now = iso();
    await redis.hset(INSTALLED, id, SER({ version: v, enabled: true, installedAt: now }));
    await redis.lpush(INSTALL_LOG, SER({ id, name: e.name, kind: e.kind, installedAt: now }));
    await redis.ltrim(INSTALL_LOG, 0, 19);
    e.installCount += 1;
    e.status = "installed";
    e.lifecycleStage = "deploy";
    e.updatedAt = now;
    // bump version download
    const vv = e.versions.find(x=>x.version===v);
    if (vv) vv.downloads += 1;
    await redis.set(DETAIL(id), SER(e));
    return e;
  },

  async uninstall(id: string): Promise<Extension | null> {
    const e = await this.get(id); if (!e) return null;
    await redis.hdel(INSTALLED, id);
    e.status = "published"; e.updatedAt = iso();
    await redis.set(DETAIL(id), SER(e));
    return e;
  },

  async setEnabled(id: string, enabled: boolean): Promise<Extension | null> {
    const e = await this.get(id); if (!e) return null;
    const raw = await redis.hget(INSTALLED, id);
    if (!raw) throw new Error("Extension not installed");
    const p = JSON.parse(raw);
    p.enabled = enabled;
    await redis.hset(INSTALLED, id, SER(p));
    e.status = enabled ? "enabled" : "disabled";
    e.updatedAt = iso();
    await redis.set(DETAIL(id), SER(e));
    return e;
  },

  async review(id: string, author: string, rating: number, comment: string): Promise<Extension | null> {
    const e = await this.get(id); if (!e) return null;
    const r: ExtensionReview = { id: randomUUID(), author, rating: Math.max(1,Math.min(5,Math.round(rating))), comment, createdAt: iso(), verified: true };
    e.reviews.unshift(r);
    if (e.reviews.length > 50) e.reviews.length = 50;
    e.reviewCount = e.reviews.length;
    e.ratingAvg = e.reviews.reduce((a,b)=>a+b.rating,0)/e.reviews.length;
    e.updatedAt = iso();
    await redis.set(DETAIL(id), SER(e));
    return e;
  },

  async releaseVersion(id: string, version: string, changelog: string, minPlatformVersion = "0.28.0"): Promise<Extension | null> {
    const e = await this.get(id); if (!e) return null;
    e.versions.unshift({ version, releasedAt: iso(), changelog, minPlatformVersion, status: e.status === "published" ? "published" : "draft", downloads: 0 });
    e.version = version;
    e.minPlatformVersion = minPlatformVersion;
    e.updatedAt = iso();
    await redis.set(DETAIL(id), SER(e));
    return e;
  },

  async installedIds(): Promise<string[]> {
    return redis.hkeys(INSTALLED);
  },

  async isInstalled(id: string): Promise<boolean> {
    return !!(await redis.hget(INSTALLED, id));
  },

  async recentInstalls(limit = 10): Promise<Array<{ id: string; name: string; kind: ExtensionKind; installedAt: string }>> {
    const raw = await redis.lrange(INSTALL_LOG, 0, limit - 1);
    return raw.map(r => JSON.parse(r));
  },

  async countByKind(): Promise<Record<ExtensionKind, number>> {
    const all = await this.list();
    const out: Record<string, number> = { business:0, industry:0, skill:0, agent:0, workflow:0, dashboard:0, "ui-component":0 };
    for (const e of all) out[e.kind] = (out[e.kind] ?? 0) + 1;
    return out as Record<ExtensionKind, number>;
  },

  async pendingReviewCount(): Promise<number> {
    const all = await this.list();
    return all.filter(e => e.status === "submitted" || e.status === "validating" || e.status === "security_review" || e.status === "testing" || e.status === "approved").length;
  },
};
