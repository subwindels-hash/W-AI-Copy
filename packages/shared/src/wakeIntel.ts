/**
 * Shared types — Enterprise Wake Intelligence & Multimodal Activation Framework (Phase 35 / Session 36)
 *
 * Slices covered:
 *   300 — Wake Intelligence Engine core (unified activation dispatcher)
 *   301 — AI-Powered Clap Intelligence (ML-driven clap-pattern recognition)
 *   302 — Custom Clap Automation (user/org configurable clap-triggered workflows)
 *   303 — Multimodal & Multi-Factor Activation Authentication
 *   304 — Offline & Cross-Device Activation
 *   305 — Context-Aware Activation
 *   306 — Emergency Activation Mode
 *   307 — AI Workforce Direct Activation
 *   308 — Wake Intelligence Security & Governance (WINDELS Constitution + Kernel applied)
 *   309 — Wake Intelligence Audit Logging
 */

export type WakeMethod =
  | "voice-wake-word"
  | "clap"
  | "finger-snap"
  | "hotkey"
  | "mouse-gesture"
  | "touch-gesture"
  | "mobile-gesture"
  | "smart-watch"
  | "smart-button"
  | "nfc"
  | "bluetooth-device"
  | "enterprise-hardware"
  | "api"
  | "scheduled"
  | "workflow"
  | "automation-rule";

export type ActivationOutcome = "accepted" | "mfa-required" | "rejected" | "throttled" | "emergency";

// 300, 308, 309
export interface WakeConfig {
  id: string;
  orgId: string;
  enabledMethods: WakeMethod[];
  defaultMethod: WakeMethod;
  wakeWords: string[];
  requireMfaFor: WakeMethod[];
  emergencyPhrase: string;
  auditAllActivations: boolean;
  policyBound: boolean;
  updatedAt: string;
}

export interface ActivationEvent {
  id: string;
  method: WakeMethod;
  deviceId: string;
  deviceKind: string;
  userId?: string;
  timestamp: string;
  confidence: number;
  outcome: ActivationOutcome;
  mfaUsed?: string[];
  workforceId?: string;
  emergency: boolean;
  offline: boolean;
  contextSnapshot: Record<string, any>;
  policyPassed: boolean;
  latencyMs: number;
}

// 301-302 — Clap patterns
export type ClapSeverity = "info" | "warn" | "critical";
export interface ClapPattern {
  id: string;
  name: string;
  pattern: number[]; // inter-clap intervals ms
  toleranceMs: number;
  action: string; // workflow/action id
  mfaRequired: boolean;
  enabled: boolean;
  description: string;
  createdAt: string;
}
export interface ClapDetection {
  id: string;
  patternId: string;
  confidence: number;
  environmentNoiseDb: number;
  userId?: string;
  deviceId: string;
  detectedAt: string;
  acousticSignature: string;
  falsePositiveRisk: "low" | "medium" | "high";
}

// 303 — Multimodal/MFA auth
export type MfaFactor = "voice-print" | "face" | "clap-biometric" | "hotkey-pattern" | "device-presence" | "pin" | "behavioral";
export interface MfaPolicy {
  id: string;
  name: string;
  requiredFactors: MfaFactor[];
  appliesTo: { methods?: WakeMethod[]; emergency?: boolean; workforceIds?: string[] };
  createdAt: string;
}

// 304 — Cross-device/offline
export interface DeviceActivationState {
  deviceId: string;
  deviceKind: string;
  user: string;
  lastActivationAt?: string;
  online: boolean;
  offlineQueueDepth: number;
  scope: "single-device" | "all-devices";
}

// 305 — Context
export type TimeOfDay = "early-morning" | "morning" | "afternoon" | "evening" | "night" | "after-hours";
export interface ContextSnapshot {
  timeOfDay: TimeOfDay;
  inMeeting: boolean;
  activeDevice: string;
  userAvailability: "available" | "busy" | "dnd" | "away";
  noiseLevelDb: number;
  batteryLevel?: number;
  location?: string;
  privacyMode: boolean;
  securityState: "normal" | "elevated" | "lockdown";
}

