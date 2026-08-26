/**
 * Session 118 — Operational-excellence assurance tests.
 *
 * Runs fully in-memory: FakeKv stands in for Redis and FakePrisma for the
 * `AiRequest` and `Task` tables. Everything is exercised through the real
 * services, including Session 73's `OpexService`, so a drift between the two
 * breaks the suite rather than quietly producing an empty register.
 *
 * The properties pinned here are the ones this module's honesty depends on:
 *
 *   - a finding survives a concurrent file, which the single-blob register
 *     could not guarantee;
 *   - "resolved in the last 24 hours" is computed from the *resolution* time,
 *     not the filing time, and the two disagree in both directions;
 *   - a rate is floored, so 999 successes out of 1 000 never reports 100;
 *   - an unassessed dimension is `null`, never `0` — and for a risk dimension
 *     that distinction is the difference between "unknown" and "none";
 *   - no composite trust score is published at all;
 *   - a Session 73 record adopted into the durable store keeps `null`
 *     transition times rather than being given invented ones;
 *   - organization isolation for every stored artefact.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));

const { OpexAssuranceService: Opex, toLegacyAlert } = await import("./opexAssurance.service.js");
const { OpexService } = await import("./opex.service.js");
const shared = await import("@windels/shared/opex");

const ORG = "org-alpha";
const OTHER = "org-beta";
const ADMIN = "user-admin";

function resetAll() {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
  db.reset?.();
}

/** Record an AiRequest row the reliability reader will see. */
async function seedRequest(
  organizationId: string,
  opts: {
    status?: string;
    durationMs?: number;
    provider?: string;
    modelId?: string;
    channel?: string;
    ageMs?: number;
  } = {},
) {
  return db.client().aiRequest.create({
    data: {
      organizationId,
      channel: opts.channel ?? "chat",
      provider: opts.provider ?? "openai",
      modelId: opts.modelId ?? "gpt-4o",
      durationMs: opts.durationMs ?? 100,
      status: opts.status ?? "succeeded",
      createdAt: new Date(Date.now() - (opts.ageMs ?? 1000)),
    },
  });
}

async function file(
  organizationId: string,
  over: Partial<{ severity: "info" | "warning" | "critical"; category: string; message: string }> = {},
) {
  return Opex.fileAlert(organizationId, ADMIN, {
    category: over.category ?? "drift",
    severity: over.severity ?? "warning",
    source: "monitor",
    message: over.message ?? "model drift observed",
  });
}

/** Backdate a stored finding so ageing and windows can be exercised. */
async function backdate(
  organizationId: string,
  alertId: string,
  patch: Record<string, unknown>,
) {
  const raw = await kv.get(`opx:alert:${organizationId}:${alertId}`);
  const record = JSON.parse(raw!);
  await kv.set(`opx:alert:${organizationId}:${alertId}`, JSON.stringify({ ...record, ...patch }));
}

beforeEach(() => {
  resetAll();
});

/* ═══ The register actually stores findings ═══════════════════════════════ */

describe("safety register durability", () => {
  it("stores a filed finding under its own key and returns it on a separate read", async () => {
    const filed = await file(ORG, { message: "prompt injection attempt" });
    const read = await Opex.getAlert(ORG, filed.id);
    expect(read.id).toBe(filed.id);
    expect(read.message).toBe("prompt injection attempt");
    expect(read.status).toBe("open");
    expect(read.organizationId).toBe(ORG);
  });

  it("keeps every finding when several are filed concurrently", async () => {
    // The Session 73 register was one JSON array in one Redis string, written
    // back wholesale on every file. Concurrent writers overwrote each other.
    const filed = await Promise.all(
      Array.from({ length: 12 }, (_, i) => file(ORG, { message: `finding ${i}` })),
    );
    const page = await Opex.listAlerts(ORG, { limit: 200 });
    expect(page.total).toBe(12);
    const ids = new Set(page.alerts.map((a) => a.id));
    for (const f of filed) expect(ids.has(f.id)).toBe(true);
  });

  it("keeps every status change when several findings are transitioned concurrently", async () => {
    const filed = await Promise.all(Array.from({ length: 8 }, () => file(ORG)));
    await Promise.all(filed.map((f) => Opex.transitionAlert(ORG, f.id, ADMIN, "resolved")));
    const page = await Opex.listAlerts(ORG, { limit: 200 });
    expect(page.alerts.every((a) => a.status === "resolved")).toBe(true);
  });

  it("records a filing time and an initial transition", async () => {
    const filed = await file(ORG);
    expect(Date.parse(filed.filedAt)).toBeGreaterThan(0);
    expect(filed.transitions).toHaveLength(1);
    expect(filed.transitions[0]!.from).toBeNull();
    expect(filed.transitions[0]!.to).toBe("open");
  });

  it("trims the index to the organization's retention limit", async () => {
    await Opex.updatePolicy(ORG, ADMIN, { registerRetention: 10 });
    for (let i = 0; i < 14; i++) await file(ORG, { message: `f${i}` });
    const page = await Opex.listAlerts(ORG, { limit: 200 });
    expect(page.total).toBe(10);
    expect(page.alerts[0]!.message).toBe("f13");
  });
});

/* ═══ Transition times — the metric that was computed from the wrong field ═ */

