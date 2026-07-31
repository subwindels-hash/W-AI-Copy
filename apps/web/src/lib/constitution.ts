import { api } from "./api";
import type { Constitution, ConstitutionDashboard, ConstitutionPolicy, ConstitutionViolation, CheckResult } from "@windels/shared";
export type { Constitution, ConstitutionDashboard, ConstitutionPolicy, ConstitutionViolation, CheckResult, ConstitutionDomain, ConstitutionPolicyStatus } from "@windels/shared";

export const constitutionApi = {
  dashboard: () => api<ConstitutionDashboard>("/constitution/dashboard/rollup"),
  policies: () => api<ConstitutionPolicy[]>("/constitution/policies"),
  active: () => api<{ constitution?: Constitution; policies: ConstitutionPolicy[] }>("/constitution/active"),
  violations: () => api<ConstitutionViolation[]>("/constitution/violations"),
  upsertPolicy: (input: Partial<ConstitutionPolicy> & { domain: ConstitutionPolicy["domain"]; title: string; statement: string; enforcementLevel: ConstitutionPolicy["enforcementLevel"]; status: ConstitutionPolicy["status"] }) =>
    api<ConstitutionPolicy>("/constitution/policies", { method: "POST", json: input }),
  publish: (input: { name: string; description?: string; policyIds: string[] }) =>
    api<Constitution>("/constitution/publish", { method: "POST", json: input }),
  check: (input: { source?: string; promptOrAction: string; context?: Record<string, unknown> }) =>
    api<CheckResult>("/constitution/check", { method: "POST", json: input }),
};
