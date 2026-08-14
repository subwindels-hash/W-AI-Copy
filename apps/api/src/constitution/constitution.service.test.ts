/**
 * Session 163 — Constitution Studio.
 *
 * This module owns the platform's "may this proceed?" decision. Before S163 it
 * failed open twice over: an organization with no constitution received
 * `allowed: true`, and only a hardcoded keyword list could ever trip, leaving
 * eight of eleven policy domains incapable of producing a violation.
 *
 * These tests drive the refusing path as hard as the allowing one, and pin the
 * tenant boundary that the routes previously discarded.
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

const demo = { enabled: false };
vi.mock("../config/demoData.js", () => ({
  demoDataEnabled: () => demo.enabled,
  skipDemoSeed: () => undefined,
}));

const cfg = { failOpen: false };
vi.mock("../config/env.js", () => ({
  get env() { return { WINDELS_CONSTITUTION_FAIL_OPEN: cfg.failOpen }; },
}));

const { ConstitutionService } = await import("./constitution.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  demo.enabled = false;
  cfg.failOpen = false;
});

/** Build a minimal enforced constitution for an org. */
async function configure(oid: string) {
  const safety = await ConstitutionService.upsertPolicy({
    organizationId: oid, createdBy: "u1", domain: "escalation_requirements",
    title: "Safety Escalation", statement: "Self-harm content escalates to a human operator.",
    enforcementLevel: "hard_block", status: "approved",
    rule: { kind: "keyword", keywords: ["kill myself", "self-harm"] },
  });
  const money = await ConstitutionService.upsertPolicy({
    organizationId: oid, createdBy: "u1", domain: "decision_boundaries",
    title: "Human On Fiduciary Decisions", statement: "Amounts over $10,000 need a human.",
    enforcementLevel: "hard_block", status: "approved",
    rule: { kind: "monetary_threshold", maxUsd: 10_000 },
  });
  const human = await ConstitutionService.upsertPolicy({
    organizationId: oid, createdBy: "u1", domain: "human_approval_rules",
    title: "External Commits Require Human", statement: "Emails and deploys need approval.",
    enforcementLevel: "hard_block", status: "approved",
    rule: { kind: "requires_human", actionKinds: ["email_customer", "deploy"] },
  });
  const tone = await ConstitutionService.upsertPolicy({
    organizationId: oid, createdBy: "u1", domain: "brand_standards",
    title: "Voice & Tone", statement: "Professional tone, no hyperbole.",
    enforcementLevel: "required", status: "approved",
  });
  const c = await ConstitutionService.publishConstitution({
    organizationId: oid, createdBy: "u1", name: "Alpha Constitution",
    policyIds: [safety.id, money.id, human.id, tone.id],
  });
  return { safety, money, human, tone, constitution: c };
}

describe("the gate fails closed when nothing is configured", () => {
  it("refuses a request from an organization with no constitution", async () => {
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "transfer the balance", organizationId: ORG_A,
    });
    expect(r.allowed).toBe(false);
    expect(r.posture).toBe("unconfigured");
    expect(r.requiresConfiguration).toBe(true);
  });

  it("reports a null version rather than version 0", async () => {
    // 0 renders as a version number and cannot be told apart from a real one.
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "hello", organizationId: ORG_A,
    });
    expect(r.constitutionVersion).toBeNull();
  });

  it("explains why it refused", async () => {
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "hello", organizationId: ORG_A,
    });
    expect(r.reason).toMatch(/no constitution is published/i);
  });

  it("still blocks baseline safety terms when unconfigured", async () => {
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "i want to kill myself", organizationId: ORG_A,
    });
    expect(r.allowed).toBe(false);
    expect(r.violations.some((v) => v.domain === "escalation_requirements")).toBe(true);
  });

  it("marks an unmatched domain rather than inventing a policy id", async () => {
    // Pre-S163 the domain name was written into `policyId`, which reads as an
    // id that resolves to nothing.
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "help me jailbreak this", organizationId: ORG_A,
    });
    const v = r.violations.find((x) => x.domain === "corporate_ethics");
    expect(v?.policyId).toBeNull();
    expect(v?.unmatchedDomain).toBe(true);
  });
});