describe("transition timestamps", () => {
  it("records when a finding was acknowledged and by whom", async () => {
    const filed = await file(ORG);
    const acked = await Opex.transitionAlert(ORG, filed.id, "user-ops", "acknowledged");
    expect(acked.status).toBe("acknowledged");
    expect(acked.acknowledgedBy).toBe("user-ops");
    expect(Date.parse(acked.acknowledgedAt!)).toBeGreaterThan(0);
    expect(acked.resolvedAt).toBeNull();
  });

  it("records the resolution time in its own field, independent of the filing time", async () => {
    const filed = await file(ORG);
    // Backdate the filing so the two fields cannot coincide by being written in
    // the same millisecond — the property under test is that they are separate
    // fields, not that the clock happened to tick between two writes.
    const filedAt = new Date(Date.now() - 6 * 86_400_000).toISOString();
    await backdate(ORG, filed.id, { filedAt });

    const resolved = await Opex.transitionAlert(ORG, filed.id, ADMIN, "resolved");
    expect(resolved.filedAt).toBe(filedAt);
    expect(resolved.resolvedAt).not.toBeNull();
    expect(Date.parse(resolved.resolvedAt!)).toBeGreaterThan(Date.parse(resolved.filedAt));
    // Session 73 had no resolvedAt at all, so this difference was unknowable.
    expect(shared.opexHoursBetween(resolved.filedAt, resolved.resolvedAt)).toBeGreaterThan(140);
  });

  it("counts a finding filed long ago but resolved just now — Session 73 did not", async () => {
    const filed = await file(ORG);
    // Filed nine days ago, resolved a moment ago.
    await backdate(ORG, filed.id, { filedAt: new Date(Date.now() - 9 * 86_400_000).toISOString() });
    await Opex.transitionAlert(ORG, filed.id, ADMIN, "resolved");

    const summary = await Opex.registerSummary(ORG);
    expect(summary.resolvedLast24h).toBe(1);

    // The old filter — resolved AND filed within 24h — would have missed it.
    const legacyStyle = (await Opex.listAlerts(ORG, { limit: 50 })).alerts.filter(
      (a) => a.status === "resolved" && Date.parse(a.filedAt) >= Date.now() - 86_400_000,
    ).length;
    expect(legacyStyle).toBe(0);
  });

  it("does not count a finding filed recently but resolved days ago — Session 73 did", async () => {
    const filed = await file(ORG);
    await Opex.transitionAlert(ORG, filed.id, ADMIN, "resolved");
    await backdate(ORG, filed.id, {
      resolvedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    });

    const summary = await Opex.registerSummary(ORG);
    expect(summary.resolvedLast24h).toBe(0);

    // The old filter would have counted it: it was filed inside the window.
    const legacyStyle = (await Opex.listAlerts(ORG, { limit: 50 })).alerts.filter(
      (a) => a.status === "resolved" && Date.parse(a.filedAt) >= Date.now() - 86_400_000,
    ).length;
    expect(legacyStyle).toBe(1);
  });

  it("refuses a second transition to the same status", async () => {
    const filed = await file(ORG);
    await Opex.transitionAlert(ORG, filed.id, ADMIN, "acknowledged");
    await expect(Opex.transitionAlert(ORG, filed.id, ADMIN, "acknowledged")).rejects.toThrow(
      /already acknowledged/i,
    );
  });

  it("refuses a transition on a resolved finding and points at the reopen path", async () => {
    const filed = await file(ORG);
    await Opex.transitionAlert(ORG, filed.id, ADMIN, "resolved");
    await expect(Opex.transitionAlert(ORG, filed.id, ADMIN, "acknowledged")).rejects.toThrow(
      /reopen/i,
    );
  });
});

/* ═══ Reopening — impossible before this session ══════════════════════════ */

describe("reopening", () => {
  it("reopens a resolved finding and keeps the resolution it undoes", async () => {
    const filed = await file(ORG);
    const resolved = await Opex.transitionAlert(ORG, filed.id, ADMIN, "resolved");
    const reopened = await Opex.reopenAlert(ORG, filed.id, "user-ops", "resolved by mistake");

    expect(reopened.status).toBe("open");
    expect(reopened.reopenCount).toBe(1);
    // The resolution stays visible: reopening adds history, it does not erase it.
    expect(reopened.resolvedAt).toBe(resolved.resolvedAt);
    expect(reopened.resolvedBy).toBe(ADMIN);
    const kinds = reopened.transitions.map((t) => `${t.from ?? "-"}>${t.to}`);
    expect(kinds).toEqual(["->open", "open>resolved", "resolved>open"]);
  });

  it("refuses to reopen a finding that is not resolved", async () => {
    const filed = await file(ORG);
    await expect(Opex.reopenAlert(ORG, filed.id, ADMIN, "not resolved yet")).rejects.toThrow(
      /only a resolved finding/i,
    );
  });

  it("records the reopen reason and the reopen in the ledger", async () => {
    const filed = await file(ORG);
    await Opex.transitionAlert(ORG, filed.id, ADMIN, "resolved");
    await Opex.reopenAlert(ORG, filed.id, ADMIN, "the mitigation regressed");
    const page = await Opex.listEvents(ORG, { kind: "alert_reopened" });
    expect(page.events).toHaveLength(1);
    expect(page.events[0]!.alertId).toBe(filed.id);
    const record = await Opex.getAlert(ORG, filed.id);
    expect(record.note).toBe("the mitigation regressed");
  });

  it("lets a reopened finding be resolved again, and counts the reopen", async () => {
    const filed = await file(ORG);
    await Opex.transitionAlert(ORG, filed.id, ADMIN, "resolved");
    await Opex.reopenAlert(ORG, filed.id, ADMIN, "regressed after a week");
    const again = await Opex.transitionAlert(ORG, filed.id, ADMIN, "resolved");
    expect(again.status).toBe("resolved");
    expect(again.reopenCount).toBe(1);
  });
});

