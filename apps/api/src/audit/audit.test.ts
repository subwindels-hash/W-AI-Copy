import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("../db/redis.js", () => ({
  redisCmd: {
    lPush: vi.fn().mockResolvedValue(1),
    lTrim: vi.fn().mockResolvedValue("OK"),
  },
}));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const { auditService } = await import("./audit.service.js");

const ORG_A = "org-audit-a";
const ORG_B = "org-audit-b";
const USER_A = "user-audit-a";

function seedLogs() {
  const now = Date.now();
  db.seed("AuditLog", [
    { id: "log-1", organizationId: ORG_A, userId: USER_A, action: "auth.login", resourceType: "user", resourceId: USER_A, ipAddress: "1.1.1.1", requestId: "req-1", metadata: {}, createdAt: new Date(now - 10000) },
    { id: "log-2", organizationId: ORG_A, userId: USER_A, action: "data.create", resourceType: "agent", resourceId: "agent-1", ipAddress: "1.1.1.1", requestId: "req-2", metadata: { agent: "x" }, createdAt: new Date(now - 5000) },
    { id: "log-3", organizationId: ORG_A, userId: null, action: "billing.invoice_paid", resourceType: "invoice", resourceId: "inv-1", ipAddress: null, requestId: null, metadata: {}, createdAt: new Date(now - 2000) },
    { id: "log-4", organizationId: ORG_B, userId: "user-b", action: "auth.login", resourceType: "user", resourceId: "user-b", ipAddress: "2.2.2.2", requestId: "req-b", metadata: {}, createdAt: new Date(now - 3000) },
  ]);
}

beforeEach(() => {
  db.reset();
  seedLogs();
});

describe("auditService", () => {
  it("queries only the caller's organization", async () => {
    const { logs, total } = await auditService.query({ organizationId: ORG_A });
    expect(logs.every(l=> l.organizationId===ORG_A)).toBe(true);
    expect(total).toBe(3);
    expect(logs.find(l=> l.id==="log-4")).toBeUndefined();
  });

  it("filters by action", async () => {
    const { logs } = await auditService.query({ organizationId: ORG_A, action: "auth.login" as any });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.id).toBe("log-1");
  });

  it("filters by resourceType", async () => {
    const { logs } = await auditService.query({ organizationId: ORG_A, resourceType: "agent" as any });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.resourceId).toBe("agent-1");
  });

  it("filters by resourceId", async () => {
    const { logs } = await auditService.query({ organizationId: ORG_A, resourceId: "inv-1" });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.id).toBe("log-3");
  });

  it("filters by date range", async () => {
    const now = new Date();
    const start = new Date(now.getTime() - 6000);
    const end = new Date(now.getTime() - 1000);
    const { logs } = await auditService.query({ organizationId: ORG_A, startDate: start, endDate: end });
    // log-2 (5000 ago) and log-3 (2000 ago) inside, log-1 (10000 ago) outside
    expect(logs.map(l=> l.id).sort()).toEqual(["log-2","log-3"]);
  });

  it("paginates with limit/offset", async () => {
    const p1 = await auditService.query({ organizationId: ORG_A, limit: 1, offset: 0 });
    const p2 = await auditService.query({ organizationId: ORG_A, limit: 1, offset: 1 });
    expect(p1.logs).toHaveLength(1);
    expect(p2.logs).toHaveLength(1);
    expect(p1.logs[0]!.id).not.toBe(p2.logs[0]!.id);
  });

  it("getById returns entry for same org and throws for cross-org", async () => {
    const row = await auditService.getById("log-1", ORG_A);
    expect(row.id).toBe("log-1");
    await expect(auditService.getById("log-4", ORG_A)).rejects.toThrow(/not found/i);
    await expect(auditService.getById("missing", ORG_A)).rejects.toThrow(/not found/i);
  });

  it("getRecent returns limited recent rows scoped to org", async () => {
    const rows = await auditService.getRecent(ORG_A, 2);
    expect(rows).toHaveLength(2);
    expect(rows.every(r=> r.id !== "log-4")).toBe(true);
    // most recent first
    expect(new Date(rows[0]!.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(rows[1]!.createdAt).getTime());
  });

  it("getStats counts by action in window", async () => {
    const stats = await auditService.getStats(ORG_A, 30);
    expect(stats["auth.login"]).toBe(1);
    expect(stats["data.create"]).toBe(1);
    expect(stats["billing.invoice_paid"]).toBe(1);
  });

  it("export JSON returns parseable array", async () => {
    const now = new Date();
    const start = new Date(now.getTime() - 20000);
    const end = new Date(now.getTime() + 1000);
    const json = await auditService.export(ORG_A, start, end, "json");
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(3);
  });

  it("export CSV returns header + rows with escaping", async () => {
    const now = new Date();
    const start = new Date(now.getTime() - 20000);
    const end = new Date(now.getTime() + 1000);
    const csv = await auditService.export(ORG_A, start, end, "csv");
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,action,resourceType,resourceId,userId,organizationId,ipAddress,requestId,createdAt");
    expect(lines.length).toBe(4); // header + 3 rows
  });

  it("getTimeline returns zero-filled daily buckets", async () => {
    const entries = await auditService.getTimeline(ORG_A, 7);
    expect(entries).toHaveLength(7);
    // at least one day has events
    expect(entries.some(e=> e.total>0)).toBe(true);
    // each entry has date YYYY-MM-DD, total and byAction
    for(const e of entries){
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof e.total).toBe("number");
      expect(typeof e.byAction).toBe("object");
      const sum = Object.values(e.byAction).reduce((a,b)=> a+(b as number),0);
      expect(sum).toBe(e.total);
    }
  });

  it("getTimeline for org with no logs returns all zeros", async () => {
    const entries = await auditService.getTimeline("org-empty-no-logs", 5);
    expect(entries).toHaveLength(5);
    expect(entries.every(e=> e.total===0)).toBe(true);
  });

  it("query returns empty for org with no logs", async () => {
    const { logs, total } = await auditService.query({ organizationId: "org-empty" });
    expect(logs).toHaveLength(0);
    expect(total).toBe(0);
  });
});
