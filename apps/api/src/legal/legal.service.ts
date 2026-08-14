/**
 * Session 66 — Enterprise Legal Intelligence Suite.
 *
 * Tenant-scoped matters, regulatory updates, contracts (CLM), and legal
 * research records. All writes are persisted in Redis under `leg:*:{orgId}:*`
 * and every read filters on the orgId.
 *
 * Fixed from previous version:
 * - `topRisks` was regenerated with a non-deterministic RNG on every dashboard read; it
 *   is now computed deterministically from the persisted matter risk scores.
 * - `research()` fabricated citation identifiers; it now records the query as
 *   a real research request and returns a disclosed heuristic response with
 *   provenance metadata (no fake case IDs).
 * - `acknowledgeUpdate` now records the userId + timestamp instead of a
 *   plain boolean.
 * - Bootstrap seeds are marked with a `seed: true` flag so they can be told
 *   apart from real user-created records.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { LegalDashboard, LegalMatter, RegulatoryUpdate, Contract, LegalResearchItem, LegalComplianceCheck } from "@windels/shared";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";

const K = {
  m: (oid: string, id: string) => `leg:m:${oid}:${id}`, ms: (oid: string) => `leg:ms:${oid}`,
  u: (oid: string, id: string) => `leg:u:${oid}:${id}`, us: (oid: string) => `leg:us:${oid}`,
  c: (oid: string, id: string) => `leg:c:${oid}:${id}`, cs: (oid: string) => `leg:cs:${oid}`,
  r: (oid: string, id: string) => `leg:r:${oid}:${id}`, rs: (oid: string) => `leg:rs:${oid}`,
  chk: (oid: string, id: string) => `leg:chk:${oid}:${id}`, chks: (oid: string) => `leg:chks:${oid}`,
};
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

const MATTER_SEED = [
  { title: "Acme Corp patent dispute", kind: "litigation", risk: 78, dueOffsetDays: 45 },
  { title: "Q2 vendor contract negotiation", kind: "contract", risk: 28, dueOffsetDays: 14 },
  { title: "EU AI Act compliance review", kind: "regulatory", risk: 62, dueOffsetDays: 90 },
  { title: "Employee IP assignment review", kind: "employment", risk: 18, dueOffsetDays: 30 },
  { title: "Board governance advisory", kind: "advisory", risk: 12, dueOffsetDays: 60 },
];
const REG_SEED = [
  { jur: "EU", title: "AI Act — general purpose AI provisions", topic: "ai", impact: "high", effectiveOffsetDays: 120 },
  { jur: "US-FTC", title: "Data broker disclosure rule", topic: "privacy", impact: "medium", effectiveOffsetDays: 90 },
  { jur: "CA", title: "CPRA amendments 2026", topic: "privacy", impact: "medium", effectiveOffsetDays: 180 },
  { jur: "UK", title: "Online Safety Act phase 2", topic: "platform-safety", impact: "low", effectiveOffsetDays: 60 },
  { jur: "Global", title: "ISO 42001 AI management systems", topic: "ai", impact: "medium", effectiveOffsetDays: 240 },
];
const CONTRACTS_SEED = [
  { title: "MSA — Globex Logistics", type: "msa", value: 480000, party: "Globex", status: "signed", clauses: 32, riskFlags: ["auto-renewal"] },
  { title: "NDA — Initech partners", type: "nda", party: "Initech", status: "signed", clauses: 12 },
  { title: "SOW — Platform v2 rollout", type: "sow", value: 120000, party: "Hooli", status: "signed", clauses: 22 },
  { title: "Office lease — HQ NYC", type: "lease", value: 2400000, party: "REIT Holdings", status: "signed", clauses: 40, riskFlags: ["liability-cap"] },
  { title: "Enterprise license — Acme", type: "license", value: 320000, party: "Acme", status: "signed", clauses: 28, riskFlags: ["auto-renewal", "liability-cap"] },
  { title: "Employment — CTO offer", type: "employment", party: "Individual", status: "draft", clauses: 18 },
];
const FRAMEWORK_CONTROLS: Record<string, string[]> = {
  SOC2: ["CC1.1", "CC5.2", "CC7.4"],
  GDPR: ["Art.5", "Art.30", "Art.32"],
  HIPAA: ["164.308(a)(1)", "164.312(a)(1)", "164.312(c)(1)"],
  ISO27001: ["A.5.1", "A.8.2", "A.12.6"],
  SOX: ["302", "404", "409"],
  "PCI-DSS": ["3.4", "8.2.3", "10.5"],
};

export const LegalService = {
  async ensureBootstrapped(logger?: any, oid = "org-windels", uid0 = "user-admin") {
    if (await redis.exists(K.ms(oid))) return;
    // Demo/sample records are opt-in; production starts empty (no sample data auto-created).
    if (!demoDataEnabled()) return skipDemoSeed("legal", logger);
    const now = new Date().toISOString();
    const baseAgo = Date.now() - 30 * 86_400_000;
    for (const m of MATTER_SEED) {
      const id = uid("mat-");
      const mt: LegalMatter & { seed?: boolean } = {
        id, title: m.title, kind: m.kind as any,
        status: "open",
        riskScore: m.risk, owner: uid0,
        dueDate: new Date(Date.now() + m.dueOffsetDays * 86_400_000).toISOString(),
        openedAt: new Date(baseAgo).toISOString(), updatedAt: now,
        summary: m.title + " — pre-seeded matter (Windels sample data).",
        seed: true,
      };
      await redis.hset(K.m(oid, id), "_doc", s2(mt)); await redis.sadd(K.ms(oid), id);
    }
    for (const u of REG_SEED) {
      const id = uid("reg-");
      const ru: RegulatoryUpdate & { seed?: boolean } = {
        id, jurisdiction: u.jur, title: u.title, topic: u.topic,
        effectiveAt: new Date(Date.now() + u.effectiveOffsetDays * 86_400_000).toISOString(),
        impact: u.impact as any, summary: u.title,
        publishedAt: new Date(baseAgo).toISOString(),
        acknowledged: false, seed: true,
      };
      await redis.hset(K.u(oid, id), "_doc", s2(ru)); await redis.sadd(K.us(oid), id);
    }
    for (const c of CONTRACTS_SEED) {
      const id = uid("ctr-");
      const ct: Contract & { seed?: boolean } = {
        id, title: c.title, counterparty: c.party, type: c.type as any,
        status: c.status as Contract["status"],
        valueUsd: c.value, startDate: new Date(baseAgo).toISOString(),
        endDate: new Date(Date.now() + 365 * 86_400_000).toISOString(),
        riskFlags: c.riskFlags ?? [], clausesCount: c.clauses,
        owner: uid0, version: 1, updatedAt: now, seed: true,
      };
      await redis.hset(K.c(oid, id), "_doc", s2(ct)); await redis.sadd(K.cs(oid), id);
    }
    for (const [f, controls] of Object.entries(FRAMEWORK_CONTROLS)) {
      for (const c of controls) {
        const id = uid("chk-");
        const ch: LegalComplianceCheck & { seed?: boolean } = { id, framework: f, control: c, status: "pass", lastCheckedAt: now, seed: true };
        await redis.hset(K.chk(oid, id), "_doc", s2(ch)); await redis.sadd(K.chks(oid), id);
      }
    }
    logger?.info?.("[legal] bootstrap complete", { orgId: oid });
  },

  async dashboard(oid = "org-windels"): Promise<LegalDashboard> {
    const [mids, uids, cids, rids, chkIds] = await Promise.all([
      redis.smembers(K.ms(oid)), redis.smembers(K.us(oid)), redis.smembers(K.cs(oid)),
      redis.smembers(K.rs(oid)), redis.smembers(K.chks(oid)),
    ]);
    const get = async <T,>(ids: string[], keyFn: (id: string) => string): Promise<T[]> => {
      const out: T[] = [];
      for (const id of ids) {
        const r = await redis.hgetall(keyFn(id));
        if (r._doc) out.push(JSON.parse(r._doc));
      }
      return out;
    };
    const [matters, updates, contracts, research, checks] = await Promise.all([
      get<LegalMatter>(mids, (id) => K.m(oid, id)),
      get<RegulatoryUpdate>(uids, (id) => K.u(oid, id)),
      get<Contract>(cids, (id) => K.c(oid, id)),
      get<LegalResearchItem>(rids, (id) => K.r(oid, id)),
      get<LegalComplianceCheck>(chkIds, (id) => K.chk(oid, id)),
    ]);
    const now = Date.now();
    const byStatus: Record<string, number> = {};
    for (const m of matters) { byStatus[m.status] = (byStatus[m.status] || 0) + 1; }
    const passRate = checks.length ? +(checks.filter((c) => c.status === "pass").length / checks.length).toFixed(2) : null;
    const upcoming = [...matters.filter((m) => m.dueDate)]
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
      .slice(0, 6)
      .map((m) => ({ id: m.id, title: m.title, dueDate: m.dueDate!, kind: m.kind }));

    // Real topRisks: aggregate mean risk score per matter.kind.
    const kindTotals: Record<string, { sum: number; count: number }> = {};
    for (const m of matters) {
      const k = m.kind ?? "other";
      const bucket = kindTotals[k] ?? (kindTotals[k] = { sum: 0, count: 0 });
      bucket.sum += m.riskScore; bucket.count++;
    }
    const risks = Object.entries(kindTotals)
      .map(([topic, v]) => ({ topic, score: Math.round(v.sum / v.count) }))
      .sort((a, b) => b.score - a.score);

    return {
      mattersOpen: matters.filter((m) => m.status !== "closed").length,
      mattersAtRisk: matters.filter((m) => m.riskScore >= 60).length,
      contractsActive: contracts.filter((c) => c.status === "signed").length,
      contractsExpiring90d: contracts.filter((c) => c.endDate && new Date(c.endDate).getTime() - now < 90 * 86_400_000 && c.status === "signed").length,
      regulatoryUpdates7d: updates.filter((u) => Date.now() - new Date(u.publishedAt).getTime() < 7 * 86_400_000).length,
      openResearchTasks: research.length,
      compliancePassRate: passRate,
      riskAvg: matters.length ? Math.round(matters.reduce((s, m) => s + m.riskScore, 0) / matters.length) : null,
      mattersByStatus: byStatus,
      recentMatters: matters.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
      recentUpdates: updates.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 6),
      recentContracts: contracts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
      upcomingDeadlines: upcoming,
      topRisks: risks,
      provenance: {
        compliancePassRate: "pass / recorded checks, or null when none exist. An empty register is not 100% compliant.",
        riskAvg: "Mean of recorded matter riskScore values, or null when no matters exist.",
        research: "research() logs the query. It does not invent citations or case identifiers.",
      },
    };
  },

  async createMatter(oid: string, userId: string, input: { title: string; kind: LegalMatter["kind"]; riskScore: number; dueDate?: string; summary?: string }): Promise<LegalMatter> {
    const id = uid("mat-");
    const now = new Date().toISOString();
    const mt: LegalMatter = {
      id, title: input.title, kind: input.kind,
      status: "open", riskScore: Math.max(0, Math.min(100, input.riskScore)),
      owner: userId, dueDate: input.dueDate,
      openedAt: now, updatedAt: now, summary: input.summary,
    };
    await redis.hset(K.m(oid, id), "_doc", s2(mt));
    await redis.sadd(K.ms(oid), id);
    return mt;
  },

  async updateMatterStatus(oid: string, id: string, status: LegalMatter["status"]): Promise<LegalMatter | null> {
    const r = await redis.hgetall(K.m(oid, id));
    if (!r._doc) return null;
    const m: LegalMatter = JSON.parse(r._doc);
    m.status = status;
    m.updatedAt = new Date().toISOString();
    await redis.hset(K.m(oid, id), "_doc", s2(m));
    return m;
  },

  /**
   * Legal research: persists the request and returns a disclosed heuristic
   * response. Real citation lookup would call an external legal database
   * (Westlaw, LexisNexis, PACER) — until that provider is configured this
   * returns provenance metadata but no fabricated case identifiers.
   */
  async research(query: string, oid: string, userId?: string): Promise<LegalResearchItem & { disclosure: string }> {
    const id = uid("res-");
    const now = new Date().toISOString();
    const item: LegalResearchItem & { disclosure: string; requestedBy?: string } = {
      id, query,
      sources: 0,
      citations: [],
      summary: `Research request logged: "${query}". No legal-database provider is configured; connect one via /platform-services/config to enable citation lookup.`,
      createdAt: now,
      disclosure: "heuristic-response; real provider not configured",
      requestedBy: userId,
    };
    await redis.hset(K.r(oid, id), "_doc", s2(item));
    await redis.sadd(K.rs(oid), id);
    return item;
  },

  async listMatters(oid: string): Promise<LegalMatter[]> {
    const ids = await redis.smembers(K.ms(oid));
    const out: LegalMatter[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.m(oid, id));
      if (r._doc) out.push(JSON.parse(r._doc));
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async listContracts(oid: string): Promise<Contract[]> {
    const ids = await redis.smembers(K.cs(oid));
    const out: Contract[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.c(oid, id));
      if (r._doc) out.push(JSON.parse(r._doc));
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async listUpdates(oid: string): Promise<RegulatoryUpdate[]> {
    const ids = await redis.smembers(K.us(oid));
    const out: RegulatoryUpdate[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.u(oid, id));
      if (r._doc) out.push(JSON.parse(r._doc));
    }
    return out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  },

  async listResearch(oid: string): Promise<LegalResearchItem[]> {
    const ids = await redis.smembers(K.rs(oid));
    const out: LegalResearchItem[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.r(oid, id));
      if (r._doc) out.push(JSON.parse(r._doc));
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createContract(oid: string, userId: string, input: {
    title: string; counterparty: string; type: Contract["type"]; valueUsd?: number;
  }): Promise<Contract> {
    const id = uid("ctr-");
    const now = new Date().toISOString();
    const ct: Contract = {
      id, title: input.title, counterparty: input.counterparty, type: input.type,
      status: "draft", valueUsd: input.valueUsd, riskFlags: [], clausesCount: 0,
      owner: userId, version: 1, updatedAt: now,
    };
    await redis.hset(K.c(oid, id), "_doc", s2(ct));
    await redis.sadd(K.cs(oid), id);
    return ct;
  },

  async createUpdate(oid: string, input: {
    jurisdiction: string; title: string; topic: string; impact: RegulatoryUpdate["impact"]; summary?: string;
  }): Promise<RegulatoryUpdate> {
    const id = uid("reg-");
    const now = new Date().toISOString();
    const ru: RegulatoryUpdate = {
      id, jurisdiction: input.jurisdiction, title: input.title, topic: input.topic,
      impact: input.impact, summary: input.summary ?? input.title,
      acknowledged: false, publishedAt: now,
    };
    await redis.hset(K.u(oid, id), "_doc", s2(ru));
    await redis.sadd(K.us(oid), id);
    return ru;
  },

  async acknowledgeUpdate(id: string, oid: string, userId?: string): Promise<RegulatoryUpdate | null> {
    const r = await redis.hgetall(K.u(oid, id));
    if (!r._doc) return null;
    const u: RegulatoryUpdate & { acknowledgedBy?: string; acknowledgedAt?: string } = JSON.parse(r._doc);
    u.acknowledged = true;
    u.acknowledgedBy = userId;
    u.acknowledgedAt = new Date().toISOString();
    await redis.hset(K.u(oid, id), "_doc", s2(u));
    return u;
  },
};
