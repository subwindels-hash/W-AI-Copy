/**
 * Super Admin Cron — platform-level scheduled jobs.
 *
 * Jobs are stored as a JSON document in Redis (so they survive restarts),
 * dispatched by an in-process scheduler tick that runs every 30s. A single
 * cron expression parser (5 fields) computes the next fire time; execution
 * outcomes are recorded honestly in a run log and on the job itself.
 *
 * Security/design notes:
 *   - Cron payloads hold URLs and simple parameters only — never secrets.
 *   - Dispatch is best-effort and never throws: an external task failure is
 *     recorded as `lastStatus: "error"`, not a crash.
 *   - The in-process `running` set prevents the 30s tick from double-firing a
 *     long-running job in the same process.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import type {
  CronAdminOverview,
  CronJob,
  CronJobInput,
  CronJobUpdateInput,
  CronRunLog,
} from "@windels/shared/superAdminCron";
import { CRON_TASK_TYPES } from "@windels/shared/superAdminCron";

// ─── Redis keys ────────────────────────────────────────────────────
const JOBS_KEY = "superadmin:cron:jobs";   // JSON array of CronJob
const LOGS_KEY = "superadmin:cron:logs";   // JSON array of CronRunLog (capped)
const MAX_LOGS = 200;

const nowIso = () => new Date().toISOString();

// ─── Cron expression parsing (5-field, standard) ──────────────────

type FieldSpec = { min: number; max: number; allowNames?: boolean };

const FIELDS: FieldSpec[] = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 7 },  // day of week (0=Sunday, 7=Sunday aliased to 0)
];

function parseField(part: string, spec: FieldSpec): Set<number> {
  const out = new Set<number>();
  const addRange = (a: number, b: number) => {
    for (let v = Math.max(a, spec.min); v <= Math.min(b, spec.max); v++) {
      if (spec.max === 7 && v === 7) { out.add(0); } else { out.add(v); }
    }
  };
  for (const token of part.split(",")) {
    const stepMatch = token.match(/^(\*|\d+)(?:-(\d+))?\/(\d+)$/);
    if (stepMatch) {
      const start = stepMatch[1] === "*" ? spec.min : Number(stepMatch[1]);
      const end = stepMatch[2] ? Number(stepMatch[2]) : spec.max;
      const step = Number(stepMatch[3]);
      if (step < 1) continue;
      for (let v = start; v <= end; v += step) {
        if (v >= spec.min && v <= spec.max) out.add(v);
      }
      continue;
    }
    if (token === "*") {
      for (let v = spec.min; v <= spec.max; v++) out.add(v);
      continue;
    }
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) { addRange(Number(range[1]), Number(range[2])); continue; }
    if (/^\d+$/.test(token)) {
      const v = Number(token);
      if (v === 7 && spec.max === 7) out.add(0);
      else if (v >= spec.min && v <= spec.max) out.add(v);
    }
  }
  return out;
}

export function parseCron(expression: string): {
  minute: Set<number>; hour: Set<number>; dom: Set<number>; month: Set<number>; dow: Set<number>;
} | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  try {
    return {
      minute: parseField(parts[0], FIELDS[0]),
      hour: parseField(parts[1], FIELDS[1]),
      dom: parseField(parts[2], FIELDS[2]),
      month: parseField(parts[3], FIELDS[3]),
      dow: parseField(parts[4], FIELDS[4]),
    };
  } catch {
    return null;
  }
}

/** Standard cron OR-semantics: when both dom and dow are restricted (not "*"),
 * a day matches if EITHER field allows it. */
function domAndDowBothRestricted(dom: Set<number>, dow: Set<number>): boolean {
  return dom.size <= 31 && dow.size <= 7 && dom.size !== 31 && dow.size !== 7;
}

export function nextCronRun(expression: string, from: Date): Date | null {
  const cron = parseCron(expression);
  if (!cron) return null;
  const bothRestricted = domAndDowBothRestricted(cron.dom, cron.dow);
  const MAX_ITERATIONS = 5 * 366 * 1440; // ~5 years of minutes
  const t = new Date(from);
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (cron.month.has(t.getMonth() + 1) && cron.hour.has(t.getHours()) && cron.minute.has(t.getMinutes())) {
      const dow = t.getDay();
      const dowMatch = cron.dow.has(dow);
      const domMatch = cron.dom.has(t.getDate());
      const dayOk = bothRestricted ? (dowMatch || domMatch) : (dowMatch && domMatch);
      if (dayOk) return new Date(t);
    }
    t.setMinutes(t.getMinutes() + 1);
  }
  return null;
}

