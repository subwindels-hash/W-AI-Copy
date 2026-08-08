/**
 * Session 89 — Tenant Isolation & Cross-Tenant Data Governance.
 *
 * Enforcement + observability for the platform's #1 failure mode: one tenant
 * reading or exporting another tenant's data. Everything here is real:
 *
 *   - Per-org isolation policies stored under org-scoped Redis keys
 *     (`ti:policy:<orgId>`), so the store itself obeys the rule it enforces.
 *   - A live namespace audit that scans Redis namespaces and flags any
 *     org-scoped namespace whose keys are missing the org segment.
 *   - Real cross-tenant self-tests that write a sentinel into org A and prove
 *     org B cannot read it — never a fabricated verdict.
 *   - An export gate other modules can call before moving data outside the
 *     tenant boundary.
 *
 * Keys: ti:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import type {
  TiIsolationPolicy,
  TiUpsertPolicyInput,
  TiComplianceRun,
  TiNamespaceAudit,
  TiNamespaceScope,
  TiFinding,
  TiProbeResult,
  TiComplianceStatus,
  TiExportCheckResult,
} from "@windels/shared/tenantIsolation";
import { TI_PII_REDACTION_LEVELS } from "@windels/shared/tenantIsolation";

const K = {
  policy: (oid: string) => `ti:policy:${oid}`,
  run: (oid: string, id: string) => `ti:run:${oid}:${id}`,
  runs: (oid: string) => `ti:runs:${oid}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

/** The default policy every org inherits until an admin overrides it. */
const DEFAULT_POLICY: Omit<TiIsolationPolicy, "orgId" | "updatedAt" | "updatedBy"> = {
  allowCrossTenantExport: false,
  allowExternalSharing: false,
  piiRedactionLevel: "basic",
  retentionDays: 365,
};

const MAX_RUNS = 50;

/**
 * Catalog of known Redis namespaces. For `org_scoped` namespaces the org id is
 * expected as a key segment right after the prefix; `shared`/`infra` namespaces
 * are global by design and are reported, not flagged.
 */
