/**
 * Session 200 — deeper CRM deal-pipeline coverage.
 *
 * The Session-90 suite covers CRUD, isolation, one stage transition and the
 * rollup. This suite hardens the nuanced deal-stage state machine and the
 * activity/list filters that were left unverified:
 *   - won/lost stamping is cleared when a closed deal is re-opened
 *   - explicit probabilityPct overrides the stage default (create + update)
 *   - a non-stage update preserves a custom probability (no silent reset)
 *   - closed_lost stamping (lostAt set, wonAt null) + its audit activity
 *   - listDeals open/stage/company filters
 *   - activity filters (dealId / contactId / kind) and deal delete leaves
 *     the historical activities intact
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string> | string>();
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
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(member, String(score)); return 1;
    }
    async zrange(key: string, start: number, stop: number) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return [];
      const entries = Array.from(map.entries());
      entries.sort((a, b) => Number(a[1]) - Number(b[1]) || (a[0] < b[0] ? -1 : 1));
      return entries.slice(start, stop === -1 ? undefined : stop + 1).map(([m]) => m);
    }
    async zrem(key: string, member: string) {
      const map = this.store.get(key);
      if (map instanceof Map) return map.delete(member) ? 1 : 0;
      return 0;
    }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({ redisCmd: fake }));

import { CrmService } from "./crm.service.js";

const ORG = "org-pipe";
beforeEach(() => { fake.store.clear(); });

async function deal(stage: any = "lead", amountCents = 100_000, extra: any = {}) {
  return CrmService.createDeal(ORG, { name: "D", companyId: "co-1", amountCents, stage, ...extra }, "u");
}

describe("deal stage state machine", () => {
  it("stamps lostAt (and clears wonAt) when moved to closed_lost, with an audit activity", async () => {
    const d = await deal("negotiation");
    const lost = await CrmService.updateDeal(ORG, d.id, { stage: "closed_lost" }, "u");
    expect(lost?.lostAt).toBeTruthy();
    expect(lost?.wonAt).toBeNull();
    expect(lost?.probabilityPct).toBe(0);
    const acts = await CrmService.listActivities(ORG, { dealId: d.id });
    expect(acts.some((a) => a.subject === "Deal moved to Closed Lost")).toBe(true);
  });

  it("clears wonAt when a won deal is re-opened to an active stage", async () => {
    const d = await deal("closed_won");
    expect(d.wonAt).toBeTruthy();
    const reopened = await CrmService.updateDeal(ORG, d.id, { stage: "negotiation" }, "u");
    expect(reopened?.wonAt).toBeNull();
    expect(reopened?.lostAt).toBeNull();
    expect(reopened?.probabilityPct).toBe(70); // stage default reapplied
  });

  it("honors an explicit probabilityPct on create over the stage default", async () => {
    const d = await deal("lead", 100_000, { probabilityPct: 42 });
    expect(d.stage).toBe("lead");
    expect(d.probabilityPct).toBe(42); // not the lead default of 10
  });

  it("honors an explicit probabilityPct on a stage-changing update", async () => {
    const d = await deal("lead");
    const moved = await CrmService.updateDeal(ORG, d.id, { stage: "proposal", probabilityPct: 55 }, "u");
    expect(moved?.stage).toBe("proposal");
    expect(moved?.probabilityPct).toBe(55); // caller override wins over the 50 default
  });

  it("preserves a custom probability on a non-stage update (no silent reset)", async () => {
    const d = await deal("qualified", 100_000, { probabilityPct: 88 });
    const updated = await CrmService.updateDeal(ORG, d.id, { amountCents: 250_000 }, "u");
    expect(updated?.amountCents).toBe(250_000);
    expect(updated?.probabilityPct).toBe(88);
    // A non-stage update creates no audit activity.
    expect(await CrmService.listActivities(ORG, { dealId: d.id })).toHaveLength(0);
  });

  it("returns null when updating an unknown deal", async () => {
    expect(await CrmService.updateDeal(ORG, "nope", { stage: "qualified" }, "u")).toBeNull();
  });
});

describe("listDeals filters", () => {
  it("filters by open, stage and company", async () => {
    await deal("lead", 100_000, { companyId: "co-A" });
    await deal("closed_won", 200_000, { companyId: "co-A" });
    await deal("proposal", 300_000, { companyId: "co-B" });

    const open = await CrmService.listDeals(ORG, { open: true });
    expect(open.every((d) => d.stage !== "closed_won" && d.stage !== "closed_lost")).toBe(true);
    expect(open).toHaveLength(2);

    const proposal = await CrmService.listDeals(ORG, { stage: "proposal" });
    expect(proposal).toHaveLength(1);

    const coA = await CrmService.listDeals(ORG, { companyId: "co-A" });
    expect(coA).toHaveLength(2);
  });
});

describe("activity filters & deal deletion", () => {
  it("filters activities by kind, dealId and contactId", async () => {
    const d = await deal("lead");
    await CrmService.createActivity(ORG, { kind: "call", subject: "Intro call", dealId: d.id }, "u");
    await CrmService.createActivity(ORG, { kind: "email", subject: "Follow-up", contactId: "contact-1" }, "u");

    expect((await CrmService.listActivities(ORG, { kind: "call" })).length).toBe(1);
    expect((await CrmService.listActivities(ORG, { dealId: d.id })).every((a) => a.dealId === d.id)).toBe(true);
    expect((await CrmService.listActivities(ORG, { contactId: "contact-1" })).length).toBe(1);
  });

  it("keeps the audit activities after the deal is deleted (history is not erased)", async () => {
    const d = await deal("lead");
    await CrmService.updateDeal(ORG, d.id, { stage: "qualified" }, "u"); // creates 1 activity
    const before = await CrmService.listActivities(ORG, { dealId: d.id });
    expect(before).toHaveLength(1);
    expect(await CrmService.deleteDeal(ORG, d.id)).toBe(true);
    // The deal is gone, but its historical activity remains queryable.
    expect(await CrmService.getDeal(ORG, d.id)).toBeNull();
    expect(await CrmService.listActivities(ORG, { dealId: d.id })).toHaveLength(1);
  });
});
