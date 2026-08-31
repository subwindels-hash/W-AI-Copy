/**
 * Session 46 — Enterprise AI Model Factory.
 *
 * The factory is a lifecycle register, and the client is written to keep it
 * honest in two places:
 *
 *   * `benchmark` requires the measured score AND the verdict. An earlier
 *     version of the Node route invented both, and the console has to be
 *     incapable of doing that — there is no way to record a benchmark here
 *     without typing the number the evaluator produced.
 *   * `startFineTune` sends `modelId`. Node's request schema does not declare
 *     it, so the Node deployment silently drops whatever the console sends and
 *     records a job with no model; the PHP build keeps it. Sending it is
 *     correct either way, and the page sends it.
 */
import { api } from "./api";
import type {
  Mf2BenchmarkResult,
  Mf2Dashboard,
  Mf2FineTuneJob,
  Mf2Model,
  Mf2Note,
  Mf2Stage,
} from "@windels/shared";
export type {
  Mf2BenchmarkResult,
  Mf2Dashboard,
  Mf2FineTuneJob,
  Mf2Model,
  Mf2Note,
  Mf2Stage,
} from "@windels/shared";

export interface CreateModelInput {
  name: string;
  builder: Mf2Model["builder"];
  size: string;
  quant: string;
  vramMb: number;
  baseModelId?: string;
  stage?: Mf2Stage;
}

export interface RecordBenchmarkInput {
  benchmark: string;
  score: number;
  pass: boolean;
}

export interface StartFineTuneInput {
  modelId?: string;
  dataset: string;
  method: Mf2FineTuneJob["method"];
}

export interface NoteInput {
  title: string;
  body: string;
  tags?: string[];
}

export const mf2Api = {
  dashboard: () => api<Mf2Dashboard>("/model-factory/dashboard/rollup"),
  models: (stage?: Mf2Stage) => api<Mf2Model[]>("/model-factory/models", stage ? { params: { stage } } : {}),
  create: (input: CreateModelInput) =>
    api<Mf2Model>("/model-factory/models", { method: "POST", json: input }),
  advance: (id: string, to: Mf2Stage) =>
    api<Mf2Model>(`/model-factory/models/${id}/advance`, { method: "POST", json: { to } }),
  benchmark: (id: string, input: RecordBenchmarkInput) =>
    api<Mf2BenchmarkResult>(`/model-factory/models/${id}/benchmark`, { method: "POST", json: input }),
  safety: (id: string, passed: boolean) =>
    api<Mf2Model>(`/model-factory/models/${id}/safety`, { method: "POST", json: { passed } }),
  approve: (id: string) =>
    api<Mf2Model>(`/model-factory/models/${id}/governance-approve`, { method: "POST" }),
  fineTunes: () => api<Mf2FineTuneJob[]>("/model-factory/fine-tunes"),
  startFineTune: (input: StartFineTuneInput) =>
    api<Mf2FineTuneJob>("/model-factory/fine-tunes", { method: "POST", json: input }),
  notes: () => api<Mf2Note[]>("/model-factory/notes"),
  createNote: (input: NoteInput) =>
    api<Mf2Note>("/model-factory/notes", { method: "POST", json: input }),
  updateNote: (id: string, patch: Partial<NoteInput>) =>
    api<Mf2Note>(`/model-factory/notes/${id}`, { method: "PATCH", json: patch }),
  deleteNote: (id: string) => api<void>(`/model-factory/notes/${id}`, { method: "DELETE" }),
};
