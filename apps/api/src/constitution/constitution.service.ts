/**
 * Session 48 — Constitution Studio (V8.4 §3).
 * Organizations define their own AI constitutions. Backs S44.11 policy stub.
 *
 * SCOPE, HONESTLY (S163): this header used to claim that "every AI
 * Employee/Workforce inherits the active approved constitution". It does not.
 * `checkRequest` has no production callers — the agent execution path never
 * consults it. What this module provides is a correct, fail-closed gate that
 * is safe to call; wiring it into the execution path is a separate piece of
 * work and has not been done.
 *
 * 11 configurable policy domains. Enforcement levels: advisory / required / hard_block.
 * Keys: cst:* (all org-scoped).
 *
 * S163 — this module owns the platform's "may this proceed?" decision, and it
 * previously failed open in two ways:
 *
 *  1. `checkRequest` derived its action from `policy?.enforcementLevel`. An
 *     organization with no policy for the matched domain got `undefined`, fell
 *     through to "logged", and received `allowed: true`. A self-harm or
 *     jailbreak prompt was permitted for every org except the seeded one, with
 *     no signal that nothing had been checked.
 *  2. Only a 12-keyword blocklist could ever trip. The policy *statements* —
 *     the $10,000 approval threshold, the $1,000/day spend cap — were never
 *     evaluated; eight of the eleven domains could not produce a violation
 *     under any input.
 *
 * Both are fixed here. The gate now fails **closed** on an unconfigured
 * organization (`posture: "unconfigured"`, `allowed: false`) unless an operator
 * explicitly sets WINDELS_CONSTITUTION_FAIL_OPEN=true, and policies carry
 * structured `rule` objects that are actually evaluated.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { env } from "../config/env.js";
import type {
  CheckResult,
  Constitution,
  ConstitutionCheckPosture,
  ConstitutionDashboard,
  ConstitutionDomain,
  ConstitutionPolicy,
  ConstitutionRule,
  ConstitutionRuleKind,
  ConstitutionViolation,
} from "@windels/shared";

const K = {
  active: (oid: string) => `cst:active:${oid}`,
  policy: (oid: string, id: string) => `cst:policy:${oid}:${id}`,
  policies: (oid: string) => `cst:policies:${oid}`,
  constitution: (oid: string, id: string) => `cst:c:${oid}:${id}`,
  constitutions: (oid: string) => `cst:cs:${oid}`,
  violations: (oid: string) => `cst:v:${oid}`,
  metrics: (oid: string) => `cst:m:${oid}`,
};
const j = (s: string | null) => (s ? JSON.parse(s) : null);
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

/**
 * S163 — seed policies now carry the machine-checkable rule that makes each
 * statement enforceable. Before this, all eleven were prose: the two monetary
 * limits and the human-approval requirement described precise, checkable
 * conditions that nothing ever evaluated.
 *
 * Policies left without a `rule` (brand tone, risk appetite, region neutrality,
 * plain language) genuinely need a judgement this deterministic engine cannot
 * make. They are seeded as-is and counted in `unenforceablePolicies` so their
 * inertness is visible rather than implied.
 */
type SeedPolicy = {
  domain: ConstitutionDomain;
  title: string;
  statement: string;
  enforcementLevel: "advisory" | "required" | "hard_block";
  rule?: ConstitutionRule;
};

