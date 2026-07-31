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

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));

const agents = await import("./agent.service.js");
const conversations = await import("./conversation.service.js");
const attachments = await import("./attachment.service.js");
const templates = await import("./promptTemplate.service.js");
const apikeys = await import("./apikey.service.js");

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
});

// ─── Conversations ─────────────────────────────────────────────────────
describe("conversations", () => {
  it("creates a conversation owned by the caller", async () => {
    const c = await conversations.createConversation(USER_A, { title: "Kickoff" } as any);
    expect(c.title).toBe("Kickoff");
    expect(db.tables.get("Conversation")![0].organizationId).toBe(ORG_A);
  });

  it("hides conversations from non-participants in another org", async () => {
    await conversations.createConversation(USER_A, { title: "Alpha only" } as any);
    const forB = await conversations.listConversations(USER_B, { page: 1, perPage: 20 } as any);
    expect(forB.items).toHaveLength(0);
  });

  it("refuses to fetch a conversation the user cannot access", async () => {
    const c = await conversations.createConversation(USER_A, { title: "Secret" } as any);
    await expect(conversations.getConversation(USER_B, c.id)).rejects.toThrow();
  });

  it("soft-deletes rather than destroying the row", async () => {
    const c = await conversations.createConversation(USER_A, { title: "Temp" } as any);
    await conversations.deleteConversation(USER_A, c.id);
    const row = db.tables.get("Conversation")!.find((r) => r.id === c.id);
    // The record must survive for audit; only deletedAt is set.
    expect(row).toBeTruthy();
    expect(row!.deletedAt).toBeTruthy();
    const list = await conversations.listConversations(USER_A, { page: 1, perPage: 20 } as any);
    expect(list.items).toHaveLength(0);
  });
});

// ─── Attachments ───────────────────────────────────────────────────────
describe("attachments", () => {
  const png = () => ({
    buffer: Buffer.from("89504e470d0a1a0a", "hex"),
    originalname: "chart.png",
    mimetype: "image/png",
    size: 8,
  });

  it("rejects an empty file", async () => {
    await expect(attachments.uploadAttachment(USER_A, { ...png(), size: 0 })).rejects.toThrow(/empty/i);
  });

  it("rejects a disallowed MIME type", async () => {
    await expect(
      attachments.uploadAttachment(USER_A, { ...png(), mimetype: "application/x-msdownload" }),
    ).rejects.toThrow(/not allowed/i);
  });

  it("rejects a file over the size limit", async () => {
    await expect(
      attachments.uploadAttachment(USER_A, { ...png(), size: 26 * 1024 * 1024 }),
    ).rejects.toThrow(/25MB/i);
  });

  it("stores a checksum and scopes the record to the organization", async () => {
    const att = await attachments.uploadAttachment(USER_A, png());
    expect(att.organizationId).toBe(ORG_A);
    // sha256 hex
    expect(att.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(att.storageKey.startsWith(`${ORG_A}/`)).toBe(true);
  });

  it("does not list another organization's attachments", async () => {
    await attachments.uploadAttachment(USER_A, png());
    const forB = await attachments.listAttachments(USER_B, {} as any);
    const items = Array.isArray(forB) ? forB : (forB as any).items ?? [];
    expect(items).toHaveLength(0);
  });
});

// ─── Prompt templates ──────────────────────────────────────────────────
describe("prompt templates", () => {
  it("seeds built-ins once per organization", async () => {
    await templates.listTemplates(USER_A);
    const first = db.tables.get("PromptTemplate")!.length;
    expect(first).toBeGreaterThan(0);
    await templates.listTemplates(USER_A);
    // Listing again must not duplicate the built-in set.
    expect(db.tables.get("PromptTemplate")!.length).toBe(first);
  });

  it("renders {{var}} and honours {{var|default}}", async () => {
    const t = await templates.createTemplate(USER_A, {
      title: "Greet", content: "Hello {{name}}, tone={{tone|friendly}}", category: "general",
    } as any);
    const { rendered } = await templates.useTemplate(USER_A, t.id, { name: "Ada" });
    expect(rendered).toBe("Hello Ada, tone=friendly");
  });

  it("substitutes an empty string for an unknown variable rather than leaking the placeholder", async () => {
    const t = await templates.createTemplate(USER_A, {
      title: "Gap", content: "[{{missing}}]", category: "general",
    } as any);
    const { rendered } = await templates.useTemplate(USER_A, t.id, {});
    expect(rendered).toBe("[]");
  });

  it("counts usage", async () => {
    const t = await templates.createTemplate(USER_A, {
      title: "Counted", content: "x", category: "general",
    } as any);
    await templates.useTemplate(USER_A, t.id, {});
    await templates.useTemplate(USER_A, t.id, {});
    const row = db.tables.get("PromptTemplate")!.find((r) => r.id === t.id);
    expect(row!.usageCount).toBe(2);
  });

  it("refuses to use another organization's template", async () => {
    const t = await templates.createTemplate(USER_A, {
      title: "Private", content: "x", category: "general",
    } as any);
    await expect(templates.useTemplate(USER_B, t.id, {})).rejects.toThrow(/not found/i);
  });
});

// ─── Public API keys ───────────────────────────────────────────────────
describe("public API keys", () => {
  it("returns the plaintext key once and stores only a hash", async () => {
    const created: any = await apikeys.createApiKey(USER_A, { name: "ci", scopes: ["READ"] } as any);
    const token = created.token ?? created.key ?? created.plaintext;
    expect(String(token)).toMatch(/^wnd_/);
    const row = db.tables.get("ApiKey")![0];
    // The raw token must never be persisted.
    expect(JSON.stringify(row)).not.toContain(String(token));
    expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies a valid key and rejects a bogus one", async () => {
    const created: any = await apikeys.createApiKey(USER_A, { name: "ci", scopes: ["READ"] } as any);
    const token = created.token ?? created.key ?? created.plaintext;
    expect(await apikeys.verifyApiKey(String(token))).toBeTruthy();
    expect(await apikeys.verifyApiKey("wnd_not_a_real_key")).toBeNull();
    // A token without the prefix is rejected before any DB lookup.
    expect(await apikeys.verifyApiKey("bearer-ish-nonsense")).toBeNull();
  });

  it("rejects a revoked key", async () => {
    const created: any = await apikeys.createApiKey(USER_A, { name: "ci", scopes: ["READ"] } as any);
    const token = String(created.token ?? created.key ?? created.plaintext);
    db.tables.get("ApiKey")![0].revokedAt = new Date();
    expect(await apikeys.verifyApiKey(token)).toBeNull();
  });

  it("rejects an expired key", async () => {
    const created: any = await apikeys.createApiKey(USER_A, { name: "ci", scopes: ["READ"] } as any);
    const token = String(created.token ?? created.key ?? created.plaintext);
    db.tables.get("ApiKey")![0].expiresAt = new Date(Date.now() - 1000);
    expect(await apikeys.verifyApiKey(token)).toBeNull();
  });
});
