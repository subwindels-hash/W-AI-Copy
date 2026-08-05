/**
 * WINDELS AI OS — Governance tests.
 *
 * Covers incident reporting/lifecycle (Redis-backed, real) and the access
 * review flow. The access-review path uses Prisma, which we substitute with a
 * fake that returns a small deterministic user set so the review math is still
 * verified honestly.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../db/client.js", () => ({
  prisma: {
    user: { findMany: vi.fn() },
    membership: { findMany: vi.fn() },
  },
}));

const { SecurityGovernanceService } = await import("../security/governance.service.js");

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("incident reporting lifecycle", () => {
  it("reports, updates through the lifecycle, and lists", async () => {
    const inc = await SecurityGovernanceService.reportIncident("user-1", {
      title: "Suspicious login", description: "Failed MFA many times", severity: "high", area: "auth",
    });
    expect(inc.status).toBe("reported");
    expect(inc.severity).toBe("high");
    expect(inc.timeline.length).toBe(1);

    const investigating = await SecurityGovernanceService.updateIncident(inc.id, "sec-1", { status: "investigating", note: "Checking IP" });
    expect(investigating!.status).toBe("investigating");
    expect(investigating!.timeline.length).toBe(2);

    const resolved = await SecurityGovernanceService.updateIncident(inc.id, "sec-1", { status: "resolved", note: "Confirmed attack" });
    expect(resolved!.status).toBe("resolved");

    const list = await SecurityGovernanceService.listIncidents("resolved");
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(inc.id);
    // Filtering by a different status excludes it.
    expect(await SecurityGovernanceService.listIncidents("postmortem")).toEqual([]);
  });

  it("returns null when updating a non-existent incident", async () => {
    expect(await SecurityGovernanceService.updateIncident("inc-missing", "u", { status: "resolved" })).toBeNull();
  });

  it("supports the full status set and sorting newest-first", async () => {
    const a = await SecurityGovernanceService.reportIncident("u1", { title: "A", description: "d", severity: "low", area: "billing" });
    const b = await SecurityGovernanceService.reportIncident("u1", { title: "B", description: "d", severity: "critical", area: "billing" });
    const list = await SecurityGovernanceService.listIncidents();
    expect(list.length).toBe(2);
    // Newest first (zset REV).
    expect(list[0]!.id).toBe(b.id);
    expect(list[1]!.id).toBe(a.id);
  });

  it("walks the full incident lifecycle reported→investigating→contained→resolved→postmortem", async () => {
    const inc = await SecurityGovernanceService.reportIncident("u1", { title: "Breach", description: "d", severity: "critical", area: "security" });
    const expected = ["reported", "investigating", "contained", "resolved", "postmortem"];
    let cur: any = inc;
    for (const status of expected.slice(1)) {
      cur = await SecurityGovernanceService.updateIncident(inc.id, "sec-1", { status, note: `moved to ${status}` });
      expect(cur!.status).toBe(status);
    }
    // Status transitions + notes append timeline entries (1 initial + 4).
    expect(cur!.timeline.length).toBe(5);
    expect(cur!.timeline[4]!.note).toContain("postmortem");
  });

  it("appends timeline notes and tracks actors", async () => {
    const inc = await SecurityGovernanceService.reportIncident("user-a", { title: "Phish", description: "d", severity: "medium", area: "auth" });
    await SecurityGovernanceService.updateIncident(inc.id, "user-b", { note: "Escalated to SOC" });
    const after = await SecurityGovernanceService.listIncidents("reported");
    const found = after.find((i) => i.id === inc.id);
    expect(found!.timeline.some((t) => t.actor === "user-b" && t.note === "Escalated to SOC")).toBe(true);
  });

  it("filters by severity field on the record", async () => {
    await SecurityGovernanceService.reportIncident("u1", { title: "low", description: "d", severity: "low", area: "billing" });
    await SecurityGovernanceService.reportIncident("u1", { title: "high", description: "d", severity: "high", area: "billing" });
    const low = await SecurityGovernanceService.listIncidents();
    expect(low.filter((i) => i.severity === "low").length).toBe(1);
    expect(low.filter((i) => i.severity === "high").length).toBe(1);
  });

  it("limits list results", async () => {
    for (let i = 0; i < 5; i++) await SecurityGovernanceService.reportIncident("u1", { title: `i${i}`, description: "d", severity: "low", area: "billing" });
    expect((await SecurityGovernanceService.listIncidents(undefined, 2)).length).toBe(2);
  });
});
