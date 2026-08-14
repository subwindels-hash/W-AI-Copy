/** Session 68 — Scientific Research client (Session 160 list/create). */
import { api } from "./api";
import type {
  ScientificDashboard, LiteratureRef, Experiment, Hypothesis, ResearchDomain,
} from "@windels/shared";
export type {
  ScientificDashboard, LiteratureRef, Experiment, Hypothesis, ResearchDomain,
} from "@windels/shared";
export { RESEARCH_DOMAINS } from "@windels/shared";

export const sciApi = {
  dashboard: () => api<ScientificDashboard>("/scientific/dashboard/rollup"),
  papers: (q?: string) => api<LiteratureRef[]>(`/scientific/papers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  listExperiments: () => api<Experiment[]>("/scientific/experiments"),
  createExperiment: (input: {
    title: string; hypothesis: string; domain: ResearchDomain; expectedOutcome?: string;
  }) => api<Experiment>("/scientific/experiments", { method: "POST", json: input }),
  updateExperimentStatus: (id: string, status: Experiment["status"]) =>
    api<Experiment>(`/scientific/experiments/${id}/status`, { method: "PATCH", json: { status } }),
  createPaper: (input: {
    title: string; authors: string[]; year: number; venue: string;
    abstract?: string; doi?: string; citations?: number; domain?: ResearchDomain;
  }) => api<LiteratureRef>("/scientific/papers", { method: "POST", json: input }),
  listHypotheses: () => api<Hypothesis[]>("/scientific/hypotheses"),
  createHypothesis: (input: { statement: string; domain: ResearchDomain; confidence?: number }) =>
    api<Hypothesis>("/scientific/hypotheses", { method: "POST", json: input }),
};
