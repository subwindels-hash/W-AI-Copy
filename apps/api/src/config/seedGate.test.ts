/**
 * The synthetic seed gate must hold on the READ path, not just at boot.
 *
 * `config/demoData.test.ts` proves the flag itself defaults to off. This file
 * proves the ten module bootstraps that fabricate records actually honour it.
 *
 * That distinction matters because of how these modules are written. Eleven
 * bootstraps checked `demoDataEnabled()`, but the gate lived in
 * `<module>/bootstrap.ts` — the boot-time entry point. Eighteen services also
 * call `ensureBootstrapped()` *lazily from their own read methods*:
 *
 *     async dashboard(oid) {
 *       if (!(await redis.exists(K.meta(oid)))) await this.ensureBootstrapped(undefined, oid);
 *       ...
 *
 * so a plain `GET /scientific/dashboard` for an organization that had never
 * been booted would seed the fabricated records on demand and then report them
 * as that organization's data. Gating `bootstrap.ts` alone therefore did not
 * stop the fabrication; the gate has to sit inside `ensureBootstrapped` itself.
 * These tests call the read paths directly with the flag off and assert the
 * store stays empty.
 *
 * Runs fully in-memory: FakeKv replaces Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";
const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

// The gate reads `env.WINDELS_DEMO_DATA`, which is parsed once at import.
// Unset means off, which is the state under test.
vi.mock("./demoData.js", async (orig) => {
  const actual = await (orig() as Promise<typeof import("./demoData.js")>);
  return { ...actual, demoDataEnabled: () => false };
});

const { RoboticsService } = await import("../robotics/robotics.service.js");
const { EducationService } = await import("../education/education.service.js");
const { SdkService } = await import("../sdk/sdk.service.js");
const { DigitalHumanService } = await import("../digitalHumans/digitalHumans.service.js");
const { TrainingService } = await import("../training/training.service.js");
const { QuantumService } = await import("../quantum/quantum.service.js");
const { FabricService } = await import("../fabric/fabric.service.js");
const { ScientificService } = await import("../scientific/scientific.service.js");
const { DataMarketplaceService } = await import("../dataMarketplace/dataMarketplace.service.js");
const { TradingIntelService } = await import("../tradingIntel/tradingIntel.service.js");

const OID = "org-test";

function reset() {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
}
beforeEach(reset);

/** Every key the fake store holds, across all five container types. */
function allKeys(): string[] {
  return [
    ...kv.strings.keys(), ...kv.hashes.keys(),
    ...kv.zsets.keys(), ...kv.lists.keys(), ...kv.sets.keys(),
  ];
}

describe("bootstraps do not fabricate records when the gate is off", () => {
  it("robotics seeds no robots, alerts or maintenance windows", async () => {
    await RoboticsService.ensureBootstrapped(undefined, OID);
    expect(allKeys().filter((k) => k.startsWith("rob:"))).toEqual([]);
  });

  it("education seeds no courses, skills or assessments", async () => {
    await EducationService.ensureBootstrapped(undefined, OID);
    expect(allKeys().filter((k) => k.startsWith("edu:"))).toEqual([]);
  });

  it("sdk seeds no packages, emulators or debug sessions", async () => {
    await SdkService.ensureBootstrapped(undefined, OID);
    expect(allKeys().filter((k) => k.startsWith("sdk:"))).toEqual([]);
  });

  it("digital humans seeds no avatars or past sessions", async () => {
    await DigitalHumanService.ensureBootstrapped(undefined, OID);
    expect(allKeys().filter((k) => k.startsWith("dh:"))).toEqual([]);
  });

  it("training seeds no datasets or jobs", async () => {
    await TrainingService.ensureBootstrapped(undefined, OID);
    expect(allKeys().filter((k) => k.startsWith("tr:"))).toEqual([]);
  });

  it("quantum seeds no crypto inventory, connectors or jobs", async () => {
    await QuantumService.ensureBootstrapped(undefined, OID);
    expect(allKeys().filter((k) => k.startsWith("qc:") || k.startsWith("qtm:"))).toEqual([]);
  });

  it("scientific seeds no experiments, papers or hypotheses", async () => {
    await ScientificService.ensureBootstrapped(undefined, OID);
    expect(allKeys().filter((k) => k.startsWith("sci:"))).toEqual([]);
  });

  it("data marketplace seeds no listings", async () => {
    await DataMarketplaceService.ensureBootstrapped(undefined, OID);
    expect(allKeys().filter((k) => k.startsWith("dmp:"))).toEqual([]);
  });
});