/* ═══ Adoption of the Session 73 register ═════════════════════════════════ */

describe("Session 73 register adoption", () => {
  it("adopts findings from the old blob rather than losing them", async () => {
    await kv.set(
      `opex:${ORG}:safety-alerts`,
      JSON.stringify([
        { id: "safety-old-1", category: "bias", severity: "warning", source: "audit", message: "old one", at: new Date(Date.now() - 3 * 86_400_000).toISOString(), status: "open" },
        { id: "safety-old-2", category: "pii", severity: "critical", source: "audit", message: "old two", at: new Date(Date.now() - 2 * 86_400_000).toISOString(), status: "resolved", resolvedBy: "user-x" },
      ]),
    );
    const page = await Opex.listAlerts(ORG, { limit: 50 });
    expect(page.total).toBe(2);
    expect(page.alerts.map((a) => a.id).sort()).toEqual(["safety-old-1", "safety-old-2"]);
  });

  it("gives an adopted record null transition times rather than invented ones", async () => {
    await kv.set(
      `opex:${ORG}:safety-alerts`,
      JSON.stringify([
        { id: "safety-old-3", category: "drift", severity: "info", source: "audit", message: "resolved long ago", at: new Date(Date.now() - 10 * 86_400_000).toISOString(), status: "resolved", resolvedBy: "user-x" },
      ]),
    );
    const record = await Opex.getAlert(ORG, "safety-old-3");
    expect(record.importedFromLegacyRegister).toBe(true);
    expect(record.status).toBe("resolved");
    // It really was resolved by someone; when is genuinely unknown.
    expect(record.resolvedBy).toBe("user-x");
    expect(record.resolvedAt).toBeNull();
  });

  it("reports an adopted resolution as time-unknown instead of counting it either way", async () => {
    await kv.set(
      `opex:${ORG}:safety-alerts`,
      JSON.stringify([
        { id: "safety-old-4", category: "drift", severity: "info", source: "audit", message: "x", at: new Date().toISOString(), status: "resolved" },
      ]),
    );
    const summary = await Opex.registerSummary(ORG);
    expect(summary.resolvedTimeUnknown).toBe(1);
    expect(summary.resolvedLast24h).toBe(0);
    expect(summary.imported).toBe(1);
  });

  it("adopts only once, even across many reads", async () => {
    await kv.set(
      `opex:${ORG}:safety-alerts`,
      JSON.stringify([{ id: "safety-old-5", category: "c", severity: "info", source: "s", message: "m", at: new Date().toISOString(), status: "open" }]),
    );
    await Opex.listAlerts(ORG);
    await Opex.listAlerts(ORG);
    await Opex.registerSummary(ORG);
    const page = await Opex.listAlerts(ORG, { limit: 50 });
    expect(page.total).toBe(1);
    const events = await Opex.listEvents(ORG, { kind: "legacy_register_imported" });
    expect(events.events).toHaveLength(1);
  });

  it("excludes adopted records from every timing statistic, with the reason stated", async () => {
    await kv.set(
      `opex:${ORG}:safety-alerts`,
      JSON.stringify([
        { id: "safety-old-6", category: "c", severity: "info", source: "s", message: "m", at: new Date(Date.now() - 86_400_000).toISOString(), status: "resolved" },
      ]),
    );
    const timings = await Opex.timings(ORG);
    expect(timings.timeToResolveHours.sampleSize).toBe(0);
    expect(timings.timeToResolveHours.median).toBeNull();
    expect(timings.timeToResolveHours.excluded).toBe(1);
    expect(timings.timeToResolveHours.excludedReason).toMatch(/no recorded resolution time/i);
  });

  it("tolerates a corrupt legacy blob without losing the durable register", async () => {
    await file(ORG, { message: "durable one" });
    await kv.set(`opex:${ORG}:safety-alerts`, "{not json");
    const page = await Opex.listAlerts(ORG, { limit: 50 });
    expect(page.total).toBe(1);
    expect(page.alerts[0]!.message).toBe("durable one");
  });
});

/* ═══ Summary arithmetic ══════════════════════════════════════════════════ */

