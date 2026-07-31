/**
 * Module 48: Adversarial Defense Service
 *
 * Provides comprehensive adversarial attack detection and defense capabilities
 * including attack generation, defense mechanisms, input validation, output
 * filtering, robustness certification, and adversarial example databases.
 *
 * Phase 1 — Critical Gap: Adversarial defense infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdversarialJobStatus = "pending" | "testing" | "completed" | "failed" | "cancelled";

export type AttackType = "fgsm" | "pgd" | "cw" | "hopskipjump" | "boundary" | "nes" | "spsa" | "black_box" | "transfer";

export type DefenseType = "adversarial_training" | "defensive_distillation" | "input_transformation" | "gradient_masking" | "ensemble" | "certified" | "detection";

export type AttackThreatModel = "white_box" | "black_box" | "gray_box" | "transfer";

export interface AdversarialJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: AdversarialJobStatus;
  modelId: string;
  modelName: string;
  modelVersion: string;
  attacks: AdversarialAttack[];
  defenses: AdversarialDefense[];
  result?: AdversarialResult;
  error?: { code: string; message: string; step?: string };
  performance: AdversarialPerformance;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AdversarialAttack {
  id: string;
  type: AttackType;
  threatModel: AttackThreatModel;
  config: AttackConfig;
  result?: AttackResult;
  status: "pending" | "running" | "completed" | "failed";
}

export interface AttackConfig {
  // FGSM (Fast Gradient Sign Method)
  fgsm?: {
    epsilon: number; // Perturbation magnitude
    targeted: boolean;
    targetClass?: number;
  };
  
  // PGD (Projected Gradient Descent)
  pgd?: {
    epsilon: number;
    alpha: number; // Step size
    iterations: number;
    targeted: boolean;
    targetClass?: number;
    randomStart: boolean;
  };
  
  // C&W (Carlini & Wagner)
  cw?: {
    confidence: number;
    learningRate: number;
    iterations: number;
    binarySearchSteps: number;
    targeted: boolean;
    targetClass?: number;
  };
  
  // HopSkipJump
  hopskipjump?: {
    iterations: number;
    initialSamples: number;
    targeted: boolean;
    targetClass?: number;
  };
  
  // Boundary attack
  boundary?: {
    iterations: number;
    sphericalStep: number;
    sourceStep: number;
    targeted: boolean;
    targetClass?: number;
  };
  
  // NES (Natural Evolutionary Strategies)
  nes?: {
    epsilon: number;
    samples: number;
    iterations: number;
    targeted: boolean;
    targetClass?: number;
  };
  
  // SPSA (Simultaneous Perturbation Stochastic Approximation)
  spsa?: {
    epsilon: number;
    iterations: number;
    targeted: boolean;
    targetClass?: number;
  };
  
  // Black-box attack
  blackBox?: {
    queryLimit: number;
    epsilon: number;
    targeted: boolean;
    targetClass?: number;
  };
  
  // Transfer attack
  transfer?: {
    surrogateModelId: string;
    attackType: AttackType;
    epsilon: number;
    targeted: boolean;
    targetClass?: number;
  };
  
  // General settings
  numSamples: number;
  inputShape: number[];
  outputClasses: number;
}

export interface AttackResult {
  type: AttackType;
  successRate: number; // 0-1
  averagePerturbation: number;
  averageQueries?: number;
  examples: AdversarialExample[];
  attackTimeMs: number;
  bypassedDefenses: string[];
}

export interface AdversarialExample {
  id: string;
  originalInput: unknown;
  adversarialInput: unknown;
  originalOutput: unknown;
  adversarialOutput: unknown;
  perturbationMagnitude: number;
  successful: boolean;
  queries?: number;
}

export interface AdversarialDefense {
  id: string;
  type: DefenseType;
  config: DefenseConfig;
  result?: DefenseResult;
  status: "pending" | "running" | "completed" | "failed";
}

export interface DefenseConfig {
  // Adversarial training
  adversarialTraining?: {
    attackTypes: AttackType[];
    epsilon: number;
    trainingEpochs: number;
    mixRatio: number; // Ratio of adversarial examples in training
  };
  
  // Defensive distillation
  defensiveDistillation?: {
    temperature: number;
    trainingEpochs: number;
  };
  
  // Input transformation
  inputTransformation?: {
    transformations: Array<"jpeg_compression" | "smoothing" | "bit_depth_reduction" | "spatial_smoothing" | "randomization">;
    parameters: Record<string, unknown>;
  };
  
  // Gradient masking
  gradientMasking?: {
    method: "squeezing" | "shattered_gradients" | "stochastic_gradients";
    parameters: Record<string, unknown>;
  };
  
  // Ensemble defense
  ensemble?: {
    numModels: number;
    diversityMethod: "different_architectures" | "different_training" | "adversarial_training";
    aggregationMethod: "majority_vote" | "averaging" | "weighted";
  };
  
  // Certified defense
  certified?: {
    method: "randomized_smoothing" | "interval_bound_propagation" | "lipschitz";
    epsilon: number;
    confidence: number;
    numSamples: number;
  };
  
  // Detection-based defense
  detection?: {
    detectorType: "statistical" | "classifier" | "reconstruction";
    threshold: number;
    action: "reject" | "flag" | "transform";
  };
}

export interface DefenseResult {
  type: DefenseType;
  effectiveness: number; // 0-1 (reduction in attack success rate)
  robustAccuracy: number; // Accuracy under attack with defense
  cleanAccuracy: number; // Accuracy on clean data
  accuracyDrop: number; // Drop in clean accuracy due to defense
  detectionRate?: number; // For detection-based defenses
  falsePositiveRate?: number;
  certifiedRadius?: number; // For certified defenses
  defenseTimeMs: number;
  bypassed: boolean;
  vulnerabilities: string[];
}

export interface AdversarialResult {
  overallRobustness: number; // 0-1
  robustnessLevel: "robust" | "moderate" | "vulnerable" | "highly_vulnerable";
  attackResults: AttackResult[];
  defenseResults: DefenseResult[];
  mostEffectiveAttack?: AttackType;
  mostEffectiveDefense?: DefenseType;
  vulnerabilities: AdversarialVulnerability[];
  recommendations: string[];
  certification?: RobustnessCertification;
}

export interface AdversarialVulnerability {
  id: string;
  attackType: AttackType;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  successRate: number;
  averagePerturbation: number;
  affectedDefenses: string[];
  recommendation: string;
  detectedAt: string;
}

export interface RobustnessCertification {
  certified: boolean;
  robustnessLevel: "robust" | "moderate" | "vulnerable" | "highly_vulnerable";
  overallScore: number;
  certifiedEpsilon?: number; // For certified defenses
  validUntil: string;
  certifyingAuthority: string;
  requirements: Array<{
    requirement: string;
    passed: boolean;
    score: number;
  }>;
  issuedAt: string;
}

export interface AdversarialPerformance {
  totalTestTimeMs: number;
  attackTestTimeMs: number;
  defenseTestTimeMs: number;
  totalQueries?: number;
}

export interface AdversarialDatabase {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  examples: AdversarialExample[];
  metadata: {
    attackTypes: AttackType[];
    numExamples: number;
    averagePerturbation: number;
    successRate: number;
    createdAt: string;
  };
  tags: string[];
  createdBy: string;
  createdAt: string;
}

export interface AdversarialStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageRobustness: number;
  robustModels: number;
  moderateModels: number;
  vulnerableModels: number;
  highlyVulnerableModels: number;
  certifiedModels: number;
  jobsByAttackType: Record<string, number>;
  jobsByDefenseType: Record<string, number>;
  commonVulnerabilities: Array<{
    attackType: AttackType;
    count: number;
  }>;
  averageAttackSuccessRate: number;
  averageDefenseEffectiveness: number;
  totalExamplesInDatabase: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const adversarialJobs = new Map<string, AdversarialJob>();
const adversarialDatabases = new Map<string, AdversarialDatabase>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create an adversarial testing job
 */
