/**
 * Shared types for Session 22 — Enterprise QA Platform.
 *
 * Covers the unified testing framework plus all eight slices:
 *   185 Testing Framework (suites/cases/runs)
 *   186 API Testing
 *   187 AI Validation (hallucination, groundedness, PII, toxicity, schema, latency)
 *   188 Workflow Testing
 *   189 Security Testing (authz, ratelimit, injection, headers, csrf)
 *   190 Chaos Engineering (fault injection)
 *   191 Disaster Recovery Testing (failover drills, RPO/RTO)
 *   192 Digital Twin Testing (scenario simulation)
 */

export type TestStatus = "passed" | "failed" | "skipped" | "running" | "queued" | "error";
export type TestSeverity = "critical" | "high" | "medium" | "low" | "info";
export type TestKind =
  | "framework" | "api" | "ai-validation" | "workflow"
  | "security" | "chaos" | "dr" | "digital-twin";

export interface TestAssertion {
  id: string;
  /** Human-readable label, e.g. "status == 200". */
  label: string;
  passed: boolean;
  /** Expected vs actual, optional detail. */
  expected?: unknown;
  actual?: unknown;
  /** Helpful message when failing. */
  message?: string;
  durationMs?: number;
}

export interface TestCase {
  id: string;
  suiteId: string;
  name: string;
  description?: string;
  kind: TestKind;
  severity: TestSeverity;
  /** Test-case-type-specific configuration payload. */
  config: Record<string, unknown>;
  tags: string[];
  /** Tags required to run (e.g. "smoke", "regression", "pre-deploy"). */
  selectors: string[];
  /** Estimated maximum runtime (ms). */
  timeoutMs: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  kind: TestKind | "mixed";
  /** Cron-like schedule (simple: intervalMs or a preset "hourly"/"daily"/"weekly"). */
  schedule?: { preset: "hourly" | "daily" | "weekly" | "manual"; intervalMs?: number };
  tags: string[];
  caseIds: string[];
  createdAt: string;
  updatedAt: string;
  lastRunId?: string;
}

export interface TestCaseResult {
  caseId: string;
  caseName: string;
  status: TestStatus;
  durationMs: number;
  startedAt: string;
  finishedAt?: string;
  assertions: TestAssertion[];
  error?: { code: string; message: string; stack?: string };
  logs: string[];
  /** Kind-specific metrics (e.g. p95, error rate, tokens used, latency). */
  metrics: Record<string, number>;
}

export interface TestRun {
  id: string;
  suiteId: string;
  suiteName: string;
  kind: TestKind | "mixed";
  triggeredBy: "schedule" | "manual" | "ci" | "chaos" | "dr-drill";
  actorId?: string;
  status: TestStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  /** Aggregate pass rate (0..1). */
  passRate: number;
  environment: "dev" | "staging" | "prod";
  results: TestCaseResult[];
  summary?: string;
}

// ── Slice 186: API Test config ───────────────────────────────────────
export interface ApiTestCaseConfig {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;                        // path relative to API base, or full URL
  headers?: Record<string, string>;
  body?: unknown;
  auth?: "none" | "user" | "admin" | "agent";
  expected: {
    status?: number | number[];
    /** JSON path → expected value (or matcher). */
    bodyMatches?: Array<{ path: string; equals?: unknown; contains?: string; type?: "string" | "number" | "boolean" | "object" | "array"; regex?: string }>;
    headersPresent?: string[];
    maxLatencyMs?: number;
    schemaEnvelope?: boolean;          // expect { ok: true, data: ... }
  };
}

// ── Slice 187: AI Validation config ──────────────────────────────────
export type AiValidationCheck =
  | "groundedness" | "hallucination-detect" | "pii-detect"
  | "toxicity" | "schema-valid" | "response-time" | "refusal-appropriate"
  | "brand-tone" | "factual-consistency";

export interface AiValidationConfig {
  /** Prompt to send, or reference to a prompt template. */
  prompt: string;
  systemPrompt?: string;
  modelId?: string;
  checks: AiValidationCheck[];
  /** Optional reference corpus snippets for groundedness. */
  referenceSnippets?: string[];
  expectedSchema?: Record<string, unknown>;
  maxLatencyMs?: number;
  forbiddenPatterns?: string[];
  requiredPatterns?: string[];
}

// ── Slice 188: Workflow Test config ──────────────────────────────────
export interface WorkflowTestConfig {
  workflowId: string;
  trigger: Record<string, unknown>;    // input payload
  expected: {
    finalStatus?: "completed" | "failed" | "waiting";
    outputsMatch?: Array<{ path: string; equals?: unknown; contains?: string }>;
    maxDurationMs?: number;
    stepsCompleted?: number;
  };
}

// ── Slice 189: Security Test config ──────────────────────────────────
export type SecurityCheck =
  | "auth-required" | "admin-only" | "csrf-enforced" | "rate-limit-enforced"
  | "sql-injection-safe" | "xss-safe" | "cors-locked" | "security-headers"
  | "password-hashed" | "jwt-expiry" | "input-validation";

export interface SecurityTestConfig { checks: SecurityCheck[]; targetUrl?: string; samplePayload?: Record<string, unknown>; }

// ── Slice 190: Chaos Experiment config ───────────────────────────────
export type ChaosFault =
  | "pod-kill" | "pod-cpu-pressure" | "pod-memory-pressure" | "network-latency"
  | "network-partition" | "redis-flush" | "db-disconnect" | "disk-fill" | "clock-skew";

export interface ChaosConfig {
  fault: ChaosFault;
  target: { kind: "workload" | "node" | "service"; name: string };
  durationMs: number;
  magnitude?: number;                  // 0..1
  /** SLOs that must hold during fault. */
  slos: { errorRatePercent?: number; p95LatencyMs?: number; availabilityPercent?: number };
}

// ── Slice 191: DR Drill config ───────────────────────────────────────
export type DrScenario = "region-failover" | "backup-restore" | "redis-restore" | "db-failover" | "dns-failover" | "total-outage";
export interface DrConfig {
  scenario: DrScenario;
  fromRegion?: string;
  toRegion?: string;
  /** Targets to validate after drill. */
  validationUrls?: string[];
  maxRtoMs?: number;
  maxRpoMs?: number;
}

// ── Slice 192: Digital Twin config ───────────────────────────────────
export interface DigitalTwinConfig {
  name: string;
  /** Number of simulated users/agents. */
  users: number;
  agents: number;
  durationMs: number;
  /** Per-user action mix (weights sum to 1). */
  actions: Array<{ type: string; weight: number; config?: Record<string, unknown> }>;
  /** Expected KPIs (max error rate, min throughput, max latency). */
  expectations: { maxErrorRate?: number; minRps?: number; maxP95Ms?: number };
}

// ── Aggregate dashboard ──────────────────────────────────────────────
export interface QADashboard {
  totalSuites: number;
  totalCases: number;
  recentRuns: TestRun[];
  passRate7d: number;
  openFailures: number;
  coverage: { api: number; workflow: number; security: number; ai: number };
}
