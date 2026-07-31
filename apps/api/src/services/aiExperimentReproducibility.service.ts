/**
 * Module 75: AI Experiment Reproducibility Service
 *
 * Provides experiment reproducibility management including environment capture,
 * dependency tracking, reproducibility validation, environment comparison,
 * reproducibility scoring, experiment cloning, and reproducibility monitoring
 * for reliable and reproducible ML experiments.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ExperimentEnvironment {
  id: string;
  organizationId: string;
  experimentId: string;
  capturedAt: string;
  system: SystemInfo;
  python: PythonEnvironment;
  dependencies: Dependency[];
  hardware: HardwareInfo;
  environmentVariables: Record<string, string>;
  codeSnapshot: CodeSnapshot;
  dataSnapshot: DataSnapshot;
  randomSeeds: RandomSeedInfo;
  reproducibilityScore: number;
  validationStatus: ValidationStatus;
  createdBy: string;
}

export type ValidationStatus = 'valid' | 'warning' | 'invalid' | 'not-validated';

export interface SystemInfo {
  os: string;
  osVersion: string;
  architecture: string;
  hostname: string;
  kernel?: string;
}

export interface PythonEnvironment {
  version: string;
  implementation: string;
  compiler: string;
  build: string;
  path: string;
  virtualenv?: string;
  conda?: string;
}

export interface Dependency {
  name: string;
  version: string;
  source: 'pip' | 'conda' | 'system' | 'local';
  location?: string;
  hash?: string;
  direct: boolean;
  dependencies?: string[]; // Names of sub-dependencies
}

export interface HardwareInfo {
  cpu: CPUInfo;
  gpu?: GPUInfo[];
  memory: MemoryInfo;
  disk: DiskInfo;
}

export interface CPUInfo {
  model: string;
  cores: number;
  threads: number;
  frequency?: string;
  architecture: string;
}

export interface GPUInfo {
  name: string;
  vendor: string;
  memory: string;
  driverVersion: string;
  cudaVersion?: string;
  count: number;
}

export interface MemoryInfo {
  total: string;
  available: string;
  used: string;
}

export interface DiskInfo {
  total: string;
  available: string;
  type: string;
}

export interface CodeSnapshot {
  repository?: string;
  branch?: string;
  commitHash: string;
  commitMessage?: string;
  commitAuthor?: string;
  commitDate?: string;
  dirty: boolean;
  files: CodeFile[];
  entryPoint: string;
}

export interface CodeFile {
  path: string;
  hash: string;
  size: number;
  modified: string;
}

export interface DataSnapshot {
  datasets: DatasetSnapshot[];
  totalSize: string;
  checksums: Record<string, string>;
}

export interface DatasetSnapshot {
  name: string;
  version?: string;
  path: string;
  size: string;
  checksum: string;
  format: string;
  samples?: number;
  features?: number;
}

export interface RandomSeedInfo {
  globalSeed?: number;
  pythonSeed?: number;
  numpySeed?: number;
  torchSeed?: number;
  tensorflowSeed?: number;
  customSeeds?: Record<string, number>;
  deterministic: boolean;
}

export interface ReproducibilityReport {
  id: string;
  organizationId: string;
  experimentId: string;
  environmentId: string;
  validatedAt: string;
  score: number;
  status: ValidationStatus;
  checks: ReproducibilityCheck[];
  issues: ReproducibilityIssue[];
  recommendations: string[];
  validatedBy: string;
}

export interface ReproducibilityCheck {
  name: string;
  category: CheckCategory;
  status: 'pass' | 'fail' | 'warning';
  score: number;
  weight: number;
  details: string;
}

export type CheckCategory =
  | 'environment'
  | 'dependencies'
  | 'code'
  | 'data'
  | 'hardware'
  | 'randomness'
  | 'configuration';

export interface ReproducibilityIssue {
  id: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  category: CheckCategory;
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  autoFixable: boolean;
}

export interface EnvironmentComparison {
  id: string;
  environment1Id: string;
  environment2Id: string;
  similarityScore: number;
  differences: EnvironmentDifference[];
  compatible: boolean;
  compatibilityIssues: string[];
  createdAt: string;
}

export interface EnvironmentDifference {
  category: string;
  component: string;
  environment1Value: any;
  environment2Value: any;
  impact: 'high' | 'medium' | 'low' | 'none';
  description: string;
}

export interface ExperimentClone {
  id: string;
  organizationId: string;
  sourceExperimentId: string;
  sourceEnvironmentId: string;
  targetExperimentId: string;
  targetEnvironmentId: string;
  status: CloneStatus;
  modifications: CloneModification[];
  clonedAt: string;
  clonedBy: string;
}

export type CloneStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

export interface CloneModification {
  type: 'parameter' | 'dependency' | 'data' | 'code' | 'hardware';
  component: string;
  originalValue: any;
  newValue: any;
  reason: string;
}

export interface EnvironmentTemplate {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  system: Partial<SystemInfo>;
  python: Partial<PythonEnvironment>;
  dependencies: Dependency[];
  hardware: Partial<HardwareInfo>;
  tags: string[];
  usageCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReproducibilityDashboard {
  organizationId: string;
  totalEnvironments: number;
  validatedEnvironments: number;
  averageReproducibilityScore: number;
  environmentsByStatus: Record<ValidationStatus, number>;
  recentReports: ReproducibilityReport[];
  commonIssues: Array<{
    issue: string;
    frequency: number;
    severity: ReproducibilityIssue['severity'];
  }>;
  reproducibilityTrend: Array<{
    date: string;
    averageScore: number;
    validationCount: number;
  }>;
  topRecommendations: string[];
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const environments = new Map<string, ExperimentEnvironment>();
const reports = new Map<string, ReproducibilityReport>();
const comparisons = new Map<string, EnvironmentComparison>();
const clones = new Map<string, ExperimentClone>();
const templates = new Map<string, EnvironmentTemplate>();

// ─── Environment Capture ───────────────────────────────────────────────────────

/**
 * Capture experiment environment
 */