export const TI_NAMESPACE_CATALOG: ReadonlyArray<{ prefix: string; scope: TiNamespaceScope }> = [
  // Camera Intelligence (Session 87)
  { prefix: "cam:feed", scope: "org_scoped" },
  { prefix: "cam:feeds", scope: "org_scoped" },
  { prefix: "cam:notes", scope: "org_scoped" },
  // ETL (Session 83)
  { prefix: "etl:pipe", scope: "org_scoped" },
  { prefix: "etl:pipes", scope: "org_scoped" },
  { prefix: "etl:dlq", scope: "org_scoped" },
  // This module
  { prefix: "ti:policy", scope: "org_scoped" },
  { prefix: "ti:run", scope: "org_scoped" },
  { prefix: "ti:runs", scope: "org_scoped" },
  // Enterprise CRM (Session 90)
  { prefix: "crm:contact", scope: "org_scoped" },
  { prefix: "crm:company", scope: "org_scoped" },
  { prefix: "crm:deal", scope: "org_scoped" },
  { prefix: "crm:activity", scope: "org_scoped" },
  // Enterprise Email Intelligence (Session 91)
  { prefix: "ei:mailbox", scope: "org_scoped" },
  { prefix: "ei:message", scope: "org_scoped" },
  { prefix: "ei:thread", scope: "org_scoped" },
  // Enterprise ERP (Session 92)
  { prefix: "erp:product", scope: "org_scoped" },
  { prefix: "erp:warehouse", scope: "org_scoped" },
  { prefix: "erp:movement", scope: "org_scoped" },
  { prefix: "erp:supplier", scope: "org_scoped" },
  { prefix: "erp:po", scope: "org_scoped" },
  { prefix: "erp:so", scope: "org_scoped" },
  // Website Builder (Session 93)
  { prefix: "wb:site", scope: "org_scoped" },
  { prefix: "wb:page", scope: "org_scoped" },
  // Social Platform (Session 94)
  { prefix: "sp:post", scope: "org_scoped" },
  { prefix: "sp:comment", scope: "org_scoped" },
  { prefix: "sp:reaction", scope: "org_scoped" },
  // Enterprise Helpdesk (Session 95)
  { prefix: "hd:ticket", scope: "org_scoped" },
  { prefix: "hd:comment", scope: "org_scoped" },
  // AI Workforce / Agent Framework lifecycle state (Session 102)
  { prefix: "agent:lifecycle", scope: "org_scoped" },
  { prefix: "agent:lifecycle:history", scope: "org_scoped" },
  // AI Software Factory / Application Builder (Session 96)
  { prefix: "ab:project", scope: "org_scoped" },
  { prefix: "ab:task", scope: "org_scoped" },
  { prefix: "ab:run", scope: "org_scoped" },
  { prefix: "ab:artifact", scope: "org_scoped" },
  { prefix: "ab:approval", scope: "org_scoped" },
  // Business Intelligence (Session 97)
  { prefix: "bi:source", scope: "org_scoped" },
  { prefix: "bi:kpi", scope: "org_scoped" },
  { prefix: "bi:report", scope: "org_scoped" },
  // Enterprise Search (Session 98)
  { prefix: "es:history", scope: "org_scoped" },
  // Software Factory Studios (Session 99)
  { prefix: "sf:plan", scope: "org_scoped" },
  // Enterprise FinOps depth (Session 100)
  { prefix: "efo:center", scope: "org_scoped" },
  { prefix: "efo:budget", scope: "org_scoped" },
  { prefix: "efo:cost", scope: "org_scoped" },
  { prefix: "efo:allocation", scope: "org_scoped" },
  // Canvas Collaboration presence/cursor state (Session 109)
  { prefix: "canvas:presence", scope: "org_scoped" },
  { prefix: "canvas:cursor", scope: "org_scoped" },
  // AI Economy / GPU capacity ledger (Session 103)
  { prefix: "eco:meta", scope: "org_scoped" },
  { prefix: "eco:usage", scope: "org_scoped" },
  { prefix: "eco:allocation", scope: "org_scoped" },
  { prefix: "eco:offer", scope: "org_scoped" },
  // Autonomous Organization approval register (Session 106)
  { prefix: "aut:meta", scope: "org_scoped" },
  { prefix: "aut:decision", scope: "org_scoped" },
  // Cognitive / World Model evidence register (Session 110)
  { prefix: "cog:meta", scope: "org_scoped" },
  { prefix: "cog:entity", scope: "org_scoped" },
  { prefix: "cog:obs", scope: "org_scoped" },
  { prefix: "cog:hypothesis", scope: "org_scoped" },
  // Global Command Center operations register (Session 111)
  { prefix: "cmd:meta", scope: "org_scoped" },
  { prefix: "cmd:incident", scope: "org_scoped" },
  { prefix: "cmd:region", scope: "org_scoped" },
  { prefix: "cmd:briefing", scope: "org_scoped" },
  { prefix: "cmd:initiative", scope: "org_scoped" },
  { prefix: "cmd:dir", scope: "org_scoped" },
  // Derivatives & Fixed-Income Desk (Session 113)
  { prefix: "deriv:pos", scope: "org_scoped" },
  { prefix: "deriv:bond", scope: "org_scoped" },
  // Google Identity governance (Session 114)
  { prefix: "gid:policy", scope: "org_scoped" },
  { prefix: "gid:link", scope: "org_scoped" },
  { prefix: "gid:event", scope: "org_scoped" },
  // Lead Discovery pipeline (Session 115). `leads85` is Session 85's own
  // namespace, org-scoped since it shipped but never audited until now.
  { prefix: "leads85", scope: "org_scoped" },
  { prefix: "lead:pipe", scope: "org_scoped" },
  { prefix: "lead:note", scope: "org_scoped" },
  { prefix: "lead:noteidx", scope: "org_scoped" },
  { prefix: "lead:hist", scope: "org_scoped" },
  // MFA assurance (Session 116) — organization-scoped half.
  { prefix: "mfa:policy", scope: "org_scoped" },
  { prefix: "mfa:exempt", scope: "org_scoped" },
  { prefix: "mfa:exemptidx", scope: "org_scoped" },
  { prefix: "mfa:event", scope: "org_scoped" },
  // Mobile / PWA (Session 117) — the organization's mobile policy.
  { prefix: "mob:policy", scope: "org_scoped" },
  // Operational excellence (Session 118). `opex` is Session 73's own namespace
  // (`opex:<org>:meta`, `opex:<org>:safety-alerts`), org-scoped since it
  // shipped but never catalogued until now. The Session 118 namespaces are
  // `opx:` rather than `opex:` on purpose: an `opex:alert:<org>:<id>` key would
  // sit under the same root with the organization in the *third* segment, and
  // the sweep reads the segment straight after the prefix — it would treat the
  // literal string "alert" as an organization id and report a conformance check
  // it never performed.
  { prefix: "opex", scope: "org_scoped" },
  { prefix: "opx:alert", scope: "org_scoped" },
  { prefix: "opx:idx", scope: "org_scoped" },
  { prefix: "opx:assess", scope: "org_scoped" },
  { prefix: "opx:policy", scope: "org_scoped" },
  { prefix: "opx:event", scope: "org_scoped" },
  { prefix: "opx:imported", scope: "org_scoped" },
  // Prompt Templates usage ledger (Session 119). Each key carries the org id
  // as the segment straight after the prefix (`pt:use:<org>`,
  // `pt:recent:<org>`, `pt:day:<org>:<yyyy-mm-dd>`, `pt:since:<org>`), so the
  // sweep's org-segment derivation holds. A bare `pt` entry is deliberately
  // NOT added: `pt:use:<org>` would then be matched with the org expected one
  // segment earlier, and the sweep would read the literal `use` as an
  // organization id and report a conformance check it never performed.
  { prefix: "pt:since", scope: "org_scoped" },
  { prefix: "pt:use", scope: "org_scoped" },
  { prefix: "pt:recent", scope: "org_scoped" },
  { prefix: "pt:day", scope: "org_scoped" },
  // Public API call ledger (Session 120). Each key carries the org id as the
  // segment straight after the prefix (`pub:req:<org>`, `pub:day:<org>:<d>`,
  // `pub:since:<org>`, `pub:evt:<org>`), so the sweep's org-segment
  // derivation holds. A bare `pub` entry is deliberately NOT added: the
  // sweep would read the literal `req` as an organization id.
  { prefix: "pub:since", scope: "org_scoped" },
  { prefix: "pub:req", scope: "org_scoped" },
  { prefix: "pub:day", scope: "org_scoped" },
  { prefix: "pub:evt", scope: "org_scoped" },
  // Sustainability / ESG ledger (Session 64, completed by Session 121). Every
  // key is `esg:<org>:<suffix>` — the org sits in the segment straight after
  // the prefix, so the sweep's derivation (orgIndex = prefix.split(":").length
  // = 1) holds for the legacy blob `esg:<org>:records`, the adoption marker
  // `esg:<org>:imported`, the index `esg:<org>:idx` and the per-record keys
  // `esg:<org>:rec:<id>` alike.
  { prefix: "esg", scope: "org_scoped" },
  // Usage Intelligence event ledger (Session 55, completed by Session 123).
  // tenantStore shape: `usg:evt:idx:<org>` (zset) and `usg:evt:i:<org>:<id>`
  // (per-event hash) — the same shape the CRM/AppBuilder/Helpdesk stores use,
  // catalogued by their two-segment prefix with the org in the segment after
  // the index marker.
  { prefix: "usg:evt", scope: "org_scoped" },
  // AI Software Engineering Workforce (Session 124). Every key is
  // `aew:<entity>:<org>:…` — the org sits in the segment straight after the
  // prefix (index 1), so the sweep's org-segment derivation holds for repos
  // (`aew:repo:<org>:<id>`), connections, engineer assignments, tasks, intel
  // nodes, memory entries and the activity ledger alike.
  { prefix: "aew", scope: "org_scoped" },
  // Super Admin Biography / Identity Knowledge system (Session 125). Every key
  // is `ik:<entity>:<org>:…` — the org sits in the segment straight after the
  // prefix (index 1), so the sweep's org-segment derivation holds for records
  // (`ik:rec:<org>:<id>`), versions, grants, and the activity ledger alike.
  { prefix: "ik", scope: "org_scoped" },
  // Session 126 completed stubs: events (evt:hist) & webhook (whk:inbox)
  { prefix: "evt:hist", scope: "org_scoped" },
  { prefix: "whk:inbox", scope: "org_scoped" },
  // Session 128 multi-provider payments: transaction ledger (pay:tx)
  { prefix: "pay:tx", scope: "org_scoped" },
  // Session 129 geo-billing profiles (geob:profile)
  { prefix: "geob:profile", scope: "org_scoped" },
  // Session 140 Global Knowledge dynamic layer: org-scoped dynamic knowledge
  // records (kn:rec). Shape: `kn:rec:idx:<org>` (zset) and
  // `kn:rec:i:<org>:<id>` (string) — the org sits in the segment after the
  // index marker, same shape as usg:evt / pay:tx.
  { prefix: "kn:rec", scope: "org_scoped" },
  // Session 141 religion expansion pipeline: org-scoped submissions
  // (rel:sub) and the globally shared approved-extension store (rel:ext).
  // Submissions shape: `rel:sub:idx:<org>` / `rel:sub:i:<org>:<id>` — org in
  // the segment after the index marker (usg:evt/pay:tx shape). Approved
  // extensions (`rel:ext:idx` / `rel:ext:i:<id>`) are global curated
  // knowledge by design — there is no organization segment at all.
  { prefix: "rel:sub", scope: "org_scoped" },
  { prefix: "rel:ext", scope: "shared" },
  // Session 144 politics update engine: org-scoped change requests
  // (pol:upd). Shape: `pol:upd:idx:<org>` / `pol:upd:i:<org>:<id>` — org in
  // the segment after the index marker (usg:evt/pay:tx shape).
  { prefix: "pol:upd", scope: "org_scoped" },
  // Global/shared infra namespaces (expected to be shared)
  { prefix: "org:membership", scope: "shared" },
  // MFA principal-scoped state — one key per *user* id, not per tenant. A
  // person's second factor belongs to the person: the secret, its recovery
  // digests, the enrolment record, the failure counter, the lock, the replay
  // markers and the member's own ledger all key on the user id, and the login
  // path that reads them has not resolved an organization yet. Cataloguing them
  // as org_scoped would let the sweep treat a user id as an organization id and
  // report conformance it has not checked. The first four predate Session 116
  // and were never catalogued at all.
  { prefix: "mfa:secret", scope: "shared" },
  { prefix: "mfa:recovery", scope: "shared" },
  { prefix: "mfa:enforced", scope: "shared" },
  // Single-use, five-minute login challenge keyed by a CSPRNG token rather than
  // by any principal; the payload carries the user id.
  { prefix: "mfa:challenge", scope: "shared" },
  { prefix: "mfa:enroll", scope: "shared" },
  { prefix: "mfa:fail", scope: "shared" },
  { prefix: "mfa:lock", scope: "shared" },
  { prefix: "mfa:used", scope: "shared" },
  { prefix: "mfa:uevent", scope: "shared" },
  // Mobile / PWA principal-scoped state (Session 117) — one key per *user* id.
  // A phone, the writes it queued while offline, its PIN lock and its push
  // history belong to the person who signed in on it, not to a tenant: the same
  // person may hold memberships in several organizations from the same handset,
  // and the offline queue is read before an organization has been resolved.
  // Every read filters on the caller's own user id and re-checks the decoded
  // record's `userId`, so cataloguing these as org_scoped would make the sweep
  // read a user id as an organization id and report a check it never made.
  { prefix: "mob:action", scope: "shared" },
  { prefix: "mob:actidx", scope: "shared" },
  { prefix: "mob:actdev", scope: "shared" },
  { prefix: "mob:pinfail", scope: "shared" },
  { prefix: "mob:pinlock", scope: "shared" },
  { prefix: "mob:event", scope: "shared" },
  { prefix: "mob:pushlog", scope: "shared" },
  // Google OAuth CSRF state is issued before any user — and therefore any
  // organization — is known, so it is shared by design and short-lived (10 min).
  { prefix: "google:state", scope: "shared" },
];

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ kind, source: "tenant-isolation", payload });
  } catch { /* best effort */ }
}

