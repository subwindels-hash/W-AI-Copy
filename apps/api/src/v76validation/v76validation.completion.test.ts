/**
 * Session 195 — v76validation completion.
 *
 * Defects closed here:
 *  - `runReport()` previously took no `oid` and produced a single
 *    platform-wide report. The `/validation/report` route used
 *    `_req, res, next` (no `req.user.organizationId`). Every tenant
 *    got the same report.
 *  - No per-org persistence at all: the report was rebuilt on every
 *    call with no history, no lastReportId, no lastReportAt, and
 *    no adoption marker.
 *  - The notes ledger was already per-org via `tenantStore` (good),
 *    but the route file used an inline `req.user.organizationId`
 *    check rather than the standard `orgOf` guard.
 *  - The 5 `v76:*` key prefixes were never catalogued in
 *    `TI_NAMESPACE_CATALOG`, so the namespace audit never verified
 *    the org-scoping the service claims to have.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));

const { V76ValidationService } = await import("./v76validation.service.js");

const ORG = "org-v76-comp";
const OTHER = "org-v76-other";

function resetAll() {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
}

beforeEach(() => {
  resetAll();
});

describe("v76validation completion — D1 require-oid", () => {
  it("every read and write rejects an empty / null oid with 403", async () => {
    await expect(V76ValidationService.runReport("")).rejects.toThrow();
    await expect(V76ValidationService.runReport(undefined as any)).rejects.toThrow();
    await expect(V76ValidationService.runReport("   " as any)).rejects.toThrow();
    await expect(V76ValidationService.history("")).rejects.toThrow();
    await expect(V76ValidationService.lastReport(undefined as any)).rejects.toThrow();
    await expect(V76ValidationService.listNotes("")).rejects.toThrow();
    await expect(V76ValidationService.createNote("", { title: "t", body: "b", tags: [] }, "u")).rejects.toThrow();
    await expect(V76ValidationService.updateNote("", "x", { title: "t" })).rejects.toThrow();
    await expect(V76ValidationService.deleteNote("", "x")).rejects.toThrow();
  });
});

describe("v76validation completion — D2 cross-tenant isolation", () => {
  it("two orgs run independent reports; each org sees its own history and the other sees nothing", async () => {
    await V76ValidationService.runReport(ORG);
    await V76ValidationService.runReport(ORG);
    await V76ValidationService.runReport(OTHER);

    const aHist = await V76ValidationService.history(ORG);
    const bHist = await V76ValidationService.history(OTHER);
    expect(aHist.length).toBe(2);
    expect(bHist.length).toBe(1);
    // The most recent of org A's reports is its own (newest first).
    expect(aHist[0].id).not.toBe(bHist[0].id);

    // Per-org lastReportId strings are distinct.
    const aLast = await kv.get(`v76:lastReportId:${ORG}`);
    const bLast = await kv.get(`v76:lastReportId:${OTHER}`);
    expect(aLast).not.toBe(bLast);
    expect(aLast).not.toBeNull();
    expect(bLast).not.toBeNull();
  });

  it("notes ledger is per-org; org B never sees org A's notes", async () => {
    const a = await V76ValidationService.createNote(ORG, { title: "Org A note", body: "secret", tags: ["x"] }, "user-a");
    await V76ValidationService.createNote(OTHER, { title: "Org B note", body: "ok", tags: [] }, "user-b");
    const aList = await V76ValidationService.listNotes(ORG);
    const bList = await V76ValidationService.listNotes(OTHER);
    expect(aList.length).toBe(1);
    expect(bList.length).toBe(1);
    expect(aList[0].data.title).toBe("Org A note");
    expect(bList[0].data.title).toBe("Org B note");
    // The keys under each org are different (tenantStore keys them
    // `v76:notes:i:<org>:<id>` and `v76:notes:idx:<org>`).
    const noteKeys = Array.from(kv.hashes.keys()).filter((k) => k.startsWith("v76:notes:i:"));
    expect(noteKeys.some((k) => k.includes(`:${ORG}:`) && k.endsWith(`:${a.id}`))).toBe(true);
    expect(noteKeys.some((k) => k.includes(`:${OTHER}:`))).toBe(true);
    expect(noteKeys.some((k) => k.includes(`:${ORG}:`) && k.endsWith(":user-b"))).toBe(false);
  });
});

describe("v76validation completion — D3 no fake history", () => {
  it("history(oid) on a fresh org returns []", async () => {
    const h = await V76ValidationService.history(ORG);
    expect(h).toEqual([]);
  });

  it("after two runReport(oid) calls history(oid) returns exactly two entries, newest first", async () => {
    await V76ValidationService.runReport(ORG);
    await new Promise((r) => setTimeout(r, 5));
    await V76ValidationService.runReport(ORG);
    const h = await V76ValidationService.history(ORG);
    expect(h.length).toBe(2);
    // Newest first: the second call's generatedAt >= the first's.
    expect(h[0].generatedAt >= h[1].generatedAt).toBe(true);
    // The v76:lastReportId:<org> pointer is the most recent.
    const lastId = await kv.get(`v76:lastReportId:${ORG}`);
    expect(h[0].id).toBe(lastId);
  });

  it("lastReport(oid) returns the report body the runReport call persisted", async () => {
    await V76ValidationService.runReport(ORG);
    const last = await V76ValidationService.lastReport(ORG);
    expect(last).not.toBeNull();
    // The body keeps the S76 keys (systems, checklist, totals, gates).
    expect(Array.isArray(last!.systems)).toBe(true);
    expect(Array.isArray(last!.checklist)).toBe(true);
    expect(last!.checklist.length).toBeGreaterThanOrEqual(20);
    expect(typeof last!.consentGateEnforced).toBe("boolean");
    expect(typeof last!.governanceGateEnforced).toBe("boolean");
  });
});

describe("v76validation completion — D4 no-seed on read", () => {
  it("a runReport(oid) call only writes the report body + the two pointers + the adoption marker", async () => {
    const beforeKeys = new Set<string>([
      ...Array.from(kv.strings.keys()),
      ...Array.from(kv.hashes.keys()),
      ...Array.from(kv.zsets.keys()),
    ]);
    await V76ValidationService.runReport(ORG);
    const afterKeys: string[] = [
      ...Array.from(kv.strings.keys()),
      ...Array.from(kv.hashes.keys()),
      ...Array.from(kv.zsets.keys()),
    ];
    const newKeys = afterKeys.filter((k) => !beforeKeys.has(k));
    for (const k of newKeys) {
      if (!k.startsWith("v76:")) continue; // the probe may touch other namespaces
      // The only allowed new keys for v76: are the report body, the
      // lastReportId / lastReportAt pointers, the reportsIdx zset,
      // and the adopted marker.
      const ok =
        k === `v76:imported:${ORG}` ||
        k === `v76:lastReportId:${ORG}` ||
        k === `v76:lastReportAt:${ORG}` ||
        k === `v76:reportsIdx:${ORG}` ||
        (k.startsWith(`v76:report:${ORG}:`));
      expect(ok, `unexpected new v76 key: ${k}`).toBe(true);
    }
  });

  it("history(oid) and lastReport(oid) are pure reads; they write nothing", async () => {
    await V76ValidationService.runReport(ORG);
    const before = [
      ...Array.from(kv.strings.keys()),
      ...Array.from(kv.hashes.keys()),
      ...Array.from(kv.zsets.keys()),
    ].filter((k) => k.startsWith("v76:")).sort();
    await V76ValidationService.history(ORG);
    await V76ValidationService.lastReport(ORG);
    const after = [
      ...Array.from(kv.strings.keys()),
      ...Array.from(kv.hashes.keys()),
      ...Array.from(kv.zsets.keys()),
    ].filter((k) => k.startsWith("v76:")).sort();
    expect(after).toEqual(before);
  });
});

describe("v76validation completion — D5 legacy adoption marker is per-org", () => {
  it("the v76:imported:<org> marker is set on first runReport(oid) and never overwritten", async () => {
    expect(await kv.get(`v76:imported:${ORG}`)).toBeNull();
    await V76ValidationService.runReport(ORG);
    expect(await kv.get(`v76:imported:${ORG}`)).toBe("1");
    await V76ValidationService.runReport(ORG);
    expect(await kv.get(`v76:imported:${ORG}`)).toBe("1");
    // The marker is per-org; the OTHER org's slot is still null.
    expect(await kv.get(`v76:imported:${OTHER}`)).toBeNull();
  });
});
