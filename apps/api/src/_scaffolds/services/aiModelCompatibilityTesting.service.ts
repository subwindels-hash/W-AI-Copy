/**
 * Module 94: AI Model Compatibility Testing Service
 * WINDELS AI OS - Phase 1
 * 
 * Tests backward/forward compatibility between model versions, detects breaking
 * changes, validates API contracts, and performs regression testing.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiModelCompatibilityTesting');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CompatibilityTest {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: TestStatus;
  testType: CompatibilityTestType;
  baselineModel: ModelReference;
  candidateModel: ModelReference;
  testConfig: TestConfiguration;
  results?: CompatibilityTestResult;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type TestStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type CompatibilityTestType =
  | 'backward_compatibility'    // New model works with old inputs
  | 'forward_compatibility'    // Old model works with new inputs
  | 'api_contract'             // API schema validation
  | 'output_equivalence'       // Output comparison
  | 'performance_regression'   // Performance comparison
  | 'full_suite';              // All tests

export interface ModelReference {
  modelId: string;
  version: string;
  framework?: string;
  endpoint?: string;
}

export interface TestConfiguration {
  testSamples: number;
  toleranceThreshold: number;
  performanceThreshold: number;
  includeEdgeCases: boolean;
  includeStressTest: boolean;
  customTestCases?: CustomTestCase[];
}

export interface CustomTestCase {
  name: string;
  input: any;
  expectedOutput?: any;
  validation?: string;
}

export interface CompatibilityTestResult {
  overallScore: number;
  passed: boolean;
  testCategories: TestCategoryResult[];
  breakingChanges: BreakingChange[];
  warnings: CompatibilityWarning[];
  recommendations: string[];
  summary: TestSummary;
}

export interface TestCategoryResult {
  category: TestCategory;
  score: number;
  passed: boolean;
  tests: TestResult[];
  details?: Record<string, any>;
}

export type TestCategory =
  | 'input_schema'
  | 'output_schema'
  | 'output_values'
  | 'performance'
  | 'error_handling'
  | 'edge_cases'
  | 'api_contract';

export interface TestResult {
  name: string;
  passed: boolean;
  score: number;
  expected: any;
  actual: any;
  difference?: number;
  message?: string;
  duration?: number;
}

export interface BreakingChange {
  type: BreakingChangeType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  component: string;
  description: string;
  baselineValue: any;
  candidateValue: any;
  impact: string;
  mitigation?: string;
}

export type BreakingChangeType =
  | 'input_schema_change'
  | 'output_schema_change'
  | 'dtype_change'
  | 'shape_change'
  | 'behavior_change'
  | 'performance_regression'
  | 'error_handling_change'
  | 'deprecated_feature_removed';

export interface CompatibilityWarning {
  type: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  component: string;
  suggestion: string;
}

export interface TestSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  criticalFailures: number;
  highSeverityIssues: number;
  mediumSeverityIssues: number;
  lowSeverityIssues: number;
}

export interface APIContract {
  id: string;
  modelId: string;
  version: string;
  inputs: SchemaField[];
  outputs: SchemaField[];
  errors: ErrorDefinition[];
  metadata: ContractMetadata;
}

export interface SchemaField {
  name: string;
  type: string;
  shape: Array<number | string>;
  dtype: string;
  required: boolean;
  default?: any;
  constraints?: FieldConstraint[];
  description?: string;
}

export interface FieldConstraint {
  type: 'min' | 'max' | 'enum' | 'pattern' | 'custom';
  value: any;
  message?: string;
}

export interface ErrorDefinition {
  code: string;
  message: string;
  httpStatus?: number;
  retryable: boolean;
}

export interface ContractMetadata {
  version: string;
  createdAt: string;
  updatedAt: string;
  deprecated?: boolean;
  deprecationDate?: string;
  migrationGuide?: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const compatibilityTests = new Map<string, CompatibilityTest>();
const apiContracts = new Map<string, APIContract>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function runInputSchemaTests(
  baseline: ModelReference,
  candidate: ModelReference,
  config: TestConfiguration
): TestCategoryResult {
  const tests: TestResult[] = [];
  
  // Test standard inputs
  tests.push({
    name: 'Standard input acceptance',
    passed: true,
    score: 100,
    expected: 'accept',
    actual: 'accept',
    message: 'Both models accept standard inputs',
  });
  
  // Test edge cases
  if (config.includeEdgeCases) {
    tests.push({
      name: 'Empty input handling',
      passed: _rng.next() > 0.1,
      score: _rng.next() > 0.1 ? 100 : 0,
      expected: 'graceful handling',
      actual: _rng.next() > 0.1 ? 'graceful handling' : 'error',
      message: _rng.next() > 0.1 ? 'Both models handle empty inputs' : 'Candidate model fails on empty input',
    });
    
    tests.push({
      name: 'Maximum sequence length',
      passed: true,
      score: 100,
      expected: 'accept',
      actual: 'accept',
      message: 'Both models handle max sequence length',
    });
  }
  
  const passed = tests.filter(t => t.passed).length;
  const score = (passed / tests.length) * 100;
  
  return {
    category: 'input_schema',
    score,
    passed: score >= 80,
    tests,
  };
}

function runOutputEquivalenceTests(
  baseline: ModelReference,
  candidate: ModelReference,
  config: TestConfiguration
): TestCategoryResult {
  const tests: TestResult[] = [];
  
  // Test output shape
  tests.push({
    name: 'Output shape consistency',
    passed: true,
    score: 100,
    expected: [1, 512],
    actual: [1, 512],
    message: 'Output shapes match',
  });
  
  // Test output values
  const valueDiff = _rng.next() * config.toleranceThreshold * 2;
  tests.push({
    name: 'Output value equivalence',
    passed: valueDiff <= config.toleranceThreshold,
    score: Math.max(0, 100 - (valueDiff / config.toleranceThreshold) * 100),
    expected: 0.0,
    actual: valueDiff,
    difference: valueDiff,
    message: valueDiff <= config.toleranceThreshold
      ? `Output difference ${valueDiff.toFixed(6)} within tolerance`
      : `Output difference ${valueDiff.toFixed(6)} exceeds tolerance ${config.toleranceThreshold}`,
  });
  
  // Test dtype
  tests.push({
    name: 'Output dtype consistency',
    passed: true,
    score: 100,
    expected: 'float32',
    actual: 'float32',
    message: 'Output dtypes match',
  });
  
  const passed = tests.filter(t => t.passed).length;
  const score = (passed / tests.length) * 100;
  
  return {
    category: 'output_values',
    score,
    passed: score >= 80,
    tests,
  };
}

function runPerformanceTests(
  baseline: ModelReference,
  candidate: ModelReference,
  config: TestConfiguration
): TestCategoryResult {
  const tests: TestResult[] = [];
  
  const baselineLatency = 100 + _rng.next() * 20;
  const candidateLatency = baselineLatency * (0.9 + _rng.next() * 0.3);
  const latencyChange = ((candidateLatency - baselineLatency) / baselineLatency) * 100;
  
  tests.push({
    name: 'Latency comparison',
    passed: Math.abs(latencyChange) <= config.performanceThreshold * 100,
    score: Math.max(0, 100 - Math.abs(latencyChange)),
    expected: baselineLatency,
    actual: candidateLatency,
    difference: latencyChange,
    message: `Latency change: ${latencyChange.toFixed(2)}%`,
    duration: candidateLatency,
  });
  
  const baselineThroughput = 1000 + _rng.next() * 200;
  const candidateThroughput = baselineThroughput * (0.9 + _rng.next() * 0.3);
  const throughputChange = ((candidateThroughput - baselineThroughput) / baselineThroughput) * 100;
  
  tests.push({
    name: 'Throughput comparison',
    passed: throughputChange >= -config.performanceThreshold * 100,
    score: Math.max(0, 100 + throughputChange),
    expected: baselineThroughput,
    actual: candidateThroughput,
    difference: throughputChange,
    message: `Throughput change: ${throughputChange.toFixed(2)}%`,
  });
  
  const passed = tests.filter(t => t.passed).length;
  const score = (passed / tests.length) * 100;
  
  return {
    category: 'performance',
    score,
    passed: score >= 80,
    tests,
    details: {
      baselineLatency,
      candidateLatency,
      baselineThroughput,
      candidateThroughput,
    },
  };
}

function detectBreakingChanges(
  baseline: ModelReference,
  candidate: ModelReference,
  testResults: TestCategoryResult[]
): BreakingChange[] {
  const changes: BreakingChange[] = [];
  
  // Check for performance regressions
  const perfCategory = testResults.find(c => c.category === 'performance');
  if (perfCategory && !perfCategory.passed) {
    changes.push({
      type: 'performance_regression',
      severity: 'high',
      component: 'inference',
      description: 'Significant performance degradation detected',
      baselineValue: perfCategory.details?.baselineLatency,
      candidateValue: perfCategory.details?.candidateLatency,
      impact: 'Increased latency may affect SLA compliance',
      mitigation: 'Optimize model or increase hardware resources',
    });
  }
  
  // Check for output changes
  const outputCategory = testResults.find(c => c.category === 'output_values');
  if (outputCategory && !outputCategory.passed) {
    changes.push({
      type: 'behavior_change',
      severity: 'critical',
      component: 'output',
      description: 'Output values differ significantly from baseline',
      baselineValue: 'baseline outputs',
      candidateValue: 'candidate outputs',
      impact: 'Downstream systems may produce incorrect results',
      mitigation: 'Review model changes and validate output quality',
    });
  }
  
  return changes;
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createCompatibilityTest(params: {
  organizationId: string;
  name: string;
  description?: string;
  testType: CompatibilityTestType;
  baselineModel: ModelReference;
  candidateModel: ModelReference;
  testConfig?: Partial<TestConfiguration>;
}): CompatibilityTest {
  const now = new Date().toISOString();
  const id = randomUUID();
  
  const test: CompatibilityTest = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'pending',
    testType: params.testType,
    baselineModel: params.baselineModel,
    candidateModel: params.candidateModel,
    testConfig: {
      testSamples: params.testConfig?.testSamples ?? 100,
      toleranceThreshold: params.testConfig?.toleranceThreshold ?? 0.01,
      performanceThreshold: params.testConfig?.performanceThreshold ?? 0.2,
      includeEdgeCases: params.testConfig?.includeEdgeCases ?? true,
      includeStressTest: params.testConfig?.includeStressTest ?? false,
      customTestCases: params.testConfig?.customTestCases,
    },
    createdAt: now,
    updatedAt: now,
  };
  
  compatibilityTests.set(id, test);
  return test;
}

export function getCompatibilityTest(id: string): CompatibilityTest | undefined {
  return compatibilityTests.get(id);
}

export function listCompatibilityTests(organizationId: string): CompatibilityTest[] {
  return Array.from(compatibilityTests.values()).filter(
    test => test.organizationId === organizationId
  );
}

export function runCompatibilityTest(testId: string): CompatibilityTest {
  const test = compatibilityTests.get(testId);
  if (!test) {
    throw new Error(`Compatibility test ${testId} not found`);
  }
  
  if (test.status !== 'pending') {
    throw new Error(`Compatibility test ${testId} is not in pending state`);
  }
  
  test.status = 'running';
  test.updatedAt = new Date().toISOString();
  
  // Simulate test execution
  setTimeout(() => {
    const testCategories: TestCategoryResult[] = [];
    
    // Run appropriate tests based on test type
    if (test.testType === 'backward_compatibility' || test.testType === 'full_suite') {
      testCategories.push(runInputSchemaTests(test.baselineModel, test.candidateModel, test.testConfig));
      testCategories.push(runOutputEquivalenceTests(test.baselineModel, test.candidateModel, test.testConfig));
    }
    
    if (test.testType === 'performance_regression' || test.testType === 'full_suite') {
      testCategories.push(runPerformanceTests(test.baselineModel, test.candidateModel, test.testConfig));
    }
    
    if (test.testType === 'api_contract' || test.testType === 'full_suite') {
      testCategories.push({
        category: 'api_contract',
        score: 100,
        passed: true,
        tests: [
          {
            name: 'API contract validation',
            passed: true,
            score: 100,
            expected: 'valid',
            actual: 'valid',
            message: 'API contract is valid',
          },
        ],
      });
    }
    
    const breakingChanges = detectBreakingChanges(
      test.baselineModel,
      test.candidateModel,
      testCategories
    );
    
    const warnings: CompatibilityWarning[] = [];
    if (breakingChanges.some(bc => bc.severity === 'medium')) {
      warnings.push({
        type: 'minor_regression',
        severity: 'medium',
        message: 'Minor regressions detected',
        component: 'model',
        suggestion: 'Review changes and consider additional testing',
      });
    }
    
    const recommendations: string[] = [];
    if (breakingChanges.length > 0) {
      recommendations.push('Address breaking changes before deployment');
    }
    if (testCategories.some(c => c.category === 'performance' && !c.passed)) {
      recommendations.push('Optimize model performance or adjust SLA expectations');
    }
    
    const totalTests = testCategories.reduce((sum, cat) => sum + cat.tests.length, 0);
    const passedTests = testCategories.reduce(
      (sum, cat) => sum + cat.tests.filter(t => t.passed).length,
      0
    );
    
    const overallScore = testCategories.reduce((sum, cat) => sum + cat.score, 0) / testCategories.length;
    
    test.results = {
      overallScore,
      passed: overallScore >= 80 && breakingChanges.filter(bc => bc.severity === 'critical').length === 0,
      testCategories,
      breakingChanges,
      warnings,
      recommendations,
      summary: {
        totalTests,
        passedTests,
        failedTests: totalTests - passedTests,
        skippedTests: 0,
        criticalFailures: breakingChanges.filter(bc => bc.severity === 'critical').length,
        highSeverityIssues: breakingChanges.filter(bc => bc.severity === 'high').length,
        mediumSeverityIssues: breakingChanges.filter(bc => bc.severity === 'medium').length,
        lowSeverityIssues: breakingChanges.filter(bc => bc.severity === 'low').length,
      },
    };
    
    test.status = 'completed';
    test.completedAt = new Date().toISOString();
    test.updatedAt = new Date().toISOString();
  }, 2000);
  
  return test;
}

export function registerAPIContract(params: {
  modelId: string;
  version: string;
  inputs: SchemaField[];
  outputs: SchemaField[];
  errors?: ErrorDefinition[];
  metadata?: Partial<ContractMetadata>;
}): APIContract {
  const now = new Date().toISOString();
  const id = randomUUID();
  
  const contract: APIContract = {
    id,
    modelId: params.modelId,
    version: params.version,
    inputs: params.inputs,
    outputs: params.outputs,
    errors: params.errors || [],
    metadata: {
      version: params.metadata?.version || '1.0',
      createdAt: params.metadata?.createdAt || now,
      updatedAt: params.metadata?.updatedAt || now,
      deprecated: params.metadata?.deprecated,
      deprecationDate: params.metadata?.deprecationDate,
      migrationGuide: params.metadata?.migrationGuide,
    },
  };
  
  apiContracts.set(id, contract);
  return contract;
}

export function getAPIContract(id: string): APIContract | undefined {
  return apiContracts.get(id);
}

export function validateAPIContract(
  contractId: string,
  modelId: string,
  version: string
): {
  valid: boolean;
  violations: string[];
} {
  const contract = apiContracts.get(contractId);
  if (!contract) {
    throw new Error(`API contract ${contractId} not found`);
  }
  
  const violations: string[] = [];
  
  // Simulate validation
  if (_rng.next() > 0.9) {
    violations.push('Input schema mismatch detected');
  }
  
  return {
    valid: violations.length === 0,
    violations,
  };
}

export function compareAPIContracts(
  baselineContractId: string,
  candidateContractId: string
): {
  compatible: boolean;
  breakingChanges: BreakingChange[];
  warnings: CompatibilityWarning[];
} {
  const baseline = apiContracts.get(baselineContractId);
  const candidate = apiContracts.get(candidateContractId);
  
  if (!baseline || !candidate) {
    throw new Error('One or both API contracts not found');
  }
  
  const breakingChanges: BreakingChange[] = [];
  const warnings: CompatibilityWarning[] = [];
  
  // Compare input schemas
  const baselineInputNames = new Set(baseline.inputs.map(i => i.name));
  const candidateInputNames = new Set(candidate.inputs.map(i => i.name));
  
  for (const name of baselineInputNames) {
    if (!candidateInputNames.has(name)) {
      breakingChanges.push({
        type: 'input_schema_change',
        severity: 'critical',
        component: `input.${name}`,
        description: `Required input field '${name}' removed`,
        baselineValue: name,
        candidateValue: null,
        impact: 'Clients using this field will fail',
        mitigation: 'Make field optional or provide default value',
      });
    }
  }
  
  return {
    compatible: breakingChanges.filter(bc => bc.severity === 'critical').length === 0,
    breakingChanges,
    warnings,
  };
}

export function getTestStatus(testId: string): {
  status: TestStatus;
  progress?: number;
  currentPhase?: string;
} {
  const test = compatibilityTests.get(testId);
  if (!test) {
    throw new Error(`Compatibility test ${testId} not found`);
  }
  
  return {
    status: test.status,
    progress: test.status === 'completed' ? 100 : test.status === 'running' ? 50 : 0,
    currentPhase: test.status === 'running' ? 'Executing tests' : undefined,
  };
}
