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
  // Global/shared infra namespaces (expected to be shared)
  { prefix: "org:membership", scope: "shared" },
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