export async function captureEnvironment(
  organizationId: string,
  experimentId: string,
  captureConfig: {
    includeDependencies?: boolean;
    includeCode?: boolean;
    includeData?: boolean;
    includeHardware?: boolean;
    includeEnvVars?: boolean;
    envVarFilter?: string[];
  },
  createdBy: string
): Promise<ExperimentEnvironment> {
  const id = `env_${randomUUID()}`;
  const now = new Date().toISOString();

  // Simulate environment capture
  const system: SystemInfo = {
    os: 'Linux',
    osVersion: 'Ubuntu 20.04.3 LTS',
    architecture: 'x86_64',
    hostname: 'ml-workstation-01',
    kernel: '5.11.0-41-generic',
  };

  const python: PythonEnvironment = {
    version: '3.9.7',
    implementation: 'CPython',
    compiler: 'GCC 9.3.0',
    build: 'default',
    path: '/usr/bin/python3',
    virtualenv: '/home/user/venv/ml-project',
  };

  const dependencies: Dependency[] = captureConfig.includeDependencies !== false
    ? [
        { name: 'torch', version: '1.10.0', source: 'pip', direct: true },
        { name: 'numpy', version: '1.21.4', source: 'pip', direct: true },
        { name: 'pandas', version: '1.3.4', source: 'pip', direct: true },
        { name: 'scikit-learn', version: '1.0.1', source: 'pip', direct: true },
        { name: 'matplotlib', version: '3.5.0', source: 'pip', direct: false },
      ]
    : [];

  const hardware: HardwareInfo = captureConfig.includeHardware !== false
    ? {
        cpu: {
          model: 'Intel(R) Core(TM) i9-10900K CPU @ 3.70GHz',
          cores: 10,
          threads: 20,
          frequency: '3.70GHz',
          architecture: 'x86_64',
        },
        gpu: [
          {
            name: 'NVIDIA GeForce RTX 3090',
            vendor: 'NVIDIA',
            memory: '24 GB',
            driverVersion: '470.82.00',
            cudaVersion: '11.4',
            count: 1,
          },
        ],
        memory: {
          total: '64 GB',
          available: '48 GB',
          used: '16 GB',
        },
        disk: {
          total: '2 TB',
          available: '1.5 TB',
          type: 'NVMe SSD',
        },
      }
    : {
        cpu: { model: 'Unknown', cores: 0, threads: 0, architecture: 'Unknown' },
        memory: { total: 'Unknown', available: 'Unknown', used: 'Unknown' },
        disk: { total: 'Unknown', available: 'Unknown', type: 'Unknown' },
      };

  const environmentVariables: Record<string, string> = captureConfig.includeEnvVars !== false
    ? {
        CUDA_VISIBLE_DEVICES: '0',
        PYTHONPATH: '/home/user/projects',
        OMP_NUM_THREADS: '4',
      }
    : {};

  const codeSnapshot: CodeSnapshot = captureConfig.includeCode !== false
    ? {
        repository: 'https://github.com/org/ml-project',
        branch: 'main',
        commitHash: 'a1b2c3d4e5f6',
        commitMessage: 'Update model architecture',
        commitAuthor: 'researcher@org.com',
        commitDate: now,
        dirty: false,
        files: [
          { path: 'train.py', hash: 'abc123', size: 15234, modified: now },
          { path: 'model.py', hash: 'def456', size: 8923, modified: now },
        ],
        entryPoint: 'train.py',
      }
    : { commitHash: 'unknown', dirty: false, files: [], entryPoint: 'unknown' };

  const dataSnapshot: DataSnapshot = captureConfig.includeData !== false
    ? {
        datasets: [
          {
            name: 'training_data',
            version: '1.0.0',
            path: '/data/training.csv',
            size: '2.5 GB',
            checksum: 'sha256:abc123def456',
            format: 'csv',
            samples: 1000000,
            features: 50,
          },
        ],
        totalSize: '2.5 GB',
        checksums: { training_data: 'sha256:abc123def456' },
      }
    : { datasets: [], totalSize: '0', checksums: {} };

  const randomSeeds: RandomSeedInfo = {
    globalSeed: 42,
    pythonSeed: 42,
    numpySeed: 42,
    torchSeed: 42,
    deterministic: true,
  };

  // Calculate initial reproducibility score
  const reproducibilityScore = calculateReproducibilityScore({
    dependencies,
    codeSnapshot,
    dataSnapshot,
    randomSeeds,
  });

  const environment: ExperimentEnvironment = {
    id,
    organizationId,
    experimentId,
    capturedAt: now,
    system,
    python,
    dependencies,
    hardware,
    environmentVariables,
    codeSnapshot,
    dataSnapshot,
    randomSeeds,
    reproducibilityScore,
    validationStatus: 'not-validated',
    createdBy,
  };

  environments.set(id, environment);
  return environment;
}