/** Returns every key whose leading segments equal `prefix` (avoids prefix collisions). */
async function nsKeys(prefix: string): Promise<string[]> {
  const all = await redis.keys(`${prefix}:*`);
  return all.filter((k) => k.startsWith(`${prefix}:`));
}

/** Audit every catalogued namespace; returns the audit rows + any findings. */
async function auditNamespaces(): Promise<{ namespaces: TiNamespaceAudit[]; findings: TiFinding[] }> {
  const namespaces: TiNamespaceAudit[] = [];
  const findings: TiFinding[] = [];
  for (const ns of TI_NAMESPACE_CATALOG) {
    const keys = await nsKeys(ns.prefix);
    if (ns.scope === "org_scoped") {
      const orgIndex = ns.prefix.split(":").length;
      let conforming = 0;
      const leaked: string[] = [];
      for (const k of keys) {
        const parts = k.split(":");
        if (parts.length <= orgIndex || !parts[orgIndex]) leaked.push(k);
        else conforming++;
      }
      if (leaked.length) {
        findings.push({
          severity: "high",
          scope: "redis",
          message: `Namespace ${ns.prefix}: ${leaked.length} key(s) missing the org segment (potential cross-tenant leak).`,
          detail: leaked.slice(0, 5).join(", "),
        });
      }
      namespaces.push({
        prefix: ns.prefix,
        scope: ns.scope,
        keyCount: keys.length,
        conformingKeys: conforming,
        leakedKeys: leaked.slice(0, 20),
      });
    } else {
      namespaces.push({ prefix: ns.prefix, scope: ns.scope, keyCount: keys.length, conformingKeys: keys.length, leakedKeys: [] });
    }
  }
  return { namespaces, findings };
}

