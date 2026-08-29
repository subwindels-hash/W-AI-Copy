/**
 * Session 123 — Usage Intelligence completion tests.
 *
 * The Session 55/rollups suite pins the counts. This suite pins what Session
 * 123 added or fixed, driving the real service against FakePrisma:
 *
 *   - **`deltaPct` was 0 without a prior baseline** (0 reads as "no change")
 *     and **the AI metrics' deltas were hardcoded 0/"flat"** because the
 *     prior AI window was never queried — both are now measured or `null`;
 *   - **empty denominators reported 0**: no AI requests → 0 ms latency
 *     (the *perfectly fast* reading) and 0 % error rate (the *no failures*
 *     reading); no runs → 0 % automation; no members → 0 % adoption. All
 *     are now `null`;
 *   - **per-module p95 latency / error rate / users were hardcoded 0** —
 *     now measured from the window's rows, `null` where a module has none;
 *   - **the 30-day series never carried tokens** (the field existed but the
 *     row fetch never selected token counts) and empty days reported
 *     `latencyMs: 0` — tokens are now real and empty days are `null`;
 *   - the rollup ships a `provenance` block naming the structural zeros.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const { UsageService } = await import("./usage.service.js");

const OID = "org-alpha";
const OTHER = "org-beta";

// Deterministic reference instant so the 30-day windows are stable.
const NOW = new Date("2026-08-06T12:00:00Z");
const daysAgo = (n: number, h = 12) => new Date(NOW.getTime() - n * 86_400_000 - h * 3_600_000);

function seedAiRequest(overrides: Record<string, unknown> = {}) {
  db.seed("AiRequest", [{
    id: cuid(),
    organizationId: OID,
    userId: "user-1",
    channel: "chat",
    provider: "openai",
    modelId: "gpt-4o",
    durationMs: 100,
    promptTokens: 10,
    completionTokens: 20,
    status: "succeeded",
    createdAt: daysAgo(1),
    ...overrides,
  }]);
}

beforeEach(() => {
  db.reset();
});

// ══════════════════════════════════════════════════════════════════════════
// Deltas: measured or null (the hardcoded-0 fixes)
// ══════════════════════════════════════════════════════════════════════════

describe("metric deltas (Session 123 fixes)", () => {
  it("FIXED: a delta without a prior-period baseline is null, never 0", async () => {
    seedAiRequest();
    const d = await UsageService.dashboard(OID, NOW);
    const conversations = d.metrics.find((m) => m.label === "Conversations (30d)")!;
    // Nothing in the prior 30-day window: no baseline.
    expect(conversations.deltaPct).toBeNull();
    expect(conversations.trend).toBeNull();
    // Point-in-time counts (members) have no baseline either.
    const members = d.metrics.find((m) => m.label === "Members")!;
    expect(members.deltaPct).toBeNull();
  });

  it("FIXED: AI metrics have real prior-window deltas instead of hardcoded 0/flat", async () => {
    // Current window: 2 requests. Prior window: 1 request.
    seedAiRequest({ createdAt: daysAgo(1) });
    seedAiRequest({ createdAt: daysAgo(2) });
    seedAiRequest({ createdAt: daysAgo(45) }); // prior window
    const d = await UsageService.dashboard(OID, NOW);
    const requests = d.metrics.find((m) => m.label === "AI requests (30d)")!;
    expect(requests.value).toBe(2);
    expect(requests.deltaPct).toBe(100); // (2-1)/1
    expect(requests.trend).toBe("up");
    const tokens = d.metrics.find((m) => m.label === "AI tokens (30d)")!;
    expect(tokens.value).toBe(60); // 2 x 30
    expect(tokens.deltaPct).toBe(100);
  });

  it("FIXED: AI latency and error-rate deltas are measured, and null without a prior window", async () => {
    // Current: 2 requests (100ms + 300ms, one failed). Prior: none.
    seedAiRequest({ createdAt: daysAgo(1), durationMs: 100 });
    seedAiRequest({ createdAt: daysAgo(2), durationMs: 300, status: "failed" });
    const d = await UsageService.dashboard(OID, NOW);
    const latency = d.metrics.find((m) => m.label === "Avg AI latency")!;
    expect(latency.value).toBe(200);
    expect(latency.deltaPct).toBeNull(); // no prior window
    const err = d.metrics.find((m) => m.label === "AI error rate")!;
    expect(err.value).toBe(50);
    expect(err.deltaPct).toBeNull();
  });

  it("computes a negative delta and trend correctly", async () => {
    seedAiRequest({ createdAt: daysAgo(1) });
    seedAiRequest({ createdAt: daysAgo(45) });
    seedAiRequest({ createdAt: daysAgo(46) });
    seedAiRequest({ createdAt: daysAgo(47) });
    const d = await UsageService.dashboard(OID, NOW);
    const requests = d.metrics.find((m) => m.label === "AI requests (30d)")!;
    expect(requests.value).toBe(1);
    expect(requests.deltaPct).toBe(-66.7); // (1-3)/3, 1dp
    expect(requests.trend).toBe("down");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Empty denominators: null, never 0
// ══════════════════════════════════════════════════════════════════════════

describe("empty denominators (Session 123 fixes)", () => {
  it("FIXED: no AI requests → latency null (0 ms read as 'perfectly fast')", async () => {
    const d = await UsageService.dashboard(OID, NOW);
    expect(d.metrics.find((m) => m.label === "Avg AI latency")!.value).toBeNull();
  });

  it("FIXED: no AI requests → error rate null (0 % read as 'no failures')", async () => {
    const d = await UsageService.dashboard(OID, NOW);
    expect(d.metrics.find((m) => m.label === "AI error rate")!.value).toBeNull();
  });

  it("FIXED: no members → adoption null (0 % read as 'nobody adopted it')", async () => {
    const d = await UsageService.dashboard(OID, NOW);
    expect(d.adoptionPct).toBeNull();
    expect(d.activeMembers30d).toBe(0);
  });

  it("FIXED: no workflow runs → automation null", async () => {
    const d = await UsageService.dashboard(OID, NOW);
    expect(d.automationRate).toBeNull();
  });

  it("adoption and automation are measured when data exists", async () => {
    db.seed("Membership", [
      { id: cuid(), userId: "user-1", organizationId: OID, workspaceId: "ws-a", joinedAt: new Date(1) },
      { id: cuid(), userId: "user-2", organizationId: OID, workspaceId: "ws-a", joinedAt: new Date(1) },
    ]);
    seedAiRequest({ userId: "user-1" });
    seedAiRequest({ userId: "user-1" });
    seedAiRequest({ userId: "user-2" });
    const d = await UsageService.dashboard(OID, NOW);
    expect(d.activeMembers30d).toBe(2);
    expect(d.adoptionPct).toBe(1); // 2 of 2 members produced AI traffic
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Per-module metrics: measured, not hardcoded 0
// ══════════════════════════════════════════════════════════════════════════

describe("per-module metrics (Session 123 fixes)", () => {
  it("computes users, p95 latency and error rate per channel from real rows", async () => {
    seedAiRequest({ channel: "chat", userId: "u1", durationMs: 100 });
    seedAiRequest({ channel: "chat", userId: "u2", durationMs: 200 });
    seedAiRequest({ channel: "chat", userId: "u1", durationMs: 300, status: "failed" });
    seedAiRequest({ channel: "workflow", userId: "u3", durationMs: 400 });
    const d = await UsageService.dashboard(OID, NOW);
    const chat = d.modules.find((m) => m.module === "chat")!;
    expect(chat.requests).toBe(3);
    expect(chat.users).toBe(2); // FIXED: was hardcoded 0
    expect(chat.p95LatencyMs).toBe(300); // FIXED: was hardcoded 0
    expect(chat.errorRate).toBe(33.33); // FIXED: was hardcoded 0
    const workflow = d.modules.find((m) => m.module === "workflow")!;
    expect(workflow.p95LatencyMs).toBe(400);
    expect(workflow.errorRate).toBe(0);
    expect(workflow.users).toBe(1);
  });

  it("reports null p95/error for a module with no requests in the window", async () => {
    const d = await UsageService.dashboard(OID, NOW);
    expect(d.modules).toEqual([]);
  });

  it("top models carry real tokens", async () => {
    seedAiRequest({ modelId: "gpt-4o" });
    seedAiRequest({ modelId: "gpt-4o" });
    seedAiRequest({ modelId: "claude" });
    const d = await UsageService.dashboard(OID, NOW);
    const gpt = d.topModels.find((m) => m.modelId === "gpt-4o")!;
    expect(gpt.requests).toBe(2);
    expect(gpt.tokens).toBe(60);
    expect(d.topModels[0]!.modelId).toBe("gpt-4o"); // sorted by requests
  });
});

// ══════════════════════════════════════════════════════════════════════════
// The 30-day series
// ══════════════════════════════════════════════════════════════════════════

describe("30-day series (Session 123 fixes)", () => {
  it("FIXED: carries real token counts per day", async () => {
    seedAiRequest({ createdAt: daysAgo(1) });
    seedAiRequest({ createdAt: daysAgo(1) });
    const d = await UsageService.dashboard(OID, NOW);
    const day = d.series.find((p) => p.ts === daysAgo(1).toISOString().slice(0, 10))!;
    expect(day.requests).toBe(2);
    expect(day.tokens).toBe(60); // FIXED: was always 0
    expect(day.latencyMs).toBe(100);
  });

  it("FIXED: an empty day reports latencyMs null, not 0", async () => {
    seedAiRequest({ createdAt: daysAgo(10) });
    const d = await UsageService.dashboard(OID, NOW);
    const empty = d.series.find((p) => p.ts === daysAgo(5).toISOString().slice(0, 10))!;
    expect(empty.requests).toBe(0);
    expect(empty.latencyMs).toBeNull();
    expect(empty.automationTasks).toBeNull();
  });

  it("excludes requests older than the window from the series", async () => {
    seedAiRequest({ createdAt: daysAgo(45) });
    const d = await UsageService.dashboard(OID, NOW);
    expect(d.series.every((p) => p.requests === 0)).toBe(true);
    expect(d.metrics.find((m) => m.label === "AI requests (30d)")!.value).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Provenance + isolation
// ══════════════════════════════════════════════════════════════════════════

describe("provenance and isolation", () => {
  it("ships provenance naming measured fields and structural zeros", async () => {
    seedAiRequest();
    const d = await UsageService.dashboard(OID, NOW);
    expect(d.provenance).toBeTruthy();
    expect(d.provenance!.entries.some((e) => e.field === "metrics" && e.basis === "measured")).toBe(true);
    expect(d.provenance!.entries.some((e) => e.field === "resources" && e.basis === "structural_zero")).toBe(true);
    expect(d.provenance!.entries.some((e) => e.field === "totalCost30dUsd / totalSavings30dUsd / productivityGainHours30d / roiPct / carbonKgCO2e30d")).toBe(true);
    expect(d.provenance!.note.length).toBeGreaterThan(20);
  });

  it("keeps organizations isolated", async () => {
    seedAiRequest();
    const mine = await UsageService.dashboard(OID, NOW);
    expect(mine.metrics.find((m) => m.label === "AI requests (30d)")!.value).toBe(1);
    const theirs = await UsageService.dashboard(OTHER, NOW);
    expect(theirs.metrics.find((m) => m.label === "AI requests (30d)")!.value).toBe(0);
    expect(theirs.topModels).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Shared contract — schemas
// ══════════════════════════════════════════════════════════════════════════

describe("shared usage schemas", () => {
  it("event schema constrains like the route's old inline schema", async () => {
    const shared = await import("@windels/shared/usage");
    expect(shared.UsageEventSchema.safeParse({ feature: "x", actor: "a", quantity: 1, unit: "u" }).success).toBe(false); // feature too short
    expect(shared.UsageEventSchema.parse({ feature: "export", actor: "user-1", quantity: 5, unit: "rows" }).quantity).toBe(5);
    expect(shared.UsageEventSchema.safeParse({ feature: "export", actor: "user-1", quantity: -1, unit: "rows" }).success).toBe(false);
    expect(shared.UsageEventSchema.safeParse({ feature: "export", actor: "user-1", quantity: 1e9 + 1, unit: "rows" }).success).toBe(false);
  });

  it("events query clamps limit to 1..1000", async () => {
    const shared = await import("@windels/shared/usage");
    expect(shared.UsageEventsQuerySchema.parse({}).limit).toBeUndefined();
    expect(shared.UsageEventsQuerySchema.parse({ limit: "250" }).limit).toBe(250);
    expect(shared.UsageEventsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(shared.UsageEventsQuerySchema.safeParse({ limit: 1001 }).success).toBe(false);
  });
});