/**
 * Validate experiment reproducibility
 */
export async function validateReproducibility(
  environmentId: string,
  validatedBy: string
): Promise<ReproducibilityReport> {
  const environment = environments.get(environmentId);
  if (!environment) {
    throw new Error(`Environment ${environmentId} not found`);
  }

  const id = `report_${randomUUID()}`;
  const now = new Date().toISOString();

  const checks: ReproducibilityCheck[] = [
    {
      name: 'Dependency Versions Pinned',
      category: 'dependencies',
      status: environment.dependencies.every((d) => d.version !== 'latest') ? 'pass' : 'fail',
      score: environment.dependencies.every((d) => d.version !== 'latest') ? 100 : 0,
      weight: 20,
      details: 'All dependencies have pinned versions',
    },
    {
      name: 'Code Version Controlled',
      category: 'code',
      status: environment.codeSnapshot.commitHash !== 'unknown' ? 'pass' : 'fail',
      score: environment.codeSnapshot.commitHash !== 'unknown' ? 100 : 0,
      weight: 20,
      details: 'Code is under version control with commit hash',
    },
    {
      name: 'Data Checksums Available',
      category: 'data',
      status: Object.keys(environment.dataSnapshot.checksums).length > 0 ? 'pass' : 'fail',
      score: Object.keys(environment.dataSnapshot.checksums).length > 0 ? 100 : 0,
      weight: 15,
      details: 'Data checksums are available for verification',
    },
    {
      name: 'Random Seeds Set',
      category: 'randomness',
      status: environment.randomSeeds.deterministic ? 'pass' : 'warning',
      score: environment.randomSeeds.deterministic ? 100 : 50,
      weight: 15,
      details: 'Random seeds are set for reproducibility',
    },
    {
      name: 'Hardware Documented',
      category: 'hardware',
      status: environment.hardware.gpu ? 'pass' : 'warning',
      score: environment.hardware.gpu ? 100 : 70,
      weight: 10,
      details: 'Hardware configuration is documented',
    },
    {
      name: 'Environment Variables Documented',
      category: 'environment',
      status: Object.keys(environment.environmentVariables).length > 0 ? 'pass' : 'warning',
      score: Object.keys(environment.environmentVariables).length > 0 ? 100 : 50,
      weight: 10,
      details: 'Environment variables are documented',
    },
    {
      name: 'Clean Working Directory',
      category: 'code',
      status: !environment.codeSnapshot.dirty ? 'pass' : 'fail',
      score: !environment.codeSnapshot.dirty ? 100 : 0,
      weight: 10,
      details: 'Working directory is clean (no uncommitted changes)',
    },
  ];

  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const weightedScore = checks.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight;

  const issues: ReproducibilityIssue[] = [];

  if (environment.dependencies.some((d) => d.version === 'latest')) {
    issues.push({
      id: `issue_${randomUUID()}`,
      severity: 'major',
      category: 'dependencies',
      title: 'Unpinned Dependency Versions',
      description: 'Some dependencies use "latest" version which may change over time',
      impact: 'Experiments may not be reproducible if dependencies change',
      recommendation: 'Pin all dependency versions to specific versions',
      autoFixable: false,
    });
  }

  if (environment.codeSnapshot.dirty) {
    issues.push({
      id: `issue_${randomUUID()}`,
      severity: 'critical',
      category: 'code',
      title: 'Uncommitted Code Changes',
      description: 'Working directory has uncommitted changes',
      impact: 'Code state cannot be reproduced',
      recommendation: 'Commit all changes before running experiments',
      autoFixable: false,
    });
  }

  if (!environment.randomSeeds.deterministic) {
    issues.push({
      id: `issue_${randomUUID()}`,
      severity: 'major',
      category: 'randomness',
      title: 'Non-Deterministic Execution',
      description: 'Random seeds are not set or deterministic mode is disabled',
      impact: 'Results may vary between runs',
      recommendation: 'Set random seeds for all random number generators',
      autoFixable: true,
    });
  }

  const status: ValidationStatus = weightedScore >= 90 ? 'valid' : weightedScore >= 70 ? 'warning' : 'invalid';

  const recommendations: string[] = [];
  if (status === 'invalid') {
    recommendations.push('Fix critical issues before attempting to reproduce this experiment');
  }
  if (issues.some((i) => i.severity === 'critical')) {
    recommendations.push('Address critical reproducibility issues immediately');
  }
  if (weightedScore < 100) {
    recommendations.push('Review and address reproducibility warnings');
  }

  const report: ReproducibilityReport = {
    id,
    organizationId: environment.organizationId,
    experimentId: environment.experimentId,
    environmentId,
    validatedAt: now,
    score: weightedScore,
    status,
    checks,
    issues,
    recommendations,
    validatedBy,
  };

  reports.set(id, report);

  // Update environment validation status
  environment.validationStatus = status;
  environment.reproducibilityScore = weightedScore;
  environments.set(environmentId, environment);

  return report;
}

