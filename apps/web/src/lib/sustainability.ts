/**
 * Session 64 — Sustainability & ESG client (Session 121 completion).
 *
 * Session 64's client had a single method (`dashboard`). Session 121 adds the
 * records surface (list / single / delete) and re-exports the widened shared
 * contract, whose scores are `null` (no attested ESG assessment exists) and
 * whose year-on-year changes are `null` without a same-period baseline.
 */
import { api } from "./api";
import type {
  EsgProvenance,
  EsgRecordRow,
  EsgScore,
  SustainabilityActivityInput,
  SustainabilityDashboard,
} from "@windels/shared/sustainability";

export type {
  EsgProvenance,
  EsgRecordRow,
  EsgScore,
  SustainabilityActivityInput,
  SustainabilityDashboard,
} from "@windels/shared/sustainability";

export const esgApi = {
  dashboard: () => api<SustainabilityDashboard>("/sustainability/dashboard/rollup"),
  records: (limit?: number) =>
    api<EsgRecordRow[]>("/sustainability/records", { params: limit ? { limit } : {} }),
  record: (id: string) => api<EsgRecordRow>(`/sustainability/records/${id}`),
  recordActivity: (input: SustainabilityActivityInput) =>
    api<EsgRecordRow>("/sustainability/activity", { method: "POST", json: input }),
  removeRecord: (id: string) =>
    api<{ id: string; deleted: true }>(`/sustainability/records/${id}`, { method: "DELETE" }),
};
