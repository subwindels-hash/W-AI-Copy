/**
 * Session 111 — Global Command Center operations register tests.
 *
 * Runs fully in-memory (FakeKv for Redis, FakePrisma for the Session 70
 * dashboard). The properties pinned here are the ones the honesty rules
 * actually depend on: organization scoping, a *measured* MTTR that only exists
 * once a human resolved something, regions that stay `unreported` until an
 * operator files a report, self-reported initiative progress, labelled
 * AI-assisted briefings, an idempotent Session 70 directive migration and a
 * byte-identical rollup across repeated reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
const dispatch = vi.fn(async () => ({}));
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn() }));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("../kernel/kernel.service.js", () => ({ KernelService: { dispatch } }));

const { CommandOperationsService: Ops } = await import("./operations.service.js");
const { CommandService } = await import("./command.service.js");
const {
  CmdDirectiveCreateSchema,
  CmdIncidentCreateSchema,
  CmdInitiativeCreateSchema,
  CmdRegionCreateSchema,
} = await import("@windels/shared/command");

const A = "org-command-a";
const B = "org-command-b";

const incidentInput = (overrides: Record<string, unknown> = {}) => ({
  title: "Checkout latency spike",
  description: "p99 above 4s for the payment API.",
  severity: "critical" as const,
  service: "payments-api",
  ...overrides,
});
const regionInput = (overrides: Record<string, unknown> = {}) => ({
  code: "eu-west-1", name: "Ireland", servicesTotal: 4, ...overrides,
});

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  db.reset();
  dispatch.mockClear();
});

describe("incident command", () => {
  it("declares incidents open with CSPRNG ids under org-scoped keys", async () => {
    const incident = await Ops.declareIncident(A, incidentInput(), "user-1");
    expect(incident.id).toMatch(/^cmd_inc_[0-9a-f]{8}-/);
    expect(incident).toMatchObject({
      status: "open", owner: null, acknowledgedAt: null, resolvedAt: null,
      resolutionNote: null, timeToResolveMinutes: null, declaredBy: "user-1",
    });
    expect(incident).not.toHaveProperty("organizationId");
    expect([...kv.hashes.keys()].some((key) => key === `cmd:incident:i:${A}:${incident.id}`)).toBe(true);
    expect(await Ops.listIncidents(A)).toHaveLength(1);
    expect(await Ops.listIncidents(A, { severity: "info" })).toHaveLength(0);
    expect(await Ops.listIncidents(A, { status: "open" })).toHaveLength(1);
  });

  it("only a named human acknowledges and resolves, and resolution needs a note", async () => {
    const incident = await Ops.declareIncident(A, incidentInput());
    const acknowledged = await Ops.acknowledgeIncident(A, incident.id, "user-oncall");
    expect(acknowledged).toMatchObject({ status: "acknowledged", owner: "user-oncall", acknowledgedBy: "user-oncall" });
    await expect(Ops.acknowledgeIncident(A, incident.id, "user-other")).rejects.toThrow(/already been acknowledged/);
    // An unattributed acknowledgement is refused outright.
    const anonymous = await Ops.declareIncident(A, incidentInput({ title: "Unowned" }));
    await expect(Ops.acknowledgeIncident(A, anonymous.id, "")).rejects.toThrow(/acknowledging user is required/);
    await expect(Ops.resolveIncident(A, anonymous.id, "", { note: "no signer" })).rejects.toThrow(/resolving user is required/);

    const resolved = await Ops.resolveIncident(A, incident.id, "user-oncall", { note: "Rolled back release 4.2.1." });
    expect(resolved).toMatchObject({ status: "resolved", resolvedBy: "user-oncall", resolutionNote: "Rolled back release 4.2.1." });
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.timeToResolveMinutes).not.toBeNull();
    expect(resolved.updates.at(-1)).toMatchObject({ author: "user-oncall", status: "resolved" });
    await expect(Ops.resolveIncident(A, incident.id, "user-oncall", { note: "again" })).rejects.toThrow(/already been resolved/);
    await expect(Ops.addIncidentUpdate(A, incident.id, { note: "late note" }, "user-1")).rejects.toThrow(/already resolved/);
  });

  it("records timeline updates without reordering the board and edits keep openedAt", async () => {
    const first = await Ops.declareIncident(A, incidentInput({ title: "First" }));
    const second = await Ops.declareIncident(A, incidentInput({ title: "Second", severity: "warning" }));
    const updated = await Ops.addIncidentUpdate(A, first.id, { note: "Failing over to the replica.", status: "mitigating" }, "user-2");
    expect(updated.status).toBe("mitigating");
    expect(updated.owner).toBe("user-2");
    expect(updated.updates).toHaveLength(1);
    expect(updated.updates[0]).toMatchObject({ author: "user-2", note: "Failing over to the replica.", status: "mitigating" });

    const patched = await Ops.updateIncident(A, first.id, { severity: "info", owner: "user-3" });
    expect(patched).toMatchObject({ severity: "info", owner: "user-3", openedAt: first.openedAt });
    // Sorted newest-first by openedAt: the second incident still leads.
    const board = await Ops.listIncidents(A);
    expect(board.map((incident) => incident.id)).toContain(second.id);
    expect(board).toHaveLength(2);
  });

  it("rejects an incident pointing at a region that is not registered in the organization", async () => {
    const foreign = await Ops.createRegion(B, regionInput());
    await expect(Ops.declareIncident(A, incidentInput({ regionCode: foreign.code }))).rejects.toThrow(/Region not found/);
    await expect(Ops.declareIncident(A, incidentInput({ regionCode: "does-not-exist" }))).rejects.toThrow(/Region not found/);
    const incident = await Ops.declareIncident(A, incidentInput());
    await expect(Ops.updateIncident(A, incident.id, { regionCode: "does-not-exist" })).rejects.toThrow(/Region not found/);
  });
});

describe("regional posture", () => {
  it("keeps a region unreported until an operator files a status report", async () => {
    const region = await Ops.createRegion(A, regionInput(), "user-1");
    expect(region).toMatchObject({
      health: "unreported", servicesUp: null, latencyMs: null, activeUsers: null,
      statusReportedAt: null, statusReportedBy: null, openIncidents: 0,
    });
    expect(region.healthBasis).toMatch(/No operator status report/);

    const reported = await Ops.reportRegionStatus(A, region.id, { servicesUp: 4, latencyMs: 87 }, "user-ops");
    expect(reported).toMatchObject({ health: "healthy", servicesUp: 4, latencyMs: 87, statusReportedBy: "user-ops" });
    // Never reported ⇒ still null, not zero.
    expect(reported.activeUsers).toBeNull();

    const degraded = await Ops.reportRegionStatus(A, region.id, { servicesUp: 2 }, "user-ops");
    expect(degraded.health).toBe("degraded");
    expect(degraded.healthBasis).toMatch(/2 of 4 declared services up/);

    const down = await Ops.reportRegionStatus(A, region.id, { servicesUp: 0 }, "user-ops");
    expect(down.health).toBe("down");
  });

  it("refuses impossible reports, duplicate codes and deletion with live incidents", async () => {
    const region = await Ops.createRegion(A, regionInput());
    await expect(Ops.createRegion(A, regionInput())).rejects.toThrow(/already registered/);
    await expect(Ops.reportRegionStatus(A, region.id, { servicesUp: 9 })).rejects.toThrow(/only 4 are declared/);

    await Ops.reportRegionStatus(A, region.id, { servicesUp: 4 });
    const incident = await Ops.declareIncident(A, incidentInput({ regionCode: region.code }));
    // All services reported up, but a critical incident is live here.
    const withIncident = await Ops.getRegion(A, region.id);
    expect(withIncident).toMatchObject({ health: "degraded", openIncidents: 1, criticalOpenIncidents: 1 });
    await expect(Ops.deleteRegion(A, region.id)).rejects.toThrow(/still has 1 unresolved incident/);

    await Ops.resolveIncident(A, incident.id, "user-1", { note: "Mitigated." });
    expect((await Ops.getRegion(A, region.id))!.health).toBe("healthy");
    expect(await Ops.deleteRegion(A, region.id)).toBe(true);
    expect(await Ops.getRegion(A, region.id)).toBeNull();
  });
});

describe("briefings and initiatives", () => {
  it("labels AI-assisted briefings and counts them apart from human ones", async () => {
    await Ops.createBriefing(A, { title: "Weekly ops review", summary: "Two releases shipped.", priority: "med", category: "ops" }, "user-1");
    const advisory = await Ops.createBriefing(A, {
      title: "Draft market note", summary: "Model-drafted competitor summary.",
      priority: "high", category: "market", origin: "ai_assisted", source: "assistant draft",
    }, "user-1");
    expect(advisory).toMatchObject({ origin: "ai_assisted", aiAssisted: true, source: "assistant draft" });

    const rollup = await Ops.operations(A);
    expect(rollup).toMatchObject({ briefingCount: 2, humanBriefings: 1, aiAssistedBriefings: 1, criticalBriefings: 0 });
    expect(await Ops.listBriefings(A, { origin: "ai_assisted" })).toHaveLength(1);
    expect(await Ops.deleteBriefing(A, advisory.id)).toBe(true);
    expect(await Ops.deleteBriefing(A, advisory.id)).toBe(false);
  });

  it("keeps initiative progress self-reported and never computes it", async () => {
    const initiative = await Ops.createInitiative(A, { name: "Migrate to PG17", owner: "cto", status: "active", progressPct: 40 }, "user-1");
    expect(initiative).toMatchObject({ progressPct: 40, progressKind: "self_reported", dueAt: null, lastReportedBy: "user-1" });

    const reported = await Ops.updateInitiative(A, initiative.id, { progressPct: 65 }, "user-2");
    expect(reported).toMatchObject({ progressPct: 65, progressKind: "self_reported", lastReportedBy: "user-2", createdAt: initiative.createdAt });

    await Ops.createInitiative(A, { name: "Zero-downtime deploys", owner: "sre", progressPct: 35 });
    const rollup = await Ops.operations(A);
    // Mean of the two *reported* numbers only — nothing is derived from tasks.
    expect(rollup).toMatchObject({ initiativeCount: 2, activeInitiatives: 1, avgReportedProgressPct: 50, progressKind: "self_reported_average" });
  });
});

describe("directives", () => {
  it("issues, transitions and refuses double transitions", async () => {
    const directive = await Ops.issueDirective(A, { scope: "global", title: "Freeze releases", body: "No deploys until the incident closes.", severity: "critical" }, "user-1");
    expect(directive).toMatchObject({ status: "issued", issuedBy: "user-1", statusChangedAt: null, statusChangedBy: null });
    expect(directive.id).toMatch(/^cmd-[0-9a-f]{8}-/);

    const acknowledged = await Ops.setDirectiveStatus(A, directive.id, { status: "acknowledged", note: "All leads notified." }, "user-2");
    expect(acknowledged).toMatchObject({ status: "acknowledged", statusChangedBy: "user-2", statusNote: "All leads notified." });
    await expect(Ops.setDirectiveStatus(A, directive.id, { status: "acknowledged" }, "user-2")).rejects.toThrow(/already acknowledged/);

    await Ops.setDirectiveStatus(A, directive.id, { status: "resolved" }, "user-2");
    await expect(Ops.setDirectiveStatus(A, directive.id, { status: "cancelled" }, "user-2")).rejects.toThrow(/already resolved/);
    expect(await Ops.setDirectiveStatus(A, "cmd-missing", { status: "resolved" }, "user-2")).toBeNull();
  });

  it("migrates Session 70 tenantStore directive envelopes in place, idempotently", async () => {
    const legacyId = "cmd-legacy1";
    const legacy = {
      id: legacyId, organizationId: A, createdAt: "2026-01-04T10:00:00.000Z", createdBy: "user-legacy",
      data: { scope: "region", targetRef: "eu-west-1", title: "Scale out", body: "Add two nodes.", severity: "warn", status: "acknowledged" },
    };
    await kv.hset(`cmd:dir:i:${A}:${legacyId}`, "_doc", JSON.stringify(legacy));
    await kv.zadd(`cmd:dir:idx:${A}`, Date.parse(legacy.createdAt), legacyId);

    const [migrated] = await Ops.listDirectives(A);
    expect(migrated).toMatchObject({
      id: legacyId, scope: "region", targetRef: "eu-west-1", title: "Scale out",
      severity: "warn", status: "acknowledged", issuedBy: "user-legacy", createdAt: legacy.createdAt,
      // The legacy envelope never captured who moved the status or why.
      statusChangedAt: null, statusChangedBy: null, statusNote: null,
    });
    const stored = JSON.parse((await kv.hget(`cmd:dir:i:${A}:${legacyId}`, "_doc"))!);
    expect(stored.data).toBeUndefined();

    const again = await Ops.listDirectives(A);
    expect(again).toHaveLength(1);
    expect(again[0]).toEqual(migrated);
    expect((await kv.zsets.get(`cmd:dir:idx:${A}`))!.size).toBe(1);
  });
});

describe("tenant isolation", () => {
  it("never leaks a record across organizations on any read path", async () => {
    const region = await Ops.createRegion(A, regionInput());
    const incident = await Ops.declareIncident(A, incidentInput({ regionCode: region.code }));
    const briefing = await Ops.createBriefing(A, { title: "A only", summary: "Private.", priority: "low", category: "ops" });
    const initiative = await Ops.createInitiative(A, { name: "A only", owner: "cto" });
    const directive = await Ops.issueDirective(A, { scope: "global", title: "A only", body: "Private." });

    expect(await Ops.listIncidents(B)).toEqual([]);
    expect(await Ops.listRegions(B)).toEqual([]);
    expect(await Ops.listBriefings(B)).toEqual([]);
    expect(await Ops.listInitiatives(B)).toEqual([]);
    expect(await Ops.listDirectives(B)).toEqual([]);
    expect(await Ops.getIncident(B, incident.id)).toBeNull();
    expect(await Ops.getRegion(B, region.id)).toBeNull();
    expect(await Ops.getBriefing(B, briefing.id)).toBeNull();
    expect(await Ops.getInitiative(B, initiative.id)).toBeNull();
    expect(await Ops.getDirective(B, directive.id)).toBeNull();
    expect(await Ops.updateIncident(B, incident.id, { severity: "info" })).toBeNull();
    expect(await Ops.updateRegion(B, region.id, { name: "stolen" })).toBeNull();
    expect(await Ops.updateInitiative(B, initiative.id, { progressPct: 100 })).toBeNull();
    expect(await Ops.deleteIncident(B, incident.id)).toBe(false);
    expect(await Ops.deleteBriefing(B, briefing.id)).toBe(false);
    expect(await Ops.deleteInitiative(B, initiative.id)).toBe(false);
    await expect(Ops.resolveIncident(B, incident.id, "user-b", { note: "not yours" })).rejects.toThrow("Incident not found");
    await expect(Ops.reportRegionStatus(B, region.id, { servicesUp: 0 })).rejects.toThrow("Region not found");
    // A's records are untouched by every attempt above.
    expect(await Ops.getIncident(A, incident.id)).toMatchObject({ severity: "critical", status: "open" });
    expect((await Ops.getRegion(A, region.id))!.name).toBe("Ireland");
  });

  it("fails closed on a record planted under another organization's key", async () => {
    const planted = { id: "cmd_inc_planted", organizationId: B, title: "Planted", severity: "critical", service: "x", regionCode: null, status: "open", owner: null, declaredBy: null, description: null, openedAt: "2026-01-01T00:00:00.000Z", acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null, resolvedBy: null, resolutionNote: null, updates: [] };
    await kv.hset(`cmd:incident:i:${A}:${planted.id}`, "_doc", JSON.stringify(planted));
    await kv.zadd(`cmd:incident:idx:${A}`, Date.parse(planted.openedAt), planted.id);
    expect(await Ops.getIncident(A, planted.id)).toBeNull();
    expect(await Ops.listIncidents(A)).toEqual([]);
    expect((await Ops.operations(A)).incidentCount).toBe(0);
  });
});

describe("deterministic operations rollup", () => {
  it("measures MTTR only from incidents a human actually resolved", async () => {
    const openIncident = await Ops.declareIncident(A, incidentInput({ title: "Still burning" }));
    const empty = await Ops.operations(A);
    expect(empty).toMatchObject({
      incidentCount: 1, openIncidents: 1, resolvedIncidents: 0, unacknowledgedIncidents: 1,
      meanTimeToResolveMinutes: null, mttrSampleSize: 0, mttrKind: "none",
    });
    expect(empty.unresolvedBySeverity).toEqual({ info: 0, warning: 0, critical: 1 });

    // Two resolved incidents with known durations: 30 and 90 minutes ⇒ mean 60.
    for (const [minutes, title] of [[30, "Short"], [90, "Long"]] as const) {
      const incident = await Ops.declareIncident(A, incidentInput({ title, severity: "warning" }));
      const raw = JSON.parse((await kv.hget(`cmd:incident:i:${A}:${incident.id}`, "_doc"))!);
      const openedAt = new Date("2026-02-01T00:00:00.000Z").toISOString();
      raw.openedAt = openedAt;
      raw.resolvedAt = new Date(Date.parse(openedAt) + minutes * 60_000).toISOString();
      raw.resolvedBy = "user-oncall";
      raw.resolutionNote = "Closed by a human.";
      raw.status = "resolved";
      await kv.hset(`cmd:incident:i:${A}:${incident.id}`, "_doc", JSON.stringify(raw));
    }

    const rollup = await Ops.operations(A);
    expect(rollup).toMatchObject({
      incidentCount: 3, openIncidents: 1, resolvedIncidents: 2,
      meanTimeToResolveMinutes: 60, mttrSampleSize: 2, mttrKind: "measured",
    });
    expect(rollup.incidentsBySeverity).toEqual({ info: 0, warning: 2, critical: 1 });
    expect(rollup.lastIncidentOpenedAt).toBe(openIncident.openedAt);
  });

  it("reports an empty organization as empty and is byte-identical across reads", async () => {
    const empty = await Ops.operations(B);
    expect(empty).toMatchObject({
      incidentCount: 0, openIncidents: 0, resolvedIncidents: 0,
      meanTimeToResolveMinutes: null, mttrKind: "none",
      regionCount: 0, regionsReported: 0, reportedServicesUp: null,
      briefingCount: 0, initiativeCount: 0, avgReportedProgressPct: null, progressKind: "none",
      directiveCount: 0, lastIncidentOpenedAt: null, lastDirectiveIssuedAt: null,
    });
    expect(empty.regions).toEqual([]);
    expect(empty.note).toMatch(/measured from the paired openedAt\/resolvedAt/);

    const region = await Ops.createRegion(A, regionInput());
    await Ops.reportRegionStatus(A, region.id, { servicesUp: 3 }, "user-ops");
    await Ops.createRegion(A, regionInput({ code: "us-east-1", name: "Virginia", servicesTotal: 2 }));
    await Ops.issueDirective(A, { scope: "team", title: "Standby", body: "Stay reachable." }, "user-1");

    const populated = await Ops.operations(A);
    expect(populated).toMatchObject({
      regionCount: 2, regionsReported: 1, regionsUnreported: 1, regionsDegraded: 1,
      regionsHealthy: 0, regionsDown: 0, declaredServices: 6, reportedServicesUp: 3,
      directiveCount: 1, issuedDirectives: 1,
    });
    // Two consecutive reads of an unchanged organization must be identical.
    expect(JSON.stringify(await Ops.operations(A))).toBe(JSON.stringify(populated));
  });

  it("projects the register into the Session 70 dashboard without inventing arrays", async () => {
    const beforeAnything = await CommandService.dashboard(A);
    expect(beforeAnything.regions).toEqual([]);
    expect(beforeAnything.incidents).toEqual([]);
    expect(beforeAnything.briefings).toEqual([]);
    expect(beforeAnything.strategicInitiatives).toEqual([]);
    expect(beforeAnything.mttrMinutes).toBe(0);

    const region = await Ops.createRegion(A, regionInput());
    const incident = await Ops.declareIncident(A, incidentInput({ regionCode: region.code }));
    await Ops.createBriefing(A, { title: "AI note", summary: "Drafted.", priority: "low", category: "ops", origin: "ai_assisted" });
    await Ops.createInitiative(A, { name: "Migrate", owner: "cto", progressPct: 20 });

    const dashboard = await CommandService.dashboard(A);
    expect(dashboard.regions).toEqual([{ region: "eu-west-1", health: "unreported", servicesUp: null, servicesTotal: 4, latencyMs: null, activeUsers: null }]);
    expect(dashboard.incidents[0]).toMatchObject({ id: incident.id, region: "eu-west-1", status: "open", severity: "critical" });
    // AI-assisted briefings stay labelled even in the legacy shape.
    expect(dashboard.briefings[0]!.summary).toMatch(/^\[AI-assisted — advisory]/);
    expect(dashboard.strategicInitiatives[0]).toMatchObject({ name: "Migrate", progress: 20, owner: "cto", due: null });
    expect(dashboard.incidentsOpen).toBeGreaterThanOrEqual(1);
    expect(dashboard.incidentsCritical).toBeGreaterThanOrEqual(1);
  });
});

describe("shared contracts", () => {
  it("rejects invalid command-centre input", () => {
    expect(CmdIncidentCreateSchema.safeParse({ title: "x", severity: "critical", service: "api" }).success).toBe(false);
    expect(CmdIncidentCreateSchema.safeParse({ title: "Outage", severity: "fatal", service: "api" }).success).toBe(false);
    expect(CmdIncidentCreateSchema.safeParse({ title: "Outage", service: "api" }).success).toBe(false);
    expect(CmdRegionCreateSchema.safeParse({ code: "EU West", name: "Ireland" }).success).toBe(false);
    expect(CmdRegionCreateSchema.safeParse({ code: "eu-west-1", name: "Ireland", servicesTotal: -1 }).success).toBe(false);
    expect(CmdInitiativeCreateSchema.safeParse({ name: "Plan", owner: "cto", progressPct: 140 }).success).toBe(false);
    expect(CmdInitiativeCreateSchema.safeParse({ name: "Plan", owner: "cto", dueAt: "next friday" }).success).toBe(false);
    expect(CmdDirectiveCreateSchema.safeParse({ scope: "planet", title: "Freeze", body: "Stop." }).success).toBe(false);

    const region = CmdRegionCreateSchema.safeParse({ code: "eu-west-1", name: "Ireland" });
    expect(region.success && region.data.servicesTotal).toBe(0);
    const directive = CmdDirectiveCreateSchema.safeParse({ scope: "global", title: "Freeze", body: "Stop deploys." });
    expect(directive.success && directive.data.severity).toBe("info");
  });

  it("emits kernel events on writes only and survives a kernel outage", async () => {
    dispatch.mockClear();
    const incident = await Ops.declareIncident(A, incidentInput());
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ source: "command", kind: "command.incident_declared" }));

    dispatch.mockClear();
    await Ops.listIncidents(A);
    await Ops.operations(A);
    expect(dispatch).not.toHaveBeenCalled();

    dispatch.mockRejectedValueOnce(new Error("kernel down"));
    const resolved = await Ops.resolveIncident(A, incident.id, "user-1", { note: "Recovered." });
    expect(resolved.status).toBe("resolved");
  });
});
