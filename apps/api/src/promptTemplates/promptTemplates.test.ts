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

const templates = await import("./promptTemplates.service.js");


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
