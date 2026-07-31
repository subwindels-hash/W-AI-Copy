/**
 * Session 32 — Phase 31: Enterprise Collaboration & Perception Intelligence (Slices 285–287).
 *
 * 285: Live Meeting Intelligence  — platform connectors, AI participant join, live
 *      transcription, real-time multilingual translation, speaker identification
 *      (permission-gated), agenda tracking, action-item / decision / risk extraction,
 *      meeting summaries, follow-up generation, calendar sync, write-through to CRM /
 *      Project / Knowledge Graph / Enterprise Memory.
 *
 * 286: Screen Intelligence        — secure screen/window sharing, interface explanation,
 *      guided troubleshooting, developer coding assistance, dashboard explanation,
 *      interface-issue detection, interactive step-by-step assistance, and
 *      auto-generated documentation from observed workflows.
 *
 * 287: Live Camera Intelligence  — equipment inspection, construction-site analysis,
 *      inventory recognition, manufacturing QA, warehouse ops, safety compliance,
 *      asset ID, technical troubleshooting, facility walkthroughs, retail recognition.
 *      Output is ADVISORY-ONLY by default and must be explicitly wired to an approved
 *      enterprise workflow before it can drive automated action.
 */

// ─── Slice 285: Live Meeting Intelligence ───────────────────────
export type MeetingPlatform =
  | "teams" | "zoom" | "meet" | "webex" | "slack-huddle" | "windels-talk" | "custom";
export type MeetingStatus =
  | "scheduled" | "live" | "transcribing" | "translating" | "summarizing" | "completed" | "cancelled";
export type SpeakerRole = "host" | "presenter" | "attendee" | "ai-participant" | "guest";
export type ActionItemStatus = "open" | "in-progress" | "blocked" | "done";
export type MeetingRiskSeverity = "info" | "low" | "medium" | "high" | "critical";
export type DecisionType = "approved" | "rejected" | "deferred" | "noted" | "action-required";
export type WriteThroughSystem = "crm" | "project" | "knowledge-graph" | "enterprise-memory" | "calendar";
export type WriteStatus = "pending" | "queued" | "synced" | "failed" | "skipped";
export type TranslationLanguage = "en" | "es" | "fr" | "de" | "pt" | "ja" | "zh" | "ar" | "hi" | "ko";

export interface MeetingConnector {
  id: string;
  name: string;
  platform: MeetingPlatform;
  status: "connected" | "error" | "syncing" | "paused";
  tenantDomain?: string;
  webhookUrl?: string;
  capabilities: string[];
  meetingsToday: number;
  minutesTranscribed24h: number;
  languagesActive: TranslationLanguage[];
  lastSyncAt?: string;
  owner: string;
}

export interface TranscriptSegment {
  id: string;
  meetingId: string;
  startSec: number;
  endSec: number;
  speakerId?: string;
  speakerLabel: string;
  text: string;
  confidence: number;
  language: TranslationLanguage;
  translated?: Partial<Record<TranslationLanguage, string>>;
}

export interface TranslationChannel {
  id: string;
  meetingId: string;
  language: TranslationLanguage;
  activeListeners: number;
  segmentsTranslated: number;
  /** Observed translation latency. Undefined until segments are translated. */
  latencyMs?: number;
  enabled: boolean;
}

export interface SpeakerProfile {
  id: string;
  meetingId: string;
  principalId?: string;
  displayName: string;
  role: SpeakerRole;
  talkTimeSec: number;
  interjections: number;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  permissionGated: boolean;
}

export interface AgendaItem {
  id: string;
  meetingId: string;
  title: string;
  order: number;
  owner?: string;
  durationMin: number;
  status: "pending" | "active" | "covered" | "skipped";
  notes: string;
}

export interface MeetingActionItem {
  id: string;
  meetingId: string;
  title: string;
  description: string;
  assignee?: string;
  dueDate?: string;
  priority: "low" | "medium" | "high" | "critical";
  status: ActionItemStatus;
  sourceSegmentId?: string;
}

export interface MeetingDecision {
  id: string;
  meetingId: string;
  title: string;
  type: DecisionType;
  decidedBy?: string;
  rationale: string;
  timestampSec: number;
}

export interface MeetingRisk {
  id: string;
  meetingId: string;
  label: string;
  severity: MeetingRiskSeverity;
  category: "commitment" | "scope" | "legal" | "security" | "quality" | "timeline" | "other";
  detail: string;
  sourceSegmentId?: string;
  acknowledged: boolean;
}

export interface MeetingSummary {
  id: string;
  meetingId: string;
  tldr: string;
  keyPoints: string[];
  topicsDiscussed: string[];
  sentimentOverall: "positive" | "neutral" | "negative" | "mixed";
  generatedAt: string;
  wordCount: number;
}

export interface FollowUpTask {
  id: string;
  meetingId: string;
  system: WriteThroughSystem;
  action: string;
  status: WriteStatus;
  targetRecordId?: string;
  syncedAt?: string;
  lastError?: string;
}

export interface LiveMeeting {
  id: string;
  title: string;
  platform: MeetingPlatform;
  connectorId: string;
  externalMeetingId?: string;
  joinUrl: string;
  aiParticipantJoined: boolean;
  status: MeetingStatus;
  startedAt: string;
  endedAt?: string;
  durationMin: number;
  organizer: string;
  attendees: number;
  languages: TranslationLanguage[];
  agendaCoveragePct: number;
  actionItemsOpen: number;
  decisionsCount: number;
  riskCount: number;
  summaryReady: boolean;
  writeThroughPending: number;
  tags: string[];
}