/**
 * Compare two environments
 */
export async function compareEnvironments(
  environment1Id: string,
  environment2Id: string
): Promise<EnvironmentComparison> {
  const env1 = environments.get(environment1Id);
  const env2 = environments.get(environment2Id);

  if (!env1 || !env2) {
    throw new Error('One or both environments not found');
  }

  const id = `comparison_${randomUUID()}`;
  const now = new Date().toISOString();

  const differences: EnvironmentDifference[] = [];

  // Compare system
  if (env1.system.os !== env2.system.os) {
    differences.push({
      category: 'system',
      component: 'os',
      environment1Value: env1.system.os,
      environment2Value: env2.system.os,
      impact: 'high',
      description: 'Different operating systems',
    });
  }

  // Compare Python version
  if (env1.python.version !== env2.python.version) {
    differences.push({
      category: 'python',
      component: 'version',
      environment1Value: env1.python.version,
      environment2Value: env2.python.version,
      impact: 'medium',
      description: 'Different Python versions',
    });
  }

  // Compare dependencies
  const deps1 = new Map(env1.dependencies.map((d) => [d.name, d.version]));
  const deps2 = new Map(env2.dependencies.map((d) => [d.name, d.version]));

  for (const [name, version1] of deps1) {
    const version2 = deps2.get(name);
    if (!version2) {
      differences.push({
        category: 'dependencies',
        component: name,
        environment1Value: version1,
        environment2Value: 'missing',
        impact: 'high',
        description: `Dependency ${name} missing in environment 2`,
      });
    } else if (version1 !== version2) {
      differences.push({
        category: 'dependencies',
        component: name,
        environment1Value: version1,
        environment2Value: version2,
        impact: 'medium',
        description: `Different versions of ${name}`,
      });
    }
  }

  for (const [name, version2] of deps2) {
    if (!deps1.has(name)) {
      differences.push({
        category: 'dependencies',
        component: name,
        environment1Value: 'missing',
        environment2Value: version2,
        impact: 'high',
        description: `Dependency ${name} missing in environment 1`,
      });
    }
  }

  // Compare hardware
  if (env1.hardware.gpu && env2.hardware.gpu) {
    if (env1.hardware.gpu[0]?.name !== env2.hardware.gpu[0]?.name) {
      differences.push({
        category: 'hardware',
        component: 'gpu',
        environment1Value: env1.hardware.gpu[0]?.name,
        environment2Value: env2.hardware.gpu[0]?.name,
        impact: 'medium',
        description: 'Different GPU models',
      });
    }
  }

  const highImpactCount = differences.filter((d) => d.impact === 'high').length;
  const mediumImpactCount = differences.filter((d) => d.impact === 'medium').length;
  const similarityScore = Math.max(0, 100 - highImpactCount * 20 - mediumImpactCount * 5);

  const compatibilityIssues: string[] = [];
  if (highImpactCount > 0) {
    compatibilityIssues.push(`${highImpactCount} high-impact differences detected`);
  }
  if (env1.system.os !== env2.system.os) {
    compatibilityIssues.push('Different operating systems may cause compatibility issues');
  }

  const comparison: EnvironmentComparison = {
    id,
    environment1Id,
    environment2Id,
    similarityScore,
    differences,
    compatible: highImpactCount === 0,
    compatibilityIssues,
    createdAt: now,
  };

  comparisons.set(id, comparison);
  return comparison;
}