// 306 — Emergency mode
export interface EmergencyContact {
  id: string;
  label: string;
  type: "internal-security" | "personal" | "emergency-services" | "designated-responder";
  target: string;
  notifyOnEmergency: boolean;
}
export interface EmergencyConfig {
  enabled: boolean;
  triggerPhrases: string[];
  triggerPatterns: string[]; // clap/wake pattern ids
  notifyContacts: string[];
  shareLocation: boolean;
  recordAudio: boolean;
  recordVideo: boolean;
  generateIncidentReport: boolean;
  triggerWorkflows: string[];
}
export interface EmergencyEvent {
  id: string;
  triggeredBy: string;
  triggerMethod: WakeMethod;
  timestamp: string;
  location?: string;
  notificationsSent: string[];
  respondersNotified: number;
  incidentReportId?: string;
  audioRecorded: boolean;
  videoRecorded: boolean;
}

// 307 — Direct workforce activation
export interface WorkforceActivationBinding {
  id: string;
  workforceId: string;
  workforceName: string;
  triggerPhrase: string;
  triggerMethods: WakeMethod[];
  requiresMfa: boolean;
  policyBindingId?: string;
  enabled: boolean;
}

// 308 — Governance applied
export interface WakeGovernanceDecision {
  activationId: string;
  passed: boolean;
  violations: string[];
  requiredApprovals: string[];
  constitutionArticleRefs: string[];
}

// Dashboard rollup
export interface WakeDashboard {
  enabledMethods: number;
  activeDevices: number;
  clapPatterns: number;
  mfaPolicies: number;
  workforceBindings: number;
  emergencyContacts: number;
  activations24h: number;
  activationsOffline24h: number;
  mfaChallenges24h: number;
  mfaFailures24h: number;
  emergencyEvents24h: number;
  avgLatencyMs: number;
  falsePositiveRatePct: number;
  auditRetentionDays: number;
}

// ─── Multi-Wake-Word Voice Activation (Phase Voice-2) ─────────────────────

/** Built-in wake phrases that ship with WINDELS AI OS. */
export const WINDLES_DEFAULT_WAKE_PHRASES: readonly string[] = [
  "Hey Windels",
  "Hello Windels",
  "Hi Windels",
  "Okay Windels",
  "Alright Windels",
  "Wake up Windels",
  "Windels",
  "Windels, are you there?",
  "Windels, listen",
  "Windels, I need you",
  "Windels, help me",
  "Windels, get ready",
  "Windels, let's go",
  "Windels, start",
  "Windels, activate",
  "Windels, come online",
] as const;

/** Activation response style — what WINDELS says/does when woken. */
export type ActivationResponseStyle = "tone" | "voice" | "visual" | "silent";

/** Built-in activation feedback phrases. */
export const ACTIVATION_RESPONSES: readonly string[] = [
  "I'm listening.",
  "Yes?",
  "How can I help?",
  "Ready.",
  "Go ahead.",
  "At your service.",
  "Listening.",
] as const;

/** Deactivation phrases — user says these to end active session. */
export const DEFAULT_DEACTIVATION_PHRASES: readonly string[] = [
  "Go to sleep, Windels.",
  "That's all, Windels.",
  "Goodbye, Windels.",
  "Stop listening, Windels.",
  "Never mind, Windels.",
] as const;

