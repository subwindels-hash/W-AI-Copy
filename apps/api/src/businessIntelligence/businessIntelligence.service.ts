/**
 * Session 97 — Enterprise Business Intelligence & Report Builder.
 *
 * Org-scoped data sources, KPI definitions whose values are computed LIVE
 * from the real module stores (CRM/ERP/Email/Social/Helpdesk/Builder), and a
 * report builder with deterministic evaluation + real CSV export.
 *
 * Honesty rules:
 *   - No Math.random anywhere; ids from CSPRNG.
 *   - KPI values are computed from live module records on every read —
 *     never stored, never fabricated. Identical store state ⇒ identical
 *     values.
 *   - CSV export is real (escaped, deterministic rows from evaluated data).
 *
 * Keys: bi:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  BiSource,
  BiKpi,
  BiReport,
  BiReportCard,
  BiKpiValue,
  BiReportCardValue,
  BiReportEvaluation,
  BiRollup,
  BiSourceCreateInput,
  BiKpiCreateInput,
  BiReportCreateInput,
  BiSourceUpsertInput,
  BiKpiUpsertInput,
  BiReportUpsertInput,
  BiModule,
  BiPeriod,
  BiFormat,
} from "@windels/shared/businessIntelligence";
import { BI_METRICS } from "@windels/shared/businessIntelligence";

type Entity = "source" | "kpi" | "report";

const K = {
  item: (e: Entity, org: string, id: string) => `bi:${e}:i:${org}:${id}`,
  idx: (e: Entity, org: string) => `bi:${e}:idx:${org}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

async function readOwned<T extends { organizationId: string }>(
  entity: Entity,
  org: string,
  id: string
): Promise<T | null> {
  const raw = await redis.hget(K.item(entity, org, id), "_doc");
  if (!raw) return null;
  const rec = j<T>(raw);
  return rec && rec.organizationId === org ? rec : null;
}

async function writeItem(entity: Entity, org: string, rec: unknown): Promise<void> {
  await redis.hset(K.item(entity, org, (rec as { id: string }).id), "_doc", s2(rec));
  await redis.zadd(K.idx(entity, org), Date.now(), (rec as { id: string }).id);
}

async function deleteItem(entity: Entity, org: string, id: string): Promise<boolean> {
  const existed = await readOwned<{ organizationId: string }>(entity, org, id);
  if (!existed) return false;
  await redis.del(K.item(entity, org, id));
  await redis.zrem(K.idx(entity, org), id);
  return true;
}

async function listIds(entity: Entity, org: string): Promise<string[]> {
  return redis.zrange(K.idx(entity, org), 0, -1);
}

const uid = (p: string) => p + randomUUID().slice(0, 8);

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ kind, source: "business-intelligence", payload });
  } catch {
    /* best effort */
  }
}

const isWithin = (iso: string | null | undefined, period: BiPeriod, now = Date.now()): boolean => {
  if (period === "all" || !iso) return true;
  const ms = period === "7d" ? 7 * 86_400_000 : 30 * 86_400_000;
  return now - new Date(iso).getTime() <= ms;
};

