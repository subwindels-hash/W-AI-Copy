/**
 * Session 53 — Enterprise Deployment Platform (V8.4 §8).
 * 14 target environments (win/linux/mac/docker/k8s/aws/azure/gcp/oracle/alibaba/
 * private/on-prem/air-gapped/edge). Automated validation, config, health.
 * Keys: dep:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { TARGET_ENVIRONMENTS, DeployStatus, DeploymentDashboard, DeploymentTarget, DeploymentValidation, DeploymentValidationCheck } from "@windels/shared";

const K = {
  t: (oid: string, id: string) => `dep:t:${oid}:${id}`,
  ts: (oid: string) => `dep:ts:${oid}`,
  v: (oid: string, tid: string) => `dep:v:${oid}:${tid}`,
};
const j = (s: string | null) => (s ? JSON.parse(s) : null);
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

export const LATEST_VERSION = "0.84.0";

const SEED_TARGETS: Array<{ name: string; environment: DeploymentTarget["environment"]; region?: string }> = [
  { name: "NA-East Production", environment: "aws", region: "us-east-1" },
  { name: "EU-West Production", environment: "kubernetes", region: "eu-west-1" },
  { name: "Edge Retail NYC", environment: "edge", region: "us-east-4" },
];

async function emitKernel(kind: string, payload: any) {
  try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ source: "deployment", kind, payload }); } catch {}
}

export const DeploymentService = {
  async ensureBootstrapped(logger?: any, oid = "org-windels") {
    if (await redis.exists(K.ts(oid))) return;
    for (const s of SEED_TARGETS) {
      await this.create({ name: s.name, environment: s.environment, region: s.region, modules: ["core","aiEcosystem","voiceFoundry","mediaGen","memoryEvolution","composer"], organizationId: oid, skipEmit: true });
    }
    logger?.info?.("[deployment] bootstrap complete", { targets: SEED_TARGETS.length });
  },

  async dashboard(oid = "org-windels"): Promise<DeploymentDashboard> {
    const targets = await this.list(oid);
    const byEnv: Record<DeploymentTarget["environment"], number> = Object.fromEntries(TARGET_ENVIRONMENTS.map(e=>[e,0])) as Record<DeploymentTarget["environment"],number>;
    for (const t of targets) byEnv[t.environment]++;
    const healthy = targets.filter(t=>t.status==="healthy").length;
    const degraded = targets.filter(t=>t.status==="degraded").length;
    const failed = targets.filter(t=>t.status==="failed").length;
    const outdated = targets.filter(t=>t.version!==LATEST_VERSION).length;
    const avg = targets.length ? Math.round((targets.reduce((s,t)=> s + (t.status==="healthy"?100:t.status==="degraded"?60:t.status==="failed"?20:50),0)/targets.length)*10)/10 : 0;
    return {
      totalTargets: targets.length, healthyTargets: healthy, degradedTargets: degraded, failedTargets: failed,
      byEnvironment: byEnv, latestVersion: LATEST_VERSION, outdatedTargets: outdated,
      avgHealthScore: avg, recent: targets.slice(0,6),
    };
  },

  async list(oid = "org-windels"): Promise<DeploymentTarget[]> {
    const ids = await redis.smembers(K.ts(oid));
    const out: DeploymentTarget[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.t(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  },

  async create(input: { name: string; environment: DeploymentTarget["environment"]; region?: string; endpoint?: string; modules?: string[]; organizationId?: string; skipEmit?: boolean }): Promise<DeploymentTarget> {
    const oid = input.organizationId || "org-windels";
    const id = uid("dt-"); const now = new Date().toISOString();
    const t: DeploymentTarget = {
      id, organizationId: oid, name: input.name, environment: input.environment, region: input.region,
      endpoint: input.endpoint, version: LATEST_VERSION,
      // A target starts unvalidated: it is not "healthy" until validate() has
      // actually run. Previously it was born healthy with validationPassed:true
      // and random cpu/mem/gpu telemetry that had never been sampled.
      status: "validating",
      modules: input.modules || [], validationPassed: false,
      createdAt: now, updatedAt: now,
    };
    await redis.hset(K.t(oid,id), "_doc", s2(t));
    await redis.sadd(K.ts(oid), id);
    if (!input.skipEmit) emitKernel("deployment.target.created", { organizationId: oid, targetId: id, environment: t.environment });
    setImmediate(() => this.validate(id, oid).catch(()=>{}));
    return t;
  },

  /**
   * Run real infrastructure validation against the local runtime.
   *
   * This previously slept a few ms per check and set `passed = Math.random() >
   * 0.05`, writing the coin-flip straight onto the target as `validationPassed`
   * / `status: healthy`. A deployment gate that passes at random is worse than
   * no gate: it manufactures evidence of a check that never happened.
   *
   * Each check now actually probes the dependency. Where no probe is possible
   * for a given target (e.g. TLS termination on a remote host we cannot reach
   * from here) the check is marked `skipped` rather than passed, so the gap is
   * visible instead of being silently counted as success.
   */
  async validate(targetId: string, oid = "org-windels"): Promise<DeploymentValidation> {
    const start = Date.now();
    const checks: DeploymentValidationCheck[] = [];

    const run = async (
      category: DeploymentValidationCheck["category"],
      label: string,
      probe: () => Promise<{ ok: boolean; detail?: string } | "skip">,
    ) => {
      const c0 = Date.now();
      let passed = false, skipped = false, detail: string | undefined;
      try {
        const r = await probe();
        if (r === "skip") { skipped = true; detail = "No probe available from this host"; }
        else { passed = r.ok; detail = r.detail; }
      } catch (e: any) {
        passed = false;
        detail = e?.message ? String(e.message).slice(0, 300) : "probe threw";
      }
      checks.push({ id: uid("chk-"), category, label, passed, skipped, detail, durationMs: Date.now() - c0 });
    };

    // Redis — round-trip a real command.
    await run("redis", "Redis connectivity", async () => {
      const pong = await redis.ping();
      return { ok: pong === "PONG", detail: `PING -> ${pong}` };
    });

    // Postgres — issue a trivial query through Prisma.
    await run("database", "PostgreSQL connectivity", async () => {
      const { prisma } = await import("../db/client.js");
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, detail: "SELECT 1 succeeded" };
    });

    // Storage — prove the uploads directory is actually writable.
    await run("storage", "Persistent storage writable", async () => {
      const { writeFile, unlink, mkdir } = await import("node:fs/promises");
      const path = await import("node:path");
      const dir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), "uploads");
      await mkdir(dir, { recursive: true });
      const probe = path.join(dir, `.write-probe-${randomUUID().slice(0, 8)}`);
      await writeFile(probe, "ok");
      await unlink(probe);
      return { ok: true, detail: dir };
    });

    // Kernel — confirm the event bus module loads and reports a heartbeat.
    await run("kernel", "Kernel heartbeat", async () => {
      const { KernelService } = await import("../kernel/kernel.service.js");
      const alive = typeof (KernelService as any)?.dispatch === "function";
      return { ok: alive, detail: alive ? "dispatch available" : "kernel not initialised" };
    });

    // Models — a provider must actually be registered.
    await run("models", "Model registry reachable", async () => {
      const { aiRegistry } = await import("../services/ai/registry.js");
      const models = (aiRegistry as any)?.listModels?.() ?? [];
      return { ok: Array.isArray(models) && models.length > 0, detail: `${models.length} model(s) registered` };
    });

    // Connectivity / TLS to a remote target cannot be asserted from here.
    await run("connectivity", "Reach target endpoint", async () => "skip");
    await run("security", "TLS & certificate check", async () => "skip");

    const executed = checks.filter((c) => !c.skipped);
    const skippedCount = checks.length - executed.length;
    // Everything-skipped is not a pass.
    const passed = executed.length > 0 && executed.every((c) => c.passed);

    const tr = await redis.hgetall(K.t(oid, targetId));
    if (tr._doc) {
      const t: DeploymentTarget = JSON.parse(tr._doc);
      t.validationPassed = passed;
      t.status = passed ? "healthy" : "degraded";
      t.lastHealthCheckAt = new Date().toISOString();
      t.lastHealthOk = passed;
      t.updatedAt = new Date().toISOString();
      // Resource telemetry is only reported when it was actually sampled. The
      // previous random cpu/mem/gpu figures are left untouched rather than
      // overwritten with new noise.
      await redis.hset(K.t(oid, targetId), "_doc", s2(t));
    }
    const v: DeploymentValidation = {
      targetId, ranAt: new Date().toISOString(), passed, checks,
      durationMs: Date.now() - start, skippedCount,
    };
    await redis.set(K.v(oid, targetId), s2(v));
    return v;
  },

  async getLatestValidation(targetId: string, oid = "org-windels"): Promise<DeploymentValidation | null> {
    const s = await redis.get(K.v(oid,targetId));
    return s ? (JSON.parse(s) as DeploymentValidation) : null;
  },

  async destroy(targetId: string, oid = "org-windels"): Promise<void> {
    const r = await redis.hgetall(K.t(oid,targetId));
    if (r._doc) { const t: DeploymentTarget = JSON.parse(r._doc); t.status = "destroyed"; t.updatedAt = new Date().toISOString(); await redis.hset(K.t(oid,targetId),"_doc",s2(t)); }
    await redis.srem(K.ts(oid), targetId);
  },
};

export default DeploymentService;