/**
 * Clone experiment with environment
 */
export async function cloneExperiment(
  organizationId: string,
  sourceExperimentId: string,
  modifications: CloneModification[],
  clonedBy: string
): Promise<ExperimentClone> {
  const id = `clone_${randomUUID()}`;
  const now = new Date().toISOString();

  // Find source environment
  const sourceEnvironment = Array.from(environments.values()).find(
    (e) => e.experimentId === sourceExperimentId
  );

  if (!sourceEnvironment) {
    throw new Error('Source experiment environment not found');
  }

  // Create target experiment and environment IDs
  const targetExperimentId = `exp_${randomUUID()}`;
  const targetEnvironmentId = `env_${randomUUID()}`;

  // Clone environment with modifications
  const targetEnvironment: ExperimentEnvironment = {
    ...sourceEnvironment,
    id: targetEnvironmentId,
    experimentId: targetExperimentId,
    capturedAt: now,
    createdBy: clonedBy,
  };

  // Apply modifications
  for (const mod of modifications) {
    if (mod.type === 'parameter') {
      // Apply parameter modifications
    } else if (mod.type === 'dependency') {
      // Apply dependency modifications
    } else if (mod.type === 'hardware') {
      // Apply hardware modifications
    }
  }

  environments.set(targetEnvironmentId, targetEnvironment);

  const clone: ExperimentClone = {
    id,
    organizationId,
    sourceExperimentId,
    sourceEnvironmentId: sourceEnvironment.id,
    targetExperimentId,
    targetEnvironmentId,
    status: 'completed',
    modifications,
    clonedAt: now,
    clonedBy,
  };

  clones.set(id, clone);
  return clone;
}

/**
 * Create environment template
 */
