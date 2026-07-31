import { api } from "./api";

export interface SecurityScorecard {
  selfTests: { passed: number; total: number };
  promptInjectionsBlocked: number;
  rateLimitedRequests: number;
  openBreakers: number;
  encryptionKeys: Array<{ id: string; createdAt: string; primary: boolean }>;
  headers: Record<string, any>;
  totalSecurityEvents: number;
  score: number;
}
export interface SelfTest { id: string; name: string; passed: boolean; detail?: string }
export interface GuardResult { safe: boolean; score: number; reasons: string[] }
export interface PasswordStrength { score: 0|1|2|3|4; label: string; issues: string[]; meetsPolicy: boolean }
export interface Breaker { name: string; state: string; failures: number; successes: number; openedAt: string|null; nextProbe: string|null }
export interface RateLimitTier { name: string; burst: number; sustainedPerMin: number; blockSeconds: number }
export interface EncryptionStatus { keys: Array<{ id: string; createdAt: string; primary: boolean }>; algorithm: string; envelopeVersion: string }

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