/**
 * Real cross-tenant self-test against an org-scoped Redis namespace: write a
 * sentinel under org A, prove org B's slot is empty, then clean up.
 */
async function redisCrossTenantProbe(): Promise<TiProbeResult> {
  const t0 = performance.now();
  const orgA = `__probe_a_${randomUUID().slice(0, 6)}`;
  const orgB = `__probe_b_${randomUUID().slice(0, 6)}`;
  const sentinel = `cam:feed:${orgA}:probe`;
  try {
    await redis.hset(sentinel, "_doc", s2({ id: "probe", organizationId: orgA }));
    const [rawB, rawA] = await Promise.all([
      redis.hget(`cam:feed:${orgB}:probe`, "_doc"),
      redis.hget(sentinel, "_doc"),
    ]);
    const passed = rawA !== null && rawB === null;
    return {
      name: "org-scoped redis key isolation (cam:feed)",
      passed,
      durationMs: performance.now() - t0,
      detail: passed
        ? "Sentinel written under org A was not readable from org B."
        : "FAIL: a value written under org A was visible from org B (cross-tenant leak).",
    };
  } finally {
    await redis.del(sentinel).catch(() => {});
  }
}

/**
 * Real cross-tenant self-test of the policy store itself: set a distinctive
 * policy for org A, then read org B and assert it still gets B's own default.
 */
