/**
 * Session 53 — Enterprise Deployment Platform (V8.4 §8).
 * 14 target environments (win/linux/mac/docker/k8s/aws/azure/gcp/oracle/alibaba/
 * private/on-prem/air-gapped/edge). Automated validation, config, health.
 * Keys: dep:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
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
  /**
   * S165 — seeding is opt-in.
   *
   * These are not neutral placeholders: "NA-East Production" (aws/us-east-1),
   * "EU-West Production" (kubernetes/eu-west-1) and "Edge Retail NYC" were
   * written on every boot, and `coreIntegration`'s health probe then counted
   * them as evidence that the platform was deployed. A reader of that report
   * concluded there were live production environments in two clouds and two
   * regions on an installation where nobody had deployed anything.
   */
  async ensureBootstrapped(logger?: any, oid = "org-windels") {
    if (await redis.exists(K.ts(oid))) return;
    if (!demoDataEnabled()) return skipDemoSeed("deployment", logger);
    for (const s of SEED_TARGETS) {
      await this.create({ name: s.name, environment: s.environment, region: s.region, modules: ["core","aiEcosystem","voiceFoundry","mediaGen","memoryEvolution","composer"], organizationId: oid, skipEmit: true, source: "demo_seed" });
    }
    logger?.info?.("[deployment] demo seed complete", { targets: SEED_TARGETS.length });
  },

  async dashboard(oid: string): Promise<DeploymentDashboard> {
    const targets = await this.list(oid);
    const byEnv: Record<DeploymentTarget["environment"], number> = Object.fromEntries(TARGET_ENVIRONMENTS.map(e=>[e,0])) as Record<DeploymentTarget["environment"],number>;
    for (const t of targets) byEnv[t.environment]++;
    const healthy = targets.filter(t=>t.status==="healthy").length;
    const degraded = targets.filter(t=>t.status==="degraded").length;
    const failed = targets.filter(t=>t.status==="failed").length;

    // S165: only a REPORTED version can be out of date. The assigned `version`
    // is set to LATEST_VERSION at creation, so the old comparison was always 0.
    const outdated = targets.filter(t => t.reportedVersion && t.reportedVersion !== LATEST_VERSION).length;
    const unknownVersion = targets.filter(t => !t.reportedVersion).length;

    // S165: health is the share of VALIDATED targets whose last real check
    // passed. A target that has never been validated is excluded rather than
    // scored 50, and an empty denominator is null rather than 0.
    const validated = targets.filter(t => t.lastHealthOk !== undefined);
    const avg = validated.length
      ? Math.round((validated.filter(t => t.lastHealthOk).length / validated.length) * 1000) / 10
      : null;

    return {
      totalTargets: targets.length, healthyTargets: healthy, degradedTargets: degraded, failedTargets: failed,
      byEnvironment: byEnv, latestVersion: LATEST_VERSION,
      outdatedTargets: outdated, unknownVersionTargets: unknownVersion,
      avgHealthScore: avg, validatedTargets: validated.length,
      recent: targets.slice(0,6),
    };
  },

  async list(oid: string): Promise<DeploymentTarget[]> {
    const ids = await redis.smembers(K.ts(oid));
    const out: DeploymentTarget[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.t(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  },

  async create(input: { name: string; environment: DeploymentTarget["environment"]; region?: string; endpoint?: string; modules?: string[]; organizationId: string; skipEmit?: boolean; source?: DeploymentTarget["source"] }): Promise<DeploymentTarget> {
    const oid = input.organizationId;
    const id = uid("dt-"); const now = new Date().toISOString();
    const t: DeploymentTarget = {
      id, organizationId: oid, name: input.name, environment: input.environment, region: input.region,
      endpoint: input.endpoint, version: LATEST_VERSION,
      // A target starts unvalidated: it is not "healthy" until validate() has
      // actually run. Previously it was born healthy with validationPassed:true
      // and random cpu/mem/gpu telemetry that had never been sampled.
      status: "validating",
      modules: input.modules || [], validationPassed: false,
      source: input.source ?? "operator_registered",
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
   * This previously slept a few ms per check and set `passed = a non-deterministic RNG >
   * 0.05`, writing the coin-flip straight onto the target as `validationPassed`
   * / `status: healthy`. A deployment gate that passes at random is worse than
   * no gate: it manufactures evidence of a check that never happened.
   *
   * Each check now actually probes the dependency. Where no probe is possible
   * for a given target (e.g. TLS termination on a remote host we cannot reach
   * from here) the check is marked `skipped` rather than passed, so the gap is
   * visible instead of being silently counted as success.
   */
  async validate(targetId: string, oid: string): Promise<DeploymentValidation> {
    const start = Date.now();
    const checks: DeploymentValidationCheck[] = [];

    const run = async (
      category: DeploymentValidationCheck["category"],
      // S165 — every check declares what it actually exercised. A local_host
      // probe is real but proves nothing about a remote environment.
      scope: DeploymentValidationCheck["scope"],
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
      checks.push({ id: uid("chk-"), category, scope, label, passed, skipped, detail, durationMs: Date.now() - c0 });
    };

    // Redis — round-trip a real command.
    await run("redis", "local_host", "Redis connectivity", async () => {
      const pong = await redis.ping();
      return { ok: pong === "PONG", detail: `PING -> ${pong}` };
    });

    // Postgres — issue a trivial query through Prisma.
    await run("database", "local_host", "PostgreSQL connectivity", async () => {
      const { prisma } = await import("../db/client.js");
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, detail: "SELECT 1 succeeded" };
    });

    // Storage — prove the uploads directory is actually writable.
    await run("storage", "local_host", "Persistent storage writable", async () => {
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
    await run("kernel", "local_host", "Kernel heartbeat", async () => {
      const { KernelService } = await import("../kernel/kernel.service.js");
      const alive = typeof (KernelService as any)?.dispatch === "function";
      return { ok: alive, detail: alive ? "dispatch available" : "kernel not initialised" };
    });

    // Models — a provider must actually be registered.
    await run("models", "local_host", "Model registry reachable", async () => {
      const { aiRegistry } = await import("../services/ai/registry.js");
      const models = (aiRegistry as any)?.listModels?.() ?? [];
      return { ok: Array.isArray(models) && models.length > 0, detail: `${models.length} model(s) registered` };
    });

    // Connectivity / TLS to a remote target cannot be asserted from here.
    await run("connectivity", "target", "Reach target endpoint", async () => "skip");
    await run("security", "target", "TLS & certificate check", async () => "skip");

    const executed = checks.filter((c) => !c.skipped);
    const skippedCount = checks.length - executed.length;
    // Everything-skipped is not a pass.
    const passed = executed.length > 0 && executed.every((c) => c.passed);

    // S165: how much of this run actually exercised the TARGET. Every
    // executable probe here interrogates the local API host; the two
    // target-specific checks are precisely the two that get skipped. Writing
    // "healthy" onto a remote environment on the strength of local Redis
    // connectivity is a claim the run does not support.
    const targetScopedChecks = executed.filter((c) => c.scope === "target").length;
    const provedTarget = targetScopedChecks > 0;

    const tr = await redis.hgetall(K.t(oid, targetId));
    if (tr._doc) {
      const t: DeploymentTarget = JSON.parse(tr._doc);
      t.validationPassed = passed;
      t.status = !passed ? "degraded" : provedTarget ? "healthy" : "validated_locally";
      t.lastHealthCheckAt = new Date().toISOString();
      // Only claim target health when something actually probed the target.
      if (provedTarget) t.lastHealthOk = passed;
      t.updatedAt = new Date().toISOString();
      // Resource telemetry is only reported when it was actually sampled. The
      // previous random cpu/mem/gpu figures are left untouched rather than
      // overwritten with new noise.
      await redis.hset(K.t(oid, targetId), "_doc", s2(t));
    }
    const v: DeploymentValidation = {
      targetId, ranAt: new Date().toISOString(), passed, checks,
      durationMs: Date.now() - start, skippedCount, targetScopedChecks,
    };
    await redis.set(K.v(oid, targetId), s2(v));
    return v;
  },

  async getLatestValidation(targetId: string, oid: string): Promise<DeploymentValidation | null> {
    const s = await redis.get(K.v(oid,targetId));
    return s ? (JSON.parse(s) as DeploymentValidation) : null;
  },

  /**
   * S165 — record the version an environment reports for itself.
   *
   * Nothing previously observed a target's running version: `create()` assigned
   * `LATEST_VERSION`, so `outdatedTargets` (version !== LATEST) was always 0 by
   * construction. A real report has to come from outside.
   */
  async reportVersion(input: { targetId: string; version: string; organizationId: string }): Promise<DeploymentTarget> {
    const oid = input.organizationId;
    const r = await redis.hgetall(K.t(oid, input.targetId));
    if (!r._doc) throw Object.assign(new Error("target not found"), { status: 404 });
    const t: DeploymentTarget = JSON.parse(r._doc);
    t.reportedVersion = input.version;
    t.versionReportedAt = new Date().toISOString();
    t.updatedAt = t.versionReportedAt;
    await redis.hset(K.t(oid, input.targetId), "_doc", s2(t));
    return t;
  },

  /**
   * S165 — remove a target from the registry.
   *
   * Renamed from `destroy()`: nothing here provisions or tears down
   * infrastructure. This de-registers a declared target and touches no cloud
   * environment, so the status it writes says exactly that.
   */
  async deregister(targetId: string, oid: string): Promise<{ deregistered: boolean; infrastructureModified: false }> {
    const r = await redis.hgetall(K.t(oid,targetId));
    let found = false;
    if (r._doc) {
      found = true;
      const t: DeploymentTarget = JSON.parse(r._doc);
      t.status = "deregistered"; t.updatedAt = new Date().toISOString();
      await redis.hset(K.t(oid,targetId),"_doc",s2(t));
    }
    await redis.srem(K.ts(oid), targetId);
    return { deregistered: found, infrastructureModified: false };
  },

  /** @deprecated S165 — use `deregister`. Kept so existing callers keep working. */
  async destroy(targetId: string, oid: string): Promise<void> {
    await this.deregister(targetId, oid);
  },
};

export default DeploymentService;