describe("register summary", () => {
  it("counts by status, severity and category without double counting", async () => {
    await file(ORG, { severity: "critical", category: "pii" });
    await file(ORG, { severity: "warning", category: "pii" });
    const third = await file(ORG, { severity: "info", category: "drift" });
    await Opex.transitionAlert(ORG, third.id, ADMIN, "resolved");

    const s = await Opex.registerSummary(ORG);
    expect(s.total).toBe(3);
    expect(s.byStatus.open).toBe(2);
    expect(s.byStatus.resolved).toBe(1);
    expect(s.bySeverity.critical).toBe(1);
    const sumCategories = s.byCategory.reduce((n, c) => n + c.total, 0);
    expect(sumCategories).toBe(s.total);
    expect(s.byCategory.find((c) => c.category === "pii")!.open).toBe(2);
  });

  it("reports a null closure rate when nothing has been filed, not zero", async () => {
    const s = await Opex.registerSummary(ORG);
    expect(s.total).toBe(0);
    expect(s.closureRatePercent).toBeNull();
    expect(s.closureNote).toMatch(/not a safety assessment/i);
  });

  it("floors the closure rate so a partly-closed register cannot report 100", async () => {
    for (let i = 0; i < 100; i++) await file(ORG, { message: `f${i}` });
    const page = await Opex.listAlerts(ORG, { limit: 200 });
    for (const a of page.alerts.slice(0, 99)) {
      await Opex.transitionAlert(ORG, a.id, ADMIN, "resolved");
    }
    const s = await Opex.registerSummary(ORG);
    expect(s.closureRatePercent).toBe(99);
  });

  it("buckets open findings by age and names the oldest", async () => {
    const recent = await file(ORG, { message: "recent" });
    const old = await file(ORG, { message: "old" });
    await backdate(ORG, old.id, { filedAt: new Date(Date.now() - 40 * 86_400_000).toISOString() });

    const s = await Opex.registerSummary(ORG);
    expect(s.ageing.under24h).toBe(1);
    expect(s.ageing.over30d).toBe(1);
    expect(s.oldestOpenAt).not.toBe(recent.filedAt);
    expect(s.oldestOpenAgeHours!).toBeGreaterThan(24 * 39);
  });

  it("counts a resolved finding out of the open ageing buckets", async () => {
    const a = await file(ORG);
    await Opex.transitionAlert(ORG, a.id, ADMIN, "resolved");
    const s = await Opex.registerSummary(ORG);
    expect(s.open).toBe(0);
    expect(s.ageing.under24h).toBe(0);
    expect(s.oldestOpenAt).toBeNull();
    expect(s.oldestOpenAgeHours).toBeNull();
  });

  it("treats an acknowledged finding as still open", async () => {
    const a = await file(ORG, { severity: "critical" });
    await Opex.transitionAlert(ORG, a.id, ADMIN, "acknowledged");
    const s = await Opex.registerSummary(ORG);
    expect(s.open).toBe(1);
    expect(s.openCritical).toBe(1);
    expect(s.byStatus.acknowledged).toBe(1);
  });
});

/* ═══ Timings ═════════════════════════════════════════════════════════════ */

describe("timings", () => {
  it("computes a median over records that carry both endpoints", async () => {
    for (const hours of [2, 4, 10]) {
      const a = await file(ORG, { message: `t${hours}` });
      await Opex.transitionAlert(ORG, a.id, ADMIN, "resolved");
      await backdate(ORG, a.id, {
        filedAt: new Date(Date.now() - hours * 3_600_000).toISOString(),
      });
    }
    const t = await Opex.timings(ORG);
    expect(t.timeToResolveHours.sampleSize).toBe(3);
    expect(t.timeToResolveHours.median).toBeGreaterThanOrEqual(3.9);
    expect(t.timeToResolveHours.median).toBeLessThanOrEqual(4.1);
  });

  it("reports null rather than zero when nothing has been resolved", async () => {
    await file(ORG);
    const t = await Opex.timings(ORG);
    expect(t.timeToResolveHours.median).toBeNull();
    expect(t.timeToResolveHours.p90).toBeNull();
    expect(t.timeToResolveHours.sampleSize).toBe(0);
    expect(t.timeToResolveHours.excluded).toBe(1);
  });
});

/* ═══ Breaches against the organization's own expectations ════════════════ */

describe("expectation breaches", () => {
  it("reports a critical finding older than the acknowledgement expectation", async () => {
    const a = await file(ORG, { severity: "critical" });
    await backdate(ORG, a.id, { filedAt: new Date(Date.now() - 10 * 3_600_000).toISOString() });
    const report = await Opex.breaches(ORG);
    expect(report.counts.acknowledgement_overdue).toBe(1);
    expect(report.breaches[0]!.expectationHours).toBe(4);
    expect(report.note).toMatch(/advisory/i);
  });

  it("does not report a non-critical finding, whatever its age", async () => {
    const a = await file(ORG, { severity: "warning" });
    await backdate(ORG, a.id, { filedAt: new Date(Date.now() - 400 * 3_600_000).toISOString() });
    const report = await Opex.breaches(ORG);
    expect(report.breaches).toHaveLength(0);
  });

  it("excludes adopted records, because their filing time is all that survived", async () => {
    await kv.set(
      `opex:${ORG}:safety-alerts`,
      JSON.stringify([
        { id: "safety-old-7", category: "c", severity: "critical", source: "s", message: "m", at: new Date(Date.now() - 200 * 3_600_000).toISOString(), status: "open" },
      ]),
    );
    const report = await Opex.breaches(ORG);
    expect(report.breaches).toHaveLength(0);
    expect(report.excludedImported).toBe(1);
  });

  it("stops reporting a breach once the finding is resolved", async () => {
    const a = await file(ORG, { severity: "critical" });
    await backdate(ORG, a.id, { filedAt: new Date(Date.now() - 200 * 3_600_000).toISOString() });
    expect((await Opex.breaches(ORG)).breaches.length).toBeGreaterThan(0);
    await Opex.transitionAlert(ORG, a.id, ADMIN, "resolved");
    expect((await Opex.breaches(ORG)).breaches).toHaveLength(0);
  });
});

/* ═══ Reliability — the rounding defect ═══════════════════════════════════ */

