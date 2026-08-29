import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../config/demoData.js", async (orig) => {
  const actual = await (orig() as Promise<typeof import("../config/demoData.js")>);
  return { ...actual, demoDataEnabled: () => false };
});

const { LegalService } = await import("./legal.service.js");

const ORG_A = "org-leg-a";
const ORG_B = "org-leg-b";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("Legal — Session 158 completion", () => {
  it("does not seed matters when demo data is off", async () => {
    await LegalService.ensureBootstrapped(undefined, ORG_A);
    expect(await LegalService.listMatters(ORG_A)).toEqual([]);
    expect(await LegalService.listContracts(ORG_A)).toEqual([]);
    expect(await LegalService.listUpdates(ORG_A)).toEqual([]);
  });

  it("dashboard does not seed on read; empty rates are null not 100%/0", async () => {
    const d = await LegalService.dashboard(ORG_A);
    expect(d.mattersOpen).toBe(0);
    expect(d.compliancePassRate).toBeNull();
    expect(d.riskAvg).toBeNull();
    expect(d.provenance?.compliancePassRate).toMatch(/not 100%/);
  });

  it("createMatter is org-scoped and drives riskAvg", async () => {
    await LegalService.createMatter(ORG_A, "u1", { title: "Patent", kind: "ip", riskScore: 80 });
    await LegalService.createMatter(ORG_A, "u1", { title: "NDA review", kind: "contract", riskScore: 20 });
    const d = await LegalService.dashboard(ORG_A);
    expect(d.mattersOpen).toBe(2);
    expect(d.riskAvg).toBe(50);
    expect(d.mattersAtRisk).toBe(1);
    expect(await LegalService.listMatters(ORG_B)).toEqual([]);
    expect((await LegalService.dashboard(ORG_B)).riskAvg).toBeNull();
  });

  it("research logs the query and invents no citations", async () => {
    const r = await LegalService.research("GDPR Art. 32", ORG_A, "u1");
    expect(r.citations).toEqual([]);
    expect(r.sources).toBe(0);
    expect(r.disclosure).toMatch(/not configured/);
    expect((await LegalService.listResearch(ORG_A)).map((x) => x.id)).toEqual([r.id]);
    expect(await LegalService.listResearch(ORG_B)).toEqual([]);
  });

  it("createContract and createUpdate are org-scoped", async () => {
    const c = await LegalService.createContract(ORG_A, "u1", {
      title: "MSA", counterparty: "Acme", type: "msa", valueUsd: 1000,
    });
    expect(c.status).toBe("draft");
    const u = await LegalService.createUpdate(ORG_A, {
      jurisdiction: "EU", title: "AI Act note", topic: "ai", impact: "high",
    });
    expect(u.acknowledged).toBe(false);
    expect(await LegalService.listContracts(ORG_B)).toEqual([]);
    expect(await LegalService.listUpdates(ORG_B)).toEqual([]);
    const acked = await LegalService.acknowledgeUpdate(u.id, ORG_B, "spy");
    expect(acked).toBeNull();
    const ok = await LegalService.acknowledgeUpdate(u.id, ORG_A, "u1");
    expect(ok!.acknowledged).toBe(true);
  });

  it("status update is org-scoped", async () => {
    const m = await LegalService.createMatter(ORG_A, "u1", { title: "Case", kind: "litigation", riskScore: 40 });
    expect(await LegalService.updateMatterStatus(ORG_B, m.id, "closed")).toBeNull();
    const closed = await LegalService.updateMatterStatus(ORG_A, m.id, "closed");
    expect(closed!.status).toBe("closed");
    const d = await LegalService.dashboard(ORG_A);
    expect(d.mattersOpen).toBe(0);
  });
});