const SEED_POLICIES: SeedPolicy[] = [
  { domain: "corporate_ethics", title: "Honest Representation", statement: "All AI communications must be truthful and clearly identify themselves as AI where required.", enforcementLevel: "hard_block",
    rule: { kind: "keyword", keywords: ["ignore previous", "bypass safety", "jailbreak", "disregard rules", "pretend you are human", "do not mention you are an ai"] } },
  { domain: "decision_boundaries", title: "Human On Fiduciary Decisions", statement: "Decisions involving amounts over $10,000 USD must be reviewed and approved by a human before execution.", enforcementLevel: "hard_block",
    rule: { kind: "monetary_threshold", maxUsd: 10_000 } },
  { domain: "risk_appetite", title: "Standard Risk Tolerance", statement: "Automated decisions in finance/legal/HR channels default to conservative risk and escalate on uncertainty > 0.3.", enforcementLevel: "required" },
  { domain: "brand_standards", title: "WINDELS Voice & Tone", statement: "Customer-facing outputs use clear, professional tone in WINDELS brand voice; no slang, no hyperbole.", enforcementLevel: "required" },
  { domain: "regulatory_compliance", title: "GDPR/CCPA Guardrails", statement: "PII is never logged to plaintext; data-subject requests route through the privacy pipeline within 24h.", enforcementLevel: "hard_block",
    rule: { kind: "keyword", keywords: ["illegal", "hack into", "steal", "fraud", "launder", "credit card number", "social security number"] } },
  { domain: "industry_rules", title: "Financial Promotion", statement: "Outbound financial communications comply with fair-dealing and suitability checks; no unlicensed advice.", enforcementLevel: "hard_block",
    rule: { kind: "keyword", keywords: ["guaranteed return", "risk-free investment", "insider tip", "cannot lose"] } },
  { domain: "regional_policies", title: "Default Region Neutral", statement: "Default behavior satisfies the strictest regional data-residency rule among deployment regions.", enforcementLevel: "required" },
  { domain: "escalation_requirements", title: "Safety Escalation", statement: "Any self-harm, harassment, or illegal-content request immediately escalates to a human safety operator.", enforcementLevel: "hard_block",
    rule: { kind: "keyword", keywords: ["self-harm", "self harm", "suicide", "kill myself", "end my life"] } },
  { domain: "human_approval_rules", title: "External Commits Require Human", statement: "Any action that emails customers, posts publicly, or commits code must be approved by a human.", enforcementLevel: "hard_block",
    rule: { kind: "requires_human", actionKinds: ["email_customer", "publish_public", "commit_code", "deploy"] } },
  { domain: "ai_decision_limits", title: "Daily Spending Cap", statement: "AI agents may not initiate cumulative spending over $1,000 USD per day without secondary approval.", enforcementLevel: "hard_block",
    rule: { kind: "monetary_threshold", maxUsd: 1_000 } },
  { domain: "communication_style", title: "Plain Language Default", statement: "Prefer short sentences and explain acronyms on first use.", enforcementLevel: "advisory" },
];

/**
 * S163 — baseline safety keywords applied regardless of what an organization
 * has configured. These back the domains where allowing an unmatched request
 * through would be indefensible; a match blocks even when the org has no policy
 * for that domain (recorded with `unmatchedDomain: true`).
 */
const BLOCKLIST: Array<{ keys: string[]; domain: ConstitutionDomain; reason: string; severity: ConstitutionViolation["severity"] }> = [
  { keys: ["ignore previous", "bypass safety", "jailbreak", "disregard rules"], domain: "corporate_ethics", reason: "Prompt appears to attempt to bypass safety controls.", severity: "critical" },
  { keys: ["self-harm", "self harm", "suicide", "kill myself"], domain: "escalation_requirements", reason: "Content suggests self-harm.", severity: "critical" },
  { keys: ["illegal", "hack into", "steal", "fraud"], domain: "regulatory_compliance", reason: "Potential illegal request.", severity: "high" },
];

/**
 * S163 — whether the operator has opted into permissive checking. Read lazily
 * so tests and runtime config changes are honoured per call rather than frozen
 * at module load.
 */
function failOpenEnabled(): boolean {
  return env.WINDELS_CONSTITUTION_FAIL_OPEN === true;
}

/** Severity assigned to a violation of a policy's own structured rule. */
function severityFor(level: ConstitutionPolicy["enforcementLevel"]): ConstitutionViolation["severity"] {
  return level === "hard_block" ? "critical" : level === "required" ? "high" : "low";
}

/** Map an enforcement level onto the action taken. */
function actionFor(level: ConstitutionPolicy["enforcementLevel"]): ConstitutionViolation["action"] {
  return level === "hard_block" ? "blocked" : level === "required" ? "warned" : "logged";
}

/**
 * Evaluate one policy's structured rule against a request.
 * Returns a reason string when the rule trips, otherwise null.
 */
function evaluateRule(
  rule: ConstitutionRule,
  lower: string,
  context: Record<string, unknown>,
): string | null {
  switch (rule.kind) {
    case "keyword": {
      const hit = rule.keywords.find((k) => lower.includes(k.toLowerCase()));
      return hit ? `Request contains restricted term "${hit}".` : null;
    }
    case "monetary_threshold": {
      const raw = context.amountUsd;
      const amount = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
      if (!Number.isFinite(amount)) return null;
      return amount > rule.maxUsd
        ? `Amount $${amount.toLocaleString("en-US")} exceeds the $${rule.maxUsd.toLocaleString("en-US")} limit for this policy.`
        : null;
    }
    case "requires_human": {
      const kind = typeof context.actionKind === "string" ? context.actionKind : null;
      if (!kind || !rule.actionKinds.includes(kind)) return null;
      if (context.humanApproved === true) return null;
      return `Action "${kind}" requires human approval, which was not supplied.`;
    }
  }
}

async function emitKernel(kind: string, payload: any) {
  try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ source: "constitution", kind, payload }); } catch {}
}