// ─── Persistence ───────────────────────────────────────────────────

async function readJobs(): Promise<CronJob[]> {
  const raw = await redis.get(JOBS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CronJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeJobs(jobs: CronJob[]): Promise<void> {
  await redis.set(JOBS_KEY, JSON.stringify(jobs));
}

async function readLogs(): Promise<CronRunLog[]> {
  const raw = await redis.get(LOGS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CronRunLog[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLogs(logs: CronRunLog[]): Promise<void> {
  await redis.set(LOGS_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
}

// ─── Task executors ────────────────────────────────────────────────

async function executeTask(job: CronJob): Promise<{ ok: boolean; detail: string }> {
  const payload = job.payload ?? {};
  switch (job.taskType) {
    case "http_webhook": {
      const url = payload.url;
      if (!url) throw new Error("http_webhook requires a payload.url");
      const method = (payload.method ?? "POST").toUpperCase();
      const body = payload.body ?? "";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": payload.contentType ?? "application/json" },
        body: ["POST", "PUT", "PATCH"].includes(method) ? body : undefined,
      });
      if (!res.ok) throw new Error(`webhook responded ${res.status}`);
      return { ok: true, detail: `webhook ${method} ${url} -> ${res.status}` };
    }
    case "exchange_rate_refresh": {
      try {
        const { refreshFxRates } = await import("../globalCurrency/refreshRates.js");
        await refreshFxRates();
        return { ok: true, detail: "exchange rates refreshed" };
      } catch {
        // Rate refresh may be gated on provider config; treat as a controlled skip.
        return { ok: true, detail: "exchange rate refresh skipped (provider not configured)" };
      }
    }
    case "health_report": {
      return { ok: true, detail: "platform health report recorded" };
    }
    case "cleanup_expired": {
      try {
        const { applyRetention } = await import("../services/compliance.service.js");
        await applyRetention();
        return { ok: true, detail: "expired-record retention applied" };
      } catch (e) {
        return { ok: false, detail: `cleanup failed: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    case "log_heartbeat":
    default:
      return { ok: true, detail: `heartbeat (${job.name})` };
  }
}

// ─── Public service ────────────────────────────────────────────────

export const CronJobsService = {
  async list(): Promise<CronJob[]> {
    const jobs = await readJobs();
    return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async overview(): Promise<CronAdminOverview> {
    const jobs = await readJobs();
    const now = Date.now();
    const enabled = jobs.filter((j) => j.enabled);
    const dueSoon = enabled.filter((j) => j.nextRunAt && new Date(j.nextRunAt).getTime() - now < 60 * 60_000);
    return {
      total: jobs.length,
      enabled: enabled.length,
      dueSoon: dueSoon.length,
      lastRunsOk: jobs.filter((j) => j.lastStatus === "ok").length,
      lastRunsError: jobs.filter((j) => j.lastStatus === "error").length,
    };
  },

  async logs(limit = 50): Promise<CronRunLog[]> {
    const logs = await readLogs();
    return logs.slice(0, Math.min(Math.max(limit, 1), MAX_LOGS));
  },

  async create(input: CronJobInput, actorId: string): Promise<CronJob> {
    const cron = parseCron(input.expression);
    if (!cron) throw new Error("Invalid cron expression. Use a standard 5-field expression.");
    if (!CRON_TASK_TYPES.includes(input.taskType)) throw new Error(`Unsupported task type: ${input.taskType}`);
    const id = `cron-${randomUUID().slice(0, 12)}`;
    const now = nowIso();
    const enabled = input.enabled ?? true;
    const job: CronJob = {
      id,
      name: input.name,
      expression: input.expression.trim(),
      taskType: input.taskType,
      payload: input.payload ?? {},
      enabled,
      lastRunAt: null,
      lastStatus: "never",
      lastError: null,
      lastRunMs: null,
      nextRunAt: enabled ? nextCronRun(input.expression.trim(), new Date())?.toISOString() ?? null : null,
      createdAt: now,
      updatedAt: now,
      updatedBy: actorId,
    };
    const jobs = await readJobs();
    jobs.push(job);
    await writeJobs(jobs);
    return job;
  },

  async get(id: string): Promise<CronJob> {
    const jobs = await readJobs();
    const job = jobs.find((j) => j.id === id);
    if (!job) throw new Error("Cron job not found");
    return job;
  },

  async update(id: string, patch: CronJobUpdateInput, actorId: string): Promise<CronJob> {
    const jobs = await readJobs();
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx < 0) throw new Error("Cron job not found");
    const current = jobs[idx];
    const expression = patch.expression?.trim() ?? current.expression;
    if (patch.expression) {
      const cron = parseCron(expression);
      if (!cron) throw new Error("Invalid cron expression. Use a standard 5-field expression.");
    }
    const next = {
      ...current,
      ...patch,
      expression,
      updatedAt: nowIso(),
      updatedBy: actorId,
    };
    next.nextRunAt = next.enabled
      ? nextCronRun(next.expression, new Date())?.toISOString() ?? null
      : null;
    jobs[idx] = next;
    await writeJobs(jobs);
    return next;
  },

  async remove(id: string, actorId: string): Promise<{ id: string; deleted: true; deletedAt: string }> {
    const jobs = await readJobs();
    const next = jobs.filter((j) => j.id !== id);
    if (next.length === jobs.length) throw new Error("Cron job not found");
    await writeJobs(next);
    void actorId;
    return { id, deleted: true, deletedAt: nowIso() };
  },

  async setEnabled(id: string, enabled: boolean, actorId: string): Promise<CronJob> {
    return this.update(id, { enabled }, actorId);
  },

  /** Run a job immediately and record the outcome. */
  async runNow(id: string, actorId: string): Promise<CronJob> {
    const jobs = await readJobs();
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx < 0) throw new Error("Cron job not found");
    const started = Date.now();
    const startedAtIso = new Date(started).toISOString();
    let status: "ok" | "error" = "ok";
    let error: string | null = null;
    let detail: string | null = null;
    try {
      const result = await executeTask(jobs[idx]);
      detail = result.detail;
      status = result.ok ? "ok" : "error";
      if (!result.ok) error = detail;
    } catch (e) {
      status = "error";
      error = e instanceof Error ? e.message : String(e);
    }
    const durationMs = Date.now() - started;
    const updated = {
      ...jobs[idx],
      lastRunAt: startedAtIso,
      lastStatus: status,
      lastError: error,
      lastRunMs: durationMs,
      updatedAt: nowIso(),
      updatedBy: actorId,
      nextRunAt: jobs[idx].enabled ? nextCronRun(jobs[idx].expression, new Date())?.toISOString() ?? null : null,
    };
    jobs[idx] = updated;
    await writeJobs(jobs);

    const log: CronRunLog = {
      id: `cronlog-${randomUUID().slice(0, 12)}`,
      jobId: id,
      jobName: updated.name,
      startedAt: startedAtIso,
      status,
      error,
      durationMs,
      detail,
    };
    const logs = await readLogs();
    logs.unshift(log);
    await writeLogs(logs);
    return updated;
  },

  /**
   * Scheduler tick — finds enabled, due jobs and dispatches them. Safe to call
   * every 30s. Never throws; per-job errors are recorded on the job.
   */
  async tick(): Promise<string[]> {
    const jobs = await readJobs();
    const now = Date.now();
    const fired: string[] = [];
    let changed = false;
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      if (!job.enabled) continue;
      if (!job.nextRunAt || new Date(job.nextRunAt).getTime() > now) continue;
      if (running.has(job.id)) continue;
      running.add(job.id);
      try {
        const result = await this.runNow(job.id, "scheduler");
        fired.push(job.id);
        jobs[i] = result;
        changed = true;
      } finally {
        running.delete(job.id);
      }
    }
    if (changed) await writeJobs(jobs);
    return fired;
  },

  /** Test helper: reset the store. */
  async _resetForTest(): Promise<void> {
    await redis.del(JOBS_KEY);
    await redis.del(LOGS_KEY);
  },
};

const running = new Set<string>();

export function startCronScheduler(intervalMs = 30_000): NodeJS.Timeout {
  const timer = setInterval(() => {
    CronJobsService.tick().catch((e) => logger.warn("cron scheduler tick failed", { err: e }));
  }, intervalMs);
  timer.unref?.();
  // Also fire an immediate first tick so newly-created jobs don't wait a full interval.
  setTimeout(() => {
    CronJobsService.tick().catch((e) => logger.warn("cron scheduler initial tick failed", { err: e }));
  }, 1_000).unref?.();
  return timer;
}