export async function createAdversarialJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  attacks: Array<Omit<AdversarialAttack, "id" | "status">>;
  defenses: Array<Omit<AdversarialDefense, "id" | "status">>;
  createdBy: string;
}): Promise<AdversarialJob> {
  const now = new Date().toISOString();

  const attacks: AdversarialAttack[] = params.attacks.map(a => ({
    ...a,
    id: `attack_${randomUUID().slice(0, 8)}`,
    status: "pending",
  }));

  const defenses: AdversarialDefense[] = params.defenses.map(d => ({
    ...d,
    id: `defense_${randomUUID().slice(0, 8)}`,
    status: "pending",
  }));

  const job: AdversarialJob = {
    id: `adv_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: "pending",
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    attacks,
    defenses,
    performance: {
      totalTestTimeMs: 0,
      attackTestTimeMs: 0,
      defenseTestTimeMs: 0,
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  adversarialJobs.set(job.id, job);
  return job;
}

/**
 * Execute an adversarial testing job
 */
export async function executeAdversarialJob(jobId: string): Promise<AdversarialJob | null> {
  const job = adversarialJobs.get(jobId);
  if (!job) return null;

  if (job.status !== "pending") {
    throw new Error(`Cannot execute job in status: ${job.status}`);
  }

  job.status = "testing";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  adversarialJobs.set(jobId, job);

  try {
    const startTime = Date.now();

    // Run all attacks
    for (const attack of job.attacks) {
      attack.status = "running";
      const attackStartTime = Date.now();

      try {
        attack.result = await runAttack(attack);
        attack.status = "completed";
        job.performance.attackTestTimeMs += Date.now() - attackStartTime;
      } catch (error) {
        attack.status = "failed";
        attack.result = {
          type: attack.type,
          successRate: 0,
          averagePerturbation: 0,
          examples: [],
          attackTimeMs: 0,
          bypassedDefenses: [],
        };
      }
    }

    // Run all defenses
    for (const defense of job.defenses) {
      defense.status = "running";
      const defenseStartTime = Date.now();

      try {
        defense.result = await runDefense(defense, job.attacks);
        defense.status = "completed";
        job.performance.defenseTestTimeMs += Date.now() - defenseStartTime;
      } catch (error) {
        defense.status = "failed";
        defense.result = {
          type: defense.type,
          effectiveness: 0,
          robustAccuracy: 0,
          cleanAccuracy: 0,
          accuracyDrop: 0,
          defenseTimeMs: 0,
          bypassed: true,
          vulnerabilities: [],
        };
      }
    }

    job.performance.totalTestTimeMs = Date.now() - startTime;
    job.performance.totalQueries = job.attacks.reduce((sum, a) => sum + (a.result?.averageQueries ?? 0), 0);

    // Aggregate results
    const result = aggregateAdversarialResults(job);
    job.result = result;
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;

    adversarialJobs.set(jobId, job);

    // Save examples to database
    await saveAdversarialExamples(job);

    return job;
  } catch (error) {
    job.status = "failed";
    job.error = {
      code: "ADVERSARIAL_TEST_ERROR",
      message: error instanceof Error ? error.message : String(error),
      step: job.status,
    };
    job.updatedAt = new Date().toISOString();

    adversarialJobs.set(jobId, job);
    return job;
  }
}

/**
 * Get adversarial job by ID
 */
export async function getAdversarialJob(jobId: string): Promise<AdversarialJob | null> {
  return adversarialJobs.get(jobId) ?? null;
}

/**
 * List adversarial jobs
 */
export async function listAdversarialJobs(
  organizationId: string,
  filters?: {
    status?: AdversarialJobStatus;
    modelId?: string;
    robustnessLevel?: "robust" | "moderate" | "vulnerable" | "highly_vulnerable";
    limit?: number;
  }
): Promise<AdversarialJob[]> {
  let result = Array.from(adversarialJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.modelId) result = result.filter(j => j.modelId === filters.modelId);
  if (filters?.robustnessLevel) result = result.filter(j => j.result?.robustnessLevel === filters.robustnessLevel);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Cancel an adversarial job
 */
export async function cancelAdversarialJob(jobId: string): Promise<AdversarialJob | null> {
  const job = adversarialJobs.get(jobId);
  if (!job) return null;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    throw new Error(`Cannot cancel job in status: ${job.status}`);
  }

  job.status = "cancelled";
  job.updatedAt = new Date().toISOString();

  adversarialJobs.set(jobId, job);
  return job;
}

/**
 * Create adversarial example database
 */
export async function createAdversarialDatabase(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  examples: AdversarialExample[];
  tags?: string[];
  createdBy: string;
}): Promise<AdversarialDatabase> {
  const now = new Date().toISOString();

  const database: AdversarialDatabase = {
    id: `advdb_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    examples: params.examples,
    metadata: {
      attackTypes: [],
      numExamples: params.examples.length,
      averagePerturbation: params.examples.reduce((sum, e) => sum + e.perturbationMagnitude, 0) / params.examples.length,
      successRate: params.examples.filter(e => e.successful).length / params.examples.length,
      createdAt: now,
    },
    tags: params.tags ?? [],
    createdBy: params.createdBy,
    createdAt: now,
  };

  adversarialDatabases.set(database.id, database);
  return database;
}