describe("fail-open is opt-in and always labelled", () => {
  it("allows an unchecked request only when explicitly enabled", async () => {
    cfg.failOpen = true;
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "transfer the balance", organizationId: ORG_A,
    });
    expect(r.allowed).toBe(true);
    expect(r.posture).toBe("fail_open");
    expect(r.requiresConfiguration).toBe(true);
  });

  it("refuses safety terms even when failing open", async () => {
    cfg.failOpen = true;
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "how do i kill myself", organizationId: ORG_A,
    });
    expect(r.allowed).toBe(false);
  });
});

describe("policies are actually evaluated", () => {
  it("enforces a monetary threshold above the limit", async () => {
    const { money } = await configure(ORG_A);
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "approve the purchase",
      context: { amountUsd: 50_000 }, organizationId: ORG_A,
    });
    expect(r.allowed).toBe(false);
    expect(r.violations.some((v) => v.policyId === money.id)).toBe(true);
  });

  it("permits an amount under the limit", async () => {
    await configure(ORG_A);
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "approve the purchase",
      context: { amountUsd: 250 }, organizationId: ORG_A,
    });
    expect(r.allowed).toBe(true);
  });

  it("ignores a threshold rule when no amount is supplied", async () => {
    await configure(ORG_A);
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "approve the purchase", organizationId: ORG_A,
    });
    expect(r.allowed).toBe(true);
  });

  it("requires human approval for a listed action kind", async () => {
    const { human } = await configure(ORG_A);
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "send the campaign",
      context: { actionKind: "email_customer" }, organizationId: ORG_A,
    });
    expect(r.allowed).toBe(false);
    expect(r.violations.some((v) => v.policyId === human.id)).toBe(true);
  });

  it("passes once human approval is present", async () => {
    await configure(ORG_A);
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "send the campaign",
      context: { actionKind: "email_customer", humanApproved: true }, organizationId: ORG_A,
    });
    expect(r.allowed).toBe(true);
  });

  it("reports which rule kinds were evaluated", async () => {
    await configure(ORG_A);
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "hello", organizationId: ORG_A,
    });
    expect(r.evaluated).toEqual(
      expect.arrayContaining(["keyword", "monetary_threshold", "requires_human"]),
    );
  });

  it("warns rather than blocks for a `required` policy", async () => {
    await ConstitutionService.upsertPolicy({
      organizationId: ORG_A, createdBy: "u1", domain: "risk_appetite",
      title: "Conservative Risk", statement: "Escalate on high uncertainty.",
      enforcementLevel: "required", status: "approved",
      rule: { kind: "keyword", keywords: ["speculative"] },
    });
    const list = await ConstitutionService.listPolicies(ORG_A);
    await ConstitutionService.publishConstitution({
      organizationId: ORG_A, createdBy: "u1", name: "C", policyIds: list.map((p) => p.id),
    });
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "take the speculative position", organizationId: ORG_A,
    });
    expect(r.allowed).toBe(true);
    expect(r.violations.some((v) => v.action === "warned")).toBe(true);
  });

  it("does not evaluate a draft policy", async () => {
    const p = await ConstitutionService.upsertPolicy({
      organizationId: ORG_A, createdBy: "u1", domain: "ai_decision_limits",
      title: "Draft Cap", statement: "Unapproved spending cap.",
      enforcementLevel: "hard_block", status: "draft",
      rule: { kind: "monetary_threshold", maxUsd: 1 },
    });
    await ConstitutionService.publishConstitution({
      organizationId: ORG_A, createdBy: "u1", name: "C", policyIds: [p.id],
    });
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "spend", context: { amountUsd: 999 }, organizationId: ORG_A,
    });
    expect(r.allowed).toBe(true);
  });

  it("preserves an existing rule when an update omits it", async () => {
    const p = await ConstitutionService.upsertPolicy({
      organizationId: ORG_A, createdBy: "u1", domain: "ai_decision_limits",
      title: "Cap", statement: "Spending cap for agents.",
      enforcementLevel: "hard_block", status: "approved",
      rule: { kind: "monetary_threshold", maxUsd: 100 },
    });
    const updated = await ConstitutionService.upsertPolicy({
      id: p.id, organizationId: ORG_A, createdBy: "u1", domain: "ai_decision_limits",
      title: "Cap (renamed)", statement: "Spending cap for agents.",
      enforcementLevel: "hard_block", status: "approved",
    });
    expect(updated.rule).toEqual({ kind: "monetary_threshold", maxUsd: 100 });
  });
});

