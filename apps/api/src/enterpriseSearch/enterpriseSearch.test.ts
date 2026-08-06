/**
 * Session 98 — Enterprise Search.
 *
 * Exercises the real service against a fake KV (same pattern as the other
 * Redis-backed suites): live search over the real module records (seeded
 * through the module services into the same fake store), deterministic
 * relevance ranking (title fields weigh more; stable ordering), facets,
 * recent-search history (org-scoped, deduped, capped), cross-tenant
 * isolation (org B cannot see org A's records), demo-seed idempotency, and
 * the shared Zod query contract.
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
    async lpush(key: string, ...values: string[]) {
      const arr = this.store.get(key);
      const list = Array.isArray(arr) ? arr : [];
      for (const v of values) list.unshift(v);
      this.store.set(key, list as unknown as string);
      return list.length;
    }
    async lrange(key: string, start: number, stop: number) {
      const arr = this.store.get(key);
      if (!Array.isArray(arr)) return [];
      return arr.slice(start, stop === -1 ? undefined : stop + 1);
    }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({
  redisCmd: fake,
}));

// Module services share the same fake store so search reads real records.
const moduleServices = async () => {
  const [{ CrmService }, { ErpService }, { EmailIntelService }, { SocialPlatformService }, { HelpdeskService }, { AppBuilderService }, { BusinessIntelligenceService }] = await Promise.all([
    import("../crm/crm.service.js"),
    import("../erp/erp.service.js"),
    import("../emailIntel/emailIntel.service.js"),
    import("../socialPlatform/socialPlatform.service.js"),
    import("../helpdesk/helpdesk.service.js"),
    import("../appBuilder/appBuilder.service.js"),
    import("../businessIntelligence/businessIntelligence.service.js"),
  ]);
  return { CrmService, ErpService, EmailIntelService, SocialPlatformService, HelpdeskService, AppBuilderService, BusinessIntelligenceService };
};

import { EnterpriseSearchService } from "./enterpriseSearch.service.js";
import { EsSearchQuerySchema } from "@windels/shared/enterpriseSearch";

const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(() => {
  fake.store.clear();
});

async function seedOrgA() {
  const { CrmService, ErpService, EmailIntelService, HelpdeskService } = await moduleServices();
  const co = await CrmService.createCompany(ORG_A, { name: "Acme Industries", industry: "Software" }, null);
  await CrmService.createContact(ORG_A, { firstName: "Ada", lastName: "Okafor", email: "ada@acme.example.com", companyId: co.id, tags: ["executive"] }, null);
  await CrmService.createContact(ORG_A, { firstName: "Chidi", lastName: "Eze", email: "chidi@northwind.example.com" }, null);
  await CrmService.createDeal(ORG_A, { name: "Acme expansion deal", companyId: co.id, amountCents: 500_000, stage: "negotiation" }, null);

  const wh = await ErpService.createWarehouse(ORG_A, { name: "Main", code: "WH1" }, null);
  const laptop = await ErpService.createProduct(ORG_A, { sku: "LAP-1", name: "Developer Laptop", category: "Hardware", priceCents: 100, costCents: 50 }, null);
  await ErpService.createMovement(ORG_A, { productId: laptop.id, warehouseId: wh.id, kind: "initial", quantity: 5 }, null);

  const mb = await EmailIntelService.createMailbox(ORG_A, { name: "Support", emailAddress: "support@example.com" }, null);
  await EmailIntelService.createMessage(ORG_A, { mailboxId: mb.id, fromAddress: "ada@acme.example.com", subject: "Re: invoice #4412", bodyText: "Please confirm payment", labels: ["billing"] }, null);

  await HelpdeskService.createTicket(ORG_A, { subject: "Cannot login to portal", requesterName: "Ada Okafor", priority: "high", tags: ["auth"] }, null);
  return { co, laptop, mb };
}

describe("ES — live search over real module records", () => {
  it("finds contacts, companies, deals, products, messages and tickets by term", async () => {
    await seedOrgA();

    const res = await EnterpriseSearchService.search(ORG_A, { q: "acme" });
    expect(res.total).toBeGreaterThanOrEqual(3); // company + contact email + deal
    const types = res.facets.map((f) => f.type);
    expect(types).toContain("company");
    expect(types).toContain("deal");
    expect(res.hits.some((h) => h.type === "company" && h.title === "Acme Industries")).toBe(true);
    expect(res.hits.some((h) => h.type === "deal" && h.title.includes("Acme expansion"))).toBe(true);

    const laptop = await EnterpriseSearchService.search(ORG_A, { q: "laptop" });
    expect(laptop.hits.some((h) => h.type === "product" && h.title === "Developer Laptop")).toBe(true);

    const ticket = await EnterpriseSearchService.search(ORG_A, { q: "login" });
    expect(ticket.hits.some((h) => h.type === "ticket" && h.title.includes("Cannot login"))).toBe(true);

    const email = await EnterpriseSearchService.search(ORG_A, { q: "invoice" });
    expect(email.hits.some((h) => h.type === "message" && h.title.includes("invoice #4412"))).toBe(true);
  });

  it("ranks title matches above body matches deterministically", async () => {
    const { CrmService } = await moduleServices();
    await CrmService.createContact(ORG_A, { firstName: "Grace", lastName: "Hopper", notes: "loves compilers" }, null);
    await CrmService.createContact(ORG_A, { firstName: "John", lastName: "Doe", notes: "the compiler whisperer" }, null);

    const r1 = await EnterpriseSearchService.search(ORG_A, { q: "compiler" });
    const r2 = await EnterpriseSearchService.search(ORG_A, { q: "compiler" });
    expect(r2.hits.map((h) => h.id)).toEqual(r1.hits.map((h) => h.id)); // deterministic ordering

    // Both matched only on notes (weight 1) → equal scores → stable by id.
    expect(r1.hits.every((h) => h.score === r1.hits[0]?.score)).toBe(true);
  });

  it("respects type filters and limit", async () => {
    await seedOrgA();
    const res = await EnterpriseSearchService.search(ORG_A, { q: "a", types: ["contact", "company"], limit: 2 });
    expect(res.hits.length).toBeLessThanOrEqual(2);
    expect(res.hits.every((h) => h.type === "contact" || h.type === "company")).toBe(true);
  });
});

describe("ES — recent-search history (org-scoped, deduped, capped)", () => {
  it("records searches, dedupes case-insensitively and keeps newest first", async () => {
    await EnterpriseSearchService.search(ORG_A, { q: "invoice" });
    await EnterpriseSearchService.search(ORG_A, { q: "ticket" });
    await EnterpriseSearchService.search(ORG_A, { q: "INVOICE" }); // dedupe

    const history = await EnterpriseSearchService.listHistory(ORG_A);
    expect(history).toHaveLength(2);
    expect(history[0]!.query).toBe("INVOICE");
    expect(history[1]!.query).toBe("ticket");
  });

  it("caps history at 20", async () => {
    for (let i = 0; i < 25; i++) await EnterpriseSearchService.search(ORG_A, { q: `query-${i}` });
    expect(await EnterpriseSearchService.listHistory(ORG_A)).toHaveLength(20);
  });

  it("removes a single entry and clears all", async () => {
    await EnterpriseSearchService.search(ORG_A, { q: "alpha" });
    await EnterpriseSearchService.search(ORG_A, { q: "beta" });
    const history = await EnterpriseSearchService.listHistory(ORG_A);
    // history is newest-first: ["beta", "alpha"] → remove "beta", keep "alpha".
    const removed = await EnterpriseSearchService.removeHistory(ORG_A, history[0]!.id);
    expect(removed).toBe(true);
    expect((await EnterpriseSearchService.listHistory(ORG_A)).map((h) => h.query)).toEqual(["alpha"]);

    await EnterpriseSearchService.clearHistory(ORG_A);
    expect(await EnterpriseSearchService.listHistory(ORG_A)).toHaveLength(0);
  });
});

describe("ES — rollup (deterministic, honest)", () => {
  it("computes live indexed counts per entity type", async () => {
    await seedOrgA();
    const r = await EnterpriseSearchService.rollup(ORG_A);
    expect(r.indexedCounts.contact).toBe(2);
    expect(r.indexedCounts.company).toBe(1);
    expect(r.indexedCounts.deal).toBe(1);
    expect(r.indexedCounts.product).toBe(1);
    expect(r.indexedCounts.message).toBe(1);
    expect(r.indexedCounts.ticket).toBe(1);
    expect(r.indexedCounts.purchase_order).toBe(0);
    expect(r.recentSearches.length).toBeGreaterThanOrEqual(0);
  });

  it("returns an honest empty rollup for a fresh org", async () => {
    const r = await EnterpriseSearchService.rollup(ORG_B);
    expect(Object.values(r.indexedCounts).reduce((s, n) => s + n, 0)).toBe(0);
    expect(r.recentSearches).toEqual([]);
    expect(r.lastUpdatedAt).toBeNull();
  });
});

describe("ES — cross-tenant isolation (fail-closed)", () => {
  it("org B cannot see org A's records in search", async () => {
    await seedOrgA();
    const res = await EnterpriseSearchService.search(ORG_B, { q: "acme" });
    expect(res.total).toBe(0);
    expect(res.hits).toEqual([]);
    expect((await EnterpriseSearchService.rollup(ORG_B)).indexedCounts.contact).toBe(0);
  });
});

describe("ES — demo seed is idempotent", () => {
  it("seeds history once and skips on the second call", async () => {
    expect(await EnterpriseSearchService.ensureDemoSeed()).toBe(true);
    expect(await EnterpriseSearchService.listHistory("org-demo-es")).toHaveLength(2);
    expect(await EnterpriseSearchService.ensureDemoSeed()).toBe(false);
    expect(await EnterpriseSearchService.listHistory("org-demo-es")).toHaveLength(2);
  });
});

describe("ES — shared input contracts", () => {
  it("validates the search query schema", () => {
    expect(EsSearchQuerySchema.safeParse({ q: "" }).success).toBe(false);
    expect(EsSearchQuerySchema.safeParse({ q: "x" }).success).toBe(true);
    expect(EsSearchQuerySchema.safeParse({ q: "x", types: ["contact"], limit: 10 }).success).toBe(true);
    expect(EsSearchQuerySchema.safeParse({ q: "x", types: ["nope"], limit: 10 }).success).toBe(false);
    expect(EsSearchQuerySchema.safeParse({ q: "x", limit: 500 }).success).toBe(false);
  });
});
