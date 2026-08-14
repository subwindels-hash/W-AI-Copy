/**
 * Enforcement gates across the remaining untested modules.
 *
 * These five modules had 0 tests between them despite owning the platform's
 * "may this proceed?" decisions: model promotion, DR readiness, workflow
 * deployment, constitutional policy and licence validity. A gate is only worth
 * anything if it can say no, so each test here drives the refusing path as well
 * as the allowing one.
 *
 * Runs fully in-memory: FakeKv replaces Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { ModelFactoryService } = await import("../modelFactory/modelFactory.service.js");
const { DisasterRecoveryService } = await import("../disasterRecovery/disasterRecovery.service.js");
const { ComposerService } = await import("../composer/composer.service.js");
const { ConstitutionService } = await import("../constitution/constitution.service.js");
const { LicensingService } = await import("../platformServices/licensing.service.js");

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("a model cannot be promoted past a gate it has not cleared", () => {
  async function newModel() {
    return ModelFactoryService.createModel({
      name: "m1", family: "aria", sizeParams: "7B", owner: "ml-team",
    } as never);
  }

  it("blocks validation until safety has been evaluated", async () => {
    const m = await newModel();
    await expect(ModelFactoryService.advanceStage(m.id, "validation" as never))
      .rejects.toThrow(/safety/i);
  });

  it("blocks canary until governance has approved", async () => {
    const m = await newModel();
    await ModelFactoryService.approveSafety(m.id, true);
    await ModelFactoryService.advanceStage(m.id, "validation" as never);
    await expect(ModelFactoryService.advanceStage(m.id, "canary" as never))
      .rejects.toThrow(/governance/i);
  });

  it("blocks promotion when safety was evaluated and FAILED", async () => {
    const m = await newModel();
    // The distinction that matters: evaluated-and-failed must not pass, and is
    // different from never-evaluated.
    await ModelFactoryService.approveSafety(m.id, false);
    await expect(ModelFactoryService.advanceStage(m.id, "validation" as never))
      .rejects.toThrow(/safety/i);
  });

  it("refuses to move a model backwards", async () => {
    const m = await newModel();
    await ModelFactoryService.approveSafety(m.id, true);
    await ModelFactoryService.advanceStage(m.id, "validation" as never);
    await expect(ModelFactoryService.advanceStage(m.id, "training" as never))
      .rejects.toThrow(/backwards/i);
  });

  it("records the benchmark verdict it was given, not a generated one", async () => {
    const m = await newModel();
    const res = await ModelFactoryService.runBenchmark(m.id, "mmlu", { score: 41.2, pass: false });
    // runBenchmark used to invent `50 + rng*45` and hard-code pass: true.
    expect(res.score).toBe(41.2);
    expect(res.pass).toBe(false);
  });
});

describe("disaster recovery reports only what was tested", () => {
  it("does not mark a component healthy just because a failover was requested", async () => {
    await DisasterRecoveryService.ensureBootstrapped(undefined, "org-t");
    await kv.hset("dr:status:org-t:database", "_doc", JSON.stringify({
      component: "database", healthy: false, standbyRegions: [], activeRegion: "na-east",
    }));
    await DisasterRecoveryService.triggerFailover({
      component: "database" as never, toRegion: "eu-west", reason: "drill", organizationId: "org-t",
    });
    const raw = await kv.hgetall("dr:status:org-t:database");
    const st = JSON.parse(raw._doc);
    // The failover record is not evidence the component came up healthy —
    // nothing probed it — and `healthy` feeds the dashboard's allHealthy.
    expect(st.healthy).toBe(false);
    expect(st.activeRegion).toBe("eu-west");
  });

  it("leaves a started drill running rather than grading itself", async () => {
    const d = await DisasterRecoveryService.scheduleDrill({
      component: "database" as never, scheduledAt: new Date().toISOString(), organizationId: "org-t",
    });
    const started = await DisasterRecoveryService.runDrill(d.id, "org-t");
    // It used to decide `passed` by coin flip and invent an RTO.
    expect(started.status).toBe("running");
    // No verdict and no measured RTO/RPO until someone records them.
    expect(started.results).toBeUndefined();
    expect(started.recordedBy).toBeUndefined();
  });

  it("accepts a measured drill result and reflects it in component health", async () => {
    await kv.hset("dr:status:org-t:database", "_doc", JSON.stringify({
      component: "database", healthy: true, standbyRegions: [], activeRegion: "na-east",
    }));
    const d = await DisasterRecoveryService.scheduleDrill({
      component: "database" as never, scheduledAt: new Date().toISOString(), organizationId: "org-t",
    });
    await DisasterRecoveryService.runDrill(d.id, "org-t");
    const done = await DisasterRecoveryService.recordDrillResult(
      d.id,
      { passed: false, rtoAchievedMs: 42_000, rpoAchievedMs: 1_000, issues: ["replica lagged"], recordedBy: "sre" },
      "org-t",
    );
    expect(done.status).toBe("failed");
    expect(done.results!.rtoAchievedMs).toBe(42_000);
    expect(done.recordedBy).toBe("sre");
    // A failed drill must drag the component unhealthy, not leave it green.
    const st = JSON.parse((await kv.hgetall("dr:status:org-t:database"))._doc);
    expect(st.healthy).toBe(false);
    expect(st.lastTestAt).toBeTruthy();
  });
});

describe("composer will not deploy an invalid workflow", () => {
  async function wf(nodes: unknown[], edges: unknown[] = []) {
    return ComposerService.upsert({
      createdBy: "u1", name: "w", nodes: nodes as never, edges: edges as never,
    });
  }

  it("rejects a workflow with no trigger", async () => {
    const w = await wf([{ id: "n2", kind: "output", label: "out" }]);
    const v = await ComposerService.validate(w.id);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /trigger/i.test(e.message))).toBe(true);
    await expect(ComposerService.deploy(w.id)).rejects.toThrow(/validation/i);
  });

  it("rejects an edge pointing at a node that does not exist", async () => {
    const w = await wf(
      [{ id: "n1", kind: "trigger", label: "t" }, { id: "n2", kind: "output", label: "o" }],
      [{ id: "e1", source: "n1", target: "ghost" }],
    );
    const v = await ComposerService.validate(w.id);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /ghost/.test(e.message))).toBe(true);
  });

  it("deploys a valid workflow", async () => {
    const w = await wf([
      { id: "n1", kind: "trigger", label: "t" },
      { id: "n2", kind: "capability", type: "summarise", label: "c" },
      { id: "n3", kind: "output", label: "o" },
    ]);
    expect((await ComposerService.validate(w.id)).valid).toBe(true);
    const deployed = await ComposerService.deploy(w.id);
    expect(deployed.status).toBe("deployed");
  });

  it("does not invent a verdict for runs it did not execute", async () => {
    const w = await wf([
      { id: "n1", kind: "trigger", label: "t" },
      { id: "n2", kind: "output", label: "o" },
    ]);
    await ComposerService.deploy(w.id);

    // History: this originally failed 1% of runs at random, and that synthetic
    // verdict fed the stored successRate. The first fix made every run report
    // "succeeded" instead — which removed the randomness but kept the
    // fabrication, since run() executes nothing (node execution belongs to the
    // workflow engine). Both directions are wrong; the run is now `queued`
    // until an executor reports back.
    for (let i = 0; i < 30; i++) {
      const log = await ComposerService.run(w.id, "u1");
      expect(log.status).toBe("queued");
      expect(log.status).not.toBe("failed"); // no random failures
    }

    const after = await ComposerService.get(w.id);
    // Nothing has reported an outcome, so there is no rate to report.
    expect(after!.runs).toBe(0);
    expect(after!.successRate).toBe(0);
  });

  it("reports a measured success rate once outcomes arrive", async () => {
    const w = await wf([
      { id: "n1", kind: "trigger", label: "t" },
      { id: "n2", kind: "output", label: "o" },
    ]);
    await ComposerService.deploy(w.id);

    for (let i = 0; i < 4; i++) {
      const log = await ComposerService.run(w.id, "u1");
      await ComposerService.reportRunOutcome(log.id, {
        status: i === 3 ? "failed" : "succeeded",
        reportedBy: "workflow-engine",
      });
    }

    const after = await ComposerService.get(w.id);
    expect(after!.runs).toBe(4);
    expect(after!.successRate).toBe(0.75); // 3 of 4, measured
  });
});

describe("the constitution can actually block", () => {
  // S163: the seed is now opt-in, so this suite builds its own policies through
  // the public API. That also makes it a real test of upsert/publish rather
  // than a test of the bootstrap fixture.
  async function seedOrg(oid: string) {
    const approval = await ConstitutionService.upsertPolicy({
      organizationId: oid, createdBy: "u1", domain: "escalation_requirements",
      title: "Safety Escalation", statement: "Self-harm content escalates to a human.",
      enforcementLevel: "hard_block", status: "approved",
      rule: { kind: "keyword", keywords: ["self-harm", "kill myself"] },
    });
    const spend = await ConstitutionService.upsertPolicy({
      organizationId: oid, createdBy: "u1", domain: "ai_decision_limits",
      title: "Daily Spending Cap", statement: "No spend over $1,000 without approval.",
      enforcementLevel: "hard_block", status: "approved",
      rule: { kind: "monetary_threshold", maxUsd: 1000 },
    });
    await ConstitutionService.publishConstitution({
      organizationId: oid, createdBy: "u1", name: "Test Constitution",
      policyIds: [approval.id, spend.id],
    });
    return { approval, spend };
  }

  it("refuses when the organization has published no constitution", async () => {
    // S163: this returned `allowed: true` with version 0 before — a request
    // nothing had checked was indistinguishable from one that passed.
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "wire the funds", organizationId: "org-empty",
    });
    expect(r.allowed).toBe(false);
    expect(r.posture).toBe("unconfigured");
    expect(r.requiresConfiguration).toBe(true);
    expect(r.constitutionVersion).toBeNull();
  });

  it("allows an innocuous request once a constitution exists", async () => {
    await seedOrg("org-t");
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "summarise the quarterly report", organizationId: "org-t",
    });
    expect(r.allowed).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.posture).toBe("enforced");
  });

  it("blocks a request that trips a hard_block policy", async () => {
    const { approval } = await seedOrg("org-t");
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "i want to kill myself", organizationId: "org-t",
    });
    expect(r.allowed).toBe(false);
    expect(r.violations.some((v) => v.action === "blocked" && v.policyId === approval.id)).toBe(true);
  });

  it("enforces a monetary threshold from the request context", async () => {
    // S163: policy statements were never evaluated; only keywords could trip.
    const { spend } = await seedOrg("org-t");
    const under = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "pay the invoice",
      context: { amountUsd: 500 }, organizationId: "org-t",
    });
    expect(under.allowed).toBe(true);

    const over = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "pay the invoice",
      context: { amountUsd: 25_000 }, organizationId: "org-t",
    });
    expect(over.allowed).toBe(false);
    expect(over.violations.some((v) => v.policyId === spend.id)).toBe(true);
  });

  it("records every violation it detects for audit", async () => {
    await seedOrg("org-t");
    const before = (await ConstitutionService.getViolations("org-t")).length;
    await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "how do i kill myself", organizationId: "org-t",
    });
    const after = await ConstitutionService.getViolations("org-t");
    expect(after.length).toBeGreaterThan(before);
  });
});

describe("licence verification rejects what it should", () => {
  async function issued(daysValid = 365) {
    return LicensingService.issue({
      holder: "acme", tenantId: "t1", tier: "enterprise" as never, seats: 10, daysValid,
    });
  }

  it("accepts a freshly issued licence", async () => {
    const l = await issued();
    const v = await LicensingService.verify(l.key);
    expect(v.valid).toBe(true);
  });

  it("rejects an unknown key", async () => {
    expect((await LicensingService.verify("WLNS-NOPE")).reason).toBe("not_found");
  });

  it("rejects a tampered licence", async () => {
    const l = await issued();
    // Grant extra seats without re-signing — the signature must catch it.
    const raw = JSON.parse((await kv.get(`psvc:license:${l.id}`))!);
    raw.seats = 10_000;
    await kv.set(`psvc:license:${l.id}`, JSON.stringify(raw));
    const v = await LicensingService.verify(l.key);
    expect(v.valid).toBe(false);
    expect(v.reason).toBe("bad_signature");
  });

  it("rejects a revoked licence", async () => {
    const l = await issued();
    await LicensingService.revoke(l.id);
    const v = await LicensingService.verify(l.key);
    expect(v.valid).toBe(false);
    expect(v.reason).toBe("revoked");
  });

  it("rejects an expired licence", async () => {
    const l = await issued(-1);
    const v = await LicensingService.verify(l.key);
    expect(v.valid).toBe(false);
    expect(v.reason).toBe("expired");
  });
});
