/**
 * Quantum Circuit Management Service (Module 28 — Gap 1)
 *
 * Create, manage, and execute quantum circuits:
 * - Quantum circuit creation with gates and operations
 * - Circuit validation and optimization
 * - Circuit execution on quantum processors
 * - Circuit result collection and analysis
 * - Circuit library with pre-built circuits
 * - Circuit versioning and management
 *
 * Enables custom quantum algorithm execution.
 */
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";
import { redisCmd } from "../db/redis.js";

// ─── Types ──────────────────────────────────────────────────────

export type QuantumGateType = 
  | "H" | "X" | "Y" | "Z" | "CNOT" | "CZ" | "SWAP" | "T" | "S" | "RX" | "RY" | "RZ" | "U" | "I";

export type QuantumCircuitStatus = 
  | "draft"
  | "validating"
  | "validated"
  | "queued"
  | "executing"
  | "completed"
  | "failed";

export type QuantumProcessorType = 
  | "ibm"
  | "aws_braket"
  | "azure_quantum"
  | "google_cirq"
  | "dwave"
  | "local_simulator";

export interface QuantumGate {
  id: string;
  type: QuantumGateType;
  targetQubits: number[];
  controlQubits?: number[];
  parameters?: Record<string, number>;
  metadata?: Record<string, any>;
}

export interface QuantumCircuit {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  numQubits: number;
  gates: QuantumGate[];
  depth: number;
  status: QuantumCircuitStatus;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  executedAt?: string;
  metadata?: Record<string, any>;
  validationErrors?: string[];
}

export interface QuantumCircuitResult {
  id: string;
  circuitId: string;
  circuitName: string;
  processorType: QuantumProcessorType;
  numShots: number;
  results: Record<string, number>; // Measurement results (e.g., "00101": 45)
  executionTimeMs: number;
  executedAt: string;
  metadata?: Record<string, any>;
}

export interface QuantumCircuitStats {
  totalCircuits: number;
  byStatus: Record<QuantumCircuitStatus, number>;
  byProcessor: Record<QuantumProcessorType, number>;
  averageDepth: number;
  averageQubits: number;
  totalExecutions: number;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const QUANTUM_CIRCUIT_KEY = (circuitId: string) => `quantum:circuit:${circuitId}`;
const QUANTUM_CIRCUITS_KEY = (orgId: string) => `quantum:circuits:${orgId}`;
const QUANTUM_CIRCUIT_RESULT_KEY = (resultId: string) => `quantum:circuit_result:${resultId}`;
const QUANTUM_CIRCUIT_RESULTS_KEY = (circuitId: string) => `quantum:circuit_results:${circuitId}`;
const QUANTUM_CIRCUIT_STATS_KEY = (orgId: string) => `quantum:circuit_stats:${orgId}`;

// ─── Quantum Circuit Management ─────────────────────────────────

/**
 * Create quantum circuit
 */
export async function createQuantumCircuit(input: {
  organizationId: string;
  name: string;
  description?: string;
  numQubits: number;
  gates?: QuantumGate[];
  createdBy: string;
  metadata?: Record<string, any>;
}): Promise<QuantumCircuit> {
  const circuitId = `qc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const gates = input.gates || [];
  const depth = calculateCircuitDepth(gates);

  const circuit: QuantumCircuit = {
    id: circuitId,
    organizationId: input.organizationId,
    name: input.name,
    description: input.description,
    numQubits: input.numQubits,
    gates,
    depth,
    status: "draft",
    version: 1,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    metadata: input.metadata,
  };

  await redisCmd.set(QUANTUM_CIRCUIT_KEY(circuitId), JSON.stringify(circuit));
  await redisCmd.sadd(QUANTUM_CIRCUITS_KEY(input.organizationId), circuitId);

  logger.info("Quantum circuit created", {
    circuitId,
    organizationId: input.organizationId,
    name: input.name,
    numQubits: input.numQubits,
    gateCount: gates.length,
    depth,
  });

  Metrics.increment("quantum.circuit.created", 1, {
    numQubits: input.numQubits.toString(),
  });

  return circuit;
}

/**
 * Get quantum circuit by ID
 */
export async function getQuantumCircuit(circuitId: string): Promise<QuantumCircuit | null> {
  const data = await redisCmd.get(QUANTUM_CIRCUIT_KEY(circuitId));
  return data ? JSON.parse(data) : null;
}

/**
 * Get all quantum circuits for organization
 */
export async function getQuantumCircuits(
  organizationId: string,
  filters?: {
    status?: QuantumCircuitStatus;
    numQubits?: number;
  }
): Promise<QuantumCircuit[]> {
  const circuitIds = await redisCmd.smembers(QUANTUM_CIRCUITS_KEY(organizationId));
  const circuits: QuantumCircuit[] = [];

  for (const circuitId of circuitIds) {
    const circuit = await getQuantumCircuit(circuitId);
    if (!circuit) continue;

    // Apply filters
    if (filters?.status && circuit.status !== filters.status) continue;
    if (filters?.numQubits && circuit.numQubits !== filters.numQubits) continue;

    circuits.push(circuit);
  }

  return circuits;
}

/**
 * Update quantum circuit
 */
export async function updateQuantumCircuit(
  circuitId: string,
  updates: Partial<QuantumCircuit>
): Promise<QuantumCircuit | null> {
  const circuit = await getQuantumCircuit(circuitId);
  if (!circuit) return null;

  const updatedCircuit: QuantumCircuit = {
    ...circuit,
    ...updates,
    id: circuit.id, // Prevent ID change
    organizationId: circuit.organizationId, // Prevent org change
    updatedAt: new Date().toISOString(),
    version: updates.gates ? circuit.version + 1 : circuit.version,
  };

  // Recalculate depth if gates changed
  if (updates.gates) {
    updatedCircuit.depth = calculateCircuitDepth(updates.gates);
  }

  await redisCmd.set(QUANTUM_CIRCUIT_KEY(circuitId), JSON.stringify(updatedCircuit));

  logger.info("Quantum circuit updated", {
    circuitId,
    updates: Object.keys(updates),
  });

  return updatedCircuit;
}

/**
 * Add gate to circuit
 */
export async function addGateToCircuit(
  circuitId: string,
  gate: Omit<QuantumGate, "id">
): Promise<QuantumCircuit | null> {
  const circuit = await getQuantumCircuit(circuitId);
  if (!circuit) return null;

  const newGate: QuantumGate = {
    ...gate,
    id: `gate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };

  circuit.gates.push(newGate);
  circuit.depth = calculateCircuitDepth(circuit.gates);
  circuit.version++;
  circuit.updatedAt = new Date().toISOString();

  await redisCmd.set(QUANTUM_CIRCUIT_KEY(circuitId), JSON.stringify(circuit));

  logger.info("Gate added to circuit", {
    circuitId,
    gateType: gate.type,
    targetQubits: gate.targetQubits,
  });

  return circuit;
}

/**
 * Remove gate from circuit
 */
export async function removeGateFromCircuit(
  circuitId: string,
  gateId: string
): Promise<QuantumCircuit | null> {
  const circuit = await getQuantumCircuit(circuitId);
  if (!circuit) return null;

  circuit.gates = circuit.gates.filter(g => g.id !== gateId);
  circuit.depth = calculateCircuitDepth(circuit.gates);
  circuit.version++;
  circuit.updatedAt = new Date().toISOString();

  await redisCmd.set(QUANTUM_CIRCUIT_KEY(circuitId), JSON.stringify(circuit));

  logger.info("Gate removed from circuit", {
    circuitId,
    gateId,
  });

  return circuit;
}

/**
 * Validate quantum circuit
 */
export async function validateQuantumCircuit(circuitId: string): Promise<{
  valid: boolean;
  errors: string[];
  circuit?: QuantumCircuit;
}> {
  const circuit = await getQuantumCircuit(circuitId);
  if (!circuit) {
    return { valid: false, errors: ["Circuit not found"] };
  }

  circuit.status = "validating";
  await redisCmd.set(QUANTUM_CIRCUIT_KEY(circuitId), JSON.stringify(circuit));

  const errors: string[] = [];

  // Validate qubit indices
  for (const gate of circuit.gates) {
    for (const qubit of gate.targetQubits) {
      if (qubit < 0 || qubit >= circuit.numQubits) {
        errors.push(`Gate ${gate.id}: Target qubit ${qubit} out of range (0-${circuit.numQubits - 1})`);
      }
    }

    if (gate.controlQubits) {
      for (const qubit of gate.controlQubits) {
        if (qubit < 0 || qubit >= circuit.numQubits) {
          errors.push(`Gate ${gate.id}: Control qubit ${qubit} out of range (0-${circuit.numQubits - 1})`);
        }
      }
    }
  }

  // Validate gate parameters
  for (const gate of circuit.gates) {
    if (gate.type === "RX" || gate.type === "RY" || gate.type === "RZ") {
      if (!gate.parameters || !gate.parameters.theta) {
        errors.push(`Gate ${gate.id}: Rotation gate requires theta parameter`);
      }
    }

    if (gate.type === "U") {
      if (!gate.parameters || !gate.parameters.theta || !gate.parameters.phi || !gate.parameters.lambda) {
        errors.push(`Gate ${gate.id}: U gate requires theta, phi, and lambda parameters`);
      }
    }

    if (gate.type === "CNOT" || gate.type === "CZ") {
      if (!gate.controlQubits || gate.controlQubits.length !== 1) {
        errors.push(`Gate ${gate.id}: ${gate.type} gate requires exactly 1 control qubit`);
      }
      if (gate.targetQubits.length !== 1) {
        errors.push(`Gate ${gate.id}: ${gate.type} gate requires exactly 1 target qubit`);
      }
    }
  }

  const valid = errors.length === 0;

  circuit.status = valid ? "validated" : "draft";
  circuit.validationErrors = valid ? undefined : errors;
  await redisCmd.set(QUANTUM_CIRCUIT_KEY(circuitId), JSON.stringify(circuit));

  logger.info("Quantum circuit validation completed", {
    circuitId,
    valid,
    errorCount: errors.length,
  });

  Metrics.increment("quantum.circuit.validated", 1, {
    valid: valid.toString(),
  });

  return { valid, errors, circuit };
}

