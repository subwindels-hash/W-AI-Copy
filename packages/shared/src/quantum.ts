/**
 * Session 63 — Enterprise Quantum Readiness Framework.
 * Session 157 — completion: honest connectors, operator-entered inventory,
 * jobs stay queued until a real backend returns.
 */
import { z } from "zod";

export const PQ_ALGORITHMS = [
  "CRYSTALS-Kyber", "CRYSTALS-Dilithium", "Falcon", "SPHINCS+",
  "BIKE", "HQC", "Classic-McEliece",
] as const;
export type PqAlgorithm = typeof PQ_ALGORITHMS[number];

export const QUANTUM_READINESS = ["unassessed", "planning", "migrating", "hybrid", "quantum_ready"] as const;
export type QuantumReadiness = typeof QUANTUM_READINESS[number];

export const QUANTUM_VENDORS = ["ibm", "aws_braket", "azure_quantum", "google_cirq", "dwave", "local_simulator"] as const;
export type QuantumVendor = typeof QUANTUM_VENDORS[number];

export const QUANTUM_JOB_KINDS = ["qaoa", "vqe", "annealer", "hybrid_solver"] as const;
export type QuantumJobKind = typeof QUANTUM_JOB_KINDS[number];

export const QUANTUM_JOB_PROBLEMS = ["portfolio", "routing", "scheduling", "chemistry", "supply_chain"] as const;
export type QuantumJobProblem = typeof QUANTUM_JOB_PROBLEMS[number];

export const CRYPTO_MIGRATION_STATUS = ["identified", "planned", "in_progress", "migrated", "deferred"] as const;
export type CryptoMigrationStatus = typeof CRYPTO_MIGRATION_STATUS[number];

export interface CryptoInventoryEntry {
  id: string;
  organizationId?: string;
  system: string;
  algorithm: string;
  keyBits?: number;
  quantumVulnerable: boolean;
  replacement?: PqAlgorithm;
  migrationStatus: CryptoMigrationStatus;
  targetDate?: string;
  owner: string;
  source?: "operator_entered" | "demo_seed";
}

export interface QuantumOptimizationJob {
  id: string;
  organizationId?: string;
  kind: QuantumJobKind;
  problem: QuantumJobProblem;
  status: "queued" | "running" | "completed" | "failed";
  qubits?: number;
  vendor?: QuantumVendor;
  startedAt?: string;
  completedAt?: string;
  objectiveValue?: number;
  /** Why the job has not completed — never a fabricated objective. */
  note?: string;
}

export type QuantumConnectorStatus =
  | "connected"
  | "disconnected"
  | "simulating"
  | "not_configured"
  | "configured_not_connected"
  | "ready";

export interface QuantumConnector {
  id: string;
  vendor: QuantumVendor;
  status: QuantumConnectorStatus;
  /** Null when no live session exists. Never a guessed queue. */
  queueDepth: number | null;
  /** Null when the vendor is not connected. */
  qubitsAvailable: number | null;
  note?: string;
}

export interface QuantumDashboard {
  readiness: QuantumReadiness;
  cryptoInventory: number;
  vulnerableCount: number;
  migratedCount: number;
  /** Null when the inventory is empty — 0% migrated is a measurement. */
  migrationPct: number | null;
  hybridJobs: number;
  completedJobs30d: number;
  connectors: QuantumConnector[];
  entries: CryptoInventoryEntry[];
  recentJobs: QuantumOptimizationJob[];
  pqAlgorithmsSupported: PqAlgorithm[];
  provenance?: {
    readiness: string;
    migrationPct: string;
    connectors: string;
    jobs: string;
  };
}

export const CreateCryptoEntrySchema = z.object({
  system: z.string().min(2).max(200),
  algorithm: z.string().min(2).max(80),
  keyBits: z.number().int().min(1).max(16384).optional(),
  quantumVulnerable: z.boolean().optional(),
  replacement: z.enum(PQ_ALGORITHMS).optional(),
  migrationStatus: z.enum(CRYPTO_MIGRATION_STATUS).default("identified"),
  targetDate: z.string().optional(),
  owner: z.string().min(1).max(120),
});
export type CreateCryptoEntryInput = z.input<typeof CreateCryptoEntrySchema>;

export const UpdateCryptoEntrySchema = CreateCryptoEntrySchema.partial();
export type UpdateCryptoEntryInput = z.input<typeof UpdateCryptoEntrySchema>;

export const SubmitQuantumJobSchema = z.object({
  kind: z.enum(QUANTUM_JOB_KINDS),
  problem: z.enum(QUANTUM_JOB_PROBLEMS),
  vendor: z.enum(QUANTUM_VENDORS).optional(),
  qubits: z.number().int().min(1).max(10000).optional(),
});
export type SubmitQuantumJobInput = z.input<typeof SubmitQuantumJobSchema>;

/** Algorithms that are quantum-vulnerable by construction (not a scan). */
export function algorithmLooksVulnerable(algorithm: string): boolean {
  return /^(RSA|ECDSA|ECDH|DSA|DH)\b/i.test(algorithm.trim());
}
