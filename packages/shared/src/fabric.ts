/**
 * Session 56 — Enterprise Intelligence Fabric, Trust Center & Mission Control (V8.5).
 * Aggregates the enterprise nervous system: data fabric, time machine, trust,
 * innovation lab, mission control, API gateway, evolution center, digital twin,
 * package manager, certification, AIO bus.
 */

// 56.1 Data Fabric
export interface DataFabricStats {
  connectedSources: number;
  streamsActive: number;
  pipelinesRunning: number;
  dataQualityScore: number; // 0..1
  lineageEdges: number;
  catalogEntries: number;
  governancePoliciesEnforced: number;
  throughputRps: number;
}

export interface DataSource {
  id: string;
  name: string;
  kind: "postgres" | "kafka" | "s3" | "snowflake" | "bigquery" | "redis" | "mongo" | "api";
  status: "healthy" | "degraded" | "offline";
  latencyMs: number;
  rowsPerSec: number;
  connectedAt: string;
}

// 56.2 Time Machine
export interface TimeMachineReplay {
  id: string;
  kind: "conversation" | "workflow" | "decision" | "event";
  targetId: string;
  startedAt: string;
  events: number;
  status: "recording" | "available" | "replaying" | "compared";
}

// 56.3 Trust Center
export interface TrustSignal {
  id: string;
  category: "confidence" | "evidence" | "hallucination" | "source" | "freshness" | "model_health" | "compliance" | "security" | "privacy" | "governance" | "human_review";
  label: string;
  score: number; // 0..1
  status: "good" | "warn" | "bad";
  detail?: string;
}

export interface TrustCenterReport {
  overallScore: number; // 0..100
  level: "trusted" | "watch" | "review" | "blocked";
  signals: TrustSignal[];
  lastEvaluatedAt: string;
}

// 56.4 Innovation Lab
export type SandboxStatus = "provisioning" | "running" | "paused" | "archived";
export interface Sandbox {
  id: string;
  name: string;
  owner: string;
  status: SandboxStatus;
  experiment: string;
  createdAt: string;
  expiresAt: string;
  resources: { cpu: number; memGb: number; gpu: number };
  promotedToProduction: boolean;
}

// 56.5 Mission Control
export interface MissionControlStatus {
  workforceActive: number;
  agentsBusy: number;
  workflowsRunning: number;
  gpuUtilPct: number;
  cpuUtilPct: number;
  securityIncidentsOpen: number;
  globalAlerts: number;
  businessKpis: Array<{ name: string; value: number; target: number; unit: string }>;
  autonomousDecisionsPerMin: number;
  digitalTwinsOnline: number;
  regionsOnline: number;
  regionsTotal: number;
}

export interface GlobalAlert {
  id: string;
  severity: "info" | "warn" | "critical";
  source: string;
  message: string;
  at: string;
  acknowledged: boolean;
}

// 56.6 API Gateway
export interface FabricEndpoint {
  id: string;
  path: string;
  method: string;
  version: string;
  rps: number;
  p95LatencyMs: number;
  errorRate: number;
  authRequired: boolean;
  rateLimit: number;
}

// 56.7 Evolution Center
export interface EvolutionTrend {
  period: string;
  performanceScore: number;
  productivityIndex: number;
  automationPct: number;
  modelObsolescenceRisk: number;
}

export interface MaturityScore {
  department: string;
  score: number; // 0..100
  level: "emerging" | "developing" | "mature" | "leading";
}

// 56.8 Digital Twin
export type FabricTwinKind = "company" | "department" | "workforce" | "supply_chain" | "construction" | "financial" | "customer_journey" | "logistics" | "facility" | "city";
export interface FabricTwin {
  id: string;
  name: string;
  kind: FabricTwinKind;
  healthPct: number;
  simulationRuns: number;
  lastSimulationAt: string;
  status: "idle" | "simulating" | "live";
  predictionAccuracyPct: number;
}

// 56.9 Package Manager (reused by S59 SDK)
export type PkgKind = "model" | "agent" | "skill" | "connector" | "voice_pack" | "language_pack" | "template" | "industry_module" | "plugin" | "workflow_pack" | "sdk";
export interface InstalledPackage {
  id: string;
  name: string;
  kind: PkgKind;
  version: string;
  author: string;
  installedAt: string;
  signed: boolean;
  autoUpdate: boolean;
  status: "installed" | "updating" | "failed" | "removing";
  sizeBytes: number;
}

export interface PackageRepo {
  id: string;
  name: string;
  url: string;
  kind: "official" | "enterprise" | "community";
  trusted: boolean;
  packagesAvailable: number;
}

// 56.10 Certification
export type CertLevel = "community" | "enterprise" | "security" | "compliance" | "government" | "industry";
export type CertTargetKind = "agent" | "model" | "skill" | "workflow" | "voice_pack" | "connector" | "plugin" | "industry_module";
export interface FabricCertification {
  id: string;
  targetId: string;
  targetKind: CertTargetKind;
  name: string;
  level: CertLevel;
  issuer: string;
  issuedAt: string;
  expiresAt?: string;
  status: "pending" | "certified" | "revoked" | "expired";
  testsPassed: number;
  testsTotal: number;
}

// 56.11 AIO Bus
export type BusEventType =
  | "agent.message" | "agent.status" | "ai.collab" | "event" | "memory.sync" | "knowledge.sync"
  | "workflow.message" | "notification" | "model.communication" | "voice.event" | "video.event"
  | "security.event" | "autonomous.decision" | "enterprise.event" | "fabric.stream" | "twin.telemetry" | "trust.update";

export interface BusEvent {
  id: string;
  type: BusEventType;
  source: string;
  target?: string;
  ts: string;
  payload: any;
}

export interface BusStats {
  eventsPerSec: number;
  topics: number;
  subscribers: number;
  deadLetters: number;
  avgLatencyMs: number;
  uptimeSec: number;
}

// Rollup / dashboard
export interface FabricDashboard {
  dataFabric: DataFabricStats;
  sources: DataSource[];
  replays: number;
  trust: TrustCenterReport;
  sandboxes: number;
  sandboxesRunning: number;
  mission: MissionControlStatus;
  alerts: GlobalAlert[];
  endpoints: number;
  evolutionTrends: EvolutionTrend[];
  maturity: MaturityScore[];
  twins: FabricTwin[];
  packages: InstalledPackage[];
  repos: PackageRepo[];
  certifications: FabricCertification[];
  bus: BusStats;
}
