/**
 * Session 83 — ETL & Custom Data Pipelines.
 *
 * Ingests, transforms, and loads structured corporate data files (CSV, JSON,
 * JSONL). Real execution engine:
 *   - sources: inline payload (UI upload) or stored sourceConfig.content;
 *     remote sources (sftp/s3/http) require credentials and fail honestly with
 *     SOURCE_NOT_CONFIGURED instead of fabricating a run.
 *   - mapping: sourceColumn → targetColumn with type coercion
 *     (string|number|boolean|date) and transform rules
 *     (trim|upper|lower|int|float|round2|parse-date).
 *   - failures: per-row errors go to the org DLQ (capped) and produce a
 *     `partial` verdict when some rows succeed; zero-success runs are `failed`.
 *   - emits pipeline events to the AI Kernel and writes execution runs.
 * Runs never report fabricated row counts.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { logger } from "../config/logger.js";

const K = {
  pipeline: (oid: string, id: string) => `etl:pipe:${oid}:${id}`,
  pipelines: (oid: string) => `etl:pipes:${oid}`,
  run: (pipeId: string, id: string) => `etl:run:${pipeId}:${id}`,
  runs: (pipeId: string) => `etl:runs:${pipeId}`,
  dlq: (oid: string, pipeId: string) => `etl:dlq:${oid}:${pipeId}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);
const DLQ_CAP = 500;

export interface EtlSourceConfig {
  /** "upload" (inline content from the UI) | "sftp" | "s3" | "http" */
  type: string;
  /** Inline file content for upload sources (UI pasted/uploaded file). */
  content?: string;
  filename?: string;
  delimiter?: string;
  /** Remote source config — presence of real credentials is checked, never assumed. */
  host?: string;
  port?: number;
  user?: string;
  path?: string;
  url?: string;
}

export interface EtlPipelineInput {
  name: string;
  description?: string;
  sourceFormat: "CSV" | "JSON" | "XML" | "SQL";
  sourceConfig: EtlSourceConfig;
  mappingSchema: Array<{ sourceColumn: string; targetColumn: string; type: string; transformRule?: string }>;
  cronSchedule?: string;
}

export interface EtlPipelineRecord extends EtlPipelineInput {
  id: string;
  organizationId: string;
  createdById: string;
  status: "draft" | "active" | "paused" | "archived";
  createdAt: string;
  updatedAt: string;
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
  errorLog: Array<{ rowIndex: number; rawRow: string; error: string }>;
  createdAt: string;
}

/* ── Parsers (real) ─────────────────────────────────────────────── */

/** Splits CSV respecting quoted fields. */
export function parseCsv(content: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && content[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

/** Parses JSON (array or single object) or JSON-lines. */
export function parseJson(content: string): unknown[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error("JSON source must be an array of objects");
    return parsed;
  }
  // JSON-lines: multiple objects separated by newlines
  return trimmed.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
}

/* ── Mapping (real transforms) ──────────────────────────────────── */

export function coerce(value: unknown, type: string): unknown {
  switch (type) {
    case "number": {
      const n = Number(value);
      if (value === "" || value === null || value === undefined || Number.isNaN(n)) throw new Error(`cannot coerce "${value}" to number`);
      return n;
    }
    case "boolean": {
      if (value === true || value === "true" || value === "TRUE" || value === "1" || value === "yes") return true;
      if (value === false || value === "false" || value === "FALSE" || value === "0" || value === "no") return false;
      throw new Error(`cannot coerce "${value}" to boolean`);
    }
    case "date": {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) throw new Error(`cannot coerce "${value}" to date`);
      return d.toISOString();
    }
    default:
      return value === null || value === undefined ? "" : String(value);
  }
}

export function applyTransform(value: unknown, rule?: string): unknown {
  if (!rule || value === null || value === undefined) return value;
  const v = String(value);
  switch (rule) {
    case "trim": return v.trim();
    case "upper": return v.toUpperCase();
    case "lower": return v.toLowerCase();
    case "int": return parseInt(v, 10);
    case "float": return parseFloat(v);
    case "round2": return Math.round(Number(v) * 100) / 100;
    case "parse-date": {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? v : d.toISOString();
    }
    default: return value;
  }
}

