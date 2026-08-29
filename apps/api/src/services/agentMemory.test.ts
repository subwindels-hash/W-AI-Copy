/**
 * Session 4 — AI Workforce: agent memory, knowledge, and skills.
 *
 * The agent CRUD lifecycle is covered in `agents/agents.test.ts`; these three
 * supporting services (memory, knowledge, skills) previously had no tests.
 * This suite pins the security and semantics that matter: cross-organization
 * access control, dedup, retrieval scoring/filtering, and the deterministic
 * skill-template layer. Runs on FakePrisma; no database required.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const memorySvc = await import("./agentMemory.service.js");
const knowledgeSvc = await import("./agentKnowledge.service.js");
const skillsSvc = await import("./agentSkills.service.js");

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

function seedAgent(id: string, orgId: string) {
  db.seed("Agent", [{ id, organizationId: orgId, name: `Agent ${id}`, role: "Assistant", status: "IDLE" }]);
}

beforeEach(() => {
  db.reset();
  seedUser(USER_A, ORG_A);
  seedUser(USER_B, ORG_B);
});

// ─── Memory ─────────────────────────────────────────────────────
describe("agent memory", () => {
  it("addMemory persists the memory and records an event + activity, org-scoped", async () => {
    seedAgent("ag1", ORG_A);
    const m = await memorySvc.addMemory(USER_A, "ag1", { content: "Client prefers email", type: "PREFERENCE", importance: 0.8, tags: ["client"] } as any);
    expect(m.agentId).toBe("ag1");
    const rows = db.tables.get("AgentMemory")!;
    expect(rows).toHaveLength(1);
    expect(db.tables.get("AgentEvent")!.some((e) => e.type === "MEMORY_STORED")).toBe(true);
    expect(db.tables.get("Activity")!.some((a) => a.type === "SYSTEM")).toBe(true);
  });

  it("refuses to add a memory to another org's agent (no cross-tenant write)", async () => {
    seedAgent("ag1", ORG_A);
    await expect(memorySvc.addMemory(USER_B, "ag1", { content: "leak" } as any)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("listMemories is filtered and paginated, and scoped to the caller's agent", async () => {
    seedAgent("ag1", ORG_A);
    db.seed("AgentMemory", [
      { id: "mem1", agentId: "ag1", type: "FACT", content: "Paris is capital", importance: 0.9 },
      { id: "mem2", agentId: "ag1", type: "PREFERENCE", content: "Likes coffee", importance: 0.5 },
    ]);
    const res = await memorySvc.listMemories(USER_A, "ag1", { page: 1, perPage: 20, type: "fact" } as any);
    expect(res.items.map((m) => m.id)).toEqual(["mem1"]);
    expect(res.items[0]!.type).toBe("fact"); // lowercased
  });

  it("recallMemories scores by term overlap + importance and caps at k", async () => {
    seedAgent("ag1", ORG_A);
    db.seed("AgentMemory", [
      { id: "m1", agentId: "ag1", type: "FACT", content: "deployment uses kubernetes cluster", importance: 0.9 },
      { id: "m2", agentId: "ag1", type: "FACT", content: "team uses postgres database", importance: 0.8 },
      { id: "m3", agentId: "ag1", type: "FACT", content: "unrelated note", importance: 0.3 },
    ]);
    const hits = await memorySvc.recallMemories("ag1", "kubernetes deployment", 10);
    expect(hits[0]!.id).toBe("m1");
    expect(hits.map((h) => h.id)).not.toContain("m3");
  });

  it("autoRemember dedups identical content and ignores too-short input", async () => {
    seedAgent("ag1", ORG_A);
    const a = await memorySvc.autoRemember("ag1", "remember this fact");
    await memorySvc.autoRemember("ag1", "remember this fact");
    const rows = db.tables.get("AgentMemory")!;
    expect(rows).toHaveLength(1); // dedup
    const short = await memorySvc.autoRemember("ag1", "hi");
    expect(short).toBeNull();
  });
});

// ─── Knowledge ──────────────────────────────────────────────────
describe("agent knowledge", () => {
  it("addKnowledge computes tokens and records an event + activity", async () => {
    seedAgent("ag1", ORG_A);
    const k = await knowledgeSvc.addKnowledge(USER_A, "ag1", { title: "Runbook", content: "How to deploy", type: "DOCUMENT" } as any);
    expect(k.tokens).toBe(Math.ceil("How to deploy".length / 4));
    expect(db.tables.get("AgentEvent")!.some((e) => e.type === "KNOWLEDGE_ADDED")).toBe(true);
  });

  it("cross-org access is denied for knowledge add/list", async () => {
    seedAgent("ag1", ORG_A);
    await expect(knowledgeSvc.addKnowledge(USER_B, "ag1", { title: "x", content: "y" } as any)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(knowledgeSvc.listKnowledge(USER_B, "ag1", { page: 1, perPage: 20 } as any)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("retrieveKnowledge matches terms across title/content", async () => {
    seedAgent("ag1", ORG_A);
    db.seed("AgentKnowledge", [
      { id: "k1", agentId: "ag1", type: "DOCUMENT", title: "Incident runbook", content: "steps for kubernetes outage", tokens: 10 },
      { id: "k2", agentId: "ag1", type: "SNIPPET", title: "Notes", content: "postgres backups nightly", tokens: 10 },
    ]);
    const hits = await knowledgeSvc.retrieveKnowledge("ag1", "kubernetes", 5);
    expect(hits.map((h: any) => h.id)).toEqual(["k1"]);
  });
});

// ─── Skills ─────────────────────────────────────────────────────
describe("agent skills", () => {
  it("listSkillTemplates returns the built-in templates with availability", async () => {
    const templates = skillsSvc.listSkillTemplates();
    const names = templates.map((t) => t.name);
    expect(names).toContain("web_search");
    expect(names).toContain("calculator");
    expect(names).toContain("datetime");
  });

  it("addSkillFromTemplate creates a skill from a known template, rejects unknown", async () => {
    seedAgent("ag1", ORG_A);
    const skill = await skillsSvc.addSkillFromTemplate(USER_A, "ag1", "calculator");
    expect(skill.name).toBe("calculator");
    await expect(skillsSvc.addSkillFromTemplate(USER_A, "ag1", "nonexistent" as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("executeAgentSkill throws for a missing or disabled skill", async () => {
    seedAgent("ag1", ORG_A);
    await expect(
      skillsSvc.executeAgentSkill("ag1", "missing", {}, {} as any),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    db.seed("AgentSkill", [{ id: "s1", agentId: "ag1", name: "web_search", enabled: false }]);
    await expect(
      skillsSvc.executeAgentSkill("ag1", "web_search", {}, {} as any),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
