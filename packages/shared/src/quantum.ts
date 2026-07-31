/**
 * Session 63 — Enterprise Quantum Readiness Framework.
 * Post-quantum cryptography, hybrid classical/quantum workflows, future
 * quantum connectors. Emphasis on readiness (crypto-agility, inventory,
 * roadmaps) since live QPUs are not required.
 */

export const PQ_ALGORITHMS = [
  "CRYSTALS-Kyber", "CRYSTALS-Dilithium", "Falcon", "SPHINCS+",
  "BIKE", "HQC", "Classic-McEliece",
] as const;
export type PqAlgorithm = typeof PQ_ALGORITHMS[number];

export const QUANTUM_READINESS = ["unassessed","planning","migrating","hybrid","quantum_ready"] as const;
export type QuantumReadiness = typeof QUANTUM_READINESS[number];

export interface CryptoInventoryEntry {
  id: string;
  system: string;
  algorithm: string;
  keyBits?: number;
  quantumVulnerable: boolean; // RSA/ECDSA/ECDH = vulnerable
  replacement?: PqAlgorithm;
  migrationStatus: "identified" | "planned" | "in_progress" | "migrated" | "deferred";
  targetDate?: string;
  owner: string;
}

export interface QuantumOptimizationJob {
  id: string;
  kind: "qaoa" | "vqe" | "annealer" | "hybrid_solver";
  problem: "portfolio" | "routing" | "scheduling" | "chemistry" | "supply_chain";
  status: "queued" | "running" | "completed" | "failed";
  qubits?: number;
  startedAt?: string;
  completedAt?: string;
  objectiveValue?: number;
}

export interface QuantumConnector {
  id: string;
  vendor: "ibm" | "aws_braket" | "azure_quantum" | "google_cirq" | "dwave" | "local_simulator";
  status: "connected" | "disconnected" | "simulating";
  queueDepth: number;
  qubitsAvailable: number;
}

export interface QuantumDashboard {
  readiness: QuantumReadiness;
  cryptoInventory: number;
  vulnerableCount: number;
  migratedCount: number;
  migrationPct: number;
  hybridJobs: number;
  completedJobs30d: number;
  connectors: QuantumConnector[];
  entries: CryptoInventoryEntry[];
  recentJobs: QuantumOptimizationJob[];
  pqAlgorithmsSupported: PqAlgorithm[];
}