/** Live metric engine — reads real module records and computes the value. */
export async function evaluateMetric(
  org: string,
  module: BiModule,
  metric: string,
  period: BiPeriod
): Promise<number> {
  const now = Date.now();
  switch (module) {
    case "crm": {
      const { CrmService } = await import("../crm/crm.service.js");
      const contacts = await CrmService.listContacts(org);
      const companies = await CrmService.listCompanies(org);
      const deals = await CrmService.listDeals(org);
      const won = deals.filter((d) => d.stage === "closed_won");
      switch (metric) {
        case "contacts": return contacts.filter((c) => isWithin(c.createdAt, period, now)).length;
        case "companies": return companies.filter((c) => isWithin(c.createdAt, period, now)).length;
        case "open_deals": return deals.filter((d) => d.stage !== "closed_won" && d.stage !== "closed_lost" && isWithin(d.createdAt, period, now)).length;
        case "won_deals": return won.filter((d) => isWithin(d.wonAt ?? d.createdAt, period, now)).length;
        case "forecast": return (await CrmService.rollup(org)).forecastCents;
        default: return 0;
      }
    }
    case "erp": {
      const { ErpService } = await import("../erp/erp.service.js");
      const r = await ErpService.rollup(org);
      const products = await ErpService.listProducts(org);
      switch (metric) {
        case "products": return products.filter((p) => isWithin(p.createdAt, period, now)).length;
        case "stock_value": return r.inventoryValueCents;
        case "purchase_orders": return r.counts.purchaseOrders.draft + r.counts.purchaseOrders.submitted + r.counts.purchaseOrders.received + r.counts.purchaseOrders.cancelled;
        case "sales_orders": return r.counts.salesOrders.draft + r.counts.salesOrders.confirmed + r.counts.salesOrders.fulfilled + r.counts.salesOrders.cancelled;
        default: return 0;
      }
    }
    case "email": {
      const { EmailIntelService } = await import("../emailIntel/emailIntel.service.js");
      const r = await EmailIntelService.rollup(org);
      switch (metric) {
        case "mailboxes": return r.counts.mailboxes;
        case "messages": return r.counts.messages;
        case "unread": return r.counts.unread;
        case "queued_outbox": return r.counts.queued;
        default: return 0;
      }
    }
    case "social": {
      const { SocialPlatformService } = await import("../socialPlatform/socialPlatform.service.js");
      const r = await SocialPlatformService.rollup(org);
      switch (metric) {
        case "posts": return r.counts.posts;
        case "comments": return r.counts.comments;
        case "reactions": return r.counts.reactions;
        default: return 0;
      }
    }
    case "helpdesk": {
      const { HelpdeskService } = await import("../helpdesk/helpdesk.service.js");
      const r = await HelpdeskService.rollup(org);
      switch (metric) {
        case "tickets": return r.counts.tickets;
        case "open": return r.counts.open;
        case "resolved": return r.counts.resolved;
        case "overdue": return r.counts.overdue;
        default: return 0;
      }
    }
    case "builder": {
      const { AppBuilderService } = await import("../appBuilder/appBuilder.service.js");
      const r = await AppBuilderService.rollup(org);
      switch (metric) {
        case "projects": return r.counts.projects;
        case "builds": return r.counts.runs;
        case "artifacts": return r.counts.artifacts;
        case "releases": return r.counts.releasedArtifacts;
        default: return 0;
      }
    }
    default:
      return 0;
  }
}