describe("reliability", () => {
  it("floors the success rate: 999 of 1000 is 99, never 100", async () => {
    expect(shared.opexRatePercent(999, 1000)).toBe(99);
    for (let i = 0; i < 199; i++) await seedRequest(ORG);
    await seedRequest(ORG, { status: "failed" });
    const r = await Opex.reliability(ORG);
    expect(r.total).toBe(200);
    expect(r.failed).toBe(1);
    // Math.round would have produced 100 here.
    expect(r.successRatePercent).toBe(99);
  });

  it("reports null, not zero, when the window holds no requests", async () => {
    const r = await Opex.reliability(ORG);
    expect(r.total).toBe(0);
    expect(r.successRatePercent).toBeNull();
    expect(r.dataFreshnessHours).toBeNull();
    expect(r.lastRequestAt).toBeNull();
    expect(r.note).toMatch(/no evidence of reliability is not evidence of reliability/i);
  });

  it("reports freshness in hours from the most recent recorded request", async () => {
    await seedRequest(ORG, { ageMs: 5 * 3_600_000 });
    const r = await Opex.reliability(ORG);
    expect(r.dataFreshnessHours).toBeGreaterThanOrEqual(4.9);
    expect(r.dataFreshnessHours).toBeLessThanOrEqual(5.1);
    expect(r.freshnessNote).toMatch(/perfectly fresh/i);
  });

  it("computes latency percentiles from recorded durations", async () => {
    for (const ms of [10, 20, 30, 40, 1000]) await seedRequest(ORG, { durationMs: ms });
    const r = await Opex.reliability(ORG);
    expect(r.latency.sampleSize).toBe(5);
    expect(r.latency.p50Ms).toBe(30);
    expect(r.latency.p95Ms).toBe(1000);
  });

  it("honours a caller-supplied window and excludes older traffic", async () => {
    await seedRequest(ORG, { ageMs: 10 * 86_400_000 });
    await seedRequest(ORG, { ageMs: 1000 });
    expect((await Opex.reliability(ORG, 30)).total).toBe(2);
    expect((await Opex.reliability(ORG, 2)).total).toBe(1);
  });

  it("breaks failures down by provider, model and channel", async () => {
    await seedRequest(ORG, { provider: "openai", status: "succeeded" });
    await seedRequest(ORG, { provider: "openai", status: "failed" });
    await seedRequest(ORG, { provider: "anthropic", status: "succeeded" });
    const b = await Opex.failureBreakdown(ORG);
    const openai = b.byProvider.find((g) => g.key === "openai")!;
    expect(openai.total).toBe(2);
    expect(openai.failed).toBe(1);
    expect(openai.failureRatePercent).toBe(50);
    expect(b.byProvider.find((g) => g.key === "anthropic")!.failureRatePercent).toBe(0);
  });

  it("reports a group with no failures as 0%, which is a measurement, not an absence", async () => {
    await seedRequest(ORG, { provider: "ollama" });
    const b = await Opex.failureBreakdown(ORG);
    // A denominator exists here, so 0 is a real rate — unlike the trust
    // dimensions, where 0 would be standing in for "never assessed".
    expect(b.byProvider.find((g) => g.key === "ollama")!.failureRatePercent).toBe(0);
  });
});

/* ═══ Assessments — the null-versus-zero rule ═════════════════════════════ */

describe("operator assessments", () => {
  it("reports every assessable dimension as not-assessed to begin with", async () => {
    const reg = await Opex.listAssessments(ORG);
    expect(reg.assessed).toBe(0);
    expect(reg.notAssessed).toEqual([...shared.OPEX_ASSESSED_DIMENSIONS]);
  });

  it("reports an unassessed dimension as null, never 0", async () => {
    const report = await Opex.trustReport(ORG);
    const alignment = report.measures.find((m) => m.key === "alignment")!;
    expect(alignment.value).toBeNull();
    expect(alignment.basis).toBe("not_assessed");
    expect(alignment.sampleSize).toBe(0);
  });

  it("reports an unassessed RISK dimension as null, because 0 would read as no risk", async () => {
    const report = await Opex.trustReport(ORG);
    const risk = report.measures.find((m) => m.key === "hallucination_risk")!;
    expect(risk.value).toBeNull();
    expect(risk.direction).toBe("lower_is_better");
    expect(risk.detail).toMatch(/best possible result/i);
  });

  it("records an assessment with its method and author, and then reports the score", async () => {
    await Opex.recordAssessment(ORG, "alignment", ADMIN, {
      score: 82,
      method: "red-team exercise against the published prompt suite",
    });
    const report = await Opex.trustReport(ORG);
    const alignment = report.measures.find((m) => m.key === "alignment")!;
    expect(alignment.value).toBe(82);
    expect(alignment.basis).toBe("operator_assessed");
    expect(alignment.detail).toContain("red-team exercise");
    expect(alignment.detail).toContain(ADMIN);
  });

  it("marks an assessment stale once it passes its validity window", async () => {
    await Opex.recordAssessment(ORG, "compliance", ADMIN, {
      score: 70,
      method: "external audit against the control set",
    });
    await kv.set(
      `opx:assess:${ORG}:compliance`,
      JSON.stringify({
        ...JSON.parse((await kv.get(`opx:assess:${ORG}:compliance`))!),
        assessedAt: new Date(Date.now() - 400 * 86_400_000).toISOString(),
      }),
    );
    const reg = await Opex.listAssessments(ORG);
    expect(reg.stale).toBe(1);
    const report = await Opex.trustReport(ORG);
    const compliance = report.measures.find((m) => m.key === "compliance")!;
    // A stale assessment still reports its number, flagged — it is not silently
    // dropped, and it is not silently trusted.
    expect(compliance.value).toBe(70);
    expect(compliance.stale).toBe(true);
    expect(compliance.detail).toMatch(/passed its validity window/i);
  });

  it("never expires an assessment when the policy disables validity", async () => {
    await Opex.updatePolicy(ORG, ADMIN, { assessmentValidityDays: null });
    await Opex.recordAssessment(ORG, "transparency", ADMIN, {
      score: 55,
      method: "documented model card review",
    });
    await kv.set(
      `opx:assess:${ORG}:transparency`,
      JSON.stringify({
        ...JSON.parse((await kv.get(`opx:assess:${ORG}:transparency`))!),
        assessedAt: new Date(Date.now() - 5000 * 86_400_000).toISOString(),
      }),
    );
    const reg = await Opex.listAssessments(ORG);
    expect(reg.stale).toBe(0);
    expect(reg.assessments[0]!.expiresAt).toBeNull();
  });

  it("returns a cleared dimension to not-assessed rather than to zero", async () => {
    await Opex.recordAssessment(ORG, "safety", ADMIN, {
      score: 91,
      method: "benchmark suite executed against the deployed models",
    });
    const cleared = await Opex.clearAssessment(ORG, "safety", ADMIN);
    expect(cleared.cleared).toBe(true);
    const report = await Opex.trustReport(ORG);
    const safety = report.measures.find((m) => m.key === "safety")!;
    expect(safety.value).toBeNull();
    expect(safety.basis).toBe("not_assessed");
  });

  it("says so honestly when there was nothing to clear", async () => {
    const cleared = await Opex.clearAssessment(ORG, "evidence_quality", ADMIN);
    expect(cleared.cleared).toBe(false);
    expect(cleared.note).toMatch(/no assessment to clear/i);
  });
});

