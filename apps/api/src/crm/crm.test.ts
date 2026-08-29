/**
 * Session 90 — Enterprise CRM.
 *
 * Exercises the real service against a fake KV (same pattern as the other
 * Redis-backed suites): contact/company/deal/activity CRUD, pipeline stage
 * transitions with audit activities, deterministic rollup math, cross-tenant
 * isolation, demo-seed idempotency, and the shared Zod input contracts.
 * No verdict is fabricated — every assertion reads what was actually stored.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string> | Set<string> | string>();
    async keys(pattern: string) {
      const regex = new RegExp("^" + pattern.replace(/[*]/g, ".*") + "$");
      return Array.from(this.store.keys()).filter((k) => regex.test(k));
    }
    async del(key: string) { return this.store.delete(key) ? 1 : 0; }
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
      let set = this.store.get(key);
      if (!(set instanceof Map)) { set = new Map(); this.store.set(key, set); }
      set.set(member, String(score)); return 1;
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

import { CrmService } from "./crm.service.js";
import {
  CrmContactUpsertSchema,
  CrmCompanyUpsertSchema,
  CrmDealUpsertSchema,
  CrmActivityCreateSchema,
} from "@windels/shared/crm";

const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(() => {
  fake.store.clear();
});

describe("CRM — contact CRUD (org-scoped)", () => {
  it("creates, reads, lists, updates and deletes a contact", async () => {
    const c = await CrmService.createContact(ORG_A, {
      firstName: "Ada", lastName: "Okafor", email: "ada@example.com",
      source: "referral", status: "lead", tags: ["executive"],
    }, "user-1");

    expect(c.id).toMatch(/^crmc-/);
    expect(c.organizationId).toBe(ORG_A);
    expect(c.source).toBe("referral");
    expect(c.status).toBe("lead");

    const got = await CrmService.getContact(ORG_A, c.id);
    expect(got?.email).toBe("ada@example.com");

    const list = await CrmService.listContacts(ORG_A, { q: "ada" });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(c.id);

    const updated = await CrmService.updateContact(ORG_A, c.id, { status: "customer" }, "user-1");
    expect(updated?.status).toBe("customer");
    expect(updated?.updatedAt >= c.updatedAt).toBe(true);

    expect(await CrmService.deleteContact(ORG_A, c.id)).toBe(true);
    expect(await CrmService.getContact(ORG_A, c.id)).toBeNull();
    expect(await CrmService.deleteContact(ORG_A, c.id)).toBe(false);
  });

  it("enforces org isolation on every read path (org B cannot see org A)", async () => {
    const c = await CrmService.createContact(ORG_A, { firstName: "Ada", lastName: "Okafor" }, "user-1");
    const d = await CrmService.createDeal(ORG_A, { name: "Acme deal", companyId: "crmco-x", amountCents: 1_000 }, "user-1");
    const a = await CrmService.createActivity(ORG_A, { kind: "call", subject: "Discovery call" }, "user-1");

    // get / list / update / delete all fail closed for org B
    expect(await CrmService.getContact(ORG_B, c.id)).toBeNull();
    expect(await CrmService.listContacts(ORG_B)).toHaveLength(0);
    expect(await CrmService.updateContact(ORG_B, c.id, { status: "customer" })).toBeNull();
    expect(await CrmService.deleteContact(ORG_B, c.id)).toBe(false);

    expect(await CrmService.getDeal(ORG_B, d.id)).toBeNull();
    expect(await CrmService.listDeals(ORG_B)).toHaveLength(0);
    expect(await CrmService.listActivities(ORG_B)).toHaveLength(0);
    expect(await CrmService.getActivity(ORG_B, a.id)).toBeNull();

    // org A data intact afterwards
    expect((await CrmService.getContact(ORG_A, c.id))?.firstName).toBe("Ada");
    expect((await CrmService.getDeal(ORG_A, d.id))?.name).toBe("Acme deal");
  });
});

describe("CRM — companies", () => {
  it("creates and lists companies with filters", async () => {
    await CrmService.createCompany(ORG_A, { name: "Acme Industries", industry: "Manufacturing", sizeBand: "mid" }, null);
    await CrmService.createCompany(ORG_A, { name: "Northwind Logistics", industry: "Logistics", sizeBand: "large" }, null);

    const all = await CrmService.listCompanies(ORG_A);
    expect(all).toHaveLength(2);

    const filtered = await CrmService.listCompanies(ORG_A, { industry: "Logistics" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Northwind Logistics");

    const q = await CrmService.listCompanies(ORG_A, { q: "acme" });
    expect(q).toHaveLength(1);
    expect(q[0].sizeBand).toBe("mid");
  });
});

describe("CRM — deal pipeline & rollup", () => {
  it("records stage transitions as audited activities with real timestamps", async () => {
    const deal = await CrmService.createDeal(ORG_A, {
      name: "Acme rollout", companyId: "crmco-acme", amountCents: 1_000_000, stage: "lead",
    }, "user-1");
    expect(deal.probabilityPct).toBe(10); // default for lead
    expect(deal.wonAt).toBeNull();
    expect(deal.stageChangedAt).toBeTruthy();

    const before = await CrmService.listActivities(ORG_A);
    expect(before).toHaveLength(0);

    const moved = await CrmService.updateDeal(ORG_A, deal.id, { stage: "qualified" }, "user-1");
    expect(moved?.stage).toBe("qualified");
    expect(moved?.probabilityPct).toBe(30);
    // stageChangedAt may equal the creation stamp when both operations land
    // in the same millisecond (ISO ms resolution) — the authoritative proof
    // of the transition is the audited activity asserted below.

    // The transition must have produced an audit activity.
    const acts = await CrmService.listActivities(ORG_A);
    expect(acts).toHaveLength(1);
    expect(acts[0].dealId).toBe(deal.id);
    expect(acts[0].subject).toBe("Deal moved to Qualified");

    // No-op stage write must NOT create another activity.
    await CrmService.updateDeal(ORG_A, deal.id, { stage: "qualified" }, "user-1");
    expect(await CrmService.listActivities(ORG_A)).toHaveLength(1);

    // Closing the deal stamps wonAt exactly once.
    const won = await CrmService.updateDeal(ORG_A, deal.id, { stage: "closed_won" }, "user-1");
    expect(won?.wonAt).toBeTruthy();
    expect(won?.lostAt).toBeNull();
    expect(won?.probabilityPct).toBe(100);
  });

  it("computes a deterministic rollup from stored records (forecast, conversion, per-stage)", async () => {
    const co = await CrmService.createCompany(ORG_A, { name: "Acme", industry: "Software" }, null);
    await CrmService.createDeal(ORG_A, { name: "D1", companyId: co.id, amountCents: 100_000, stage: "lead" }, "u");
    await CrmService.createDeal(ORG_A, { name: "D2", companyId: co.id, amountCents: 200_000, stage: "negotiation" }, "u");
    await CrmService.createDeal(ORG_A, { name: "D3", companyId: co.id, amountCents: 300_000, stage: "closed_won" }, "u");
    await CrmService.createDeal(ORG_A, { name: "D4", companyId: co.id, amountCents: 50_000, stage: "closed_lost" }, "u");
    await CrmService.createContact(ORG_A, { firstName: "Ada", lastName: "Okafor", companyId: co.id }, "u");
    await CrmService.createActivity(ORG_A, { kind: "note", subject: "Initial note" }, "u");

    const r1 = await CrmService.rollup(ORG_A);
    const r2 = await CrmService.rollup(ORG_A);

    // Deterministic: two consecutive reads are byte-identical.
    expect(r2).toEqual(r1);

    expect(r1.counts).toEqual({ contacts: 1, companies: 1, openDeals: 2, closedWonDeals: 1, closedLostDeals: 1, activities: 1 });

    // Weighted forecast = Σ amount × probability (10% of 100k + 70% of 200k).
    expect(r1.forecastCents).toBe(10_000 + 140_000);
    expect(r1.openPipelineCents).toBe(300_000);
    expect(r1.closedWonCents).toBe(300_000);
    expect(r1.conversionRate).toBe(0.5);

    const lead = r1.pipeline.find((p) => p.stageKey === "lead");
    const won = r1.pipeline.find((p) => p.stageKey === "closed_won");
    expect(lead?.count).toBe(1);
    expect(lead?.sumCents).toBe(100_000);
    expect(won?.count).toBe(1);
    expect(won?.sumCents).toBe(300_000);

    expect(r1.topDeals).toHaveLength(2);
    expect(r1.topDeals[0].name).toBe("D2"); // largest open deal first
    expect(r1.recentActivities).toHaveLength(1);
    expect(r1.lastUpdatedAt).toBeTruthy();
  });

  it("returns an honest empty rollup (no fabricated numbers) for a fresh org", async () => {
    const r = await CrmService.rollup(ORG_B);
    expect(r.counts.contacts).toBe(0);
    expect(r.counts.openDeals).toBe(0);
    expect(r.forecastCents).toBe(0);
    expect(r.conversionRate).toBeNull();
    expect(r.lastUpdatedAt).toBeNull();
    expect(r.pipeline).toHaveLength(6);
    expect(r.pipeline.every((p) => p.count === 0 && p.sumCents === 0)).toBe(true);
  });
});

describe("CRM — activities", () => {
  it("filters activities by linked record and kind", async () => {
    const co = await CrmService.createCompany(ORG_A, { name: "Acme" }, null);
    const c = await CrmService.createContact(ORG_A, { firstName: "Ada", lastName: "Okafor", companyId: co.id }, "u");
    const d = await CrmService.createDeal(ORG_A, { name: "Deal", companyId: co.id, amountCents: 1 }, "u");
    await CrmService.createActivity(ORG_A, { kind: "call", subject: "Call", contactId: c.id, dealId: d.id, companyId: co.id }, "u");
    await CrmService.createActivity(ORG_A, { kind: "email", subject: "Email", companyId: co.id }, "u");

    expect(await CrmService.listActivities(ORG_A, { contactId: c.id })).toHaveLength(1);
    expect(await CrmService.listActivities(ORG_A, { dealId: d.id })).toHaveLength(1);
    expect(await CrmService.listActivities(ORG_A, { kind: "email" })).toHaveLength(1);
    expect(await CrmService.listActivities(ORG_A, { kind: "call" })).toHaveLength(1);
  });
});

describe("CRM — demo seed is idempotent", () => {
  it("seeds the demo org once and skips on the second call", async () => {
    const first = await CrmService.ensureDemoSeed();
    expect(first).toBe(true);
    const counts = (await CrmService.rollup("org-demo-crm")).counts;
    expect(counts.companies).toBe(3);
    expect(counts.contacts).toBe(5);
    expect(counts.openDeals).toBeGreaterThan(0);
    expect(counts.activities).toBeGreaterThan(0);

    const second = await CrmService.ensureDemoSeed();
    expect(second).toBe(false);
    expect((await CrmService.rollup("org-demo-crm")).counts.companies).toBe(3);
  });
});

describe("CRM — shared input contracts", () => {
  it("rejects malformed contact input", () => {
    expect(CrmContactUpsertSchema.safeParse({ firstName: "", lastName: "X" }).success).toBe(false);
    expect(CrmContactUpsertSchema.safeParse({ firstName: "A", lastName: "B", email: "not-an-email" }).success).toBe(false);
    expect(CrmContactUpsertSchema.safeParse({ firstName: "A", lastName: "B" }).success).toBe(true);
  });

  it("rejects malformed company input", () => {
    expect(CrmCompanyUpsertSchema.safeParse({ name: "" }).success).toBe(false);
    expect(CrmCompanyUpsertSchema.safeParse({ name: "Acme", website: "nope" }).success).toBe(false);
    expect(CrmCompanyUpsertSchema.safeParse({ name: "Acme" }).success).toBe(true);
  });

  it("rejects malformed deal input (amount, currency, stage)", () => {
    expect(CrmDealUpsertSchema.safeParse({ name: "D", companyId: "c", amountCents: -5 }).success).toBe(false);
    expect(CrmDealUpsertSchema.safeParse({ name: "D", companyId: "c", amountCents: 100, currency: "usd" }).success).toBe(false);
    expect(CrmDealUpsertSchema.safeParse({ name: "D", companyId: "c", amountCents: 100, currency: "USD", stage: "nonsense" }).success).toBe(false);
    expect(CrmDealUpsertSchema.safeParse({ name: "D", companyId: "c", amountCents: 100 }).success).toBe(true);
    expect(CrmDealUpsertSchema.safeParse({ name: "D", amountCents: 100 }).success).toBe(false); // companyId required
  });

  it("rejects malformed activity input", () => {
    expect(CrmActivityCreateSchema.safeParse({ kind: "note", subject: "" }).success).toBe(false);
    expect(CrmActivityCreateSchema.safeParse({ kind: "nonsense", subject: "x" }).success).toBe(false);
    expect(CrmActivityCreateSchema.safeParse({ kind: "note", subject: "x" }).success).toBe(true);
  });
});
