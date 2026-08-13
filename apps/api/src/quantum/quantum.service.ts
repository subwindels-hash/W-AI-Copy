/**
 * Session 63 — Quantum Readiness Framework.
 * Session 157 — completion: no seed-on-read, connectors report env only,
 * jobs stay queued, inventory is operator-entered.
 *
 * Keys: q:inv:<org>:<id>  q:invs:<org>
 *       q:j:<org>:<id>    q:js:<org>
 *       q:c:<org>:<id>    q:meta:<org>
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import {
  QuantumDashboard, CryptoInventoryEntry, QuantumOptimizationJob, QuantumConnector,
  PQ_ALGORITHMS, QUANTUM_VENDORS, QuantumReadiness, QuantumVendor,
  CreateCryptoEntryInput, UpdateCryptoEntryInput, SubmitQuantumJobInput,
  algorithmLooksVulnerable,
} from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";

const _rng = makeRng("quantum");
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }

const K = {
  inv: (oid: string, id: string) => `q:inv:${oid}:${id}`,
  invs: (oid: string) => `q:invs:${oid}`,
  job: (oid: string, id: string) => `q:j:${oid}:${id}`,
  jobs: (oid: string) => `q:js:${oid}`,
  con: (oid: string, id: string) => `q:c:${oid}:${id}`,
  meta: (oid: string) => `q:meta:${oid}`,
};
const s2 = (o: unknown) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

const VULNERABLE = ["RSA-2048", "RSA-4096", "ECDSA-P256", "ECDH-P256", "ECDSA-P384"];
const PQ_MAP: Record<string, typeof PQ_ALGORITHMS[number]> = {
  "RSA-2048": "CRYSTALS-Kyber", "ECDSA-P256": "CRYSTALS-Dilithium", "ECDH-P256": "CRYSTALS-Kyber",
  "RSA-4096": "CRYSTALS-Kyber", "ECDSA-P384": "Falcon",
};
const SYSTEMS = [
  "Auth Service", "API Gateway", "Payment Processing", "VPN Concentrator", "TLS Terminator",
  "Document Signing", "Code Signing CA", "IoT Device Fleet", "S/MIME Email", "SSH CA",
  "Customer Data at Rest", "Inter-service mTLS",
];

function envSet(name: string): boolean {
  const v = process.env[name];
  return !!(v && v.trim());
}

export function quantumConnectors(): QuantumConnector[] {
  const ibm = envSet("WINDELS_IBM_QUANTUM_TOKEN");
  const braket = envSet("WINDELS_AWS_BRAKET_REGION") || envSet("AWS_ACCESS_KEY_ID");
  const azure = envSet("WINDELS_AZURE_QUANTUM_RESOURCE");
  const cirq = envSet("WINDELS_GOOGLE_QUANTUM_PROJECT");
  const dwave = envSet("WINDELS_DWAVE_TOKEN");
  const local = process.env.WINDELS_QUANTUM_LOCAL_SIM === "true";
  const row = (vendor: QuantumVendor, configured: boolean, note: string): QuantumConnector => ({
    id: `qc-${vendor}`,
    vendor,
    status: configured ? "configured_not_connected" : "not_configured",
    queueDepth: null,
    qubitsAvailable: null,
    note,
  });
  return [
    row("ibm", ibm, ibm
      ? "WINDELS_IBM_QUANTUM_TOKEN is set; no QPU session is open in this process."
      : "Set WINDELS_IBM_QUANTUM_TOKEN to declare IBM Quantum. Status is never 'connected' without a live session."),
    row("aws_braket", braket, braket
      ? "AWS/Braket credentials are present; no Braket session is open."
      : "Set WINDELS_AWS_BRAKET_REGION (or AWS_ACCESS_KEY_ID) to declare Braket."),
    row("azure_quantum", azure, azure
      ? "WINDELS_AZURE_QUANTUM_RESOURCE is set; no workspace session is open."
      : "Set WINDELS_AZURE_QUANTUM_RESOURCE to declare Azure Quantum."),
    row("google_cirq", cirq, cirq
      ? "WINDELS_GOOGLE_QUANTUM_PROJECT is set; no Cirq/IonQ session is open."
      : "Set WINDELS_GOOGLE_QUANTUM_PROJECT to declare a Google quantum project."),
    row("dwave", dwave, dwave
      ? "WINDELS_DWAVE_TOKEN is set; no Leap session is open."
      : "Set WINDELS_DWAVE_TOKEN to declare D-Wave Leap."),
    {
      id: "qc-local_simulator",
      vendor: "local_simulator",
      status: local ? "ready" : "not_configured",
      queueDepth: local ? 0 : null,
      qubitsAvailable: null,
      note: local
        ? "WINDELS_QUANTUM_LOCAL_SIM=true — local simulator is declared ready. Jobs still stay queued until a runner is wired."
        : "Set WINDELS_QUANTUM_LOCAL_SIM=true to declare a local simulator. This process does not execute circuits.",
    },
  ];
}

export const QuantumService = {
  async ensureBootstrapped(logger?: { info?: (...a: unknown[]) => void }, oid = "org-windels") {
    if (!demoDataEnabled()) return skipDemoSeed("quantum", logger);
    _rng.reseed(`ensureBootstrapped:${logger}`);
    if (await redis.exists(K.meta(oid))) return;
    const now = new Date().toISOString();
    let migratedCount = 0;
    for (const sys of SYSTEMS) {
      const algo = VULNERABLE[randInt(0, VULNERABLE.length - 1)]!;
      const vulnerable = VULNERABLE.includes(algo);
      const statuses: CryptoInventoryEntry["migrationStatus"][] = ["identified", "planned", "in_progress", "migrated", "deferred"];
      const status = vulnerable ? statuses[randInt(0, 3)]! : "migrated";
      if (status === "migrated") migratedCount++;
      const id = uid("inv-");
      const e: CryptoInventoryEntry = {
        id, organizationId: oid, system: sys, algorithm: algo,
        keyBits: algo.startsWith("RSA") ? 2048 : 256, quantumVulnerable: vulnerable,
        replacement: vulnerable ? PQ_MAP[algo] || "CRYSTALS-Kyber" : undefined,
        migrationStatus: status,
        targetDate: vulnerable ? new Date(Date.now() + randInt(60, 540) * 86400000).toISOString() : undefined,
        owner: ["Security", "Platform", "Infra", "IT"][randInt(0, 3)]!,
        source: "demo_seed",
      };
      await redis.hset(K.inv(oid, id), "_doc", s2(e)); await redis.sadd(K.invs(oid), id);
    }
    for (let i = 0; i < 4; i++) {
      const id = uid("qj-");
      const kinds: QuantumOptimizationJob["kind"][] = ["qaoa", "vqe", "annealer", "hybrid_solver"];
      const problems: QuantumOptimizationJob["problem"][] = ["portfolio", "routing", "scheduling", "supply_chain"];
      const j: QuantumOptimizationJob = {
        id, organizationId: oid, kind: kinds[i % kinds.length]!, problem: problems[i % problems.length]!,
        status: "completed", qubits: randInt(20, 200),
        startedAt: new Date(Date.now() - randInt(1, 30) * 86400000).toISOString(),
        completedAt: now, objectiveValue: +rand(0.85, 0.99).toFixed(4),
        note: "demo_seed — not a real QPU result",
      };
      await redis.hset(K.job(oid, id), "_doc", s2(j)); await redis.sadd(K.jobs(oid), id);
    }
    const readiness: QuantumReadiness = migratedCount / SYSTEMS.length > 0.75 ? "hybrid" : migratedCount / SYSTEMS.length > 0.3 ? "migrating" : "planning";
    await redis.hset(K.meta(oid), "readiness", readiness);
    logger?.info?.("[quantum] bootstrap complete", { systems: SYSTEMS.length });
  },

  async inventory(oid = "org-windels"): Promise<CryptoInventoryEntry[]> {
    const ids = await redis.smembers(K.invs(oid));
    const out: CryptoInventoryEntry[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.inv(oid, id));
      if (r._doc) {
        const e = JSON.parse(r._doc) as CryptoInventoryEntry;
        if (!e.organizationId || e.organizationId === oid) out.push(e);
      }
    }
    return out.sort((a, b) => a.system.localeCompare(b.system));
  },

  async getInventory(id: string, oid = "org-windels"): Promise<CryptoInventoryEntry | null> {
    const r = await redis.hgetall(K.inv(oid, id));
    if (!r._doc) return null;
    const e = JSON.parse(r._doc) as CryptoInventoryEntry;
    if (e.organizationId && e.organizationId !== oid) return null;
    return e;
  },

  async createInventory(input: CreateCryptoEntryInput, oid = "org-windels"): Promise<CryptoInventoryEntry> {
    const id = uid("inv-");
    const vulnerable = input.quantumVulnerable ?? algorithmLooksVulnerable(input.algorithm);
    const e: CryptoInventoryEntry = {
      id, organizationId: oid, system: input.system, algorithm: input.algorithm,
      keyBits: input.keyBits, quantumVulnerable: vulnerable,
      replacement: input.replacement, migrationStatus: input.migrationStatus ?? "identified",
      targetDate: input.targetDate, owner: input.owner, source: "operator_entered",
    };
    await redis.hset(K.inv(oid, id), "_doc", s2(e));
    await redis.sadd(K.invs(oid), id);
    return e;
  },

  async updateInventory(id: string, input: UpdateCryptoEntryInput, oid = "org-windels"): Promise<CryptoInventoryEntry | null> {
    const e = await this.getInventory(id, oid); if (!e) return null;
    if (input.system !== undefined) e.system = input.system;
    if (input.algorithm !== undefined) e.algorithm = input.algorithm;
    if (input.keyBits !== undefined) e.keyBits = input.keyBits;
    if (input.quantumVulnerable !== undefined) e.quantumVulnerable = input.quantumVulnerable;
    else if (input.algorithm !== undefined) e.quantumVulnerable = algorithmLooksVulnerable(input.algorithm);
    if (input.replacement !== undefined) e.replacement = input.replacement;
    if (input.migrationStatus !== undefined) e.migrationStatus = input.migrationStatus;
    if (input.targetDate !== undefined) e.targetDate = input.targetDate;
    if (input.owner !== undefined) e.owner = input.owner;
    await redis.hset(K.inv(oid, id), "_doc", s2(e));
    return e;
  },

  async removeInventory(id: string, oid = "org-windels"): Promise<boolean> {
    const e = await this.getInventory(id, oid); if (!e) return false;
    await redis.del(K.inv(oid, id));
    await redis.srem(K.invs(oid), id);
    return true;
  },

  async connectors(_oid = "org-windels"): Promise<QuantumConnector[]> {
    return quantumConnectors();
  },

  async jobs(oid = "org-windels"): Promise<QuantumOptimizationJob[]> {
    const ids = await redis.smembers(K.jobs(oid));
    const out: QuantumOptimizationJob[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.job(oid, id));
      if (r._doc) {
        const j = JSON.parse(r._doc) as QuantumOptimizationJob;
        if (!j.organizationId || j.organizationId === oid) out.push(j);
      }
    }
    return out.sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
  },

  async submitJob(input: SubmitQuantumJobInput & { organizationId?: string }): Promise<QuantumOptimizationJob> {
    const oid = input.organizationId || "org-windels";
    const id = uid("qj-");
    const now = new Date().toISOString();
    const j: QuantumOptimizationJob = {
      id, organizationId: oid, kind: input.kind, problem: input.problem,
      status: "queued", vendor: input.vendor, qubits: input.qubits, startedAt: now,
      note: "Queued. No QPU/hybrid backend is wired — this job will not invent an objective value.",
    };
    await redis.hset(K.job(oid, id), "_doc", s2(j));
    await redis.sadd(K.jobs(oid), id);
    return j;
  },

  async dashboard(oid = "org-windels"): Promise<QuantumDashboard> {
    const inv = await this.inventory(oid);
    const jobs = await this.jobs(oid);
    const vulnerable = inv.filter((e) => e.quantumVulnerable).length;
    const migrated = inv.filter((e) => e.migrationStatus === "migrated").length;
    const migrationPct = inv.length ? Math.round(migrated / inv.length * 100) : null;
    const readiness: QuantumReadiness = !inv.length
      ? "unassessed"
      : (migrationPct ?? 0) > 75 ? "hybrid" : (migrationPct ?? 0) > 30 ? "migrating" : "planning";
    return {
      readiness, cryptoInventory: inv.length, vulnerableCount: vulnerable, migratedCount: migrated,
      migrationPct, hybridJobs: jobs.length,
      completedJobs30d: jobs.filter((j) => j.completedAt && Date.now() - new Date(j.completedAt).getTime() < 30 * 86400000).length,
      connectors: quantumConnectors(), entries: inv, recentJobs: jobs.slice(0, 8),
      pqAlgorithmsSupported: [...PQ_ALGORITHMS],
      provenance: {
        readiness: inv.length
          ? "Derived from the share of inventory rows marked migrated."
          : "unassessed — the inventory is empty. Not a claim that planning has started.",
        migrationPct: "migrated / inventory size, or null when nothing is recorded.",
        connectors: "Environment report only. Status is never 'connected' without a live QPU session.",
        jobs: "Operator-submitted jobs stay queued. Demo-seed jobs (WINDELS_DEMO_DATA) are labelled demo_seed.",
      },
    };
  },
};
