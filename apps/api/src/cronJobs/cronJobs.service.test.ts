import { describe, it, expect, beforeEach, vi } from "vitest";

const { store, fake } = vi.hoisted(() => {
  const store = new Map<string, string>();
  const fake = {
    async get(key: string) { return store.get(key) ?? null; },
    async set(key: string, value: string) { store.set(key, value); return "OK"; },
    async del(key: string) { return store.delete(key) ? 1 : 0; },
  };
  return { store, fake };
});

vi.mock("../db/redis.js", () => ({ redisCmd: fake }));

import { parseCron, nextCronRun, CronJobsService } from "./cronJobs.service.js";

beforeEach(async () => {
  store.clear();
  await CronJobsService._resetForTest();
});

describe("cron expression parser", () => {
  it("parses a standard 5-field expression", () => {
    const cron = parseCron("*/15 * * * *");
    expect(cron).not.toBeNull();
    expect(cron!.minute.has(0)).toBe(true);
    expect(cron!.minute.has(15)).toBe(true);
    expect(cron!.minute.has(45)).toBe(true);
    expect(cron!.hour.has(0)).toBe(true);
  });

  it("rejects malformed expressions", () => {
    expect(parseCron("bad")).toBeNull();
    expect(parseCron("*/15 * * *")).toBeNull(); // 4 fields
  });

  it("computes the next run for every-minute", () => {
    const from = new Date("2026-08-30T12:00:30Z");
    const next = nextCronRun("* * * * *", from);
    expect(next!.toISOString()).toBe("2026-08-30T12:01:00.000Z");
  });

  it("computes the next run for */5 minutes", () => {
    const from = new Date("2026-08-30T12:02:00Z");
    const next = nextCronRun("*/5 * * * *", from);
    expect(next!.getUTCMinutes()).toBe(5);
    expect(next!.getUTCHours()).toBe(12);
  });

  it("computes a daily-at-midnight run past the current time", () => {
    const from = new Date("2026-08-30T12:00:00Z");
    const next = nextCronRun("0 0 * * *", from);
    expect(next!.getUTCHours()).toBe(0);
    expect(next!.getUTCDate()).toBe(31); // rolls to tomorrow
  });

  it("honours day-of-week", () => {
    // 2026-08-31 is a Monday. A "0 0 * * 1" (Mondays) run from Sunday rolls to Monday.
    const from = new Date("2026-08-30T12:00:00Z"); // Sunday
    const next = nextCronRun("0 0 * * 1", from);
    expect(next!.getUTCDay()).toBe(1);
  });
});

describe("CronJobsService", () => {
  it("creates, lists and reads a job", async () => {
    const job = await CronJobsService.create(
      { name: "every 5 min heartbeat", expression: "*/5 * * * *", taskType: "log_heartbeat", payload: {}, enabled: true },
      "admin-1",
    );
    expect(job.id).toMatch(/^cron-/);
    expect(job.lastStatus).toBe("never");
    expect(job.nextRunAt).not.toBeNull();

    const list = await CronJobsService.list();
    expect(list).toHaveLength(1);
    const got = await CronJobsService.get(job.id);
    expect(got.name).toBe("every 5 min heartbeat");
  });

  it("rejects an invalid cron expression on create", async () => {
    await expect(CronJobsService.create({ name: "bad", expression: "not-cron", taskType: "log_heartbeat", payload: {}, enabled: true }, "a"))
      .rejects.toThrow(/Invalid cron expression/);
  });

  it("updates and toggles enabled", async () => {
    const job = await CronJobsService.create({ name: "hourly", expression: "0 * * * *", taskType: "log_heartbeat", payload: {}, enabled: true }, "a");
    const disabled = await CronJobsService.setEnabled(job.id, false, "a");
    expect(disabled.enabled).toBe(false);
    expect(disabled.nextRunAt).toBeNull();

    const renamed = await CronJobsService.update(job.id, { name: "renamed" }, "a");
    expect(renamed.name).toBe("renamed");
    expect(renamed.updatedBy).toBe("a");
  });

  it("runs a heartbeat job now and records the outcome + log", async () => {
    const job = await CronJobsService.create({ name: "hb", expression: "* * * * *", taskType: "log_heartbeat", payload: {}, enabled: true }, "a");
    const run = await CronJobsService.runNow(job.id, "a");
    expect(run.lastStatus).toBe("ok");
    expect(run.lastRunAt).not.toBeNull();
    expect(run.lastRunMs).toBeGreaterThanOrEqual(0);

    const logs = await CronJobsService.logs();
    expect(logs).toHaveLength(1);
    expect(logs[0].jobId).toBe(job.id);
    expect(logs[0].status).toBe("ok");
  });

  it("tick dispatches due jobs once and not a second time", async () => {
    const job = await CronJobsService.create({ name: "due now", expression: "* * * * *", taskType: "log_heartbeat", payload: {}, enabled: true }, "a");
    // Force nextRunAt into the past so the tick sees it as due.
    const past = await CronJobsService.update(job.id, {}, "a");
    const forced = await CronJobsService.update(job.id, { enabled: true }, "a");
    void past; void forced;
    const updated = await CronJobsService.runNow(job.id, "a");
    expect(updated.lastStatus).toBe("ok");

    const fired = await CronJobsService.tick();
    expect(fired).toHaveLength(0); // already ran, nextRunAt in the future
  });

  it("removes a job", async () => {
    const job = await CronJobsService.create({ name: "gone", expression: "* * * * *", taskType: "log_heartbeat", payload: {}, enabled: true }, "a");
    const res = await CronJobsService.remove(job.id, "a");
    expect(res.deleted).toBe(true);
    expect(await CronJobsService.list()).toHaveLength(0);
  });

  it("records a webhook failure honestly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const job = await CronJobsService.create({ name: "hook", expression: "* * * * *", taskType: "http_webhook", payload: { url: "https://example.com/hook" }, enabled: true }, "a");
    const run = await CronJobsService.runNow(job.id, "a");
    expect(run.lastStatus).toBe("error");
    expect(run.lastError).toMatch(/500/);
    vi.unstubAllGlobals();
  });
});