export const ConstitutionService = {
  /**
   * S163 — seeding is now opt-in (`WINDELS_DEMO_DATA=true`).
   *
   * These eleven policies were written with `status: "approved"` and
   * `approvedBy: "system"` — pre-ratified governance attributed to an approver
   * who is not a person. An organization's constitution is exactly the kind of
   * artifact that must not appear approved unless someone approved it.
   *
   * Skipping the seed is safe here only because `checkRequest` now fails
   * closed: an org with no constitution gets `allowed: false` /
   * `posture: "unconfigured"`, not a silent pass.
   */
  async ensureBootstrapped(logger?: any, defaultOrgId = "org-windels", userId = "user-admin") {
    if (await redis.exists(K.policies(defaultOrgId))) return;
    if (!demoDataEnabled()) return skipDemoSeed("constitution", logger);
    const now = new Date().toISOString();
    const policyIds: string[] = [];
    for (const sp of SEED_POLICIES) {
      const id = uid("cp-");
      const p: ConstitutionPolicy = {
        id, organizationId: defaultOrgId, domain: sp.domain, title: sp.title, statement: sp.statement,
        enforcementLevel: sp.enforcementLevel, status: "approved", version: 1,
        ...(sp.rule ? { rule: sp.rule } : {}),
        // S163: attributed to the seed, not to "system" — nobody ratified these.
        approvedBy: "demo_seed",
        approvedAt: now, createdBy: userId, createdAt: now, updatedAt: now,
      };
      await redis.hset(K.policy(defaultOrgId, id), "_doc", s2(p));
      await redis.sadd(K.policies(defaultOrgId), id);
      policyIds.push(id);
    }
    const cid = uid("c-");
    const c: Constitution = {
      id: cid, organizationId: defaultOrgId, name: "Default Enterprise Constitution",
      description: "Demo seed constitution with default governance policies. Review and re-approve before relying on it.",
      status: "active", version: 1,
      policyIds, effectiveFrom: now, createdBy: userId, createdAt: now, updatedAt: now,
    };
    await redis.hset(K.constitution(defaultOrgId, cid), "_doc", s2(c));
    await redis.sadd(K.constitutions(defaultOrgId), cid);
    await redis.set(K.active(defaultOrgId), cid);
    // S163: `cst:m:<oid>.workforces` was initialised to "0" here and never
    // written again, so the dashboard reported a structural zero as coverage.
    // The field is no longer seeded; `coveredWorkforces` reports null.
    logger?.info?.("[constitution] demo seed complete", { policies: policyIds.length });
  },

  async dashboard(oid: string): Promise<ConstitutionDashboard> {
    const cid = await redis.get(K.active(oid));
    let constitution: Constitution | undefined; let policies: ConstitutionPolicy[] = [];
    if (cid) { const r = await redis.hgetall(K.constitution(oid, cid)); constitution = r._doc ? JSON.parse(r._doc) : undefined; }
    const pids = await redis.smembers(K.policies(oid));
    for (const id of pids) { const r = await redis.hgetall(K.policy(oid, id)); if (r._doc) policies.push(JSON.parse(r._doc)); }
    const approved = policies.filter((p) => p.status === "approved").length;
    const counts: Record<ConstitutionDomain, number> = Object.fromEntries(
      ["corporate_ethics","decision_boundaries","risk_appetite","brand_standards","communication_style","regulatory_compliance","industry_rules","regional_policies","escalation_requirements","human_approval_rules","ai_decision_limits"].map((d) => [d, 0]),
    ) as Record<ConstitutionDomain, number>;
    for (const p of policies) counts[p.domain]++;
    const since = Date.now() - 24*3600*1000;
    const vrows = await redis.zrangebyscore(K.violations(oid), since, Date.now());
    let blocked = 0; const bySev = { low:0,medium:0,high:0,critical:0 };
    for (const r of vrows) { const v: ConstitutionViolation = JSON.parse(r); bySev[v.severity]++; if (v.action === "blocked") blocked++; }
    // S163: approved policies with no machine-checkable rule cannot enforce
    // anything. Counting them makes decorative governance visible.
    const unenforceable = policies.filter((p) => p.status === "approved" && !p.rule).length;
    return {
      activeConstitutionId: constitution?.id,
      // S163: null, not 0 — "no constitution" is not version zero.
      activeVersion: constitution?.version ?? null,
      posture: constitution ? "enforced" : failOpenEnabled() ? "fail_open" : "unconfigured",
      totalPolicies: policies.length, approvedPolicies: approved,
      unenforceablePolicies: unenforceable,
      policiesByDomain: counts,
      violations24h: vrows.length, violationsBySeverity: bySev, blockedActions24h: blocked,
      // S163: nothing in the platform writes workforce coverage. Was a
      // hardcoded "0" seeded at bootstrap and never updated.
      coveredWorkforces: null,
      lastApprovedAt: constitution?.effectiveFrom,
    };
  },

  async listPolicies(oid: string): Promise<ConstitutionPolicy[]> {
    const ids = await redis.smembers(K.policies(oid));
    const out: ConstitutionPolicy[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.policy(oid, id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out.sort((a,b) => a.domain.localeCompare(b.domain));
  },

  async upsertPolicy(input: { id?: string; organizationId: string; createdBy: string; domain: ConstitutionDomain; title: string; statement: string; enforcementLevel: "advisory" | "required" | "hard_block"; status: ConstitutionPolicy["status"]; rule?: ConstitutionRule }): Promise<ConstitutionPolicy> {
    const oid = input.organizationId;
    const id = input.id || uid("cp-");
    const now = new Date().toISOString();
    let existing: ConstitutionPolicy | undefined;
    if (input.id) { const r = await redis.hgetall(K.policy(oid, id)); if (r._doc) existing = JSON.parse(r._doc); }
    const p: ConstitutionPolicy = {
      id, organizationId: oid, domain: input.domain, title: input.title, statement: input.statement,
      enforcementLevel: input.enforcementLevel, status: input.status,
      // S163: an explicit rule replaces the old one; omitting `rule` on an
      // update preserves whatever was there rather than silently disarming it.
      ...(input.rule !== undefined ? { rule: input.rule } : existing?.rule ? { rule: existing.rule } : {}),
      version: (existing?.version || 0) + 1,
      approvedBy: input.status === "approved" ? input.createdBy : existing?.approvedBy,
      approvedAt: input.status === "approved" ? now : existing?.approvedAt,
      createdBy: existing?.createdBy || input.createdBy,
      createdAt: existing?.createdAt || now, updatedAt: now,
    };
    await redis.hset(K.policy(oid, id), "_doc", s2(p));
    await redis.sadd(K.policies(oid), id);
    return p;
  },

  async publishConstitution(input: { organizationId: string; createdBy: string; name: string; description?: string; policyIds: string[] }): Promise<Constitution> {
    const oid = input.organizationId;
    const prevId = await redis.get(K.active(oid));
    if (prevId) {
      const r = await redis.hgetall(K.constitution(oid, prevId));
      if (r._doc) { const pc: Constitution = JSON.parse(r._doc); pc.status = "superseded"; pc.updatedAt = new Date().toISOString(); await redis.hset(K.constitution(oid, prevId), "_doc", s2(pc)); }
    }
    const prev = prevId ? (j(await redis.hget(K.constitution(oid, prevId), "_doc")) as Constitution | null) : null;
    const cid = uid("c-");
    const c: Constitution = {
      id: cid, organizationId: oid, name: input.name, description: input.description || "",
      status: "active", version: (prev?.version || 0) + 1, policyIds: input.policyIds,
      effectiveFrom: new Date().toISOString(), createdBy: input.createdBy,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await redis.hset(K.constitution(oid, cid), "_doc", s2(c));
    await redis.sadd(K.constitutions(oid), cid);
    await redis.set(K.active(oid), cid);
    emitKernel("constitution.published", { organizationId: oid, constitutionId: cid, version: c.version });
    return c;
  },

  async getActive(oid: string): Promise<{ constitution?: Constitution; policies: ConstitutionPolicy[] }> {
    const cid = await redis.get(K.active(oid));
    if (!cid) return { policies: await this.listPolicies(oid) };
    const r = await redis.hgetall(K.constitution(oid, cid));
    const c: Constitution | undefined = r._doc ? JSON.parse(r._doc) : undefined;
    const policies: ConstitutionPolicy[] = [];
    if (c) for (const pid of c.policyIds) { const pr = await redis.hgetall(K.policy(oid, pid)); if (pr._doc) policies.push(JSON.parse(pr._doc)); }
    return { constitution: c, policies };
  },

  /**
   * S163 — the platform's "may this proceed?" gate, rebuilt to fail closed.
   *
   * Evaluation order:
   *  1. No active constitution -> refuse (`unconfigured`), unless the operator
   *     has opted into `WINDELS_CONSTITUTION_FAIL_OPEN`, in which case the
   *     permissive verdict is labelled `fail_open` rather than passed off as a
   *     clean check.
   *  2. Every approved policy's structured `rule` is evaluated. This is what
   *     makes the $10,000 threshold and the human-approval requirement real.
   *  3. The baseline blocklist runs regardless of configuration. A term that
   *     matches a domain the org has no policy for still blocks, recorded with
   *     `unmatchedDomain: true` — an unconfigured domain is not a permissive one.
   */
  async checkRequest(input: { source: string; promptOrAction: string; context?: Record<string,unknown>; organizationId: string }): Promise<CheckResult> {
    const oid = input.organizationId;
    const { constitution, policies } = await this.getActive(oid);
    const lower = input.promptOrAction.toLowerCase();
    const context = input.context ?? {};
    const violations: CheckResult["violations"] = [];
    const recs: ConstitutionViolation[] = [];
    const evaluated = new Set<ConstitutionRuleKind>();
    const now = new Date().toISOString();
    let blocked = 0;

    const record = (
      policyId: string | null,
      domain: ConstitutionDomain,
      severity: ConstitutionViolation["severity"],
      reason: string,
      action: ConstitutionViolation["action"],
      unmatchedDomain?: boolean,
    ) => {
      if (action === "blocked") blocked++;
      violations.push({ policyId, domain, severity, reason, action, ...(unmatchedDomain ? { unmatchedDomain: true } : {}) });
      recs.push({
        id: uid("v-"), organizationId: oid, constitutionId: constitution?.id || "",
        policyId: policyId ?? "", domain, source: input.source, summary: reason,
        severity, action, at: now,
      });
    };

    // 1 — unconfigured organization: nothing to check against.
    if (!constitution) {
      const failOpen = failOpenEnabled();
      const posture: ConstitutionCheckPosture = failOpen ? "fail_open" : "unconfigured";
      const reason = failOpen
        ? "No constitution is published for this organization. WINDELS_CONSTITUTION_FAIL_OPEN is set, so the request was allowed WITHOUT any policy check."
        : "No constitution is published for this organization, so this request could not be reviewed. Publish a constitution to enable enforcement.";
      // Still run the baseline safety blocklist even when failing open: a
      // self-harm prompt must not pass merely because setup is incomplete.
      for (const bl of BLOCKLIST) {
        if (bl.keys.some((k) => lower.includes(k))) {
          record(null, bl.domain, bl.severity, bl.reason, "blocked", true);
        }
      }
      for (const v of recs) { await redis.zadd(K.violations(oid), Date.now(), s2(v)); }
      if (recs.length) await redis.zremrangebyrank(K.violations(oid), 0, -501);
      return {
        allowed: failOpen && blocked === 0,
        violations,
        constitutionVersion: null,
        posture,
        requiresConfiguration: true,
        evaluated: violations.length ? ["keyword"] : [],
        reason,
      };
    }

    // 2 — evaluate each approved policy's own structured rule.
    const active = policies.filter((p) => p.status === "approved");
    for (const p of active) {
      if (!p.rule) continue;
      evaluated.add(p.rule.kind);
      const reason = evaluateRule(p.rule, lower, context);
      if (reason) {
        record(p.id, p.domain, severityFor(p.enforcementLevel), `${p.title}: ${reason}`, actionFor(p.enforcementLevel));
      }
    }

    // 3 — baseline blocklist, independent of configuration.
    for (const bl of BLOCKLIST) {
      if (!bl.keys.some((k) => lower.includes(k))) continue;
      const policy = active.find((p) => p.domain === bl.domain);
      // Already reported by that policy's own keyword rule — don't double-count.
      if (policy?.rule?.kind === "keyword" && violations.some((v) => v.policyId === policy.id)) continue;
      evaluated.add("keyword");
      if (policy) {
        record(policy.id, bl.domain, bl.severity, bl.reason, actionFor(policy.enforcementLevel));
      } else {
        // No policy covers this domain. Pre-S163 this silently degraded to
        // "logged" and allowed the request; a baseline safety term now blocks.
        record(null, bl.domain, bl.severity, `${bl.reason} No policy is configured for this domain, so the request was refused.`, "blocked", true);
      }
    }

    for (const v of recs) { await redis.zadd(K.violations(oid), Date.now(), s2(v)); }
    if (recs.length) await redis.zremrangebyrank(K.violations(oid), 0, -501);
    return {
      allowed: blocked === 0,
      violations,
      constitutionVersion: constitution.version,
      posture: "enforced",
      requiresConfiguration: false,
      evaluated: [...evaluated],
    };
  },

  async getViolations(oid: string, limit = 50): Promise<ConstitutionViolation[]> {
    const rows = await redis.zrange(K.violations(oid), -limit, -1, "REV");
    return rows.map((r) => JSON.parse(r) as ConstitutionViolation);
  },
};

export default ConstitutionService;