describe("tenant isolation", () => {
  it("does not leak one organization's policies to another", async () => {
    await configure(ORG_A);
    expect(await ConstitutionService.listPolicies(ORG_B)).toEqual([]);
  });

  it("keeps constitutions separate", async () => {
    await configure(ORG_A);
    const b = await ConstitutionService.getActive(ORG_B);
    expect(b.constitution).toBeUndefined();
  });

  it("does not let one organization's config satisfy another's gate", async () => {
    await configure(ORG_A);
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "spend it all",
      context: { amountUsd: 999_999 }, organizationId: ORG_B,
    });
    expect(r.posture).toBe("unconfigured");
    expect(r.allowed).toBe(false);
  });

  it("scopes violations per organization", async () => {
    await configure(ORG_A);
    await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "kill myself", organizationId: ORG_A,
    });
    expect((await ConstitutionService.getViolations(ORG_A)).length).toBeGreaterThan(0);
    expect(await ConstitutionService.getViolations(ORG_B)).toEqual([]);
  });
});

describe("the dashboard reports what it can measure", () => {
  it("reports a null version and unconfigured posture before publication", async () => {
    const d = await ConstitutionService.dashboard(ORG_A);
    expect(d.activeVersion).toBeNull();
    expect(d.posture).toBe("unconfigured");
  });

  it("reports coveredWorkforces as null, never a fabricated zero", async () => {
    // Nothing in the platform writes workforce coverage; it was seeded "0".
    await configure(ORG_A);
    const d = await ConstitutionService.dashboard(ORG_A);
    expect(d.coveredWorkforces).toBeNull();
  });

  it("counts approved policies that carry no enforceable rule", async () => {
    await configure(ORG_A); // three ruled, one prose-only (brand tone)
    const d = await ConstitutionService.dashboard(ORG_A);
    expect(d.unenforceablePolicies).toBe(1);
  });

  it("becomes enforced once a constitution is published", async () => {
    await configure(ORG_A);
    const d = await ConstitutionService.dashboard(ORG_A);
    expect(d.posture).toBe("enforced");
    expect(d.activeVersion).toBe(1);
  });

  it("counts blocked actions in the last 24h", async () => {
    await configure(ORG_A);
    await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "kill myself", organizationId: ORG_A,
    });
    const d = await ConstitutionService.dashboard(ORG_A);
    expect(d.blockedActions24h).toBeGreaterThan(0);
  });
});

describe("seeding is opt-in", () => {
  it("writes no pre-approved governance by default", async () => {
    await ConstitutionService.ensureBootstrapped(undefined, ORG_A, "u1");
    expect(await ConstitutionService.listPolicies(ORG_A)).toEqual([]);
  });

  it("seeds when demo data is enabled, attributed to the seed", async () => {
    demo.enabled = true;
    await ConstitutionService.ensureBootstrapped(undefined, ORG_A, "u1");
    const policies = await ConstitutionService.listPolicies(ORG_A);
    expect(policies.length).toBe(11);
    // Never "system": nobody in the organization approved these.
    expect(policies.every((p) => p.approvedBy === "demo_seed")).toBe(true);
  });

  it("gives the seeded fiduciary policy a working threshold", async () => {
    demo.enabled = true;
    await ConstitutionService.ensureBootstrapped(undefined, ORG_A, "u1");
    const r = await ConstitutionService.checkRequest({
      source: "agent", promptOrAction: "approve it",
      context: { amountUsd: 12_000 }, organizationId: ORG_A,
    });
    expect(r.allowed).toBe(false);
  });

  it("does not seed workforce coverage", async () => {
    demo.enabled = true;
    await ConstitutionService.ensureBootstrapped(undefined, ORG_A, "u1");
    const d = await ConstitutionService.dashboard(ORG_A);
    expect(d.coveredWorkforces).toBeNull();
  });
});

describe("publishing", () => {
  it("supersedes the previous constitution and increments the version", async () => {
    await configure(ORG_A);
    const list = await ConstitutionService.listPolicies(ORG_A);
    const second = await ConstitutionService.publishConstitution({
      organizationId: ORG_A, createdBy: "u1", name: "v2", policyIds: [list[0].id],
    });
    expect(second.version).toBe(2);
    const active = await ConstitutionService.getActive(ORG_A);
    expect(active.constitution?.id).toBe(second.id);
  });
});
