/**
 * Shared types — Session 44: Voice Ownership, Security & Governance.
 *
 * Wires S40 Voice Studio + S41 Voice Foundry into Governance/Security.
 * Identity verification, consent enforcement, immutable audit, privacy controls,
 * policies, compliance monitoring, explainable voice decisions, configurable
 * approval workflows, e2e traceability.
 */

export type VoIdentityLevel = "unverified" | "email-verified" | "gov-id-verified" | "enterprise-verified";
export type VoConsentState = "not-recorded" | "recorded" | "revoked" | "expired";

export interface VoVoiceOwner {
  voiceId: string;
  ownerId: string;
  ownershipSource: "voice-studio-clone" | "voice-foundry-autonomous" | "enterprise-assigned";
  identityLevel: VoIdentityLevel;
  consentState: VoConsentState;
  consentRecordedAt?: string;
  humanOversightRequired: boolean;
  immutableAuditEntries: number;
}

export interface VoAuditEntry {
  id: string;
  voiceId: string;
  kind: "consent-granted" | "consent-revoked" | "identity-upgraded" | "voice-used" | "voice-cloned" | "voice-deployed" | "voice-evolved" | "policy-violation" | "approval-required";
  actorId: string;
  at: string;
  immutableHash: string;
  detail?: string;
}

export interface VoPolicy {
  id: string;
  name: string;
  appliesTo: "all" | "voice-studio" | "voice-foundry";
  requireApprovalAboveRiskScore: number;
  humanOversight: boolean;
  enabled: boolean;
}

export interface VoDashboard {
  voicesTracked: number;
  verifiedOwners: number;
  consentCompliant: number;
  consentMissing: number;
  auditEntries: number;
  policiesActive: number;
  pendingApprovals: number;
  violations24h: number;
  governanceWired: boolean;
  securityWired: boolean;
  immutableAudit: boolean;
}
