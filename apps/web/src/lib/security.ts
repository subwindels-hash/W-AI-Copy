import { api } from "./api";

/**
 * Types come from @windels/shared/security, which the API route also compiles
 * against. They were previously re-declared here by hand, so nothing connected
 * the two: a field renamed on the server compiled cleanly on both sides and
 * simply rendered `undefined` in the dashboard.
 *
 * Local aliases keep the existing import names used across the UI.
 */
import type {
  SecurityScorecard,
  SecuritySelfTest,
  PromptGuardResult,
  PasswordStrength,
  CircuitBreakerStatus,
  RateLimitTier,
  EncryptionStatus,
} from "@windels/shared/security";

export type {
  SecurityScorecard,
  PasswordStrength,
  RateLimitTier,
  EncryptionStatus,
};
export type SelfTest = SecuritySelfTest;
export type GuardResult = PromptGuardResult;
export type Breaker = CircuitBreakerStatus;

export const securityApi = {
  scorecard: () => api<SecurityScorecard>("/security/scorecard"),
  selfTest: () => api<SelfTest[]>("/security/self-test"),
  scanPrompt: (text: string) => api<GuardResult>("/security/prompt-guard/scan", { method: "POST", json: { text } }),
  passwordStrength: (password: string) => api<PasswordStrength>("/security/password-strength", { method: "POST", json: { password } }),
  breakers: () => api<Breaker[]>("/security/breakers"),
  resetBreaker: (name: string) => api<Breaker[]>(`/security/breakers/${name}/reset`, { method: "POST" }),
  rateLimits: () => api<RateLimitTier[]>("/security/rate-limits"),
  events: (limit = 200) => api<any[]>("/security/events", { params: { limit } }),
  encryption: () => api<EncryptionStatus>("/security/encryption"),
};
