/**
 * Session 54 — Enterprise Update & Lifecycle Management (V8.4 §9).
 * Controlled upgrades: auto/manual/module/plugin/model/voice/language packs,
 * blue/green, canary, rollback, version tracking, dependency validation.
 * Keys: upd:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import {
  UpdatePackage, UpdateChannel, UpdateStrategy, UpdateCategory, UpdateStatus,
  UpdateCheck, UpdateValidation, UpdateRollout, UpdateDashboard, UPDATE_CATEGORIES, UPDATE_CHANNELS, UPDATE_STRATEGIES,
} from "@windels/shared";

const K = {
  p: (oid: string, id: string) => `upd:p:${oid}:${id}`,
  ps: (oid: string) => `upd:ps:${oid}`,
  v: (oid: string, pid: string) => `upd:v:${oid}:${pid}`,
  r: (oid: string, id: string) => `upd:r:${oid}:${id}`,
  meta: (oid: string) => `upd:meta:${oid}`,
};
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

const CURRENT_VERSION = "0.85.0";
const DEFAULT_CHANNEL: UpdateChannel = "stable";

const SEED_UPDATES: Array<{ name: string; version: string; category: UpdateCategory; channel: UpdateChannel; strategy: UpdateStrategy; sizeMb: number; changelog: string }> = [
  { name: "WINDELS Platform Core", version: "0.84.1", category: "platform", channel: "stable", strategy: "blue_green", sizeMb: 42, changelog: "Stability + security patches." },
  { name: "GPT-Sovits Voice Pack — EN-US Maya", version: "1.2.0", category: "voice_pack", channel: "stable", strategy: "auto", sizeMb: 320, changelog: "New natural voice, improved prosody." },
  { name: "Aria-7B Reasoning Model", version: "2.3.0", category: "model", channel: "canary", strategy: "canary", sizeMb: 14200, changelog: "Better reasoning on enterprise tasks." },
  { name: "Slack Connector", version: "1.1.4", category: "connector", channel: "stable", strategy: "auto", sizeMb: 1, changelog: "Thread-reply bug fix." },
  { name: "Security Hotfix — Kernel", version: "0.84.1-h1", category: "security_patch", channel: "stable", strategy: "auto", sizeMb: 2, changelog: "Critical kernel auth patch." },
  { name: "Finance Industry Template", version: "1.0.0", category: "template", channel: "beta", strategy: "manual", sizeMb: 5, changelog: "New finance workflows + KPIs." },
];

async function emitKernel(kind: string, payload: any) {
  try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ source: "updates", kind, payload }); } catch {}
}

function newPkg(oid: string, s: typeof SEED_UPDATES[number], createdBy: string, status: UpdateStatus = "pending"): UpdatePackage {
  const now = new Date().toISOString();
  return {
    id: uid("upd-"),
    organizationId: oid,
    name: s.name, version: s.version, fromVersion: CURRENT_VERSION,
    category: s.category, channel: s.channel, strategy: s.strategy,
    sizeBytes: s.sizeMb * 1024 * 1024, changelog: s.changelog,
    dependencies: [], signed: true, sha256: randomUUID().replace(/-/g,"").repeat(2).slice(0,64),
    approvalsRequired: ["security_patch","platform"].includes(s.category) ? 2 : s.channel === "stable" ? 1 : 0,
    approvalsGiven: [], status, progressPct: status === "deployed" ? 100 : 0,
    canaryPct: s.strategy === "canary" ? 5 : undefined,
    blueGreenActive: s.strategy === "blue_green" ? "blue" : undefined,
    createdAt: now, updatedAt: now, deployedAt: status === "deployed" ? now : undefined, createdBy,
  };
}

export const UpdateService = {
  async ensureBootstrapped(logger?: any, oid = "org-windels", uid0 = "user-admin") {
    if (await redis.exists(K.ps(oid))) return;
    // seed: mark platform 0.84.0 as current deployed, others as available
    const cur = newPkg(oid, { name: "WINDELS Platform Core", version: "0.84.0", category: "platform", channel: "stable", strategy: "blue_green", sizeMb: 40, changelog: "Current installed" }, uid0, "deployed");
    cur.deployedAt = new Date(Date.now()-7*86400000).toISOString(); cur.createdAt = cur.deployedAt; cur.updatedAt = cur.deployedAt;
    await redis.hset(K.p(oid,cur.id), "_doc", s2(cur));
    await redis.sadd(K.ps(oid), cur.id);
    for (const s of SEED_UPDATES) {
      const p = newPkg(oid, s, uid0);
      await redis.hset(K.p(oid,p.id), "_doc", s2(p));
      await redis.sadd(K.ps(oid), p.id);
    }
    await redis.hset(K.meta(oid), "currentVersion", CURRENT_VERSION, "channel", DEFAULT_CHANNEL, "lastCheckAt", new Date().toISOString());
    logger?.info?.("[updates] bootstrap complete", { packages: SEED_UPDATES.length + 1 });
  },

  async dashboard(oid = "org-windels"): Promise<UpdateDashboard> {
    const all = await this.list(oid);
    const meta = await redis.hgetall(K.meta(oid));
    const now = Date.now();
    const deployed7 = all.filter(p=>p.status==="deployed" && p.deployedAt && now - new Date(p.deployedAt).getTime() < 7*86400000).length;
    const rolledBack30 = all.filter(p=>p.status==="rolled_back" && p.updatedAt && now - new Date(p.updatedAt).getTime() < 30*86400000).length;
    return {
      availableUpdates: all.filter(p=>p.status==="pending" || p.status==="staged").length,
      pendingApproval: all.filter(p=>p.approvalsGiven.length < p.approvalsRequired && p.status!=="deployed").length,
      deploying: all.filter(p=>["downloading","staged","approved","deploying"].includes(p.status)).length,
      deployedLast7d: deployed7,
      rollbacksLast30d: rolledBack30,
      currentVersion: meta.currentVersion || CURRENT_VERSION,
      channel: (meta.channel as UpdateChannel) || DEFAULT_CHANNEL,
      lastCheckAt: meta.lastCheckAt || new Date().toISOString(),
      recent: all.slice(0,6),
    };
  },

  async list(oid = "org-windels"): Promise<UpdatePackage[]> {
    const ids = await redis.smembers(K.ps(oid));
    const out: UpdatePackage[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.p(oid,id)); if (r._doc) { try { out.push(JSON.parse(r._doc)); } catch {} } }
    return out.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
  },

  async get(id: string, oid = "org-windels"): Promise<UpdatePackage | null> {
    const r = await redis.hgetall(K.p(oid,id)); return r._doc ? JSON.parse(r._doc) : null;
  },

  async checkForUpdates(oid = "org-windels"): Promise<UpdatePackage[]> {
    // Simulate fetching from upstream; already seeded.
    await redis.hset(K.meta(oid), "lastCheckAt", new Date().toISOString());
    const all = await this.list(oid);
    return all.filter(p=>p.status==="pending");
  },

  async validate(id: string, oid = "org-windels"): Promise<UpdateValidation> {
    const p = await this.get(id, oid);
    const start = Date.now();
    const checks: UpdateCheck[] = [];
    // Preflight for a software rollout. This previously slept a few ms per check
    // and set `passed = Math.random() > 0.06`, so a package could be marked
    // "staged" — signature verified, backup taken, smoke tests green — without
    // any of it happening. Checks that can be verified here are executed; the
    // rest are marked `skipped` rather than counted as passes.
    const run = async (
      kind: UpdateCheck["kind"],
      label: string,
      probe: () => Promise<{ ok: boolean; detail?: string } | "skip">,
    ) => {
      const t0 = Date.now();
      let passed = false, skipped = false, detail: string | undefined;
      try {
        const r = await probe();
        if (r === "skip") { skipped = true; detail = "Not verifiable from the control plane"; }
        else { passed = r.ok; detail = r.detail; }
      } catch (e: any) {
        detail = e?.message ? String(e.message).slice(0, 300) : "probe threw";
      }
      checks.push({ id: uid("uc-"), packageId: id, kind, label, passed, skipped, detail, durationMs: Date.now() - t0 });
    };

    // Governance approval is recorded state — genuinely checkable.
    await run("governance", "Governance approval present", async () => {
      if (!p) return { ok: false, detail: "package not found" };
      const have = p.approvalsGiven.length, need = p.approvalsRequired;
      return { ok: have >= need, detail: `${have}/${need} approvals` };
    });

    // Disk headroom on the host running the control plane.
    await run("space", "Disk & memory headroom", async () => {
      const { statfs } = await import("node:fs/promises");
      const st: any = await (statfs as any)(process.cwd());
      const freeBytes = Number(st.bsize) * Number(st.bavail);
      const freeMb = Math.floor(freeBytes / 1_048_576);
      return { ok: freeMb > 512, detail: `${freeMb} MB free` };
    });

    // A signature can only be verified against a real artifact + public key.
    await run("signature", "Package signature verified", async () => {
      if (p?.signature && process.env.UPDATE_SIGNING_PUBLIC_KEY) {
        return { ok: false, detail: "Signature present but verification is not implemented" };
      }
      return "skip";
    });

    // These require the artifact, a staging environment, and a snapshot target.
    await run("dependency", "Dependencies satisfied", async () => "skip");
    await run("compatibility", "Module compatibility matrix", async () => "skip");
    await run("backup", "Pre-upgrade snapshot taken", async () => "skip");
    await run("preflight_test", "Smoke tests against staging", async () => "skip");

    const executed = checks.filter((c) => !c.skipped);
    const passed = executed.length > 0 && executed.every((c) => c.passed);
    const v: UpdateValidation = { packageId: id, ranAt: new Date().toISOString(), passed, checks, durationMs: Date.now()-start };
    if (p) { p.status = passed ? "staged" : "failed"; p.updatedAt = new Date().toISOString(); await redis.hset(K.p(oid,id),"_doc",s2(p)); }
    await redis.set(K.v(oid,id), s2(v));
    return v;
  },

  async approve(id: string, approverUserId: string, oid = "org-windels"): Promise<UpdatePackage> {
    const p = await this.get(id, oid); if (!p) throw Object.assign(new Error("not found"), {status:404});
    if (!p.approvalsGiven.includes(approverUserId)) p.approvalsGiven.push(approverUserId);
    p.status = p.approvalsGiven.length >= p.approvalsRequired ? "approved" : p.status;
    p.updatedAt = new Date().toISOString();
    await redis.hset(K.p(oid,id),"_doc",s2(p));
    return p;
  },

  async deploy(id: string, oid = "org-windels"): Promise<UpdatePackage> {
    const p = await this.get(id, oid); if (!p) throw Object.assign(new Error("not found"),{status:404});
    if (p.approvalsGiven.length < p.approvalsRequired) throw Object.assign(new Error("approvals required"),{status:400});
    p.status = "deploying"; p.updatedAt = new Date().toISOString(); p.progressPct = 10;
    await redis.hset(K.p(oid,id),"_doc",s2(p));
    // Progress is reported, not simulated. There is no artifact transfer to
    // pace here, so the package moves straight to deployed; the previous code
    // slept through fake 25% increments to imitate a staged rollout.
    p.progressPct = 100;
    p.status = "deployed"; p.deployedAt = new Date().toISOString(); p.updatedAt = p.deployedAt;
    await redis.hset(K.meta(oid), "currentVersion", p.version, "channel", p.channel);
    await redis.hset(K.p(oid,id),"_doc",s2(p));
    // Emit rollout record
    const rollout: UpdateRollout = {
      id: uid("roll-"), packageId: id, organizationId: oid, environment: "production",
      strategy: p.strategy, canaryPct: p.canaryPct||0, blueGreenSide: p.blueGreenActive||"blue",
      startedAt: new Date(Date.now()-2000).toISOString(), completedAt: p.deployedAt, status: "completed",
      // errorRate / p95LatencyMs are intentionally omitted: no post-rollout
      // telemetry has been observed yet, and undefined is honest where a
      // flattering 0.4% error rate is a claim.
    };
    await redis.hset(K.r(oid,rollout.id), "_doc", s2(rollout));
    emitKernel("update.deployed", { packageId: id, version: p.version });
    return p;
  },

  async rollback(id: string, oid = "org-windels"): Promise<UpdatePackage> {
    const p = await this.get(id, oid); if (!p) throw Object.assign(new Error("not found"),{status:404});
    p.status = "rolled_back"; p.rolledBackFrom = p.version;
    p.version = p.fromVersion || "0.84.0"; p.updatedAt = new Date().toISOString();
    await redis.hset(K.p(oid,id),"_doc",s2(p));
    emitKernel("update.rolled_back", { packageId: id });
    return p;
  },

  async setChannel(channel: UpdateChannel, oid = "org-windels"): Promise<{channel: UpdateChannel}> {
    if (!UPDATE_CHANNELS.includes(channel)) throw Object.assign(new Error("bad channel"),{status:400});
    await redis.hset(K.meta(oid), "channel", channel);
    return { channel };
  },
};

export const UPDATE_CATEGORIES_LIST = UPDATE_CATEGORIES;
export const UPDATE_CHANNELS_LIST = UPDATE_CHANNELS;
export const UPDATE_STRATEGIES_LIST = UPDATE_STRATEGIES;