/** Voice activation configuration — per-user and per-org. */
export interface VoiceActivationConfig {
  id: string;
  organizationId: string;
  userId?: string;
  /** Whether voice activation is enabled globally. */
  enabled: boolean;
  /** Primary wake phrase (used for display and confidence boost). */
  primaryWakePhrase: string;
  /** All active wake phrases (built-in + custom). */
  wakePhrases: string[];
  /** Custom user/org-defined wake phrases. */
  customWakePhrases: string[];
  /** Deactivation phrases. */
  deactivationPhrases: string[];
  /** Activation response style. */
  responseStyle: ActivationResponseStyle;
  /** Activation feedback phrase. */
  activationResponse: string;
  /** Whether continuous conversation mode is enabled. */
  continuousConversation: boolean;
  /** How long (seconds) to stay active after last interaction in continuous mode. */
  continuousTimeoutSec: number;
  /** Maximum conversation duration in seconds before auto-sleep. */
  maxConversationDurationSec: number;
  /** Minimum confidence (0-1) to accept a wake detection. */
  minConfidence: number;
  /** Privacy: process wake detection locally only. */
  localProcessingOnly: boolean;
  /** Privacy: disable microphone completely. */
  microphoneDisabled: boolean;
  /** Privacy: require visual indicator when listening. */
  requireVisualIndicator: boolean;
  /** Maximum voice data retention days (0 = delete immediately after processing). */
  voiceDataRetentionDays: number;
  /** Allowed device kinds for voice activation. */
  allowedDeviceKinds: string[];
  /** Whether to log all voice activations. */
  auditVoiceActivations: boolean;
  /** Require confirmation for high-risk voice commands. */
  requireConfirmationForHighRisk: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Voice profile — associates a voice pattern with an authorized user. */
export interface VoiceProfile {
  id: string;
  organizationId: string;
  userId: string;
  userName: string;
  /** Voice embedding hash for recognition (not raw audio). */
  voiceEmbeddingHash: string;
  /** Number of enrollment samples provided. */
  enrollmentSamples: number;
  /** Whether the profile is active. */
  active: boolean;
  /** Last recognized timestamp. */
  lastRecognizedAt?: string;
  /** Recognition confidence history (recent). */
  recentConfidences: number[];
  createdAt: string;
  updatedAt: string;
}

/** Voice activation session — tracks an active voice conversation. */
export interface VoiceActivationSession {
  id: string;
  organizationId: string;
  userId: string;
  deviceId: string;
  /** The wake phrase that triggered activation. */
  wakePhrase: string;
  /** Confidence of the wake detection. */
  wakeConfidence: number;
  /** Whether continuous conversation is active. */
  continuousMode: boolean;
  /** Conversation turn count. */
  turnCount: number;
  /** Commands processed in this session. */
  commandsProcessed: string[];
  /** Session status. */
  status: "active" | "listening" | "processing" | "responding" | "sleeping" | "ended";
  /** When the session started. */
  startedAt: string;
  /** Last activity timestamp. */
  lastActivityAt: string;
  /** When the session ended. */
  endedAt?: string;
  /** Deactivation phrase used (if any). */
  deactivationPhrase?: string;
}

/** Voice activation log entry for audit. */
export interface VoiceActivationLog {
  id: string;
  organizationId: string;
  userId?: string;
  deviceId: string;
  wakePhrase: string;
  confidence: number;
  commandText?: string;
  intentDetected?: string;
  outcome: "accepted" | "rejected" | "confirmation_required" | "error";
  processingMode: "local" | "cloud" | "hybrid";
  latencyMs: number;
  timestamp: string;
}

/** Voice & Wake Center dashboard summary. */
export interface VoiceCenterDashboard {
  voiceActivationEnabled: boolean;
  primaryWakePhrase: string;
  totalWakePhrases: number;
  customWakePhrases: number;
  continuousConversationEnabled: boolean;
  voiceProfiles: number;
  activeSessions: number;
  activationsToday: number;
  activationsThisWeek: number;
  avgConfidence: number;
  falsePositiveRate: number;
  microphoneStatus: "enabled" | "disabled" | "permission_required";
  localProcessingOnly: boolean;
  recentActivations: VoiceActivationLog[];
}

/** Input schema types for API routes. */
export interface AddCustomWakePhraseInput {
  phrase: string;
}

export interface UpdateVoiceConfigInput {
  enabled?: boolean;
  primaryWakePhrase?: string;
  customWakePhrases?: string[];
  responseStyle?: ActivationResponseStyle;
  activationResponse?: string;
  continuousConversation?: boolean;
  continuousTimeoutSec?: number;
  maxConversationDurationSec?: number;
  minConfidence?: number;
  localProcessingOnly?: boolean;
  microphoneDisabled?: boolean;
  requireVisualIndicator?: boolean;
  voiceDataRetentionDays?: number;
  allowedDeviceKinds?: string[];
  auditVoiceActivations?: boolean;
  requireConfirmationForHighRisk?: boolean;
}