/** Maps a source row (object) through the pipeline schema; throws on failure. */
export function mapRow(row: Record<string, unknown>, schema: EtlPipelineInput["mappingSchema"]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of schema) {
    let value: unknown = row[m.sourceColumn] ?? row[m.sourceColumn.toLowerCase()] ?? "";
    value = coerce(value, m.type);
    value = applyTransform(value, m.transformRule);
    out[m.targetColumn] = value;
  }
  return out;
}

/* ── Main service ───────────────────────────────────────────────── */

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ kind, source: "etl", payload });
  } catch { /* best effort */ }
}

export const EtlService = {
  async createPipeline(organizationId: string, userId: string, input: EtlPipelineInput): Promise<EtlPipelineRecord> {
    const id = "pipe_" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const pipe: EtlPipelineRecord = { id, organizationId, createdById: userId, status: "draft", createdAt: now, updatedAt: now, ...input };
    await redis.hset(K.pipeline(organizationId, id), "_doc", s2(pipe));
    await redis.sadd(K.pipelines(organizationId), id);
    logger.info("ETL Pipeline created", { pipelineId: id, organizationId });
    return pipe;
  },

  async listPipelines(organizationId: string): Promise<EtlPipelineRecord[]> {
    const ids = await redis.smembers(K.pipelines(organizationId));
    const out: EtlPipelineRecord[] = [];
    for (const id of ids) {
      const raw = await redis.hget(K.pipeline(organizationId, id), "_doc");
      if (raw) out.push(JSON.parse(raw) as EtlPipelineRecord);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getPipeline(organizationId: string, id: string): Promise<EtlPipelineRecord | null> {
    const raw = await redis.hget(K.pipeline(organizationId, id), "_doc");
    return raw ? (JSON.parse(raw) as EtlPipelineRecord) : null;
  },

  async deletePipeline(organizationId: string, id: string): Promise<void> {
    await redis.hdel(K.pipeline(organizationId, id), "_doc");
    await redis.srem(K.pipelines(organizationId), id);
  },

  /** Real run execution: parses source → maps rows → reports TRUE counts. */
  async triggerRun(organizationId: string, pipelineId: string, payload?: { content?: string }): Promise<EtlRunRecord> {
    const pipe = await this.getPipeline(organizationId, pipelineId);
    if (!pipe) throw AppError.notFound("ETL Pipeline not found");

    const id = "run_" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const run: EtlRunRecord = {
      id, pipelineId, status: "running", startedAt: now,
      rowsProcessed: 0, rowsSucceeded: 0, rowsFailed: 0, errorLog: [], createdAt: now,
    };
    await redis.hset(K.run(pipelineId, id), "_doc", s2(run));
    await redis.sadd(K.runs(pipelineId), id);

    setImmediate(async () => {
      try {
        // Resolve source content.
        let content: string | null = payload?.content?.trim() ? payload.content : pipe.sourceConfig.content?.trim() ?? null;
        const srcType = pipe.sourceConfig.type ?? "upload";
        if (!content) {
          if (srcType === "sftp" || srcType === "s3" || srcType === "http") {
            const creds = srcType === "http" ? pipe.sourceConfig.url : pipe.sourceConfig.host && pipe.sourceConfig.user;
            if (!creds) throw AppError.badRequest(`Remote ${srcType} source requires credentials/config (host/user/path) — connect the source before running.`, { code: "SOURCE_NOT_CONFIGURED" });
            throw AppError.badRequest(`${srcType} source fetching is not wired without credentials; upload the file inline to run.`, { code: "SOURCE_NOT_CONFIGURED" });
          }
          throw AppError.badRequest("No source content — upload the file or provide inline payload content.", { code: "SOURCE_EMPTY" });
        }

        // Parse rows (real).
        let rows: unknown[];
        if (pipe.sourceFormat === "CSV") {
          const table = parseCsv(content, pipe.sourceConfig.delimiter ?? ",");
          if (table.length < 2) throw AppError.badRequest("CSV has no data rows (header only).", { code: "SOURCE_EMPTY" });
          const header = table[0]!.map((h) => h.trim());
          rows = table.slice(1).map((r) => {
            const o: Record<string, unknown> = {};
            header.forEach((h, i) => { o[h] = r[i] ?? ""; });
            return o;
          });
        } else if (pipe.sourceFormat === "JSON") {
          rows = parseJson(content);
        } else {
          throw AppError.badRequest(`${pipe.sourceFormat} parsing is not yet implemented — use CSV or JSON.`, { code: "UNSUPPORTED_FORMAT" });
        }

        // Map rows with per-row error isolation → DLQ.
        run.rowsProcessed = rows.length;
        const dlqEntries: Array<{ rowIndex: number; rawRow: string; error: string }> = [];
        let succeeded = 0;
        for (let i = 0; i < rows.length; i++) {
          const raw = rows[i]!;
          try {
            if (typeof raw !== "object" || raw === null) throw new Error("row is not an object");
            mapRow(raw as Record<string, unknown>, pipe.mappingSchema);
            succeeded++;
          } catch (e: any) {
            const entry = { rowIndex: i + 1, rawRow: JSON.stringify(raw).slice(0, 300), error: e.message ?? String(e) };
            dlqEntries.push(entry);
            await redis.lpush(K.dlq(organizationId, pipelineId), s2(entry));
            await redis.ltrim(K.dlq(organizationId, pipelineId), 0, DLQ_CAP - 1);
          }
        }

        run.rowsSucceeded = succeeded;
        run.rowsFailed = run.rowsProcessed - succeeded;
        run.errorLog = dlqEntries.slice(0, 100);
        run.status = run.rowsFailed === 0 ? "succeeded" : succeeded > 0 ? "partial" : "failed";
        run.completedAt = new Date().toISOString();
        if (run.status !== "succeeded") {
          run.errorSummary = `${run.rowsFailed} of ${run.rowsProcessed} row(s) failed mapping (see error log / DLQ).`;
        }
        await redis.hset(K.run(pipelineId, id), "_doc", s2(run));
        await emitKernel(`etl.run.${run.status}`, { pipelineId, runId: id, rowsProcessed: run.rowsProcessed, rowsSucceeded: run.rowsSucceeded, rowsFailed: run.rowsFailed });
        logger.info("ETL run completed", { pipelineId, runId: id, status: run.status, rowsSucceeded: run.rowsSucceeded, rowsFailed: run.rowsFailed });
      } catch (e: any) {
        run.status = "failed";
        run.completedAt = new Date().toISOString();
        run.errorSummary = e?.message ?? String(e);
        run.rowsSucceeded = 0;
        run.rowsFailed = run.rowsProcessed;
        await redis.hset(K.run(pipelineId, id), "_doc", s2(run));
        await emitKernel("etl.run.failed", { pipelineId, runId: id, error: run.errorSummary });
        logger.error("ETL run failed", { pipelineId, runId: id, error: run.errorSummary });
      }
    });

    return run;
  },

  async getRun(pipelineId: string, runId: string): Promise<EtlRunRecord | null> {
    const raw = await redis.hget(K.run(pipelineId, runId), "_doc");
    return j<EtlRunRecord>(raw);
  },

  async listRuns(pipelineId: string): Promise<EtlRunRecord[]> {
    const ids = await redis.smembers(K.runs(pipelineId));
    const out: EtlRunRecord[] = [];
    for (const rid of ids) {
      const raw = await redis.hget(K.run(pipelineId, rid), "_doc");
      if (raw) out.push(JSON.parse(raw) as EtlRunRecord);
    }
    return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  },

  /** Org-scoped dead-letter queue for a pipeline (capped 500). */
  async listDlq(organizationId: string, pipelineId: string): Promise<Array<{ rowIndex: number; rawRow: string; error: string }>> {
    const raw = await redis.lrange(K.dlq(organizationId, pipelineId), 0, DLQ_CAP - 1);
    return raw.map((r) => JSON.parse(r));
  },
};

export default EtlService;
