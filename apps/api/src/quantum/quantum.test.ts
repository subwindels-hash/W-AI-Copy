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

const { QuantumService } = await import("./quantum.service.js");

const ORG_A = "org-q-a";
const ORG_B = "org-q-b";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  delete process.env.WINDELS_IBM_QUANTUM_TOKEN;
  delete process.env.WINDELS_QUANTUM_LOCAL_SIM;
});

describe("Quantum — Session 157 completion", () => {
  it("does not seed inventory or jobs when demo data is off", async () => {
    await QuantumService.ensureBootstrapped(undefined, ORG_A);
    expect(await QuantumService.inventory(ORG_A)).toEqual([]);
    expect(await QuantumService.jobs(ORG_A)).toEqual([]);
  });

  it("dashboard does not seed on read and reports unassessed", async () => {
    const d = await QuantumService.dashboard(ORG_A);
    expect(d.cryptoInventory).toBe(0);
    expect(d.migrationPct).toBeNull();
    expect(d.readiness).toBe("unassessed");
    expect(d.vulnerableCount).toBe(0);
    expect(d.provenance?.readiness).toMatch(/empty/i);
  });

  it("connectors never claim connected and never invent qubit counts", async () => {
    const cs = await QuantumService.connectors(ORG_A);
    expect(cs.length).toBe(6);
    for (const c of cs) {
      expect(c.status).not.toBe("connected");
      expect(c.status).not.toBe("simulating");
      expect(c.qubitsAvailable).toBeNull();
    }
    const ibm = cs.find((c) => c.vendor === "ibm")!;
    expect(ibm.status).toBe("not_configured");
  });

  it("IBM token only flips the connector to configured_not_connected", async () => {
    process.env.WINDELS_IBM_QUANTUM_TOKEN = "tok-test-not-a-real-key";
    const ibm = (await QuantumService.connectors(ORG_A)).find((c) => c.vendor === "ibm")!;
    expect(ibm.status).toBe("configured_not_connected");
    expect(ibm.qubitsAvailable).toBeNull();
    expect(ibm.queueDepth).toBeNull();
  });

  it("inventory create is operator_entered and org-scoped", async () => {
    const e = await QuantumService.createInventory({
      system: "Auth Service", algorithm: "RSA-2048", owner: "sec",
    }, ORG_A);
    expect(e.source).toBe("operator_entered");
    expect(e.quantumVulnerable).toBe(true);
    expect(e.migrationStatus).toBe("identified");
    expect(await QuantumService.inventory(ORG_B)).toEqual([]);
    expect(await QuantumService.getInventory(e.id, ORG_B)).toBeNull();
  });

  it("Kyber is not flagged vulnerable; RSA is", async () => {
    const safe = await QuantumService.createInventory({
      system: "API", algorithm: "CRYSTALS-Kyber", owner: "sec",
    }, ORG_A);
    expect(safe.quantumVulnerable).toBe(false);
    const d = await QuantumService.dashboard(ORG_A);
    expect(d.cryptoInventory).toBe(1);
    expect(d.vulnerableCount).toBe(0);
    expect(d.migrationPct).toBe(0);
    expect(d.readiness).toBe("planning");
  });

  it("migrationPct and readiness follow recorded status", async () => {
    const e = await QuantumService.createInventory({
      system: "VPN", algorithm: "RSA-4096", owner: "infra",
    }, ORG_A);
    await QuantumService.updateInventory(e.id, { migrationStatus: "migrated" }, ORG_A);
    const d = await QuantumService.dashboard(ORG_A);
    expect(d.migratedCount).toBe(1);
    expect(d.migrationPct).toBe(100);
    expect(d.readiness).toBe("hybrid");
  });

  it("submitJob stays queued and does not invent an objective", async () => {
    const j = await QuantumService.submitJob({ kind: "qaoa", problem: "portfolio", organizationId: ORG_A });
    expect(j.status).toBe("queued");
    expect(j.objectiveValue).toBeUndefined();
    expect(j.qubits).toBeUndefined();
    expect(j.note).toMatch(/will not invent/i);
    const jobs = await QuantumService.jobs(ORG_B);
    expect(jobs).toEqual([]);
  });

  it("operator-supplied qubit count is stored, not generated", async () => {
    const j = await QuantumService.submitJob({
      kind: "vqe", problem: "chemistry", qubits: 12, vendor: "ibm", organizationId: ORG_A,
    });
    expect(j.qubits).toBe(12);
    expect(j.vendor).toBe("ibm");
    expect(j.status).toBe("queued");
  });

  it("update and delete inventory are org-scoped", async () => {
    const e = await QuantumService.createInventory({
      system: "SSH CA", algorithm: "ECDSA-P256", owner: "it",
    }, ORG_A);
    expect(await QuantumService.updateInventory(e.id, { owner: "x" }, ORG_B)).toBeNull();
    const upd = await QuantumService.updateInventory(e.id, { owner: "platform" }, ORG_A);
    expect(upd!.owner).toBe("platform");
    expect(await QuantumService.removeInventory(e.id, ORG_B)).toBe(false);
    expect(await QuantumService.removeInventory(e.id, ORG_A)).toBe(true);
    expect(await QuantumService.getInventory(e.id, ORG_A)).toBeNull();
  });
});