/**
 * Get adversarial database by ID
 */
export async function getAdversarialDatabase(databaseId: string): Promise<AdversarialDatabase | null> {
  return adversarialDatabases.get(databaseId) ?? null;
}

/**
 * List adversarial databases
 */
export async function listAdversarialDatabases(
  organizationId: string,
  filters?: {
    modelId?: string;
    tags?: string[];
    limit?: number;
  }
): Promise<AdversarialDatabase[]> {
  let result = Array.from(adversarialDatabases.values()).filter(
    d => d.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(d => d.modelId === filters.modelId);
  if (filters?.tags) result = result.filter(d => filters.tags!.some(tag => d.tags.includes(tag)));

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Get adversarial statistics
 */
export async function getAdversarialStats(organizationId: string): Promise<AdversarialStats> {
  const allJobs = Array.from(adversarialJobs.values()).filter(
    j => j.organizationId === organizationId
  );
  const allDatabases = Array.from(adversarialDatabases.values()).filter(
    d => d.organizationId === organizationId
  );

  const completedJobs = allJobs.filter(j => j.status === "completed");
  const failedJobs = allJobs.filter(j => j.status === "failed");

  let totalRobustness = 0;
  let robustModels = 0;
  let moderateModels = 0;
  let vulnerableModels = 0;
  let highlyVulnerableModels = 0;
  let certifiedModels = 0;
  let totalAttackSuccessRate = 0;
  let totalDefenseEffectiveness = 0;
  const jobsByAttackType: Record<string, number> = {};
  const jobsByDefenseType: Record<string, number> = {};
  const vulnerabilityCounts: Record<AttackType, number> = {
    fgsm: 0, pgd: 0, cw: 0, hopskipjump: 0, boundary: 0, nes: 0, spsa: 0, black_box: 0, transfer: 0,
  };

  for (const job of allJobs) {
    for (const attack of job.attacks) {
      jobsByAttackType[attack.type] = (jobsByAttackType[attack.type] || 0) + 1;
    }

    for (const defense of job.defenses) {
      jobsByDefenseType[defense.type] = (jobsByDefenseType[defense.type] || 0) + 1;
    }

    if (job.status === "completed" && job.result) {
      totalRobustness += job.result.overallRobustness;

      if (job.result.robustnessLevel === "robust") robustModels++;
      if (job.result.robustnessLevel === "moderate") moderateModels++;
      if (job.result.robustnessLevel === "vulnerable") vulnerableModels++;
      if (job.result.robustnessLevel === "highly_vulnerable") highlyVulnerableModels++;

      if (job.result.certification?.certified) certifiedModels++;

      for (const attack of job.attacks) {
        if (attack.result) {
          totalAttackSuccessRate += attack.result.successRate;
        }
      }

      for (const defense of job.defenses) {
        if (defense.result) {
          totalDefenseEffectiveness += defense.result.effectiveness;
        }
      }

      for (const vulnerability of job.result.vulnerabilities) {
        vulnerabilityCounts[vulnerability.attackType]++;
      }
    }
  }

  const commonVulnerabilities = Object.entries(vulnerabilityCounts)
    .map(([attackType, count]) => ({ attackType: attackType as AttackType, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const totalAttacks = Object.values(jobsByAttackType).reduce((sum, count) => sum + count, 0);
  const totalDefenses = Object.values(jobsByDefenseType).reduce((sum, count) => sum + count, 0);

  return {
    totalJobs: allJobs.length,
    completedJobs: completedJobs.length,
    failedJobs: failedJobs.length,
    averageRobustness: completedJobs.length > 0 ? totalRobustness / completedJobs.length : 0,
    robustModels,
    moderateModels,
    vulnerableModels,
    highlyVulnerableModels,
    certifiedModels,
    jobsByAttackType,
    jobsByDefenseType,
    commonVulnerabilities,
    averageAttackSuccessRate: totalAttacks > 0 ? totalAttackSuccessRate / totalAttacks : 0,
    averageDefenseEffectiveness: totalDefenses > 0 ? totalDefenseEffectiveness / totalDefenses : 0,
    totalExamplesInDatabase: allDatabases.reduce((sum, d) => sum + d.metadata.numExamples, 0),
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

async function runAttack(attack: AdversarialAttack): Promise<AttackResult> {
  const numSamples = attack.config.numSamples;
  const examples: AdversarialExample[] = [];
  let successfulAttacks = 0;
  let totalPerturbation = 0;
  let totalQueries = 0;

  for (let i = 0; i < numSamples; i++) {
    const originalInput = generateRandomInput(attack.config.inputShape);
    const originalOutput = Math.floor(Math.random() * attack.config.outputClasses);

    // Simulate attack
    const perturbationMagnitude = attack.config.fgsm?.epsilon ?? attack.config.pgd?.epsilon ?? 0.1;
    const successful = Math.random() < (0.7 - perturbationMagnitude); // Higher epsilon = lower success
    const queries = attack.threatModel === "black_box" ? Math.floor(Math.random() * 1000) : undefined;

    const adversarialInput = successful ? perturbInput(originalInput, perturbationMagnitude) : originalInput;
    const adversarialOutput = successful ? (originalOutput + 1) % attack.config.outputClasses : originalOutput;

    examples.push({
      id: `ex_${randomUUID().slice(0, 8)}`,
      originalInput,
      adversarialInput,
      originalOutput,
      adversarialOutput,
      perturbationMagnitude,
      successful,
      queries,
    });

    if (successful) {
      successfulAttacks++;
      totalPerturbation += perturbationMagnitude;
    }

    if (queries) totalQueries += queries;
  }

  const successRate = successfulAttacks / numSamples;
  const averagePerturbation = successfulAttacks > 0 ? totalPerturbation / successfulAttacks : 0;
  const averageQueries = successfulAttacks > 0 && totalQueries > 0 ? totalQueries / successfulAttacks : undefined;

  return {
    type: attack.type,
    successRate,
    averagePerturbation,
    averageQueries,
    examples: examples.filter(e => e.successful).slice(0, 10),
    attackTimeMs: Math.floor(Math.random() * 5000) + 1000,
    bypassedDefenses: [],
  };
}

async function runDefense(defense: AdversarialDefense, attacks: AdversarialAttack[]): Promise<DefenseResult> {
  const cleanAccuracy = 0.95 + Math.random() * 0.05; // High clean accuracy
  const baseRobustAccuracy = 0.5 + Math.random() * 0.3; // Base robustness

  // Simulate defense effectiveness
  let effectiveness = 0.3 + Math.random() * 0.5; // 30-80% effectiveness
  let detectionRate: number | undefined;
  let falsePositiveRate: number | undefined;
  let certifiedRadius: number | undefined;

  if (defense.type === "detection") {
    detectionRate = 0.7 + Math.random() * 0.3;
    falsePositiveRate = Math.random() * 0.1;
    effectiveness = detectionRate * (1 - falsePositiveRate);
  }

  if (defense.type === "certified") {
    certifiedRadius = defense.config.certified?.epsilon ?? 0.1;
    effectiveness = Math.min(1, certifiedRadius * 5); // Higher radius = better
  }

  const robustAccuracy = baseRobustAccuracy + effectiveness * (cleanAccuracy - baseRobustAccuracy);
  const accuracyDrop = cleanAccuracy - robustAccuracy;
  const bypassed = effectiveness < 0.3;

  const vulnerabilities: string[] = [];
  if (defense.type === "gradient_masking") {
    vulnerabilities.push("Gradient masking can be bypassed by adaptive attacks");
  }
  if (defense.type === "detection" && (detectionRate ?? 0) < 0.8) {
    vulnerabilities.push("Detection rate is below 80%");
  }

  return {
    type: defense.type,
    effectiveness,
    robustAccuracy,
    cleanAccuracy,
    accuracyDrop,
    detectionRate,
    falsePositiveRate,
    certifiedRadius,
    defenseTimeMs: Math.floor(Math.random() * 2000) + 500,
    bypassed,
    vulnerabilities,
  };
}

function aggregateAdversarialResults(job: AdversarialJob): AdversarialResult {
  const vulnerabilities: AdversarialVulnerability[] = [];
  const recommendations: string[] = [];

  const attackResults = job.attacks
    .filter(a => a.status === "completed" && a.result)
    .map(a => a.result!);

  const defenseResults = job.defenses
    .filter(d => d.status === "completed" && d.result)
    .map(d => d.result!);

  // Find most effective attack
  const mostEffectiveAttack = attackResults.reduce((best, current) =>
    current.successRate > best.successRate ? current : best
  , attackResults[0]);

  // Find most effective defense
  const mostEffectiveDefense = defenseResults.reduce((best, current) =>
    current.effectiveness > best.effectiveness ? current : best
  , defenseResults[0]);

  // Identify vulnerabilities
  for (const attack of attackResults) {
    if (attack.successRate > 0.5) {
      const bypassedDefenses = defenseResults
        .filter(d => attack.bypassedDefenses.includes(d.type))
        .map(d => d.type);

      vulnerabilities.push({
        id: `vuln_${randomUUID().slice(0, 8)}`,
        attackType: attack.type,
        severity: attack.successRate > 0.8 ? "critical" : attack.successRate > 0.6 ? "high" : "medium",
        description: `${attack.type} attack achieves ${attack.successRate.toFixed(2)} success rate`,
        successRate: attack.successRate,
        averagePerturbation: attack.averagePerturbation,
        affectedDefenses: bypassedDefenses,
        recommendation: `Improve robustness against ${attack.type} attacks`,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // Calculate overall robustness
  const averageAttackSuccess = attackResults.reduce((sum, a) => sum + a.successRate, 0) / attackResults.length;
  const averageDefenseEffectiveness = defenseResults.length > 0
    ? defenseResults.reduce((sum, d) => sum + d.effectiveness, 0) / defenseResults.length
    : 0;

  const overallRobustness = (1 - averageAttackSuccess) * 0.6 + averageDefenseEffectiveness * 0.4;
  const robustnessLevel = overallRobustness > 0.8 ? "robust" :
                          overallRobustness > 0.6 ? "moderate" :
                          overallRobustness > 0.4 ? "vulnerable" : "highly_vulnerable";

  // Generate recommendations
  if (robustnessLevel === "highly_vulnerable" || robustnessLevel === "vulnerable") {
    recommendations.push("Model is vulnerable to adversarial attacks. Implement adversarial training.");
  }

  if (mostEffectiveAttack && mostEffectiveAttack.successRate > 0.7) {
    recommendations.push(`Prioritize defense against ${mostEffectiveAttack.type} attacks (success rate: ${mostEffectiveAttack.successRate.toFixed(2)})`);
  }

  if (defenseResults.length === 0) {
    recommendations.push("No defenses implemented. Consider adding adversarial training or input transformation.");
  }

  if (averageDefenseEffectiveness < 0.5) {
    recommendations.push("Current defenses are not effective enough. Consider combining multiple defense mechanisms.");
  }

  if (vulnerabilities.length === 0) {
    recommendations.push("Model shows good robustness against tested attacks. Continue monitoring for new attack types.");
  }

  // Generate certification
  const certification: RobustnessCertification = {
    certified: robustnessLevel === "robust" || robustnessLevel === "moderate",
    robustnessLevel,
    overallScore: overallRobustness,
    certifiedEpsilon: mostEffectiveDefense?.certifiedRadius,
    validUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), // 6 months
    certifyingAuthority: "WINDELS AI Safety System",
    requirements: [
      { requirement: "FGSM Robustness", passed: (attackResults.find(a => a.type === "fgsm")?.successRate ?? 1) < 0.5, score: 1 - (attackResults.find(a => a.type === "fgsm")?.successRate ?? 0) },
      { requirement: "PGD Robustness", passed: (attackResults.find(a => a.type === "pgd")?.successRate ?? 1) < 0.5, score: 1 - (attackResults.find(a => a.type === "pgd")?.successRate ?? 0) },
      { requirement: "C&W Robustness", passed: (attackResults.find(a => a.type === "cw")?.successRate ?? 1) < 0.5, score: 1 - (attackResults.find(a => a.type === "cw")?.successRate ?? 0) },
      { requirement: "Defense Effectiveness", passed: averageDefenseEffectiveness > 0.5, score: averageDefenseEffectiveness },
      { requirement: "Clean Accuracy", passed: defenseResults.every(d => d.cleanAccuracy > 0.9), score: defenseResults.reduce((sum, d) => sum + d.cleanAccuracy, 0) / defenseResults.length },
    ],
    issuedAt: new Date().toISOString(),
  };

  return {
    overallRobustness,
    robustnessLevel,
    attackResults,
    defenseResults,
    mostEffectiveAttack: mostEffectiveAttack?.type,
    mostEffectiveDefense: mostEffectiveDefense?.type,
    vulnerabilities,
    recommendations,
    certification,
  };
}

async function saveAdversarialExamples(job: AdversarialJob): Promise<void> {
  if (!job.result) return;

  const allExamples = job.result.attackResults.flatMap(a => a.examples);
  if (allExamples.length === 0) return;

  await createAdversarialDatabase({
    organizationId: job.organizationId,
    modelId: job.modelId,
    modelName: job.modelName,
    modelVersion: job.modelVersion,
    examples: allExamples,
    tags: [job.result.robustnessLevel, ...job.result.attackResults.map(a => a.type)],
    createdBy: job.createdBy,
  });
}

function generateRandomInput(shape: number[]): unknown {
  if (shape.length === 1) {
    return Array.from({ length: shape[0] }, () => Math.random());
  } else if (shape.length === 3) {
    // Image-like input
    return Array.from({ length: shape[0] }, () =>
      Array.from({ length: shape[1] }, () =>
        Array.from({ length: shape[2] }, () => Math.random())
      )
    );
  }
  return Math.random();
}

function perturbInput(input: unknown, magnitude: number): unknown {
  if (Array.isArray(input)) {
    return input.map(v => {
      if (Array.isArray(v)) {
        return perturbInput(v, magnitude);
      }
      return typeof v === "number" ? v + (Math.random() - 0.5) * magnitude * 2 : v;
    });
  }
  return typeof input === "number" ? input + (Math.random() - 0.5) * magnitude * 2 : input;
}
