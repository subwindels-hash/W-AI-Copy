/** Session 69 / 110 — Cognitive Evolution & World Model client. */
import { api } from "./api";
import type {
  CogEntity,
  CogEntityCreateInput,
  CogEntityQuery,
  CogEntityUpdateInput,
  CogHypothesis,
  CogHypothesisCreateInput,
  CogHypothesisQuery,
  CogHypothesisResolveInput,
  CogObservation,
  CogObservationCreateInput,
  CogObservationQuery,
  CogWorldModelRollup,
  CognitiveDashboard,
  InnovationProposal,
  SelfEvolutionMetric,
  FederationPartner,
  CogInnovationCreateInput,
  CogInnovationStatus,
  CogSelfEvolutionComponentInput,
  CogSelfEvolutionAutoFixInput,
  CogFederationPartnerCreateInput,
  CogFederationPartnerUpdateInput,
} from "@windels/shared/cognitive";

export type {
  CogEntity,
  CogEntityCreateInput,
  CogEntityKind,
  CogEntityQuery,
  CogEntityUpdateInput,
  CogHypothesis,
  CogHypothesisCreateInput,
  CogHypothesisResolveInput,
  CogHypothesisStatus,
  CogObservation,
  CogObservationCreateInput,
  CogObservationOrigin,
  CogWorldModelRollup,
  CognitiveDashboard,
  WorldModelDomain,
  InnovationProposal,
  SelfEvolutionMetric,
  FederationPartner,
  CogInnovationStatus,
} from "@windels/shared/cognitive";

/** `/dashboard/rollup` keeps the Session 69 shape and adds the world model. */
export type CognitiveRollup = CognitiveDashboard & {
  observations: CogObservation[];
  worldModel: CogWorldModelRollup;
};

export const cogApi = {
  dashboard: () => api<CognitiveRollup>("/cognitive/dashboard/rollup"),
  worldModel: () => api<CogWorldModelRollup>("/cognitive/world-model"),

  entities: (query?: Partial<CogEntityQuery>) => api<CogEntity[]>("/cognitive/entities", { params: query }),
  getEntity: (id: string) => api<CogEntity>(`/cognitive/entities/${id}`),
  createEntity: (input: CogEntityCreateInput) => api<CogEntity>("/cognitive/entities", { method: "POST", json: input }),
  updateEntity: (id: string, input: CogEntityUpdateInput) => api<CogEntity>(`/cognitive/entities/${id}`, { method: "PATCH", json: input }),
  deleteEntity: (id: string) => api<{ deleted: boolean; id: string }>(`/cognitive/entities/${id}`, { method: "DELETE" }),

  observations: (query?: Partial<CogObservationQuery>) => api<CogObservation[]>("/cognitive/observations", { params: query }),
  getObservation: (id: string) => api<CogObservation>(`/cognitive/observations/${id}`),
  recordObservation: (input: CogObservationCreateInput) => api<CogObservation>("/cognitive/observations", { method: "POST", json: input }),
  deleteObservation: (id: string) => api<void>(`/cognitive/observations/${id}`, { method: "DELETE" }),

  hypotheses: (query?: Partial<CogHypothesisQuery>) => api<CogHypothesis[]>("/cognitive/hypotheses", { params: query }),
  getHypothesis: (id: string) => api<CogHypothesis>(`/cognitive/hypotheses/${id}`),
  createHypothesis: (input: CogHypothesisCreateInput) => api<CogHypothesis>("/cognitive/hypotheses", { method: "POST", json: input }),
  resolveHypothesis: (id: string, input: CogHypothesisResolveInput) => api<CogHypothesis>(`/cognitive/hypotheses/${id}/resolve`, { method: "POST", json: input }),
  deleteHypothesis: (id: string) => api<{ deleted: boolean; id: string }>(`/cognitive/hypotheses/${id}`, { method: "DELETE" }),

  // ── Session-completion subsystems (now real org-scoped stores) ────────────
  // innovation pipeline, self-evolution register, and federation register.
  innovations: () => api<InnovationProposal[]>("/cognitive/innovations"),
  createInnovation: (input: CogInnovationCreateInput) => api<InnovationProposal>("/cognitive/innovations", { method: "POST", json: input }),
  setInnovationStatus: (innovationId: string, status: CogInnovationStatus) =>
    api<InnovationProposal>(`/cognitive/innovations/${encodeURIComponent(innovationId)}/status`, { method: "POST", json: { status } }),
  deleteInnovation: (innovationId: string) =>
    api<{ deleted: boolean }>(`/cognitive/innovations/${encodeURIComponent(innovationId)}`, { method: "DELETE" }),

  selfEvolution: () => api<SelfEvolutionMetric[]>("/cognitive/self-evolution"),
  upsertSelfEvolutionComponent: (input: CogSelfEvolutionComponentInput) =>
    api<SelfEvolutionMetric>("/cognitive/self-evolution/components", { method: "PUT", json: input }),
  recordAutoFix: (input: CogSelfEvolutionAutoFixInput) =>
    api<SelfEvolutionMetric>("/cognitive/self-evolution/auto-fix", { method: "POST", json: input }),

  federation: () => api<FederationPartner[]>("/cognitive/federation"),
  createFederationPartner: (input: CogFederationPartnerCreateInput) =>
    api<FederationPartner>("/cognitive/federation", { method: "POST", json: input }),
  updateFederationPartner: (partnerId: string, input: CogFederationPartnerUpdateInput) =>
    api<FederationPartner>(`/cognitive/federation/${encodeURIComponent(partnerId)}`, { method: "PATCH", json: input }),
  deleteFederationPartner: (partnerId: string) =>
    api<{ deleted: boolean }>(`/cognitive/federation/${encodeURIComponent(partnerId)}`, { method: "DELETE" }),
};
