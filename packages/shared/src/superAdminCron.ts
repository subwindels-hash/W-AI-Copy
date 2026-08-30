/**
 * Super Admin Cron — shared contract for platform-level scheduled jobs.
 *
 * A cron job is a named, repeating task driven by a standard 5-field cron
 * expression (minute hour day-of-month month day-of-week). Jobs are stored in
 * Redis and dispatched by an in-process scheduler tick (see
 * `apps/api/src/cronJobs/cronJobs.service.ts`). This contract intentionally
 * describes the surface only: it never guarantees an external task actually
 * ran — the scheduler records the outcome honestly and surfaces errors.
 */
import { z } from "zod";

export const CRON_TASK_TYPES = [
  "http_webhook",          // POST a configured webhook URL
  "exchange_rate_refresh", // refresh configured currency/provider rates
  "health_report",         // produce a platform health report entry
  "cleanup_expired",       // run retention/cleanup for expired records
  "log_heartbeat",         // deterministic no-op that records a successful run
] as const;
export type CronTaskType = (typeof CRON_TASK_TYPES)[number];

export const CRON_TASK_LABELS: Record<CronTaskType, string> = {
  http_webhook: "Webhook POST",
  exchange_rate_refresh: "Refresh exchange rates",
  health_report: "Platform health report",
  cleanup_expired: "Clean up expired records",
  log_heartbeat: "Heartbeat (test)",
};

export type CronJobStatus = "ok" | "error" | "never";

export interface CronJob {
  id: string;
  name: string;
  /** Standard 5-field cron expression, e.g. "0 0 * * *" (daily at midnight). */
  expression: string;
  taskType: CronTaskType;
  payload: Record<string, string>;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: CronJobStatus;
  lastError: string | null;
  lastRunMs: number | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface CronRunLog {
  id: string;
  jobId: string;
  jobName: string;
  startedAt: string;
  status: "ok" | "error";
  error: string | null;
  durationMs: number;
  detail: string | null;
}

export interface CronAdminOverview {
  total: number;
  enabled: number;
  dueSoon: number;
  lastRunsOk: number;
  lastRunsError: number;
}

export const CronJobSchema = z.object({
  name: z.string().trim().min(1).max(120),
  expression: z
    .string()
    .trim()
    .min(5)
    .max(40)
    .refine(
      (expr) => expr.split(/\s+/).length === 5,
      "Use a standard 5-field cron expression: minute hour day-of-month month day-of-week.",
    ),
  taskType: z.enum(CRON_TASK_TYPES),
  payload: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
});
export type CronJobInput = z.infer<typeof CronJobSchema>;

export const CronJobUpdateSchema = CronJobSchema.partial();
export type CronJobUpdateInput = z.infer<typeof CronJobUpdateSchema>;

export const CronJobIdParamSchema = z.object({
  id: z.string().trim().regex(/^cron-[A-Za-z0-9-]+$/, "Not a cron job id."),
});

export const CronJobEnabledSchema = z.object({
  enabled: z.boolean(),
});

export const CRON_PRIVACY_NOTE =
  "Cron jobs run in-process on the API server. A job's payload may contain URLs and simple parameters only — never store secrets in a cron job payload.";