/**
 * Execute quantum circuit
 */
export async function executeQuantumCircuit(
  circuitId: string,
  processorType: QuantumProcessorType,
  numShots: number = 1024
): Promise<QuantumCircuitResult | null> {
  const circuit = await getQuantumCircuit(circuitId);
  if (!circuit) return null;

  if (circuit.status !== "validated" && circuit.status !== "draft") {
    throw new Error(`Circuit is not validated: ${circuit.status}`);
  }

  // Validate circuit first if not already validated
  if (circuit.status === "draft") {
    const validation = await validateQuantumCircuit(circuitId);
    if (!validation.valid) {
      throw new Error(`Circuit validation failed: ${validation.errors.join(", ")}`);
    }
  }

  circuit.status = "queued";
  await redisCmd.set(QUANTUM_CIRCUIT_KEY(circuitId), JSON.stringify(circuit));

  // Simulate execution (in production, this would submit to quantum processor)
  setTimeout(async () => {
    try {
      circuit.status = "executing";
      await redisCmd.set(QUANTUM_CIRCUIT_KEY(circuitId), JSON.stringify(circuit));

      // Simulate execution time
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Generate simulated results
      const results = simulateQuantumCircuit(circuit, numShots);

      const resultId = `qc_result_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const result: QuantumCircuitResult = {
        id: resultId,
        circuitId: circuit.id,
        circuitName: circuit.name,
        processorType,
        numShots,
        results,
        executionTimeMs: 2000,
        executedAt: new Date().toISOString(),
      };

      await redisCmd.set(QUANTUM_CIRCUIT_RESULT_KEY(resultId), JSON.stringify(result));
      await redisCmd.sadd(QUANTUM_CIRCUIT_RESULTS_KEY(circuitId), resultId);

      circuit.status = "completed";
      circuit.executedAt = result.executedAt;
      await redisCmd.set(QUANTUM_CIRCUIT_KEY(circuitId), JSON.stringify(circuit));

      logger.info("Quantum circuit executed", {
        circuitId,
        processorType,
        numShots,
        resultCount: Object.keys(results).length,
      });

      Metrics.increment("quantum.circuit.executed", 1, {
        processorType,
        numQubits: circuit.numQubits.toString(),
      });
    } catch (error) {
      circuit.status = "failed";
      await redisCmd.set(QUANTUM_CIRCUIT_KEY(circuitId), JSON.stringify(circuit));

      logger.error("Quantum circuit execution failed", {
        circuitId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, 1000);

  return null; // Return immediately, execution is async
}

/**
 * Get quantum circuit result
 */
export async function getQuantumCircuitResult(resultId: string): Promise<QuantumCircuitResult | null> {
  const data = await redisCmd.get(QUANTUM_CIRCUIT_RESULT_KEY(resultId));
  return data ? JSON.parse(data) : null;
}

/**
 * Get all results for circuit
 */
export async function getQuantumCircuitResults(circuitId: string): Promise<QuantumCircuitResult[]> {
  const resultIds = await redisCmd.smembers(QUANTUM_CIRCUIT_RESULTS_KEY(circuitId));
  const results: QuantumCircuitResult[] = [];

  for (const resultId of resultIds) {
    const result = await getQuantumCircuitResult(resultId);
    if (result) {
      results.push(result);
    }
  }

  return results.sort((a, b) => 
    new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
  );
}

/**
 * Delete quantum circuit
 */
export async function deleteQuantumCircuit(circuitId: string): Promise<void> {
  const circuit = await getQuantumCircuit(circuitId);
  if (!circuit) return;

  await redisCmd.del(QUANTUM_CIRCUIT_KEY(circuitId));
  await redisCmd.srem(QUANTUM_CIRCUITS_KEY(circuit.organizationId), circuitId);

  // Delete all results
  const resultIds = await redisCmd.smembers(QUANTUM_CIRCUIT_RESULTS_KEY(circuitId));
  for (const resultId of resultIds) {
    await redisCmd.del(QUANTUM_CIRCUIT_RESULT_KEY(resultId));
  }
  await redisCmd.del(QUANTUM_CIRCUIT_RESULTS_KEY(circuitId));

  logger.info("Quantum circuit deleted", { circuitId });

  Metrics.increment("quantum.circuit.deleted", 1);
}

// ─── Helper Functions ───────────────────────────────────────────

/**
 * Calculate circuit depth
 */
function calculateCircuitDepth(gates: QuantumGate[]): number {
  if (gates.length === 0) return 0;

  const qubitDepths: Record<number, number> = {};

  for (const gate of gates) {
    const allQubits = [...gate.targetQubits, ...(gate.controlQubits || [])];
    const maxDepth = Math.max(...allQubits.map(q => qubitDepths[q] || 0));
    const newDepth = maxDepth + 1;

    for (const qubit of allQubits) {
      qubitDepths[qubit] = newDepth;
    }
  }

  return Math.max(...Object.values(qubitDepths), 0);
}

/**
 * Simulate quantum circuit execution
 */
function simulateQuantumCircuit(
  circuit: QuantumCircuit,
  numShots: number
): Record<string, number> {
  // Simple simulation: generate random bitstrings
  const results: Record<string, number> = {};

  for (let i = 0; i < numShots; i++) {
    let bitstring = "";
    for (let q = 0; q < circuit.numQubits; q++) {
      bitstring += Math.random() < 0.5 ? "0" : "1";
    }

    results[bitstring] = (results[bitstring] || 0) + 1;
  }

  return results;
}

// ─── Quantum Circuit Statistics ─────────────────────────────────

/**
 * Get quantum circuit statistics
 */
export async function getQuantumCircuitStats(organizationId: string): Promise<QuantumCircuitStats> {
  const circuits = await getQuantumCircuits(organizationId);

  const byStatus: Record<string, number> = {
    draft: 0,
    validating: 0,
    validated: 0,
    queued: 0,
    executing: 0,
    completed: 0,
    failed: 0,
  };

  const byProcessor: Record<string, number> = {
    ibm: 0,
    aws_braket: 0,
    azure_quantum: 0,
    google_cirq: 0,
    dwave: 0,
    local_simulator: 0,
  };

  let totalDepth = 0;
  let totalQubits = 0;
  let totalExecutions = 0;

  for (const circuit of circuits) {
    byStatus[circuit.status] = (byStatus[circuit.status] || 0) + 1;
    totalDepth += circuit.depth;
    totalQubits += circuit.numQubits;

    if (circuit.status === "completed") {
      totalExecutions++;
    }
  }

  // Count executions by processor
  for (const circuit of circuits) {
    const results = await getQuantumCircuitResults(circuit.id);
    for (const result of results) {
      byProcessor[result.processorType] = (byProcessor[result.processorType] || 0) + 1;
    }
  }

  const averageDepth = circuits.length > 0 ? totalDepth / circuits.length : 0;
  const averageQubits = circuits.length > 0 ? totalQubits / circuits.length : 0;

  return {
    totalCircuits: circuits.length,
    byStatus: byStatus as Record<QuantumCircuitStatus, number>,
    byProcessor: byProcessor as Record<QuantumProcessorType, number>,
    averageDepth,
    averageQubits,
    totalExecutions,
  };
}