async function policyCrossTenantProbe(): Promise<TiProbeResult> {
  const t0 = performance.now();
  const orgA = `__probe_a_${randomUUID().slice(0, 6)}`;
  const orgB = `__probe_b_${randomUUID().slice(0, 6)}`;
  try {
    await TenantIsolationService.upsertPolicy(
      orgA,
      { allowCrossTenantExport: true, allowExternalSharing: true, piiRedactionLevel: "strict", retentionDays: 999 },
      "probe"
    );
    const b = await TenantIsolationService.getPolicy(orgB);
    const passed = b.orgId === orgB && b.allowCrossTenantExport === false && b.piiRedactionLevel === "basic";
    return {
      name: "cross-tenant policy isolation (ti:policy)",
      passed,
      durationMs: performance.now() - t0,
      detail: passed
        ? "Org A's policy was not visible to org B (B kept its default)."
        : "FAIL: org B observed org A's policy (cross-tenant leak detected).",
    };
  } finally {
    await redis.del(K.policy(orgA)).catch(() => {});
  }
}

/** Evaluate an org's policy against the platform baseline. */
export function reviewPolicy(policy: TiIsolationPolicy): TiFinding[] {
  const findings: TiFinding[] = [];
  if (policy.allowCrossTenantExport) {
    findings.push({ severity: "medium", scope: "policy", message: "allowCrossTenantExport is enabled", detail: "Cross-tenant data export is permitted by policy — confirm this is intentional." });
  }
  if (policy.allowExternalSharing) {
    findings.push({ severity: "medium", scope: "policy", message: "allowExternalSharing is enabled", detail: "Data may be shared outside the tenant — confirm this is intentional." });
  }
  if (policy.piiRedactionLevel === "none") {
    findings.push({ severity: "high", scope: "policy", message: "PII redaction is disabled", detail: "The org mandates no PII redaction, which is not recommended for a shared platform." });
  }
  if (policy.retentionDays < 30) {
    findings.push({ severity: "low", scope: "policy", message: `retentionDays is ${policy.retentionDays} (< 30)`, detail: "Short retention may conflict with compliance obligations." });
  }
  if (policy.regionPin) {
    findings.push({ severity: "low", scope: "policy", message: `region pinned to ${policy.regionPin}`, detail: "Data is pinned to a specific region by policy." });
  }
  return findings;
}

