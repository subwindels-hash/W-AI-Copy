/**
 * Session 48 — Constitution Studio (V8.4 §3).
 * Organizations define their own AI constitutions; every AI Employee/Workforce
 * inherits the active approved constitution. Backs S44.11 policy stub.
 *
 * 11 configurable policy domains. Enforcement levels: advisory / required / hard_block.
 * Keys: cst:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  CheckResult,
  Constitution,
  ConstitutionDashboard,
  ConstitutionDomain,
  ConstitutionPolicy,
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

const SEED_POLICIES: Array<{ domain: ConstitutionDomain; title: string; statement: string; enforcementLevel: "advisory" | "required" | "hard_block" }> = [
  { domain: "corporate_ethics", title: "Honest Representation", statement: "All AI communications must be truthful and clearly identify themselves as AI where required.", enforcementLevel: "hard_block" },
  { domain: "decision_boundaries", title: "Human On Fiduciary Decisions", statement: "Decisions involving amounts over $10,000 USD must be reviewed and approved by a human before execution.", enforcementLevel: "hard_block" },
  { domain: "risk_appetite", title: "Standard Risk Tolerance", statement: "Automated decisions in finance/legal/HR channels default to conservative risk and escalate on uncertainty > 0.3.", enforcementLevel: "required" },
  { domain: "brand_standards", title: "WINDELS Voice & Tone", statement: "Customer-facing outputs use clear, professional tone in WINDELS brand voice; no slang, no hyperbole.", enforcementLevel: "required" },
  { domain: "regulatory_compliance", title: "GDPR/CCPA Guardrails", statement: "PII is never logged to plaintext; data-subject requests route through the privacy pipeline within 24h.", enforcementLevel: "hard_block" },
  { domain: "industry_rules", title: "Financial Promotion", statement: "Outbound financial communications comply with fair-dealing and suitability checks; no unlicensed advice.", enforcementLevel: "hard_block" },
  { domain: "regional_policies", title: "Default Region Neutral", statement: "Default behavior satisfies the strictest regional data-residency rule among deployment regions.", enforcementLevel: "required" },
  { domain: "escalation_requirements", title: "Safety Escalation", statement: "Any self-harm, harassment, or illegal-content request immediately escalates to a human safety operator.", enforcementLevel: "hard_block" },
  { domain: "human_approval_rules", title: "External Commits Require Human", statement: "Any action that emails customers, posts publicly, or commits code must be approved by a human.", enforcementLevel: "hard_block" },
  { domain: "ai_decision_limits", title: "Daily Spending Cap", statement: "AI agents may not initiate cumulative spending over $1,000 USD per day without secondary approval.", enforcementLevel: "hard_block" },
  { domain: "communication_style", title: "Plain Language Default", statement: "Prefer short sentences and explain acronyms on first use.", enforcementLevel: "advisory" },
];

const BLOCKLIST: Array<{ keys: string[]; domain: ConstitutionDomain; reason: string; severity: ConstitutionViolation["severity"] }> = [
  { keys: ["ignore previous", "bypass safety", "jailbreak", "disregard rules"], domain: "corporate_ethics", reason: "Prompt appears to attempt to bypass safety controls.", severity: "critical" },
  { keys: ["self-harm", "suicide", "kill myself"], domain: "escalation_requirements", reason: "Content suggests self-harm.", severity: "critical" },
  { keys: ["illegal", "hack into", "steal", "fraud"], domain: "regulatory_compliance", reason: "Potential illegal request.", severity: "high" },
];

async function emitKernel(kind: string, payload: any) {
  try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ source: "constitution", kind, payload }); } catch {}
}

export const ConstitutionService = {
  async ensureBootstrapped(logger?: any, defaultOrgId = "org-windels", userId = "user-admin") {
    if (await redis.exists(K.policies(defaultOrgId))) return;
    const now = new Date().toISOString();
    const policyIds: string[] = [];
    for (const sp of SEED_POLICIES) {
      const id = uid("cp-");
      const p: ConstitutionPolicy = {
        id, organizationId: defaultOrgId, domain: sp.domain, title: sp.title, statement: sp.statement,
        enforcementLevel: sp.enforcementLevel, status: "approved", version: 1, approvedBy: "system",
        approvedAt: now, createdBy: userId, createdAt: now, updatedAt: now,
      };
      await redis.hset(K.policy(defaultOrgId, id), "_doc", s2(p));
      await redis.sadd(K.policies(defaultOrgId), id);
      policyIds.push(id);
    }
    const cid = uid("c-");
    const c: Constitution = {
      id: cid, organizationId: defaultOrgId, name: "Default Enterprise Constitution",
      description: "Seed constitution with default governance policies.", status: "active", version: 1,
      policyIds, effectiveFrom: now, createdBy: userId, createdAt: now, updatedAt: now,
    };
    await redis.hset(K.constitution(defaultOrgId, cid), "_doc", s2(c));
    await redis.sadd(K.constitutions(defaultOrgId), cid);
    await redis.set(K.active(defaultOrgId), cid);
    await redis.hset(K.metrics(defaultOrgId), "workforces", "0");
    logger?.info?.("[constitution] bootstrap complete", { policies: policyIds.length });
  },

  async dashboard(oid = "org-windels"): Promise<ConstitutionDashboard> {
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
    const wf = Number((await redis.hget(K.metrics(oid), "workforces")) || "0");
    return {
      activeConstitutionId: constitution?.id, activeVersion: constitution?.version || 0,
      totalPolicies: policies.length, approvedPolicies: approved, policiesByDomain: counts,
      violations24h: vrows.length, violationsBySeverity: bySev, blockedActions24h: blocked,
      coveredWorkforces: wf, lastApprovedAt: constitution?.effectiveFrom,
    };
  },

  async listPolicies(oid = "org-windels"): Promise<ConstitutionPolicy[]> {
    const ids = await redis.smembers(K.policies(oid));
    const out: ConstitutionPolicy[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.policy(oid, id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out.sort((a,b) => a.domain.localeCompare(b.domain));
  },

  async upsertPolicy(input: { id?: string; organizationId?: string; createdBy: string; domain: ConstitutionDomain; title: string; statement: string; enforcementLevel: "advisory" | "required" | "hard_block"; status: ConstitutionPolicy["status"] }): Promise<ConstitutionPolicy> {
    const oid = input.organizationId || "org-windels";
    const id = input.id || uid("cp-");
    const now = new Date().toISOString();
    let existing: ConstitutionPolicy | undefined;
    if (input.id) { const r = await redis.hgetall(K.policy(oid, id)); if (r._doc) existing = JSON.parse(r._doc); }
    const p: ConstitutionPolicy = {
      id, organizationId: oid, domain: input.domain, title: input.title, statement: input.statement,
      enforcementLevel: input.enforcementLevel, status: input.status,
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

  async publishConstitution(input: { organizationId?: string; createdBy: string; name: string; description?: string; policyIds: string[] }): Promise<Constitution> {
    const oid = input.organizationId || "org-windels";
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

  async getActive(oid = "org-windels"): Promise<{ constitution?: Constitution; policies: ConstitutionPolicy[] }> {
    const cid = await redis.get(K.active(oid));
    if (!cid) return { policies: await this.listPolicies(oid) };
    const r = await redis.hgetall(K.constitution(oid, cid));
    const c: Constitution | undefined = r._doc ? JSON.parse(r._doc) : undefined;
    const policies: ConstitutionPolicy[] = [];
    if (c) for (const pid of c.policyIds) { const pr = await redis.hgetall(K.policy(oid, pid)); if (pr._doc) policies.push(JSON.parse(pr._doc)); }
    return { constitution: c, policies };
  },

  async checkRequest(input: { source: string; promptOrAction: string; context?: Record<string,unknown>; organizationId?: string }): Promise<CheckResult> {
    const oid = input.organizationId || "org-windels";
    const { constitution, policies } = await this.getActive(oid);
    const lower = input.promptOrAction.toLowerCase();
    const violations: CheckResult["violations"] = [];
    const recs: ConstitutionViolation[] = [];
    const now = new Date().toISOString();
    let blocked = 0;
    for (const bl of BLOCKLIST) {
      if (bl.keys.some((k) => lower.includes(k))) {
        const policy = policies.find((p) => p.domain === bl.domain);
        const action: "blocked" | "warned" | "logged" = policy?.enforcementLevel === "hard_block" ? "blocked" : policy?.enforcementLevel === "required" ? "warned" : "logged";
        if (action === "blocked") blocked++;
        violations.push({ policyId: policy?.id || bl.domain, domain: bl.domain, severity: bl.severity, reason: bl.reason, action });
        recs.push({ id: uid("v-"), organizationId: oid, constitutionId: constitution?.id || "", policyId: policy?.id || bl.domain, domain: bl.domain, source: input.source, summary: bl.reason, severity: bl.severity, action, at: now });
      }
    }
    for (const v of recs) { await redis.zadd(K.violations(oid), Date.now(), s2(v)); }
    await redis.zremrangebyrank(K.violations(oid), 0, -501);
    return { allowed: blocked === 0, violations, constitutionVersion: constitution?.version || 0 };
  },

  async getViolations(oid = "org-windels", limit = 50): Promise<ConstitutionViolation[]> {
    const rows = await redis.zrange(K.violations(oid), -limit, -1, "REV");
    return rows.map((r) => JSON.parse(r) as ConstitutionViolation);
  },
};

export default ConstitutionService;
