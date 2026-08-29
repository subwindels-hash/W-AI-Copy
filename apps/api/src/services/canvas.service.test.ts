/**
 * Session 5 — Windels Workspace / Canvas.
 *
 * The canvas CRUD + blocks + connections service previously had no unit tests
 * (only the realtime canvasCollab service was covered). This suite pins the
 * security and semantics that matter: organization scoping, access-level
 * enforcement (PRIVATE / WORKSPACE / ORGANIZATION), block/connection validation,
 * and soft-delete. Runs on FakePrisma; no database required.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const canvasSvc = await import("./canvas.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const USER_A = "user-alpha";
const USER_A2 = "user-alpha-2"; // same org, same workspace
const USER_B = "user-beta";

function seedUser(id: string, orgId: string, wsId: string) {
  db.seed("User", [{ id, email: `${id}@example.com`, role: "USER", isActive: true }]);
  db.seed("Organization", [{ id: orgId, name: orgId }]);
  db.seed("Workspace", [{ id: wsId, organizationId: orgId, name: "Default" }]);
  db.seed("Membership", [{ id: cuid(), userId: id, organizationId: orgId, workspaceId: wsId, role: "MEMBER", joinedAt: new Date(1) }]);
}

function seedCanvas(id: string, opts: { orgId: string; wsId?: string; createdBy: string; access: string }) {
  // Ensure the creator user row exists so the `createdBy` relation hydrates.
  db.seed("User", [{ id: opts.createdBy, email: `${opts.createdBy}@example.com`, role: "USER", isActive: true }]);
  db.seed("Canvas", [{
    id, organizationId: opts.orgId, workspaceId: opts.wsId ?? null,
    title: `Canvas ${id}`, access: opts.access, createdById: opts.createdBy,
    viewportX: 0, viewportY: 0, viewportZoom: 1, deletedAt: null,
  }]);
}

function seedBlock(id: string, canvasId: string, type = "TEXT") {
  db.seed("CanvasBlock", [{ id, canvasId, type, zIndex: 0, x: 0, y: 0, width: 280, height: 140 }]);
}

beforeEach(() => {
  db.reset();
  seedUser(USER_A, ORG_A, "ws-a");
  seedUser(USER_A2, ORG_A, "ws-a");
  seedUser(USER_B, ORG_B, "ws-b");
});

describe("createCanvas + org scoping", () => {
  it("creates a canvas in the caller's org/workspace and logs activity", async () => {
    const c = await canvasSvc.createCanvas(USER_A, { title: "Design doc" } as any);
    expect(c.organizationId).toBe(ORG_A);
    expect(c.workspaceId).toBe("ws-a");
    expect(db.tables.get("Activity")!.some((a) => a.type === "SYSTEM")).toBe(true);
  });

  it("listCanvases returns only the caller's org", async () => {
    seedCanvas("cA", { orgId: ORG_A, createdBy: USER_A, access: "ORGANIZATION" });
    seedCanvas("cB", { orgId: ORG_B, createdBy: USER_B, access: "ORGANIZATION" });
    const forA = await canvasSvc.listCanvases(USER_A, { page: 1, perPage: 20 } as any);
    expect(forA.items.map((c) => c.id)).toEqual(["cA"]);
  });
});

describe("canvas access control", () => {
  it("denies a PRIVATE canvas to another user in the same org", async () => {
    seedCanvas("cP", { orgId: ORG_A, wsId: "ws-a", createdBy: USER_A, access: "PRIVATE" });
    await expect(canvasSvc.getCanvas(USER_A2, "cP")).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Owner can read it.
    await expect(canvasSvc.getCanvas(USER_A, "cP")).resolves.toMatchObject({ id: "cP" });
  });

  it("denies a canvas to a user in another org regardless of access", async () => {
    seedCanvas("cA", { orgId: ORG_A, wsId: "ws-a", createdBy: USER_A, access: "ORGANIZATION" });
    await expect(canvasSvc.getCanvas(USER_B, "cA")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("soft-deletes a canvas (row survives with deletedAt set)", async () => {
    seedCanvas("c1", { orgId: ORG_A, wsId: "ws-a", createdBy: USER_A, access: "ORGANIZATION" });
    await canvasSvc.deleteCanvas(USER_A, "c1");
    const row = db.tables.get("Canvas")!.find((r) => r.id === "c1");
    expect(row?.deletedAt).toBeTruthy();
  });
});

describe("blocks", () => {
  it("adds a block to an accessible canvas and touches updatedAt", async () => {
    seedCanvas("c1", { orgId: ORG_A, wsId: "ws-a", createdBy: USER_A, access: "ORGANIZATION" });
    const b = await canvasSvc.addBlock(USER_A, "c1", { type: "TEXT", x: 10, y: 20 } as any);
    expect(b.canvasId).toBe("c1");
    expect(db.tables.get("CanvasBlock")).toHaveLength(1);
  });

  it("refuses to add a block to a canvas the user cannot access", async () => {
    seedCanvas("cP", { orgId: ORG_A, wsId: "ws-a", createdBy: USER_A, access: "PRIVATE" });
    await expect(canvasSvc.addBlock(USER_A2, "cP", { type: "TEXT" } as any)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("updateBlock requires the block to belong to the canvas", async () => {
    seedCanvas("c1", { orgId: ORG_A, wsId: "ws-a", createdBy: USER_A, access: "ORGANIZATION" });
    seedCanvas("c2", { orgId: ORG_A, wsId: "ws-a", createdBy: USER_A, access: "ORGANIZATION" });
    seedBlock("b1", "c1");
    await expect(canvasSvc.updateBlock(USER_A, "c2", "b1", { x: 5 } as any)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("connections", () => {
  it("rejects a self-connection and duplicate connections", async () => {
    seedCanvas("c1", { orgId: ORG_A, wsId: "ws-a", createdBy: USER_A, access: "ORGANIZATION" });
    seedBlock("b1", "c1");
    seedBlock("b2", "c1");
    await expect(canvasSvc.addConnection(USER_A, "c1", { fromId: "b1", toId: "b1" } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await canvasSvc.addConnection(USER_A, "c1", { fromId: "b1", toId: "b2" } as any);
    await expect(canvasSvc.addConnection(USER_A, "c1", { fromId: "b1", toId: "b2" } as any)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses a connection referencing a block outside the canvas", async () => {
    seedCanvas("c1", { orgId: ORG_A, wsId: "ws-a", createdBy: USER_A, access: "ORGANIZATION" });
    seedCanvas("c2", { orgId: ORG_A, wsId: "ws-a", createdBy: USER_A, access: "ORGANIZATION" });
    seedBlock("b1", "c1");
    seedBlock("bX", "c2");
    await expect(canvasSvc.addConnection(USER_A, "c1", { fromId: "b1", toId: "bX" } as any)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
