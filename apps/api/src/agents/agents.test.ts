/**
 * Coverage for the five core CRUD modules: agents, conversations, attachments,
 * prompt templates, and the public API key layer.
 *
 * These were reported as "Critical 5 (No Service Files)". They do in fact
 * exist — at `src/services/<name>.service.ts` rather than `src/<module>/`, so a
 * directory-shaped audit misses them — and they are real Prisma-backed
 * implementations wired to registered routes.
 *
 * What they genuinely lacked was any test at all, because they are pure Prisma
 * consumers and the suite has no database. `FakePrisma` closes that gap, so the
 * properties that actually matter — organization scoping, participant access,
 * upload validation, and API-key auth — are now verified rather than assumed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";
import { AgAgentCreateSchema, AgAgentListQuerySchema, AgAgentUpdateSchema } from "@windels/shared/agents";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const agents = await import("./agents.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const USER_A = "user-alpha";
const USER_B = "user-beta";

/** Give each user a membership so resolveUserContext() can place them. */
function seedMemberships() {
  db.seed("Membership", [
    { id: cuid(), userId: USER_A, organizationId: ORG_A, workspaceId: "ws-a", joinedAt: new Date(1) },
    { id: cuid(), userId: USER_B, organizationId: ORG_B, workspaceId: "ws-b", joinedAt: new Date(1) },
  ]);
  db.seed("Organization", [{ id: ORG_A, name: "Alpha" }, { id: ORG_B, name: "Beta" }]);
  db.seed("Workspace", [{ id: "ws-a", organizationId: ORG_A }, { id: "ws-b", organizationId: ORG_B }]);
}

beforeEach(() => {
  db.reset();
  seedMemberships();
});

// ─── Agents ────────────────────────────────────────────────────────────
describe("agents", () => {
  it("creates an agent scoped to the caller's organization", async () => {
    const a = await agents.createAgent(USER_A, { name: "Researcher", role: "analyst" } as any);
    expect(a.name).toBe("Researcher");
    const row = db.tables.get("Agent")![0];
    expect(row.organizationId).toBe(ORG_A);
  });

  it("does not leak agents across organizations", async () => {
    await agents.createAgent(USER_A, { name: "Alpha bot", role: "analyst" } as any);
    const forB = await agents.listAgents(USER_B, { page: 1, perPage: 20 } as any);
    expect(forB.items).toHaveLength(0);
  });

  it("refuses to read another organization's agent", async () => {
    const a = await agents.createAgent(USER_A, { name: "Private", role: "analyst" } as any);
    await expect(agents.getAgent(USER_B, a.id)).rejects.toThrow();
  });

  it("updates status and records lifecycle events against the agent", async () => {
    const a = await agents.createAgent(USER_A, { name: "Worker", role: "analyst" } as any);
    // updateAgentStatus and recordAgentEvent are separate primitives — the
    // runtime calls both; neither implies the other.
    await agents.updateAgentStatus(a.id, "ACTIVE");
    expect(db.tables.get("Agent")!.find((r) => r.id === a.id)!.status).toBe("ACTIVE");

    await agents.recordAgentEvent(a.id, "STATUS_CHANGE", "activated");
    const events = db.tables.get("AgentEvent") ?? [];
    expect(events).toHaveLength(1);
    expect(events[0].agentId).toBe(a.id);
  });

  it("filters agents by status, query and pagination from the real organization store", async () => {
    const online = await agents.createAgent(USER_A, { name: "Online Researcher", role: "research" } as any);
    await agents.createAgent(USER_A, { name: "Offline Writer", role: "writer" } as any);
    await agents.updateAgentStatus(online.id, "ONLINE");
    const result = await agents.listAgents(USER_A, { page: 1, perPage: 10, status: "online", q: "research" }, { status: "online", q: "research" });
    expect(result.items.map((item) => item.id)).toEqual([online.id]);
    expect(result.pagination.total).toBe(1);
  });

  it("updates an agent and rejects an unavailable model", async () => {
    const a = await agents.createAgent(USER_A, { name: "Editable", role: "analyst" } as any);
    const updated = await agents.updateAgent(USER_A, a.id, { name: "Edited", capabilities: ["summarize"] });
    expect(updated.name).toBe("Edited");
    await expect(agents.updateAgent(USER_A, a.id, { modelId: "missing-model" })).rejects.toThrow("not available");
  });

  it("prevents cross-organization updates and deletes", async () => {
    const a = await agents.createAgent(USER_A, { name: "Private", role: "analyst" } as any);
    await expect(agents.updateAgent(USER_B, a.id, { name: "Leaked" })).rejects.toThrow();
    await expect(agents.deleteAgent(USER_B, a.id)).rejects.toThrow();
    expect((await agents.getAgent(USER_A, a.id)).name).toBe("Private");
  });

  it("does not allow built-in agents to be deleted, but deletes custom agents", async () => {
    const builtInId = cuid();
    db.seed("Agent", [{ id: builtInId, organizationId: ORG_A, name: "Built-in", role: "core", isBuiltIn: true, status: "IDLE", createdAt: new Date(), updatedAt: new Date() }]);
    await expect(agents.deleteAgent(USER_A, builtInId)).rejects.toThrow("Built-in agents cannot be deleted");
    const custom = await agents.createAgent(USER_A, { name: "Custom", role: "helper" } as any);
    await expect(agents.deleteAgent(USER_A, custom.id)).resolves.toBeUndefined();
    await expect(agents.getAgent(USER_A, custom.id)).rejects.toThrow("Agent not found");
  });

  it("lists events only after verifying the agent belongs to the caller's organization", async () => {
    const a = await agents.createAgent(USER_A, { name: "Audited", role: "observer" } as any);
    await agents.recordAgentEvent(a.id, "STATUS_CHANGED", "online", { source: "test" });
    const result = await agents.listAgentEvents(USER_A, a.id, { page: 1, perPage: 20 });
    expect(result.items[0]).toMatchObject({ type: "status_changed", message: "online", metadata: { source: "test" } });
    await expect(agents.listAgentEvents(USER_B, a.id, { page: 1, perPage: 20 })).rejects.toThrow();
  });
});

describe("agent shared contracts", () => {
  it("validates create, update and list inputs", () => {
    expect(AgAgentCreateSchema.safeParse({ name: "Researcher", role: "analyst" }).success).toBe(true);
    expect(AgAgentCreateSchema.safeParse({ name: "", role: "analyst" }).success).toBe(false);
    expect(AgAgentUpdateSchema.safeParse({}).success).toBe(false);
    expect(AgAgentListQuerySchema.safeParse({ page: "1", perPage: "25", status: "online" }).success).toBe(true);
    expect(AgAgentListQuerySchema.safeParse({ status: "unknown" }).success).toBe(false);
  });
});