export const BusinessIntelligenceService = {
  // ── Sources ───────────────────────────────────────────────────────
  async listSources(org: string): Promise<BiSource[]> {
    const ids = await listIds("source", org);
    const out: BiSource[] = [];
    for (const id of ids) {
      const s = await readOwned<BiSource>("source", org, id);
      if (s) out.push(s);
    }
    return out.sort((a, b) => (a.name < b.name ? -1 : 1));
  },

  async getSource(org: string, id: string): Promise<BiSource | null> {
    return readOwned<BiSource>("source", org, id);
  },

  async createSource(org: string, input: BiSourceCreateInput, _userId: string | null): Promise<BiSource> {
    const now = new Date().toISOString();
    const rec: BiSource = {
      id: uid("bis-"),
      organizationId: org,
      name: input.name,
      module: input.module,
      description: input.description ?? null,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("source", org, rec);
    void emitKernel("bi.source.created", { id: rec.id, organizationId: org, module: rec.module });
    return rec;
  },

  async updateSource(org: string, id: string, patch: Partial<BiSourceUpsertInput>, _userId: string | null): Promise<BiSource | null> {
    const cur = await readOwned<BiSource>("source", org, id);
    if (!cur) return null;
    const next: BiSource = {
      ...cur,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.module !== undefined ? { module: patch.module } : {}),
      ...(patch.description !== undefined ? { description: patch.description ?? null } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      updatedAt: new Date().toISOString(),
    };
    await writeItem("source", org, next);
    void emitKernel("bi.source.updated", { id, organizationId: org });
    return next;
  },

  async deleteSource(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("source", org, id);
    if (ok) void emitKernel("bi.source.deleted", { id, organizationId: org });
    return ok;
  },

  /** Live sample: evaluate a representative metric for the source's module. */
  async sampleSource(org: string, id: string): Promise<{ count: number; sampledAt: string } | null> {
    const source = await readOwned<BiSource>("source", org, id);
    if (!source) return null;
    const metric = BI_METRICS[source.module][0]!;
    return { count: await evaluateMetric(org, source.module, metric, "all"), sampledAt: new Date().toISOString() };
  },

  // ── KPIs ──────────────────────────────────────────────────────────
  async listKpis(org: string, filter?: { sourceModule?: BiModule }): Promise<BiKpi[]> {
    const ids = await listIds("kpi", org);
    const out: BiKpi[] = [];
    for (const id of ids) {
      const k = await readOwned<BiKpi>("kpi", org, id);
      if (!k) continue;
      if (filter?.sourceModule && k.sourceModule !== filter.sourceModule) continue;
      out.push(k);
    }
    return out.sort((a, b) => (a.name < b.name ? -1 : 1));
  },

  async getKpi(org: string, id: string): Promise<BiKpi | null> {
    return readOwned<BiKpi>("kpi", org, id);
  },

  async createKpi(org: string, input: BiKpiCreateInput, _userId: string | null): Promise<BiKpi> {
    const metric = input.metric;
    if (!BI_METRICS[input.sourceModule].includes(metric)) throw new Error("UNKNOWN_METRIC");
    const now = new Date().toISOString();
    const rec: BiKpi = {
      id: uid("bik-"),
      organizationId: org,
      name: input.name,
      sourceModule: input.sourceModule,
      metric,
      period: input.period ?? "all",
      format: input.format ?? "number",
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("kpi", org, rec);
    void emitKernel("bi.kpi.created", { id: rec.id, organizationId: org, metric });
    return rec;
  },

  async updateKpi(org: string, id: string, patch: Partial<BiKpiUpsertInput>, _userId: string | null): Promise<BiKpi | null> {
    const cur = await readOwned<BiKpi>("kpi", org, id);
    if (!cur) return null;
    if (patch.metric && patch.sourceModule && !BI_METRICS[patch.sourceModule].includes(patch.metric)) throw new Error("UNKNOWN_METRIC");
    const next: BiKpi = {
      ...cur,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.sourceModule !== undefined ? { sourceModule: patch.sourceModule } : {}),
      ...(patch.metric !== undefined ? { metric: patch.metric } : {}),
      ...(patch.period !== undefined ? { period: patch.period } : {}),
      ...(patch.format !== undefined ? { format: patch.format } : {}),
      updatedAt: new Date().toISOString(),
    };
    await writeItem("kpi", org, next);
    void emitKernel("bi.kpi.updated", { id, organizationId: org });
    return next;
  },

  async deleteKpi(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("kpi", org, id);
    if (ok) void emitKernel("bi.kpi.deleted", { id, organizationId: org });
    return ok;
  },

  async evaluateKpiValue(org: string, kpiId: string): Promise<BiKpiValue | null> {
    const kpi = await readOwned<BiKpi>("kpi", org, kpiId);
    if (!kpi) return null;
    return {
      kpiId: kpi.id,
      name: kpi.name,
      sourceModule: kpi.sourceModule,
      metric: kpi.metric,
      period: kpi.period,
      value: await evaluateMetric(org, kpi.sourceModule, kpi.metric, kpi.period),
      format: kpi.format,
      sampledAt: new Date().toISOString(),
    };
  },

  // ── Reports ───────────────────────────────────────────────────────
  async listReports(org: string): Promise<BiReport[]> {
    const ids = await listIds("report", org);
    const out: BiReport[] = [];
    for (const id of ids) {
      const r = await readOwned<BiReport>("report", org, id);
      if (r) out.push(r);
    }
    return out.sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1));
  },

  async getReport(org: string, id: string): Promise<BiReport | null> {
    return readOwned<BiReport>("report", org, id);
  },

  async createReport(org: string, input: BiReportCreateInput, _userId: string | null): Promise<BiReport> {
    const now = new Date().toISOString();
    const rec: BiReport = {
      id: uid("bir-"),
      organizationId: org,
      name: input.name,
      description: input.description ?? null,
      cards: (input.cards ?? []).map((c) => ({
        id: uid("birc-"),
        title: c.title,
        sourceModule: c.sourceModule,
        metric: c.metric,
        period: c.period ?? "all",
      })),
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("report", org, rec);
    void emitKernel("bi.report.created", { id: rec.id, organizationId: org, cards: rec.cards.length });
    return rec;
  },

  async updateReport(org: string, id: string, patch: Partial<BiReportUpsertInput>, _userId: string | null): Promise<BiReport | null> {
    const cur = await readOwned<BiReport>("report", org, id);
    if (!cur) return null;
    const next: BiReport = {
      ...cur,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description ?? null } : {}),
      ...(patch.cards !== undefined
        ? {
            cards: patch.cards.map((c) => ({
              id: (c as BiReportCard & { id?: string }).id ?? uid("birc-"),
              title: c.title,
              sourceModule: c.sourceModule,
              metric: c.metric,
              period: c.period ?? "all",
            })),
          }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    await writeItem("report", org, next);
    void emitKernel("bi.report.updated", { id, organizationId: org });
    return next;
  },

  async deleteReport(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("report", org, id);
    if (ok) void emitKernel("bi.report.deleted", { id, organizationId: org });
    return ok;
  },

  /** Evaluate every card live — deterministic given the same store state. */
  async evaluateReport(org: string, id: string): Promise<BiReportEvaluation | null> {
    const report = await readOwned<BiReport>("report", org, id);
    if (!report) return null;
    const cards: BiReportCardValue[] = [];
    for (const card of report.cards) {
      cards.push({
        card,
        value: await evaluateMetric(org, card.sourceModule, card.metric, card.period),
        format: card.metric === "forecast" || card.metric === "stock_value" ? "currency" : "number",
        sampledAt: new Date().toISOString(),
      });
    }
    return { report, cards, evaluatedAt: new Date().toISOString() };
  },

  /** Real CSV export of a report's evaluated cards. */
  async exportReportCsv(org: string, id: string): Promise<{ filename: string; csv: string } | null> {
    const evaluation = await this.evaluateReport(org, id);
    if (!evaluation) return null;
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [
      ["report", "evaluated_at", "card", "metric", "period", "value", "format"].map(esc).join(","),
      ...evaluation.cards.map((c) =>
        [esc(evaluation.report.name), esc(evaluation.evaluatedAt), esc(c.card.title), esc(c.card.metric), esc(c.card.period), String(c.value), esc(c.format)].join(",")
      ),
    ];
    return {
      filename: `${evaluation.report.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report.csv`,
      csv: rows.join("\n"),
    };
  },

  // ── Rollup (computed per read) ────────────────────────────────────
  async rollup(org: string): Promise<BiRollup> {
    const [sources, kpis, reports] = await Promise.all([
      this.listSources(org),
      this.listKpis(org),
      this.listReports(org),
    ]);
    const sourceHealth: BiRollup["sourceHealth"] = [];
    for (const s of sources) {
      const sample = s.enabled ? await this.sampleSource(org, s.id) : null;
      sourceHealth.push({
        sourceId: s.id,
        name: s.name,
        module: s.module,
        enabled: s.enabled,
        sampleCount: sample?.count ?? 0,
        lastSampleAt: sample?.sampledAt ?? null,
      });
    }
    const cards = reports.reduce((sum, r) => sum + r.cards.length, 0);
    const stamps = [sources[0]?.createdAt, kpis[0]?.createdAt, reports[0]?.createdAt].filter(Boolean).sort().reverse()[0] ?? null;
    return {
      counts: { sources: sources.length, enabledSources: sources.filter((s) => s.enabled).length, kpis: kpis.length, reports: reports.length, cards },
      sourceHealth,
      recentReports: reports.slice(0, 5),
      lastUpdatedAt: stamps,
    };
  },

  // ── Idempotent demo seed (opt-in only) ─────────────────────────────
  async ensureDemoSeed(logger?: { info?: (...a: any[]) => void }): Promise<boolean> {
    const demoOrg = "org-demo-bi";
    const existing = await this.listSources(demoOrg);
    if (existing.length > 0) return false;

    for (const module of ["crm", "erp", "email", "social", "helpdesk", "builder"] as BiModule[]) {
      await this.createSource(demoOrg, { name: `${module} source`, module }, null);
    }

    const kpis: Array<[string, BiModule, string, BiPeriod, BiFormat]> = [
      ["CRM forecast", "crm", "forecast", "all", "currency"],
      ["ERP inventory value", "erp", "stock_value", "all", "currency"],
      ["Unread email", "email", "unread", "all", "number"],
      ["Social reactions", "social", "reactions", "all", "number"],
      ["Helpdesk open", "helpdesk", "open", "all", "number"],
      ["Factory artifacts", "builder", "artifacts", "all", "number"],
    ];
    for (const [name, m, metric, period, format] of kpis) {
      await this.createKpi(demoOrg, { name, sourceModule: m, metric, period, format }, null);
    }

    await this.createReport(demoOrg, {
      name: "Executive overview",
      description: "Live snapshot across the enterprise application suite.",
      cards: [
        { title: "Pipeline forecast", sourceModule: "crm", metric: "forecast", period: "all" },
        { title: "Inventory value", sourceModule: "erp", metric: "stock_value", period: "all" },
        { title: "Unread email", sourceModule: "email", metric: "unread", period: "all" },
        { title: "Open helpdesk", sourceModule: "helpdesk", metric: "open", period: "all" },
      ],
    }, null);

    logger?.info?.("[bi] demo seed complete (org-demo-bi): 6 sources, 6 KPIs, 1 report (4 cards)");
    return true;
  },
};