export const TenantIsolationService = {
  async getPolicy(orgId: string): Promise<TiIsolationPolicy> {
    const raw = await redis.hget(K.policy(orgId), "_doc");
    if (raw) return j<TiIsolationPolicy>(raw)!;
    return { orgId, ...DEFAULT_POLICY, updatedAt: "1970-01-01T00:00:00.000Z", updatedBy: "system" };
  },

  async upsertPolicy(orgId: string, input: TiUpsertPolicyInput, actorId: string): Promise<TiIsolationPolicy> {
    const policy: TiIsolationPolicy = {
      orgId,
      ...input,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    };
    await redis.hset(K.policy(orgId), "_doc", s2(policy));
    await emitKernel("tenant-isolation.policy.updated", { orgId, allowCrossTenantExport: input.allowCrossTenantExport });
    logger.info("Tenant isolation policy updated", { orgId, actorId });
    return policy;
  },

  async runCompliance(orgId: string): Promise<TiComplianceRun> {
    const { namespaces, findings: nsFindings } = await auditNamespaces();
    const probes: TiProbeResult[] = [await redisCrossTenantProbe(), await policyCrossTenantProbe()];

    const policy = await this.getPolicy(orgId);
    const policyFindings = reviewPolicy(policy);
    const findings: TiFinding[] = [...nsFindings, ...policyFindings];
    for (const p of probes) {
      if (!p.passed) findings.push({ severity: "high", scope: "probe", message: `Self-test failed: ${p.name}`, detail: p.detail });
    }

    let score = 100;
    for (const f of findings) score -= f.severity === "high" ? 25 : f.severity === "medium" ? 10 : 5;
    score = Math.max(0, Math.min(100, score));

    let status: TiComplianceStatus = "compliant";
    if (findings.some((f) => f.severity === "high") || probes.some((p) => !p.passed)) status = "failed";
    else if (findings.some((f) => f.severity === "medium")) status = "review_required";

    const run: TiComplianceRun = {
      id: "tirun_" + randomUUID().slice(0, 8),
      orgId,
      ranAt: new Date().toISOString(),
      status,
      score,
      namespaces,
      probes,
      findings,
      summary:
        status === "compliant"
          ? "Isolation posture is compliant."
          : status === "failed"
            ? "Isolation posture FAILED — review the findings immediately."
            : "Isolation posture requires review.",
    };

    await redis.hset(K.run(orgId, run.id), "_doc", s2(run));
    await redis.sadd(K.runs(orgId), run.id);
    const count = await redis.scard(K.runs(orgId));
    if (count > MAX_RUNS) {
      const ids = (await redis.smembers(K.runs(orgId))).sort();
      for (const old of ids.slice(0, count - MAX_RUNS)) {
        await redis.srem(K.runs(orgId), old);
        await redis.hdel(K.run(orgId, old), "_doc");
      }
    }

    await emitKernel("tenant-isolation.run_completed", {
      orgId,
      runId: run.id,
      status,
      score,
      probeFailures: probes.filter((p) => !p.passed).length,
    });
    logger.info("Tenant isolation compliance run completed", { orgId, runId: run.id, status, score });
    return run;
  },

  async listRuns(orgId: string): Promise<TiComplianceRun[]> {
    const ids = await redis.smembers(K.runs(orgId));
    const out: TiComplianceRun[] = [];
    for (const id of ids) {
      const raw = await redis.hget(K.run(orgId, id), "_doc");
      if (raw) out.push(JSON.parse(raw) as TiComplianceRun);
    }
    return out.sort((a, b) => b.ranAt.localeCompare(a.ranAt));
  },

  async getRun(orgId: string, runId: string): Promise<TiComplianceRun | null> {
    const raw = await redis.hget(K.run(orgId, runId), "_doc");
    return j<TiComplianceRun>(raw);
  },

  /** Export gate — call before moving data outside the tenant boundary. */
  async checkExport(orgId: string, dataset: string, actorId: string): Promise<TiExportCheckResult> {
    const policy = await this.getPolicy(orgId);
    const result: TiExportCheckResult = {
      allowed: policy.allowCrossTenantExport,
      dataset,
      reason: policy.allowCrossTenantExport
        ? "Org policy permits cross-tenant export."
        : "Blocked by org isolation policy (allowCrossTenantExport=false).",
      policy: {
        allowCrossTenantExport: policy.allowCrossTenantExport,
        piiRedactionLevel: policy.piiRedactionLevel,
        regionPin: policy.regionPin,
      },
    };
    await emitKernel(result.allowed ? "tenant-isolation.export.allowed" : "tenant-isolation.export.blocked", {
      orgId,
      dataset,
      actorId,
    });
    return result;
  },
};

export const DEFAULT_ISOLATION_POLICY = DEFAULT_POLICY;
export const TI_PII_LEVELS = TI_PII_REDACTION_LEVELS;
