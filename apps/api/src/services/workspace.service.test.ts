/**
 * Session 2 — Universal Workspace: resolveUserContext, dashboard, and task
 * management. The workspace/task service previously had no unit coverage (only
 * conversations and attachments were tested), so its org-scoping and task
 * lifecycle were unverified. Runs on FakePrisma; no database required.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const ws = await import("./workspace.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const USER_A = "user-alpha";
const USER_B = "user-beta";

function seedUser(id: string, orgId: string) {
  db.seed("User", [{ id, email: `${id}@example.com`, role: "USER", isActive: true }]);
  db.seed("Organization", [{ id: orgId, name: orgId }]);
  db.seed("Workspace", [{ id: `ws-${orgId}`, organizationId: orgId, name: "Default" }]);
  db.seed("Membership", [{ id: cuid(), userId: id, organizationId: orgId, workspaceId: `ws-${orgId}`, role: "MEMBER", joinedAt: new Date(1) }]);
}

beforeEach(() => {
  db.reset();
  seedUser(USER_A, ORG_A);
  seedUser(USER_B, ORG_B);
});

describe("resolveUserContext", () => {
  it("returns the user's org + workspace from their first membership", async () => {
    const ctx = await ws.resolveUserContext(USER_A);
    expect(ctx.organizationId).toBe(ORG_A);
    expect(ctx.workspaceId).toBe(`ws-${ORG_A}`);
  });

  it("throws FORBIDDEN when the user has no membership", async () => {
    await expect(ws.resolveUserContext("nobody")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("getDashboard", () => {
  it("aggregates real counts and returns org-scoped agents/tasks/activity", async () => {
    db.seed("Agent", [
      { id: "a1", organizationId: ORG_A, name: "Worker", status: "ONLINE" },
      { id: "a2", organizationId: ORG_A, name: "Researcher", status: "IDLE" },
    ]);
    db.seed("Task", [
      { id: "t1", organizationId: ORG_A, title: "Active", status: "IN_PROGRESS", priority: "HIGH" },
      { id: "t2", organizationId: ORG_A, title: "Done", status: "DONE", priority: "LOW" },
      { id: "t3", organizationId: ORG_B, title: "Other org", status: "IN_PROGRESS", priority: "HIGH" },
    ]);
    db.seed("Activity", [{ id: cuid(), organizationId: ORG_A, type: "TASK_CREATED", message: "created", createdAt: new Date() }]);

    const ctx = await ws.resolveUserContext(USER_A);
    const d = await ws.getDashboard(ctx);
    expect(d.stats.agentsTotal).toBe(2);
    expect(d.stats.agentsOnline).toBe(1);
    expect(d.stats.tasksActive).toBe(1);       // only org A's IN_PROGRESS
    expect(d.stats.tasksDone).toBe(1);
    expect(d.stats.tasksPending).toBe(0);
    expect(d.tasks).toHaveLength(2);           // org A only
    expect(d.agents).toHaveLength(2);
    expect(d.activities).toHaveLength(1);
  });
});

describe("listTasks / createTask / updateTaskStatus", () => {
  it("createTask persists a task and an activity, org-scoped", async () => {
    const ctx = await ws.resolveUserContext(USER_A);
    const task = await ws.createTask(ctx, USER_A, { title: "Write report", priority: "URGENT" } as any);
    expect(task.organizationId).toBe(ORG_A);
    expect(task.title).toBe("Write report");
    const acts = db.tables.get("Activity")!;
    expect(acts.some((a) => a.type === "TASK_CREATED")).toBe(true);
  });

  it("listTasks hides another organization's tasks and filters by status", async () => {
    const ctxA = await ws.resolveUserContext(USER_A);
    await ws.createTask(ctxA, USER_A, { title: "A task", priority: "MEDIUM" } as any);
    db.seed("Task", [{ id: "tb", organizationId: ORG_B, title: "B task", status: "DONE", priority: "MEDIUM" }]);

    // B sees its own task but never A's.
    const ctxB = await ws.resolveUserContext(USER_B);
    const listB = await ws.listTasks(ctxB, { page: 1, perPage: 20 } as any);
    expect(listB.items.map((t: any) => t.id)).toContain("tb");
    expect(listB.items.map((t: any) => t.id)).not.toContain("t1"); // A's task invisible

    // A filtering for DONE finds nothing (its task is TODO), proving status filter works.
    const listA = await ws.listTasks(ctxA, { page: 1, perPage: 20, status: "DONE" } as any);
    expect(listA.items).toHaveLength(0);
  });

  it("updateTaskStatus is org-scoped and sets completedAt on DONE", async () => {
    const ctxA = await ws.resolveUserContext(USER_A);
    const task = await ws.createTask(ctxA, USER_A, { title: "Ship", priority: "HIGH" } as any);
    const updated = await ws.updateTaskStatus(ctxA, USER_A, task.id, "DONE");
    expect(updated.status).toBe("DONE");
    expect(updated.progress).toBe(100);
    expect(updated.completedAt).not.toBeNull();
  });

  it("updateTaskStatus refuses to touch another org's task", async () => {
    db.seed("Task", [{ id: "tB", organizationId: ORG_B, title: "B", status: "TODO", priority: "MEDIUM" }]);
    const ctxA = await ws.resolveUserContext(USER_A);
    await expect(ws.updateTaskStatus(ctxA, USER_A, "tB", "DONE")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