// ─── Slice 286: Enterprise Screen Intelligence ──────────────────
export type ScreenSessionStatus = "requested" | "active" | "analyzing" | "paused" | "ended";
export type ScreenShareLevel = "window" | "tab" | "fullscreen" | "developer-coding";
export type GuidedStepStatus = "pending" | "active" | "done" | "skipped" | "failed";
export type CodeAssistanceKind = "explain" | "refactor" | "debug" | "test-gen" | "review";
export type DocFormat = "markdown" | "confluence" | "notion" | "pdf";
export type DocGenerationStatus = "queued" | "drafting" | "ready" | "exported";

export interface ScreenShareSession {
  id: string;
  title: string;
  user: string;
  level: ScreenShareLevel;
  application?: string;
  url?: string;
  status: ScreenSessionStatus;
  consentGranted: boolean;
  piiRedaction: boolean;
  startedAt: string;
  endedAt?: string;
  framesCaptured: number;
  aiExplanations: number;
  stepsGuided: number;
  codeAssists: number;
  docsGenerated: number;
  issuesDetected: number;
}

export interface InterfaceExplanation {
  id: string;
  sessionId: string;
  elementSelector?: string;
  region?: string;
  explanation: string;
  relatedDocs?: string[];
  confidence: number;
  timestamp: string;
}

export interface GuidedStep {
  id: string;
  sessionId: string;
  stepNumber: number;
  title: string;
  instruction: string;
  expectedOutcome: string;
  status: GuidedStepStatus;
  /** Set when the step is first advanced away from pending, so elapsed time can
   *  be measured rather than accumulated from random increments. */
  startedAt?: string;
  elapsedSec: number;
  aiCoached: boolean;
}

export interface CodeAssistance {
  id: string;
  sessionId: string;
  kind: CodeAssistanceKind;
  language?: string;
  fileName?: string;
  selectionSnippet?: string;
  suggestion: string;
  applied: boolean;
  timestamp: string;
}

export interface ScreenIssue {
  id: string;
  sessionId: string;
  label: string;
  severity: "info" | "warn" | "critical";
  detail: string;
  rectified: boolean;
  timestamp: string;
}

export interface WorkflowDoc {
  id: string;
  sessionId: string;
  title: string;
  format: DocFormat;
  status: DocGenerationStatus;
  sections: string[];
  wordCount: number;
  exportedAt?: string;
  generatedAt: string;
}

// ─── Slice 287: Enterprise Live Camera Intelligence ─────────────
export type CameraPipelineKind =
  | "equipment-inspection" | "construction-site" | "inventory-recognition"
  | "manufacturing-qa" | "warehouse-ops" | "safety-compliance" | "asset-id"
  | "technical-troubleshooting" | "facility-walkthrough" | "retail-recognition";
export type CameraStatus = "live" | "paused" | "degraded" | "offline";
export type DetectionConfidence = "low" | "medium" | "high" | "very-high";
export type DetectionVerdict = "advisory" | "approved-workflow";
export type CameraFindingKind =
  | "defect" | "safety-violation" | "asset-tag" | "inventory-count" | "ppe-missing"
  | "obstacle" | "spill" | "anomaly" | "misalignment" | "recognition";

export interface CameraPipeline {
  id: string;
  name: string;
  kind: CameraPipelineKind;
  site: string;
  cameraCount: number;
  status: CameraStatus;
  modelVersion: string;
  fps: number;
  resolution: string;
  verdictDefault: DetectionVerdict;
  detectionsToday: number;
  findingsOpen: number;
  acknowledgedFindings: number;
  safetyAlerts24h: number;
  /** Observed pipeline health. Undefined until the pipeline reports in. */
  uptimePct?: number;
  latencyMs?: number;
  owner: string;
  approvedWorkflow?: string;
  tags: string[];
}

export interface Detection {
  id: string;
  pipelineId: string;
  cameraId: string;
  frameId: string;
  kind: CameraFindingKind;
  label: string;
  confidence: number;
  confidenceBand: DetectionConfidence;
  verdict: DetectionVerdict;
  bbox?: { x: number; y: number; w: number; h: number };
  timestamp: string;
  advisoryNote: string;
}

export interface CameraFinding {
  id: string;
  pipelineId: string;
  detectionId: string;
  kind: CameraFindingKind;
  title: string;
  severity: "info" | "warn" | "critical";
  detail: string;
  location: string;
  recommendation: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  verdict: DetectionVerdict;
  createdAt: string;
}

// ─── Aggregate dashboard ─────────────────────────────────────────
export interface CollaborationDashboard {
  connectors: number;
  connectorsHealthy: number;
  meetingsLive: number;
  meetingsToday: number;
  minutesTranscribed24h: number;
  languagesActive: number;
  aiParticipantsActive: number;
  actionItemsOpen: number;
  decisionsCaptured: number;
  risksFlagged: number;
  summariesGenerated24h: number;
  writeThroughPending: number;
  writeThroughSynced24h: number;

  screenSessionsActive: number;
  screenSessionsToday: number;
  guidedStepsActive: number;
  guidedStepsCompleted24h: number;
  codeAssists24h: number;
  docsGenerated24h: number;
  issuesDetected24h: number;

  cameraPipelines: number;
  camerasLive: number;
  detections24h: number;
  openFindings: number;
  safetyAlerts24h: number;
  advisoryFindingsPct: number;
  avgCameraLatencyMs: number;
}