/* ═══ Trust report ════════════════════════════════════════════════════════ */

describe("trust report", () => {
  it("publishes no composite score at all", async () => {
    const report = await Opex.trustReport(ORG);
    expect(report.compositeScore).toBeNull();
    expect(report.compositeNote).toMatch(/cannot be attributed to anything/i);
  });

  it("counts observed, assessed and not-assessed measures and they sum to the total", async () => {
    await seedRequest(ORG);
    await Opex.recordAssessment(ORG, "alignment", ADMIN, {
      score: 60,
      method: "structured internal review of refusal behaviour",
    });
    const report = await Opex.trustReport(ORG);
    expect(report.observed + report.assessed + report.notAssessed).toBe(report.measures.length);
    expect(report.assessed).toBe(1);
  });

  it("does not report one signal under three names", async () => {
    await seedRequest(ORG);
    const report = await Opex.trustReport(ORG);
    const keys = report.measures.map((m) => m.key);
    // Session 73 published trust, reliability and operationalStability as three
    // dimensions holding the same number.
    expect(keys.filter((k) => k === "reliability")).toHaveLength(1);
    expect(keys).not.toContain("operationalStability");
    expect(keys).not.toContain("trust");
  });

  it("labels the task ratio as a closure rate, not a human approval rate", async () => {
    const report = await Opex.trustReport(ORG);
    const task = report.measures.find((m) => m.key === "task_closure")!;
    expect(task.label).toMatch(/task closure/i);
    expect(task.detail).toMatch(/no approval workflow feeds it/i);
  });

  it("uses one window on both sides of the task ratio", async () => {
    const org = "org-tasks";
    await db.client().task.create({
      data: { organizationId: org, title: "done recently", status: "DONE", updatedAt: new Date() },
    });
    await db.client().task.create({
      data: {
        organizationId: org,
        title: "open but ancient",
        status: "TODO",
        updatedAt: new Date(Date.now() - 400 * 86_400_000),
      },
    });
    const closure = await Opex.taskClosure(org, 30);
    // Session 73 counted the ancient TODO in the denominator against a 30-day
    // numerator, so this organization scored 50%. Both sides now use 30 days.
    expect(closure.done).toBe(1);
    expect(closure.openInWindow).toBe(0);
    expect(closure.ratePercent).toBe(100);
  });
});

/* ═══ Policy ══════════════════════════════════════════════════════════════ */

describe("policy", () => {
  it("reports platform defaults as defaults", async () => {
    const p = await Opex.getPolicy(ORG);
    expect(p.isDefault).toBe(true);
    expect(p.reliabilityWindowDays).toBe(30);
    expect(p.criticalAckHours).toBe(4);
    expect(p.note).toMatch(/advisory/i);
  });

  it("stores an update and stops calling it a default", async () => {
    await Opex.updatePolicy(ORG, ADMIN, { criticalAckHours: 2 });
    const p = await Opex.getPolicy(ORG);
    expect(p.isDefault).toBe(false);
    expect(p.criticalAckHours).toBe(2);
    expect(p.updatedBy).toBe(ADMIN);
  });

  it("refuses a resolution expectation earlier than the acknowledgement expectation", async () => {
    await expect(
      Opex.updatePolicy(ORG, ADMIN, { criticalAckHours: 48, criticalResolveHours: 12 }),
    ).rejects.toThrow(/every breach of one would be a breach of the other/i);
  });

  it("keeps two organizations' policies apart", async () => {
    await Opex.updatePolicy(ORG, ADMIN, { criticalAckHours: 1 });
    expect((await Opex.getPolicy(OTHER)).criticalAckHours).toBe(4);
    expect((await Opex.getPolicy(OTHER)).isDefault).toBe(true);
  });
});

