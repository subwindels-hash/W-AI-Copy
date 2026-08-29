/** Session 83 — ETL & Data Pipelines Client */
import { api } from "./api";

export interface EtlPipelineRecord {
  id: string;
  name: string;
  description?: string;
  sourceFormat: "CSV" | "JSON" | "XML" | "SQL";
  sourceConfig: Record<string, any>;
  mappingSchema: Array<{ sourceColumn: string; targetColumn: string; type: string; transformRule?: string }>;
  cronSchedule?: string;
  status: "draft" | "active" | "paused" | "archived";
}

export interface EtlRunRecord {
  id: string;
  pipelineId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "partial";
  startedAt?: string;
  completedAt?: string;
  rowsProcessed: number;
  rowsSucceeded: number;
  rowsFailed: number;
  errorSummary?: string;
}

export const etlApi = {
  listPipelines: () => api<EtlPipelineRecord[]>("/etl/pipelines"),
  createPipeline: (input: Omit<EtlPipelineRecord, "id" | "status">) => api<EtlPipelineRecord>("/etl/pipelines", { method: "POST", json: input }),
  triggerRun: (id: string) => api<EtlRunRecord>(`/etl/pipelines/${id}/run`, { method: "POST" }),
  listRuns: (id: string) => api<EtlRunRecord[]>(`/etl/pipelines/${id}/runs`),
};