export async function createEnvironmentTemplate(
  organizationId: string,
  params: {
    name: string;
    description: string;
    system?: Partial<SystemInfo>;
    python?: Partial<PythonEnvironment>;
    dependencies?: Dependency[];
    hardware?: Partial<HardwareInfo>;
    tags?: string[];
  },
  createdBy: string
): Promise<EnvironmentTemplate> {
  const id = `template_${randomUUID()}`;
  const now = new Date().toISOString();

  const template: EnvironmentTemplate = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    system: params.system || {},
    python: params.python || {},
    dependencies: params.dependencies || [],
    hardware: params.hardware || {},
    tags: params.tags || [],
    usageCount: 0,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  templates.set(id, template);
  return template;
}

/**
 * Get environment by ID
 */
export async function getExperimentEnvironment(environmentId: string): Promise<ExperimentEnvironment | null> {
  return environments.get(environmentId) || null;
}

/**
 * List environments for an organization
 */
export async function listExperimentEnvironments(
  organizationId: string,
  filters?: { validationStatus?: ValidationStatus; limit?: number }
): Promise<ExperimentEnvironment[]> {
  const allEnvironments = Array.from(environments.values()).filter(
    (e) => e.organizationId === organizationId
  );

  let filtered = allEnvironments;
  if (filters?.validationStatus) {
    filtered = filtered.filter((e) => e.validationStatus === filters.validationStatus);
  }

  return filtered
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
    .slice(0, filters?.limit || 50);
}

/**
 * Get reproducibility dashboard
 */
export async function getReproducibilityDashboard(organizationId: string): Promise<ReproducibilityDashboard> {
  const allEnvironments = await listExperimentEnvironments(organizationId, { limit: 1000 });
  const allReports = Array.from(reports.values()).filter((r) => r.organizationId === organizationId);

  const validatedEnvironments = allEnvironments.filter((e) => e.validationStatus !== 'not-validated');
  const averageScore = validatedEnvironments.length > 0
    ? validatedEnvironments.reduce((sum, e) => sum + e.reproducibilityScore, 0) / validatedEnvironments.length
    : 0;

  const environmentsByStatus: Record<ValidationStatus, number> = {
    valid: 0,
    warning: 0,
    invalid: 0,
    'not-validated': 0,
  };

  for (const env of allEnvironments) {
    environmentsByStatus[env.validationStatus]++;
  }

  const recentReports = allReports
    .sort((a, b) => b.validatedAt.localeCompare(a.validatedAt))
    .slice(0, 10);

  const issueMap = new Map<string, { count: number; severity: ReproducibilityIssue['severity'] }>();
  for (const report of allReports) {
    for (const issue of report.issues) {
      const current = issueMap.get(issue.title) || { count: 0, severity: issue.severity };
      issueMap.set(issue.title, { count: current.count + 1, severity: issue.severity });
    }
  }

  const commonIssues = Array.from(issueMap.entries())
    .map(([issue, data]) => ({ issue, frequency: data.count, severity: data.severity }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10);

  return {
    organizationId,
    totalEnvironments: allEnvironments.length,
    validatedEnvironments: validatedEnvironments.length,
    averageReproducibilityScore: averageScore,
    environmentsByStatus,
    recentReports,
    commonIssues,
    reproducibilityTrend: [],
    topRecommendations: [
      'Pin all dependency versions',
      'Use version control for all code',
      'Set random seeds for reproducibility',
      'Document environment variables',
      'Capture data checksums',
    ],
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function calculateReproducibilityScore(env: {
  dependencies: Dependency[];
  codeSnapshot: CodeSnapshot;
  dataSnapshot: DataSnapshot;
  randomSeeds: RandomSeedInfo;
}): number {
  let score = 100;

  // Check dependencies
  if (env.dependencies.some((d) => d.version === 'latest')) {
    score -= 20;
  }

  // Check code
  if (env.codeSnapshot.commitHash === 'unknown') {
    score -= 20;
  }
  if (env.codeSnapshot.dirty) {
    score -= 20;
  }

  // Check data
  if (Object.keys(env.dataSnapshot.checksums).length === 0) {
    score -= 15;
  }

  // Check randomness
  if (!env.randomSeeds.deterministic) {
    score -= 15;
  }

  return Math.max(0, score);
}