/* ═══ Isolation ═══════════════════════════════════════════════════════════ */

describe("organization isolation", () => {
  it("never returns another organization's finding", async () => {
    const mine = await file(ORG, { message: "mine" });
    await file(OTHER, { message: "theirs" });
    expect((await Opex.listAlerts(ORG, { limit: 50 })).total).toBe(1);
    expect((await Opex.listAlerts(OTHER, { limit: 50 })).total).toBe(1);
    await expect(Opex.getAlert(OTHER, mine.id)).rejects.toThrow(/not found/i);
  });

  it("skips a record whose stored organization does not match its key", async () => {
    const mine = await file(ORG, { message: "mine" });
    const raw = JSON.parse((await kv.get(`opx:alert:${ORG}:${mine.id}`))!);
    await kv.set(
      `opx:alert:${ORG}:${mine.id}`,
      JSON.stringify({ ...raw, organizationId: "org-forged" }),
    );
    expect(await Opex.readAlert(ORG, mine.id)).toBeNull();
    expect((await Opex.listAlerts(ORG, { limit: 50 })).total).toBe(0);
  });

  it("keeps assessments and ledgers apart", async () => {
    await Opex.recordAssessment(ORG, "alignment", ADMIN, {
      score: 40,
      method: "internal alignment review with documented cases",
    });
    expect((await Opex.listAssessments(OTHER)).assessed).toBe(0);
    expect((await Opex.listEvents(OTHER)).events).toHaveLength(0);
    expect((await Opex.listEvents(ORG)).events.length).toBeGreaterThan(0);
  });

  it("puts the organization id straight after the prefix on every key it writes", async () => {
    await file(ORG);
    await Opex.recordAssessment(ORG, "safety", ADMIN, {
      score: 10,
      method: "documented benchmark run over the deployed suite",
    });
    await Opex.updatePolicy(ORG, ADMIN, { criticalAckHours: 3 });

    const keys = [...kv.strings.keys(), ...kv.lists.keys()].filter((k) => k.startsWith("opx:"));
    // Guard: the assertion below is worthless if nothing was written.
    expect(keys.length).toBeGreaterThan(3);
    for (const key of keys) {
      const parts = key.split(":");
      // opx:<section>:<org>[:<id>]
      expect(parts[2]).toBe(ORG);
    }
  });
});

/* ═══ Configuration, gaps and the ledger ══════════════════════════════════ */

describe("configuration and gaps", () => {
  it("names every unimplemented rollup section rather than letting its zero pass as data", async () => {
    const cfg = Opex.configuration();
    expect(cfg.unimplementedSections.length).toBeGreaterThan(0);
    for (const section of shared.OPEX_UNIMPLEMENTED_SECTIONS) {
      expect(cfg.unimplementedSections).toContain(section);
    }
    expect(cfg.note).toMatch(/implemented and reachable, not audited or certified/i);
  });

  it("does not round a warning up to a pass or down to a failure", async () => {
    const cfg = Opex.configuration();
    expect(cfg.checks.some((c) => c.state === "warn")).toBe(true);
    expect(cfg.checks.some((c) => c.state === "fail")).toBe(false);
    expect(cfg.ready).toBe(true);
  });

  it("lists the unassessed dimensions and the empty traffic window as gaps", async () => {
    const gaps = await Opex.gaps(ORG);
    expect(gaps.gaps.some((g) => g.key === "dimensions_never_assessed")).toBe(true);
    expect(gaps.gaps.some((g) => g.key === "no_recorded_ai_traffic")).toBe(true);
    expect(gaps.counts.high + gaps.counts.medium + gaps.counts.low).toBe(gaps.gaps.length);
    expect(gaps.note).toMatch(/not read as a measurement/i);
  });

  it("raises an open critical finding as a high gap", async () => {
    await file(ORG, { severity: "critical" });
    const gaps = await Opex.gaps(ORG);
    expect(gaps.gaps.some((g) => g.key === "open_critical_findings" && g.severity === "high")).toBe(
      true,
    );
  });

  it("records filings, transitions and policy changes in the ledger", async () => {
    const a = await file(ORG);
    await Opex.transitionAlert(ORG, a.id, ADMIN, "resolved");
    await Opex.updatePolicy(ORG, ADMIN, { criticalAckHours: 6 });
    const page = await Opex.listEvents(ORG, { limit: 50 });
    const kinds = page.events.map((e) => e.kind);
    expect(kinds).toContain("alert_filed");
    expect(kinds).toContain("alert_resolved");
    expect(kinds).toContain("policy_updated");
    expect(page.note).toMatch(/recorded since it was introduced/i);
  });

  it("filters the ledger by finding without leaking another finding's events", async () => {
    const a = await file(ORG);
    const b = await file(ORG);
    await Opex.transitionAlert(ORG, b.id, ADMIN, "resolved");
    const page = await Opex.listEvents(ORG, { alertId: a.id });
    expect(page.events.every((e) => e.alertId === a.id)).toBe(true);
    expect(page.events.some((e) => e.kind === "alert_resolved")).toBe(false);
  });
});

/* ═══ The Session 73 surface still behaves ════════════════════════════════ */

