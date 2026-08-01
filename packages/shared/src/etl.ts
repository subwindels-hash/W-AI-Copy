// Session 83 — ETL & Data Pipeline Platform.
//
// The request schemas below were previously declared inline in
// apps/api/src/http/routes/etl.ts, and the record shapes were declared a second
// time as interfaces in apps/api/src/etl/etl.service.ts. Neither was visible to
// the web client, which re-described the same payloads by hand — so a change to
// the accepted `sourceFormat` set, for example, had to be made in three places
// and nothing failed the build if one was missed.
//
// These are the single source of truth. The route imports the schemas, the
// service derives its record types from them, and the web client imports the
// same types.

import { z } from "zod";

/** Formats the run engine can actually parse today. */
export const ETL_SOURCE_FORMATS = ["CSV", "JSON", "XML", "SQL"] as const;
export type EtlSourceFormat = (typeof ETL_SOURCE_FORMATS)[number];

/**
 * Only CSV and JSON are implemented; XML and SQL are accepted by the schema but
 * rejected at run time with UNSUPPORTED_FORMAT rather than silently succeeding.
 */
export const ETL_IMPLEMENTED_FORMATS: readonly EtlSourceFormat[] = ["CSV", "JSON"] as const;

export const ETL_PIPELINE_STATUSES = ["draft", "active", "paused", "archived"] as const;
export type EtlPipelineStatus = (typeof ETL_PIPELINE_STATUSES)[number];

/**
 * Run outcomes. `partial` exists because a run with some bad rows must not be
 * reported as a success — see PROGRESS.md, Session 83: the engine previously
 * hard-coded rowsSucceeded=100 regardless of what happened.
 */
export const ETL_RUN_STATUSES = ["queued", "running", "succeeded", "failed", "partial"] as const;
export type EtlRunStatus = (typeof ETL_RUN_STATUSES)[number];

/** Where the rows come from. Remote types require real credentials. */
export const EtlSourceConfigSchema = z.object({
  /** "upload" (inline content from the UI) | "sftp" | "s3" | "http" */
  type: z.string().min(1),
  /** Inline file content for upload sources. */
  content: z.string().optional(),
  filename: z.string().optional(),
  delimiter: z.string().optional(),
  // Remote source config — presence of real credentials is checked, never assumed.
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  user: z.string().optional(),
  path: z.string().optional(),
  url: z.string().optional(),
}).passthrough();
export type EtlSourceConfig = z.infer<typeof EtlSourceConfigSchema>;

/** One source→target column mapping, with an optional transform. */
export const EtlColumnMappingSchema = z.object({
  sourceColumn: z.string().min(1),
  targetColumn: z.string().min(1),
  type: z.string(),
  transformRule: z.string().optional(),
});
export type EtlColumnMapping = z.infer<typeof EtlColumnMappingSchema>;

/** Transform rules the mapper understands. */
export const ETL_TRANSFORM_RULES = [
  "trim", "upper", "lower", "int", "float", "round2", "parse-date",
] as const;
export type EtlTransformRule = (typeof ETL_TRANSFORM_RULES)[number];

export const CreateEtlPipelineSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  sourceFormat: z.enum(ETL_SOURCE_FORMATS),
  sourceConfig: z.record(z.any()),
  mappingSchema: z.array(EtlColumnMappingSchema),
  cronSchedule: z.string().optional(),
});
export type CreateEtlPipelineInput = z.infer<typeof CreateEtlPipelineSchema>;

/** Optional inline payload accepted when triggering a run. */
export const TriggerEtlRunSchema = z.object({
  content: z.string().max(5_000_000).optional(),
});
export type TriggerEtlRunInput = z.infer<typeof TriggerEtlRunSchema>;

export const EtlPipelineIdSchema = z.object({ id: z.string().min(1).max(64) });
export const EtlRunIdSchema = EtlPipelineIdSchema.extend({
  runId: z.string().min(1).max(64),
});

export interface EtlPipelineRecord extends CreateEtlPipelineInput {
  id: string;
  organizationId: string;
  createdById: string;
  status: EtlPipelineStatus;
  createdAt: string;
  updatedAt: string;
}

/** A single rejected row, retained for the dead-letter queue. */
export interface EtlRowError {
  rowIndex: number;
  rawRow: string;
  error: string;
}

export interface EtlRunRecord {
  id: string;
  pipelineId: string;
  status: EtlRunStatus;
  startedAt?: string;
  completedAt?: string;
  rowsProcessed: number;
  rowsSucceeded: number;
  rowsFailed: number;
  errorSummary?: string;
  errorLog: EtlRowError[];
  createdAt: string;
}
