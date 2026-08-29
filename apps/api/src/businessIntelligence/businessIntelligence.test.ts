/**
 * Session 97 — Enterprise Business Intelligence.
 *
 * Exercises the real service against a fake KV (same pattern as the other
 * Redis-backed suites): source/KPI/report CRUD, the live metric engine
 * (KPI values computed from real module records — never stored), metric
 * validation, deterministic report evaluation, real CSV export, rollup
 * determinism, cross-tenant isolation, demo-seed idempotency, and the shared
 * Zod input contracts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string> | Set<string> | string | number>();
    async keys(pattern: string) {
      const regex = new RegExp("^" + pattern.replace(/[*]/g, ".*") + "$");
      return Array.from(this.store.keys()).filter((k) => regex.test(k));
    }
    async del(key: string) { return this.store.delete(key) ? 1 : 0; }
    async incr(key: string) {
      const cur = (this.store.get(key) as number) ?? 0;
      this.store.set(key, cur + 1);
      return cur + 1;
    }
    async hset(key: string, field: string, value: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(field, value); return 1;
    }
    async hget(key: string, field: string) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return null;
      const v = map.get(field);
      return v !== undefined ? String(v) : null;
    }
    async zadd(key: string, score: number, member: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(member, String(score)); return 1;
    }
    async zrange(key: string, start: number, stop: number) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return [];
      const entries = Array.from(map.entries());
      entries.sort((a, b) => Number(a[1]) - Number(b[1]) || (a[0] < b[0] ? -1 : 1));
      const slice = entries.slice(start, stop === -1 ? undefined : stop + 1);
      return slice.map(([m]) => m);
    }
    async zrem(key: string, member: string) {
      const map = this.store.get(key);
      if (map instanceof Map) return map.delete(member) ? 1 : 0;
      return 0;
    }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({
  redisCmd: fake,
}));
// All module services are Redis-backed too → point them at the same fake
// store so the live metric engine reads real (in-memory) records.
const moduleServices = async () => {
  const [{ CrmService }, { ErpService }, { EmailIntelService }, { SocialPlatformService }, { HelpdeskService }, { AppBuilderService }] = await Promise.all([
    import("../crm/crm.service.js"),
    import("../erp/erp.service.js"),
    import("../emailIntel/emailIntel.service.js"),
    import("../socialPlatform/socialPlatform.service.js"),
    import("../helpdesk/helpdesk.service.js"),
    import("../appBuilder/appBuilder.service.js"),
  ]);
  return { CrmService, ErpService, EmailIntelService, SocialPlatformService, HelpdeskService, AppBuilderService };
};

import { BusinessIntelligenceService, evaluateMetric } from "./businessIntelligence.service.js";
import {
  BiSourceUpsertSchema,
  BiKpiUpsertSchema,
  BiReportUpsertSchema,
} from "@windels/shared/businessIntelligence";

const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(() => {
  fake.store.clear();
});

describe("BI — sources & KPIs (org-scoped, metric validation)", () => {
  it("creates sources per module and lists them", async () => {
    const s = await BusinessIntelligenceService.createSource(ORG_A, { name: "CRM source", module: "crm" }, null);
    expect(s.id).toMatch(/^bis-/);
    expect(s.module).toBe("crm");
    expect(s.enabled).toBe(true);
    expect(await BusinessIntelligenceService.listSources(ORG_A)).toHaveLength(1);
  });

  it("rejects a KPI with an unknown metric for its module", async () => {
    await expect(BusinessIntelligenceService.createKpi(ORG_A, { name: "Bad", sourceModule: "crm", metric: "nonsense" }, null))
      .rejects.toThrow("UNKNOWN_METRIC");
    const k = await BusinessIntelligenceService.createKpi(ORG_A, { name: "Good", sourceModule: "crm", metric: "forecast", format: "currency" }, null);
    expect(k.id).toMatch(/^bik-/);
  });
});

describe("BI — live metric engine (real, deterministic)", () => {
  it("computes crm.contacts from real module records and updates when records change", async () => {
    const { CrmService } = await moduleServices();
    expect(await evaluateMetric(ORG_A, "crm", "contacts", "all")).toBe(0);

    await CrmService.createContact(ORG_A, { firstName: "Ada", lastName: "Okafor" }, null);
    await CrmService.createContact(ORG_A, { firstName: "Chidi", lastName: "Eze" }, null);
    expect(await evaluateMetric(ORG_A, "crm", "contacts", "all")).toBe(2);
  });

  it("computes crm.forecast from real won/expected deals", async () => {
    const { CrmService } = await moduleServices();
    const co = await CrmService.createCompany(ORG_A, { name: "Acme" }, null);
    await CrmService.createDeal(ORG_A, { name: "D1", companyId: co.id, amountCents: 100_000, stage: "lead" }, null);
    await CrmService.createDeal(ORG_A, { name: "D2", companyId: co.id, amountCents: 200_000, stage: "negotiation" }, null);
    // forecast = Σ amount × probability: 100k×10% + 200k×70%
    expect(await evaluateMetric(ORG_A, "crm", "forecast", "all")).toBe(10_000 + 140_000);
  });

  it("computes erp.stock_value, email.unread, helpdesk.open, social.reactions, builder.artifacts", async () => {
    const { ErpService, EmailIntelService, HelpdeskService, SocialPlatformService, AppBuilderService } = await moduleServices();

    const wh = await ErpService.createWarehouse(ORG_A, { name: "WH", code: "WH1" }, null);
    const p = await ErpService.createProduct(ORG_A, { sku: "S1", name: "Widget", priceCents: 100, costCents: 50 }, null);
    await ErpService.createMovement(ORG_A, { productId: p.id, warehouseId: wh.id, kind: "initial", quantity: 10 }, null);
    expect(await evaluateMetric(ORG_A, "erp", "stock_value", "all")).toBe(500);

    const mb = await EmailIntelService.createMailbox(ORG_A, { name: "Inbox", emailAddress: "inbox@example.com" }, null);
    await EmailIntelService.createMessage(ORG_A, { mailboxId: mb.id, fromAddress: "a@b.co", subject: "Hi", bodyText: "x" }, null);
    expect(await evaluateMetric(ORG_A, "email", "unread", "all")).toBe(1);

    await HelpdeskService.createTicket(ORG_A, { subject: "T", requesterName: "R" }, null);
    expect(await evaluateMetric(ORG_A, "helpdesk", "open", "all")).toBe(1);

    const post = await SocialPlatformService.createPost(ORG_A, { authorName: "A", content: "Hello #world" }, null);
    await SocialPlatformService.toggleReaction(ORG_A, post.id, { emoji: "👍" }, "u1");
    expect(await evaluateMetric(ORG_A, "social", "reactions", "all")).toBe(1);

    const proj = await AppBuilderService.createProject(ORG_A, { name: "App", systemPrompt: "Build" }, null);
    const run = await AppBuilderService.createRun(ORG_A, proj.id, { version: "v1.0.0" }, null);
    let cur = run;
    for (let i = 0; i < 5; i++) cur = (await AppBuilderService.advanceRun(ORG_A, cur.id, null))!;
    expect(await evaluateMetric(ORG_A, "builder", "artifacts", "all")).toBe(1);
  });
});

describe("BI — reports (deterministic evaluation + real CSV)", () => {
  it("evaluates every card live and deterministically", async () => {
    const { CrmService } = await moduleServices();
    const co = await CrmService.createCompany(ORG_A, { name: "Acme" }, null);
    await CrmService.createContact(ORG_A, { firstName: "Ada", lastName: "Okafor" }, null);
    await CrmService.createDeal(ORG_A, { name: "D", companyId: co.id, amountCents: 1_000_000, stage: "closed_won" }, null);
    // Open deal contributes to forecast at its stage probability (lead = 10%).
    await CrmService.createDeal(ORG_A, { name: "Pipeline", companyId: co.id, amountCents: 100_000, stage: "lead" }, null);

    const report = await BusinessIntelligenceService.createReport(ORG_A, {
      name: "Overview",
      cards: [
        { title: "Contacts", sourceModule: "crm", metric: "contacts", period: "all" },
        { title: "Won deals", sourceModule: "crm", metric: "won_deals", period: "all" },
        { title: "Forecast", sourceModule: "crm", metric: "forecast", period: "all" },
      ],
    }, null);
    expect(report.cards).toHaveLength(3);
    expect(report.cards.every((cd) => cd.id.startsWith("birc-"))).toBe(true);

    const e1 = await BusinessIntelligenceService.evaluateReport(ORG_A, report.id);
    const e2 = await BusinessIntelligenceService.evaluateReport(ORG_A, report.id);
    // Deterministic VALUES (the sampledAt/evaluatedAt clocks legitimately move).
    expect(e2!.cards.map((c) => c.value)).toEqual(e1!.cards.map((c) => c.value));
    expect(e1?.cards.map((c) => c.value)).toEqual([1, 1, 10_000]); // contacts, won, forecast (100k×10%)
    expect(e1?.cards[2].format).toBe("currency");
  });

  it("exports a real CSV with the report's evaluated values", async () => {
    const report = await BusinessIntelligenceService.createReport(ORG_A, {
      name: "Executive",
      cards: [{ title: "Contacts", sourceModule: "crm", metric: "contacts", period: "all" }],
    }, null);
    const out = await BusinessIntelligenceService.exportReportCsv(ORG_A, report.id);
    expect(out).not.toBeNull();
    expect(out!.filename).toBe("executive-report.csv");
    expect(out!.csv).toContain('"report","evaluated_at","card","metric","period","value","format"');
    expect(out!.csv).toContain('"Executive"');
    expect(out!.csv).toContain('"Contacts"');
    expect(out!.csv).toContain(",0,"); // no contacts in ORG_A at this point
  });
});

describe("BI — rollup (deterministic, honest)", () => {
  it("computes counts and source health from stored records", async () => {
    await BusinessIntelligenceService.createSource(ORG_A, { name: "CRM", module: "crm" }, null);
    await BusinessIntelligenceService.createKpi(ORG_A, { name: "Contacts", sourceModule: "crm", metric: "contacts" }, null);
    await BusinessIntelligenceService.createReport(ORG_A, {
      name: "R", cards: [{ title: "C", sourceModule: "crm", metric: "contacts", period: "all" }],
    }, null);

    const r1 = await BusinessIntelligenceService.rollup(ORG_A);
    const r2 = await BusinessIntelligenceService.rollup(ORG_A);
    // Deterministic counts + health (sample timestamps legitimately move).
    expect(r2!.counts).toEqual(r1!.counts);
    expect(r2!.sourceHealth.map((h) => ({ module: h.module, enabled: h.enabled, sampleCount: h.sampleCount })))
      .toEqual(r1!.sourceHealth.map((h) => ({ module: h.module, enabled: h.enabled, sampleCount: h.sampleCount })));

    expect(r1.counts.sources).toBe(1);
    expect(r1.counts.enabledSources).toBe(1);
    expect(r1.counts.kpis).toBe(1);
    expect(r1.counts.reports).toBe(1);
    expect(r1.counts.cards).toBe(1);
    expect(r1.sourceHealth[0].module).toBe("crm");
    expect(r1.sourceHealth[0].enabled).toBe(true);
    expect(r1.recentReports).toHaveLength(1);
    expect(r1.lastUpdatedAt).toBeTruthy();
  });

  it("returns an honest empty rollup for a fresh org", async () => {
    const r = await BusinessIntelligenceService.rollup(ORG_B);
    expect(r.counts.sources).toBe(0);
    expect(r.counts.kpis).toBe(0);
    expect(r.counts.reports).toBe(0);
    expect(r.sourceHealth).toEqual([]);
    expect(r.lastUpdatedAt).toBeNull();
  });
});

describe("BI — cross-tenant isolation (fail-closed)", () => {
  it("org B cannot read org A sources, KPIs or reports; KPI values stay org-scoped", async () => {
    const { CrmService } = await moduleServices();
    const kpi = await BusinessIntelligenceService.createKpi(ORG_A, { name: "Contacts", sourceModule: "crm", metric: "contacts" }, null);
    const report = await BusinessIntelligenceService.createReport(ORG_A, {
      name: "R", cards: [{ title: "C", sourceModule: "crm", metric: "contacts", period: "all" }],
    }, null);
    await CrmService.createContact(ORG_A, { firstName: "Ada", lastName: "Okafor" }, null);

    expect(await BusinessIntelligenceService.listSources(ORG_B)).toHaveLength(0);
    expect(await BusinessIntelligenceService.listKpis(ORG_B)).toHaveLength(0);
    expect(await BusinessIntelligenceService.evaluateKpiValue(ORG_B, kpi.id)).toBeNull();
    expect(await BusinessIntelligenceService.listReports(ORG_B)).toHaveLength(0);
    expect(await BusinessIntelligenceService.evaluateReport(ORG_B, report.id)).toBeNull();
    expect(await BusinessIntelligenceService.exportReportCsv(ORG_B, report.id)).toBeNull();
    expect(await evaluateMetric(ORG_B, "crm", "contacts", "all")).toBe(0);

    // Org A intact.
    expect((await BusinessIntelligenceService.evaluateKpiValue(ORG_A, kpi.id))?.value).toBe(1);
  });
});

describe("BI — demo seed is idempotent", () => {
  it("seeds the demo org once and skips on the second call", async () => {
    expect(await BusinessIntelligenceService.ensureDemoSeed()).toBe(true);
    const r = await BusinessIntelligenceService.rollup("org-demo-bi");
    expect(r.counts.sources).toBe(6);
    expect(r.counts.kpis).toBe(6);
    expect(r.counts.reports).toBe(1);
    expect(r.counts.cards).toBe(4);

    expect(await BusinessIntelligenceService.ensureDemoSeed()).toBe(false);
    expect((await BusinessIntelligenceService.rollup("org-demo-bi")).counts.sources).toBe(6);
  });
});

describe("BI — shared input contracts", () => {
  it("validates source input", () => {
    expect(BiSourceUpsertSchema.safeParse({ name: "", module: "crm" }).success).toBe(false);
    expect(BiSourceUpsertSchema.safeParse({ name: "A", module: "nope" }).success).toBe(false);
    expect(BiSourceUpsertSchema.safeParse({ name: "A", module: "crm" }).success).toBe(true);
  });

  it("validates KPI input", () => {
    expect(BiKpiUpsertSchema.safeParse({ name: "A", sourceModule: "crm", metric: "" }).success).toBe(false);
    expect(BiKpiUpsertSchema.safeParse({ name: "A", sourceModule: "crm", metric: "contacts", period: "bogus" }).success).toBe(false);
    expect(BiKpiUpsertSchema.safeParse({ name: "A", sourceModule: "crm", metric: "contacts" }).success).toBe(true);
  });

  it("validates report input", () => {
    expect(BiReportUpsertSchema.safeParse({ name: "" }).success).toBe(false);
    expect(BiReportUpsertSchema.safeParse({ name: "R", cards: [{ title: "C", sourceModule: "crm", metric: "contacts" }] }).success).toBe(true);
  });
});
