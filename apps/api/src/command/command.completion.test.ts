/**
 * Session 178 — command completion (Tier 2 #13)
 * Read-path seeding + default tenant.
 * Runs via FakeKv + FakePrisma.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));

const { CommandService } = await import("./command.service.js");
const { CommandOperationsService } = await import("./operations.service.js");

const ORG = "org-cmd-comp";
const OTHER = "org-cmd-other";

function resetAll() {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
  db.reset?.();
}

beforeEach(() => resetAll());

describe("command completion — M1 read path does not seed", () => {
  it("dashboard on empty org creates no cmd:meta and no cmd:incident keys (fails on M1)", async () => {
    await CommandService.dashboard(ORG);
    expect(await kv.exists(`cmd:${ORG}:meta`)).toBe(0);
    // Operations register should also not be seeded via cascade
    const opsKeys = await kv.keys(`cmd:incident:idx:${ORG}`);
    expect(opsKeys.length).toBe(0);
    // No incident should appear
    const incidents = await CommandOperationsService.listIncidents(ORG, { limit: 10 });
    expect(incidents.length).toBe(0);
  });

  it("ensureBootstrapped is idempotent and isolated", async () => {
    await CommandService.ensureBootstrapped(undefined, ORG);
    expect(await kv.exists(`cmd:${ORG}:meta`)).toBe(1);
    const keysBefore = await kv.keys(`cmd:*:${ORG}*`);
    await CommandService.ensureBootstrapped(undefined, ORG);
    const keysAfter = await kv.keys(`cmd:*:${ORG}*`);
    expect(keysAfter.length).toBe(keysBefore.length);
    expect(await kv.exists(`cmd:${OTHER}:meta`)).toBe(0);
  });

  it("dashboard second call still creates no new keys", async () => {
    await CommandService.dashboard(ORG);
    const before = (await kv.keys(`cmd:*`)).length;
    await CommandService.dashboard(ORG);
    const after = (await kv.keys(`cmd:*`)).length;
    expect(after).toBe(before);
  });
});

describe("command completion — M2 default tenant removed", () => {
  it("dashboard requires organizationId (throws on empty) (fails on M2)", async () => {
    await expect(CommandService.dashboard("" as any)).rejects.toThrow();
    await expect(CommandService.dashboard(null as any)).rejects.toThrow();
  });

  it("ensureBootstrapped early-returns on empty oid without creating global key", async () => {
    await CommandService.ensureBootstrapped(undefined, "" as any);
    await CommandService.ensureBootstrapped(undefined, null as any);
    expect((await kv.keys(`cmd:*`)).length).toBe(0);
  });

  it("operations stay isolated across orgs", async () => {
    // Create an incident in ORG
    await CommandOperationsService.declareIncident(ORG, { title: "E2E incident", severity: "warning", service: "api" } as any, "user-a");
    const otherIncidents = await CommandOperationsService.listIncidents(OTHER, { limit: 10 });
    expect(otherIncidents).toHaveLength(0);
    const otherDash = await CommandService.dashboard(OTHER);
    expect(otherDash.incidents).toHaveLength(0);
    const otherOps = await CommandOperationsService.operations(OTHER);
    expect(otherOps.openIncidents).toBe(0);
  });
});

describe("command completion — dashboard still honest", () => {
  it("dashboard on empty org returns empty arrays and honest health", async () => {
    const d = await CommandService.dashboard(ORG);
    expect(d.incidents).toHaveLength(0);
    expect(d.regions).toHaveLength(0);
    expect(d.briefings).toHaveLength(0);
    expect(d.strategicInitiatives).toHaveLength(0);
    expect(typeof d.enterpriseHealth).toBe("number");
  });
});