describe("fabric keeps its real side effect while gating its contents", () => {
  it("seeds no sources, twins, certificates or alerts", async () => {
    await FabricService.ensureBootstrapped(undefined, OID);
    // The bus meta key is written by startBus bookkeeping, not by the seed;
    // what must not exist is fabricated fabric *content*.
    const content = allKeys().filter((k) =>
      k.startsWith("fab:src") || k.startsWith("fab:twin") ||
      k.startsWith("fab:cert") || k.startsWith("fab:alert") || k.startsWith("fab:pkg"));
    expect(content).toEqual([]);
  });
});

describe("trading intelligence installs its catalogue but never a portfolio", () => {
  it("registers agents, indicators and instruments", async () => {
    await TradingIntelService.ensureBootstrapped(undefined);
    // The catalogue describes what the module *can* do and is not a claim
    // about anything having been traded, so it installs unconditionally.
    expect((await kv.zrange("ti:agents", 0, -1)).length).toBeGreaterThan(0);
    expect((await kv.zrange("ti:indicators", 0, -1)).length).toBeGreaterThan(0);
  });

  it("opens no positions and states no risk profile", async () => {
    await TradingIntelService.ensureBootstrapped(undefined);
    // A fresh install previously showed three winning positions and a risk
    // book claiming $2,480,000 of exposure at a 1.82 Sharpe — belonging to
    // nobody, and summed into the dashboard's pnl24hUsd.
    expect(await TradingIntelService.listPositions()).toEqual([]);
    expect(await TradingIntelService.riskProfile()).toBeNull();
  });

  it("reports a flat, empty book on the dashboard", async () => {
    await TradingIntelService.ensureBootstrapped(undefined);
    const d = await TradingIntelService.dashboard();
    expect(d.positionsOpen).toBe(0);
    expect(d.pnl24hUsd).toBe(0);
    // The 24h counters were hard-set to 12 jobs / 480 signals / 3 blocked / 38
    // simulations on a platform that had run none of them.
    expect(d.simulationsRun24h).toBe(0);
    expect(d.learningInsights).toBe(0);
  });
});

describe("read paths do not seed on demand", () => {
  // These services call ensureBootstrapped() from inside their own read
  // methods, so the dashboard itself was a seeding trigger.
  it("scientific dashboard reports zeros rather than seeding", async () => {
    const d = await ScientificService.dashboard(OID);
    expect(d.papersIndexed).toBe(0);
    expect(d.experimentsActive).toBe(0);
    expect(allKeys().filter((k) => k.startsWith("sci:exp:"))).toEqual([]);
  });

  it("robotics dashboard reports an empty fleet without NaN", async () => {
    const d = await RoboticsService.dashboard(OID);
    expect(d.totalRobots).toBe(0);
    // Unmeasured averages are null, never 0-as-a-reading (Session 155).
    expect(d.avgCpuPct).toBeNull();
    expect(d.avgBatteryPct).toBeNull();
  });

  it("data marketplace dashboard reports no listings", async () => {
    const d = await DataMarketplaceService.dashboard(OID);
    expect(allKeys().filter((k) => k.startsWith("dmp:a:"))).toEqual([]);
    expect(d).toBeTruthy();
  });
});