describe("Session 73 compatibility", () => {
  it("keeps createAlert's return shape and files into the durable register", async () => {
    const created = await OpexService.createAlert(ORG, {
      category: "jailbreak",
      severity: "critical",
      source: "guardrail",
      message: "jailbreak attempt blocked",
    });
    expect(created).toMatchObject({
      category: "jailbreak",
      severity: "critical",
      source: "guardrail",
      status: "open",
    });
    expect(typeof created.at).toBe("string");
    // Same record, now readable through the durable store.
    const durable = await Opex.getAlert(ORG, created.id);
    expect(durable.filedAt).toBe(created.at);
  });

  it("keeps updateAlert's return shape and its conflict on an already-resolved record", async () => {
    const created = await OpexService.createAlert(ORG, {
      category: "bias",
      severity: "warning",
      source: "audit",
      message: "bias finding",
    });
    const resolved = await OpexService.updateAlert(ORG, created.id, ADMIN, "resolved", "fixed");
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedBy).toBe(ADMIN);
    expect(resolved.note).toBe("fixed");
    await expect(
      OpexService.updateAlert(ORG, created.id, ADMIN, "acknowledged"),
    ).rejects.toThrow(/already resolved/i);
  });

  it("never leaks the durable-only fields into the Session 73 shape", async () => {
    const record = await file(ORG);
    const legacy = toLegacyAlert(record);
    expect(Object.keys(legacy).sort()).toEqual(
      ["at", "category", "id", "message", "severity", "source", "status"].sort(),
    );
    expect("transitions" in legacy).toBe(false);
    expect("importedFromLegacyRegister" in legacy).toBe(false);
  });

  it("keeps the rollup's shape and fixes mitigations24h inside it", async () => {
    const a = await file(ORG);
    await backdate(ORG, a.id, { filedAt: new Date(Date.now() - 9 * 86_400_000).toISOString() });
    await Opex.transitionAlert(ORG, a.id, ADMIN, "resolved");

    const dash = await OpexService.dashboard(ORG);
    expect(dash.safety.mitigations24h).toBe(1);
    expect(dash.trust).toHaveProperty("hallucinationRisk");
    expect(Array.isArray(dash.recentAlerts)).toBe(true);
    expect(Array.isArray(dash.governance.gates)).toBe(true);
  });

  it("attaches provenance marking the structural zeros in the rollup", async () => {
    const dash = await OpexService.dashboard(ORG);
    const provenance = dash.provenance!;
    expect(provenance.structuralZeroFields).toBeGreaterThan(0);
    // `safety.benchmarks` remains a structural zero (explanations, playbooks,
    // regulations, governance.gates and collaborationSessionsActive are now
    // measured from real stores).
    const structural = provenance.entries.find((e) => e.field === "safety.benchmarks")!;
    expect(structural.basis).toBe("not_assessed");
    const safety = provenance.entries.find((e) => e.field === "trust.safety")!;
    expect(safety.detail).toMatch(/not a safety assessment/i);
    expect(provenance.note).toMatch(/shape is unchanged for existing consumers/i);
  });

  it("floors the rollup's reliability figure too", async () => {
    for (let i = 0; i < 199; i++) await seedRequest(ORG);
    await seedRequest(ORG, { status: "failed" });
    const dash = await OpexService.dashboard(ORG);
    expect(dash.trust.reliability).toBe(99);
    expect(dash.trust.trust).toBe(99);
  });
});

/* ═══ Shared helpers ══════════════════════════════════════════════════════ */

describe("shared helpers", () => {
  it("returns null rather than 0 for an empty denominator", () => {
    expect(shared.opexRatePercent(0, 0)).toBeNull();
    expect(shared.opexRatePercent(5, 0)).toBeNull();
    expect(shared.opexRatePercent(0, 10)).toBe(0);
  });

  it("never lets a rate exceed 100 or fall below 0", () => {
    expect(shared.opexRatePercent(15, 10)).toBe(100);
    expect(shared.opexRatePercent(-5, 10)).toBe(0);
  });

  it("returns null for an unparsable or reversed interval", () => {
    expect(shared.opexHoursBetween("nonsense", new Date().toISOString())).toBeNull();
    expect(shared.opexHoursBetween(null, null)).toBeNull();
    const later = new Date(Date.now() + 3_600_000).toISOString();
    expect(shared.opexHoursBetween(later, new Date().toISOString())).toBeNull();
  });

  it("computes nearest-rank percentiles and null on an empty sample", () => {
    expect(shared.opexPercentile([], 50)).toBeNull();
    expect(shared.opexPercentile([1, 2, 3, 4], 50)).toBe(2);
    expect(shared.opexPercentile([1, 2, 3, 4], 100)).toBe(4);
  });

  it("buckets ages at the boundaries it documents", () => {
    expect(shared.opexAgeingBucket(23.9)).toBe("under24h");
    expect(shared.opexAgeingBucket(24)).toBe("under7d");
    expect(shared.opexAgeingBucket(24 * 7)).toBe("under30d");
    expect(shared.opexAgeingBucket(24 * 30)).toBe("over30d");
  });

  it("builds a not-assessed measure with a null value, never a zero", () => {
    const m = shared.notAssessedMeasure("x", "X", "lower_is_better", "because");
    expect(m.value).toBeNull();
    expect(m.basis).toBe("not_assessed");
    expect(m.sampleSize).toBe(0);
    expect(m.asOf).toBeNull();
  });

  it("treats an unparsable assessment timestamp as stale rather than current", () => {
    expect(shared.opexAssessmentStale("not-a-date", 30, Date.now())).toBe(true);
    expect(shared.opexAssessmentStale("not-a-date", null, Date.now())).toBe(false);
  });
});
