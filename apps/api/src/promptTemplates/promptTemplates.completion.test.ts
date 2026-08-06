/**
 * Session 119 — Prompt Templates Library completion tests.
 *
 * The Session 23 suite (`promptTemplates.test.ts`) pins the module's original
 * five behaviours. This suite pins everything Session 119 added or fixed,
 * driving the real services against FakePrisma (Postgres stand-in) and FakeKv
 * (Redis stand-in):
 *
 *   - the renderer defect: `{{var | default}}` (space around the pipe) used to
 *     leak the raw placeholder into the rendered prompt; it now resolves;
 *   - holes: a variable that is neither supplied nor defaulted renders empty
 *     (Session 23's pinned behaviour) AND is reported in `unresolved` — a
 *     gapped prompt is never presented as complete;
 *   - the race: update/delete/use looked the row up org-scoped and then
 *     mutated with `where: { id }`; if the row vanished in between, Prisma
 *     P2025 escaped as a 500. It is now mapped to not-found;
 *   - icon validation counts Unicode code points, so a family emoji (11 UTF-16
 *     units, 4 code points) is accepted instead of being rejected as "too
 *     long";
 *   - the org-scoped usage ledger (`pt:*` keys): NX first-event marker,
 *     capped event list, per-day buckets with TTL, recent sorted set — and
 *     statistics that report `null`/absence rather than invented zeros, are
 *     floored rather than rounded, and never mix the database counter with
 *     the windowed ledger;
 *   - the ledger is best-effort: a failing Redis must not break a template
 *     use, and the stats payload says `ledgerAvailable: false`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
vi.mock("../db/redis.js", () => ({
  redis: kv,
  redisCmd: kv,
  redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const service = await import("./promptTemplates.service.js");
const usage = await import("./promptTemplatesUsage.service.js");
const shared = await import("@windels/shared/promptTemplates");
// The mocked db/client module: the exact prisma instance the services hold.
const clientMock = await import("../db/client.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const USER_A = "user-alpha";
const USER_B = "user-beta";

function seedMemberships() {
  db.seed("Membership", [
    { id: cuid(), userId: USER_A, organizationId: ORG_A, workspaceId: "ws-a", joinedAt: new Date(1) },
    { id: cuid(), userId: USER_B, organizationId: ORG_B, workspaceId: "ws-b", joinedAt: new Date(1) },
  ]);
  db.seed("Organization", [{ id: ORG_A, name: "Alpha" }, { id: ORG_B, name: "Beta" }]);
  db.seed("Workspace", [{ id: "ws-a", organizationId: ORG_A }, { id: "ws-b", organizationId: ORG_B }]);
}

beforeEach(() => {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
  db.reset();
  seedMemberships();
});

function seedTemplate(overrides: Record<string, unknown> = {}) {
  const row = {
    id: cuid(),
    organizationId: ORG_A,
    title: "Seed",
    description: null,
    content: "plain",
    category: "general",
    icon: null,
    createdById: USER_A,
    isBuiltIn: false,
    usageCount: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
  db.seed("PromptTemplate", [row]);
  return row;
}

const P2025 = Object.assign(new Error("Record not found"), { code: "P2025" });

// ══════════════════════════════════════════════════════════════════════════
// Shared contract — rendering (the Session 119 renderer fixes)
// ══════════════════════════════════════════════════════════════════════════

describe("shared renderPromptTemplate", () => {
  it("substitutes supplied variables", () => {
    const out = shared.renderPromptTemplate("Hello {{name}}!", { name: "Ada" });
    expect(out.rendered).toBe("Hello Ada!");
    expect(out.missing).toEqual([]);
    expect(out.usedDefaults).toEqual([]);
  });

  it("resolves {{name|default}} from the default when the variable is absent", () => {
    const out = shared.renderPromptTemplate("Tone: {{tone|professional}}", {});
    expect(out.rendered).toBe("Tone: professional");
    expect(out.usedDefaults).toEqual(["tone"]);
    expect(out.missing).toEqual([]);
  });

  it("prefers a supplied value over the declared default", () => {
    const out = shared.renderPromptTemplate("Tone: {{tone|professional}}", { tone: "casual" });
    expect(out.rendered).toBe("Tone: casual");
    expect(out.usedDefaults).toEqual([]);
  });

  it("uses an empty-string value rather than the default (value present, empty)", () => {
    const out = shared.renderPromptTemplate("[{{x|fallback}}]", { x: "" });
    expect(out.rendered).toBe("[]");
    expect(out.usedDefaults).toEqual([]);
  });

  it("FIXED: resolves {{name | default}} with whitespace around the pipe", () => {
    // Session 23's pattern required the pipe immediately after the name, so
    // this form leaked the raw placeholder into the prompt.
    const out = shared.renderPromptTemplate("Tone: {{tone | professional}}", {});
    expect(out.rendered).toBe("Tone: professional");
    expect(out.usedDefaults).toEqual(["tone"]);
  });

  it("FIXED: resolves {{ name | default }} with whitespace everywhere", () => {
    const out = shared.renderPromptTemplate("{{ lang | en }}: hi", {});
    expect(out.rendered).toBe("en: hi");
  });

  it("reports a missing variable in `missing` and renders empty (Session 23 behaviour kept)", () => {
    const out = shared.renderPromptTemplate("[{{missing}}]", {});
    expect(out.rendered).toBe("[]");
    expect(out.missing).toEqual(["missing"]);
  });

  it("deduplicates the missing list", () => {
    const out = shared.renderPromptTemplate("{{a}} {{a}} {{a}}", {});
    expect(out.missing).toEqual(["a"]);
  });

  it("does not report variables that were filled from defaults as missing", () => {
    const out = shared.renderPromptTemplate("{{a|1}} {{b}}", { a: "x" });
    expect(out.rendered).toBe("x ");
    expect(out.missing).toEqual(["b"]);
  });

  it("leaves malformed placeholders raw ({{ }} and { single brace })", () => {
    const out = shared.renderPromptTemplate("a {{ }} b { not a var } c", {});
    expect(out.rendered).toBe("a {{ }} b { not a var } c");
    expect(out.missing).toEqual([]);
  });

  it("matches placeholders with spaces inside the braces", () => {
    const out = shared.renderPromptTemplate("Hi {{ name }}!", { name: "Bo" });
    expect(out.rendered).toBe("Hi Bo!");
  });

  it("treats multi-word default values as part of the default", () => {
    const out = shared.renderPromptTemplate("{{x|two words}}", {});
    expect(out.rendered).toBe("two words");
  });
});

describe("shared extractTemplateVars", () => {
  it("lists variables in first-appearance order, deduplicated", () => {
    expect(shared.extractTemplateVars("{{b}} then {{a}} then {{b}}")).toEqual(["b", "a"]);
  });

  it("returns [] for content without placeholders", () => {
    expect(shared.extractTemplateVars("no placeholders here")).toEqual([]);
  });

  it("understands the whitespace-around-pipe form", () => {
    expect(shared.extractTemplateVars("{{ tone | professional }}")).toEqual(["tone"]);
  });

  it("ignores malformed braces", () => {
    expect(shared.extractTemplateVars("{{ }} {{}} {x}")).toEqual([]);
  });
});

describe("shared extractTemplateDefaults", () => {
  it("returns declared defaults keyed by name", () => {
    expect(shared.extractTemplateDefaults("{{tone|professional}} {{x}} {{y|2}}")).toEqual({
      tone: "professional",
      y: "2",
    });
  });

  it("keeps the first default for a repeated variable", () => {
    expect(shared.extractTemplateDefaults("{{x|first}} {{x|second}}")).toEqual({ x: "first" });
  });

  it("returns {} when nothing declares a default", () => {
    expect(shared.extractTemplateDefaults("{{a}} {{b}}")).toEqual({});
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Shared contract — rates and helpers
// ══════════════════════════════════════════════════════════════════════════

describe("shared promptTemplateSharePercent", () => {
  it("floors, never rounds: 999/1000 is 99, not 100", () => {
    expect(shared.promptTemplateSharePercent(999, 1000)).toBe(99);
  });

  it("returns null on an empty denominator", () => {
    expect(shared.promptTemplateSharePercent(0, 0)).toBeNull();
    expect(shared.promptTemplateSharePercent(5, -1)).toBeNull();
  });

  it("clamps a part larger than the whole to 100", () => {
    expect(shared.promptTemplateSharePercent(12, 10)).toBe(100);
  });

  it("returns 0 for a zero part on a positive whole", () => {
    expect(shared.promptTemplateSharePercent(0, 10)).toBe(0);
  });
});

describe("shared promptTemplateAvgPerDay", () => {
  it("floors to 2 decimals", () => {
    expect(shared.promptTemplateAvgPerDay(10, 3)).toBe(3.33);
  });

  it("returns null when there are no days", () => {
    expect(shared.promptTemplateAvgPerDay(5, 0)).toBeNull();
    expect(shared.promptTemplateAvgPerDay(5, -2)).toBeNull();
  });
});

describe("shared utcDay helpers", () => {
  it("formats the UTC calendar day", () => {
    expect(shared.utcDayOf(new Date("2026-08-06T23:59:59Z"))).toBe("2026-08-06");
    expect(shared.utcDayOf(new Date("2026-08-06T00:00:00Z"))).toBe("2026-08-06");
  });

  it("walks backwards across month boundaries", () => {
    expect(shared.utcDayBefore(new Date("2026-08-01T12:00:00Z"), 1)).toBe("2026-07-31");
    expect(shared.utcDayBefore(new Date("2026-03-01T12:00:00Z"), 1)).toBe("2026-02-28");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Shared contract — Zod validation
// ══════════════════════════════════════════════════════════════════════════

describe("PromptTemplateCreateSchema", () => {
  it("defaults the category to general", () => {
    const out = shared.PromptTemplateCreateSchema.parse({ title: "T", content: "c" });
    expect(out.category).toBe("general");
  });

  it("accepts an icon of up to 8 code points", () => {
    expect(shared.PromptTemplateCreateSchema.parse({ title: "T", content: "c", icon: "📝📝" }).icon).toBe("📝📝");
  });

  it("FIXED: accepts a family emoji (11 UTF-16 units, 4 code points) that Session 23's .max(8) rejected", () => {
    const family = "👨‍👩‍👧‍👦";
    expect(family.length).toBeGreaterThan(8); // the old check counted UTF-16 units
    const out = shared.PromptTemplateCreateSchema.parse({ title: "T", content: "c", icon: family });
    expect(out.icon).toBe(family);
  });

  it("rejects an icon of 9 code points", () => {
    expect(() =>
      shared.PromptTemplateCreateSchema.parse({ title: "T", content: "c", icon: "一二三四五六七八九" }),
    ).toThrow();
  });

  it("rejects empty titles and content, and over-long content", () => {
    expect(() => shared.PromptTemplateCreateSchema.parse({ title: " ", content: "c" })).toThrow();
    expect(() => shared.PromptTemplateCreateSchema.parse({ title: "T", content: "" })).toThrow();
    expect(() =>
      shared.PromptTemplateCreateSchema.parse({ title: "T", content: "x".repeat(20001) }),
    ).toThrow();
  });

  it("accepts a 20000-char content", () => {
    expect(shared.PromptTemplateCreateSchema.parse({ title: "T", content: "x".repeat(20000) }).content.length).toBe(20000);
  });

  it("rejects a title longer than 200", () => {
    expect(() => shared.PromptTemplateCreateSchema.parse({ title: "x".repeat(201), content: "c" })).toThrow();
  });

  it("rejects a description longer than 500", () => {
    expect(() =>
      shared.PromptTemplateCreateSchema.parse({ title: "T", content: "c", description: "x".repeat(501) }),
    ).toThrow();
  });
});

describe("PromptTemplateUpdateSchema", () => {
  it("requires at least one field", () => {
    expect(() => shared.PromptTemplateUpdateSchema.parse({})).toThrow(/At least one field/);
  });

  it("accepts a partial update", () => {
    expect(shared.PromptTemplateUpdateSchema.parse({ title: "New" })).toEqual({ title: "New" });
  });
});

describe("PromptTemplateUseBodySchema / stats / list query schemas", () => {
  it("defaults the use body to {}", () => {
    expect(shared.PromptTemplateUseBodySchema.parse(undefined)).toEqual({});
    expect(shared.PromptTemplateUseBodySchema.parse({ name: "Ada" })).toEqual({ name: "Ada" });
  });

  it("stats window defaults to 7 and rejects 0 and 91", () => {
    expect(shared.PromptTemplateStatsQuerySchema.parse({}).days).toBe(7);
    expect(shared.PromptTemplateStatsQuerySchema.parse({ days: "30" }).days).toBe(30);
    expect(() => shared.PromptTemplateStatsQuerySchema.parse({ days: 0 })).toThrow();
    expect(() => shared.PromptTemplateStatsQuerySchema.parse({ days: 91 })).toThrow();
  });

  it("list query coerces limit and caps it at 100", () => {
    expect(shared.PromptTemplateListQuerySchema.parse({ limit: "25" }).limit).toBe(25);
    expect(() => shared.PromptTemplateListQuerySchema.parse({ limit: 101 })).toThrow();
    expect(shared.PromptTemplateListQuerySchema.parse({ q: "  hi  " }).q).toBe("hi");
  });

  it("rejects a non-cuid template id", () => {
    expect(() => shared.PromptTemplateIdParamSchema.parse({ id: "not-a-cuid" })).toThrow();
  });

  it("duplicate schema accepts no body or an optional title", () => {
    expect(shared.PromptTemplateDuplicateSchema.parse({})).toEqual({});
    expect(shared.PromptTemplateDuplicateSchema.parse({ title: "Copy" })).toEqual({ title: "Copy" });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Service — CRUD, isolation, built-in protection
// ══════════════════════════════════════════════════════════════════════════

describe("service CRUD", () => {
  it("seeds built-ins lazily per organization, never leaking another org's rows", async () => {
    const a = await service.listTemplates(USER_A);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((t: any) => t.isBuiltIn && t.organizationId === ORG_A)).toBe(true);
    // Org B's first list seeds its OWN built-ins — the rows are org-scoped.
    const b = await service.listTemplates(USER_B);
    expect(b.length).toBeGreaterThan(0);
    expect(b.every((t: any) => t.organizationId === ORG_B)).toBe(true);
    const all = db.tables.get("PromptTemplate") as any[];
    expect(all.every((t) => t.organizationId === ORG_A || t.organizationId === ORG_B)).toBe(true);
  });

  it("keeps built-ins separate from user templates in the list order", async () => {
    await service.listTemplates(USER_A); // seeds built-ins
    await service.createTemplate(USER_A, { title: "Mine", content: "x", category: "general" } as any);
    const rows = await service.listTemplates(USER_A);
    expect(rows[0]!.isBuiltIn).toBe(true); // built-ins sort first
    expect(rows.some((r: any) => r.title === "Mine")).toBe(true);
  });

  it("filters by category", async () => {
    await service.listTemplates(USER_A);
    await service.createTemplate(USER_A, { title: "Python", content: "x", category: "coding" } as any);
    const coding = await service.listTemplates(USER_A, "coding");
    // "Code review" is a built-in in the coding category, plus the new one.
    expect(coding.length).toBe(2);
    expect(coding.some((t: any) => t.title === "Python")).toBe(true);
    const general = await service.listTemplates(USER_A, "general");
    expect(general.length).toBe(2); // "Summarize text" + "Explain like I'm 5"
    expect(general.every((t: any) => t.isBuiltIn)).toBe(true);
  });

  it("searches case-insensitively across title, content and description", async () => {
    await service.listTemplates(USER_A);
    await service.createTemplate(USER_A, {
      title: "Quarterly Report", content: "numbers", description: "finance deck", category: "general",
    } as any);
    expect((await service.listTemplates(USER_A, undefined, { q: "QUARTERLY" })).length).toBe(1);
    expect((await service.listTemplates(USER_A, undefined, { q: "FINANCE" })).length).toBe(1);
    expect((await service.listTemplates(USER_A, undefined, { q: "NUMBERS" })).length).toBe(1);
    expect((await service.listTemplates(USER_A, undefined, { q: "nope" })).length).toBe(0);
  });

  it("caps the list with limit", async () => {
    await service.listTemplates(USER_A);
    const limited = await service.listTemplates(USER_A, undefined, { limit: 3 });
    expect(limited.length).toBe(3);
  });

  it("getTemplate returns an org-scoped template and 404s cross-org", async () => {
    const t = seedTemplate({ title: "Private" });
    const got = await service.getTemplate(USER_A, t.id);
    expect(got.title).toBe("Private");
    await expect(service.getTemplate(USER_B, t.id)).rejects.toThrow(/not found/i);
  });

  it("createTemplate scopes to the caller's org and stamps createdById", async () => {
    const t = await service.createTemplate(USER_A, { title: "Mine", content: "x" } as any);
    const row = db.tables.get("PromptTemplate")!.find((r: any) => r.id === t.id);
    expect(row!.organizationId).toBe(ORG_A);
    expect(row!.createdById).toBe(USER_A);
    expect(row!.isBuiltIn).toBe(false);
  });

  it("updateTemplate rejects built-ins and 404s cross-org", async () => {
    await service.listTemplates(USER_A); // seeds built-ins
    const builtIn = (await service.listTemplates(USER_A))[0];
    await expect(service.updateTemplate(USER_A, builtIn.id, { title: "Hijack" })).rejects.toThrow(/built-in/i);
    const mine = await service.createTemplate(USER_A, { title: "Mine", content: "x" } as any);
    await expect(service.updateTemplate(USER_B, mine.id, { title: "Theirs" })).rejects.toThrow(/not found/i);
    const updated = await service.updateTemplate(USER_A, mine.id, { title: "Renamed" });
    expect(updated.title).toBe("Renamed");
  });

  it("deleteTemplate rejects built-ins and 404s cross-org", async () => {
    await service.listTemplates(USER_A);
    const builtIn = (await service.listTemplates(USER_A))[0];
    await expect(service.deleteTemplate(USER_A, builtIn.id)).rejects.toThrow(/built-in/i);
    const mine = await service.createTemplate(USER_A, { title: "Mine", content: "x" } as any);
    await expect(service.deleteTemplate(USER_B, mine.id)).rejects.toThrow(/not found/i);
    await service.deleteTemplate(USER_A, mine.id);
    expect(db.tables.get("PromptTemplate")!.some((r: any) => r.id === mine.id)).toBe(false);
  });

  it("duplicateTemplate copies a built-in into an editable user template", async () => {
    await service.listTemplates(USER_A);
    const builtIn = (await service.listTemplates(USER_A))[0];
    const copy = await service.duplicateTemplate(USER_A, builtIn.id);
    expect(copy.id).not.toBe(builtIn.id);
    expect(copy.title).toBe(`${builtIn.title} (copy)`);
    expect(copy.isBuiltIn).toBe(false);
    expect(copy.content).toBe(builtIn.content);
    expect(copy.createdById).toBe(USER_A);
    // The copy is editable even though the source was a built-in.
    const renamed = await service.updateTemplate(USER_A, copy.id, { title: "My version" });
    expect(renamed.title).toBe("My version");
  });

  it("duplicateTemplate honours an explicit title and 404s cross-org", async () => {
    const t = seedTemplate({ title: "Original" });
    const copy = await service.duplicateTemplate(USER_A, t.id, { title: "Explicit copy" });
    expect(copy.title).toBe("Explicit copy");
    await expect(service.duplicateTemplate(USER_B, t.id)).rejects.toThrow(/not found/i);
  });

  it("duplicateTemplate truncates the auto-copy title to 200 chars", async () => {
    const t = seedTemplate({ title: "x".repeat(200) });
    const copy = await service.duplicateTemplate(USER_A, t.id);
    expect(copy.title.length).toBe(200);
    expect(copy.title.endsWith("(copy)")).toBe(true);
  });

  it("useTemplate 404s cross-org", async () => {
    const t = seedTemplate({ title: "Private" });
    await expect(service.useTemplate(USER_B, t.id, {})).rejects.toThrow(/not found/i);
  });

  it("seedBuiltInTemplates is idempotent when called directly", async () => {
    await service.seedBuiltInTemplates(ORG_A, USER_A);
    const first = db.tables.get("PromptTemplate")!.length;
    await service.seedBuiltInTemplates(ORG_A, USER_A);
    expect(db.tables.get("PromptTemplate")!.length).toBe(first);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Service — the P2025 race (Session 119 fix)
// ══════════════════════════════════════════════════════════════════════════

describe("service P2025 race (row vanishes between lookup and mutation)", () => {
  // `db.client()` returns a fresh proxy per call, so spies must be installed
  // on the exact instance the service holds — the mocked db/client module.
  const mockedPrisma = () => (clientMock as any).prisma;

  it("updateTemplate maps P2025 to not-found instead of a 500", async () => {
    const t = seedTemplate({ title: "Mine" });
    const updateSpy = vi.spyOn(mockedPrisma().promptTemplate, "update").mockRejectedValueOnce(P2025);
    await expect(service.updateTemplate(USER_A, t.id, { title: "New" })).rejects.toMatchObject({ status: 404 });
    updateSpy.mockRestore();
  });

  it("deleteTemplate maps P2025 to not-found", async () => {
    const t = seedTemplate({ title: "Mine" });
    const deleteSpy = vi.spyOn(mockedPrisma().promptTemplate, "delete").mockRejectedValueOnce(P2025);
    await expect(service.deleteTemplate(USER_A, t.id)).rejects.toMatchObject({ status: 404 });
    deleteSpy.mockRestore();
  });

  it("useTemplate maps a P2025 on the counter increment to not-found", async () => {
    const t = seedTemplate({ title: "Mine" });
    const updateSpy = vi.spyOn(mockedPrisma().promptTemplate, "update").mockRejectedValueOnce(P2025);
    await expect(service.useTemplate(USER_A, t.id, {})).rejects.toMatchObject({ status: 404 });
    updateSpy.mockRestore();
  });

  it("a non-P2025 error still propagates", async () => {
    const t = seedTemplate({ title: "Mine" });
    const updateSpy = vi.spyOn(mockedPrisma().promptTemplate, "update").mockRejectedValueOnce(new Error("db down"));
    await expect(service.updateTemplate(USER_A, t.id, { title: "New" })).rejects.toThrow(/db down/);
    updateSpy.mockRestore();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Service — usage path + ledger writes
// ══════════════════════════════════════════════════════════════════════════

describe("useTemplate ledger writes", () => {
  it("increments the durable usageCount", async () => {
    const t = seedTemplate({ title: "Counted" });
    await service.useTemplate(USER_A, t.id, {});
    await service.useTemplate(USER_A, t.id, {});
    const row = db.tables.get("PromptTemplate")!.find((r: any) => r.id === t.id);
    expect(row!.usageCount).toBe(2);
  });

  it("returns template, rendered and unresolved", async () => {
    const t = seedTemplate({ title: "Greet", content: "Hi {{name}}, tone {{tone|friendly}}" });
    const out = await service.useTemplate(USER_A, t.id, { name: "Ada" });
    expect(out.rendered).toBe("Hi Ada, tone friendly");
    expect(out.unresolved).toEqual([]);
    expect(out.template.id).toBe(t.id);
  });

  it("reports unresolved variables", async () => {
    const t = seedTemplate({ title: "Gap", content: "[{{a}}] [{{b}}] [{{a}}]" });
    const out = await service.useTemplate(USER_A, t.id, {});
    expect(out.rendered).toBe("[] [] []");
    expect(out.unresolved).toEqual(["a", "b"]);
  });

  it("writes the NX first-event marker, the event, the recent zset and the day bucket", async () => {
    const t = seedTemplate({ title: "Ledgered" });
    const at = new Date("2026-08-06T10:00:00Z");
    await usage.recordTemplateUse(ORG_A, t.id, USER_A, at);
    expect(kv.strings.get("pt:since:org-alpha")!.value).toBe(at.toISOString());
    expect(kv.lists.get("pt:use:org-alpha")!.length).toBe(1);
    const event = JSON.parse(kv.lists.get("pt:use:org-alpha")![0]!);
    expect(event.templateId).toBe(t.id);
    expect(event.userId).toBe(USER_A);
    expect(kv.zsets.get("pt:recent:org-alpha")!.get(t.id)).toBe(at.getTime());
    expect(kv.hashes.get("pt:day:org-alpha:2026-08-06")![t.id]).toBe("1");
  });

  it("keeps the first-event marker across later uses (NX)", async () => {
    const t = seedTemplate({ title: "Ledgered" });
    await usage.recordTemplateUse(ORG_A, t.id, USER_A, new Date("2026-08-01T00:00:00Z"));
    await usage.recordTemplateUse(ORG_A, t.id, USER_A, new Date("2026-08-06T00:00:00Z"));
    expect(kv.strings.get("pt:since:org-alpha")!.value).toBe("2026-08-01T00:00:00.000Z");
  });

  it("caps the event list at PROMPT_TEMPLATE_LEDGER_CAP", async () => {
    const t = seedTemplate({ title: "Ledgered" });
    for (let i = 0; i < shared.PROMPT_TEMPLATE_LEDGER_CAP + 25; i++) {
      await usage.recordTemplateUse(ORG_A, t.id, USER_A, new Date(Date.UTC(2026, 7, 6) + i * 1000));
    }
    expect(kv.lists.get("pt:use:org-alpha")!.length).toBe(shared.PROMPT_TEMPLATE_LEDGER_CAP);
  });

  it("refreshes the day-bucket TTL on every write", async () => {
    const t = seedTemplate({ title: "Ledgered" });
    const expireSpy = vi.spyOn(kv, "expire");
    await usage.recordTemplateUse(ORG_A, t.id, USER_A, new Date("2026-08-06T10:00:00Z"));
    expect(expireSpy).toHaveBeenCalledWith("pt:day:org-alpha:2026-08-06", shared.PROMPT_TEMPLATE_DAY_BUCKET_TTL_DAYS * 86400);
    expireSpy.mockRestore();
  });

  it("a failing ledger never breaks the use path", async () => {
    const t = seedTemplate({ title: "Resilient" });
    const lpushSpy = vi.spyOn(kv, "lpush").mockRejectedValueOnce(new Error("redis down"));
    const out = await service.useTemplate(USER_A, t.id, {});
    expect(out.rendered).toBe("plain");
    const row = db.tables.get("PromptTemplate")!.find((r: any) => r.id === t.id);
    expect(row!.usageCount).toBe(1); // durable counter still incremented
    lpushSpy.mockRestore();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Service — statistics
// ══════════════════════════════════════════════════════════════════════════

describe("templateStats", () => {
  it("reports database totals and an empty ledger honestly for a fresh org", async () => {
    await service.listTemplates(USER_B); // org B has built-ins but no uses
    const s = await usage.templateStats(USER_B, 7);
    expect(s.totalTemplates).toBeGreaterThan(0);
    expect(s.builtInTemplates).toBe(s.totalTemplates);
    expect(s.userTemplates).toBe(0);
    expect(s.totalUses).toBe(0);
    expect(s.ledgerAvailable).toBe(true);
    expect(s.ledgerStart).toBeNull();
    expect(s.usesInWindow).toBe(0);
    expect(s.distinctUseDays).toBe(0);
    expect(s.ledgerCoveredDays).toBe(0);
    expect(s.avgUsesPerDay).toBeNull();
    expect(s.topTemplates).toEqual([]);
    expect(s.recentTemplates).toEqual([]);
    expect(s.daily).toEqual([]);
    expect(s.note.length).toBeGreaterThan(10);
  });

  it("counts window uses from the day buckets and reports the ledger start", async () => {
    await service.listTemplates(USER_A);
    const a = (await service.listTemplates(USER_A))[0];
    const b = (await service.listTemplates(USER_A))[1];
    const today = new Date("2026-08-06T12:00:00Z");
    await usage.recordTemplateUse(ORG_A, a.id, USER_A, new Date("2026-08-05T09:00:00Z"));
    await usage.recordTemplateUse(ORG_A, a.id, USER_A, new Date("2026-08-06T09:00:00Z"));
    await usage.recordTemplateUse(ORG_A, b.id, USER_A, new Date("2026-08-06T10:00:00Z"));
    const s = await usage.templateStats(USER_A, 7, today);
    expect(s.ledgerStart).toBe("2026-08-05T09:00:00.000Z");
    expect(s.usesInWindow).toBe(3);
    expect(s.distinctUseDays).toBe(2);
    expect(s.daily).toEqual([
      { day: "2026-08-05", uses: 1 },
      { day: "2026-08-06", uses: 2 },
    ]);
    expect(s.ledgerCoveredDays).toBe(2); // 08-05 → 08-06
    expect(s.avgUsesPerDay).toBe(1.5);
  });

  it("excludes uses older than the window from window numbers but keeps the ledger start", async () => {
    await service.listTemplates(USER_A);
    const a = (await service.listTemplates(USER_A))[0];
    await usage.recordTemplateUse(ORG_A, a.id, USER_A, new Date("2026-06-01T00:00:00Z")); // 66 days ago
    await usage.recordTemplateUse(ORG_A, a.id, USER_A, new Date("2026-08-06T00:00:00Z"));
    const s = await usage.templateStats(USER_A, 7, new Date("2026-08-06T12:00:00Z"));
    expect(s.ledgerStart).toBe("2026-06-01T00:00:00.000Z");
    expect(s.usesInWindow).toBe(1);
    // covered days are bounded by the window: 7 days, not 67.
    expect(s.ledgerCoveredDays).toBe(7);
    expect(s.avgUsesPerDay).toBe(0.14); // floor(1/7 * 100)/100
  });

  it("ranks top templates by window uses and resolves titles", async () => {
    await service.listTemplates(USER_A);
    const rows = await service.listTemplates(USER_A);
    const [a, b] = rows;
    await usage.recordTemplateUse(ORG_A, b.id, USER_A, new Date("2026-08-06T08:00:00Z"));
    await usage.recordTemplateUse(ORG_A, b.id, USER_A, new Date("2026-08-06T09:00:00Z"));
    await usage.recordTemplateUse(ORG_A, a.id, USER_A, new Date("2026-08-06T10:00:00Z"));
    const s = await usage.templateStats(USER_A, 7, new Date("2026-08-06T12:00:00Z"));
    expect(s.topTemplates[0]!.templateId).toBe(b.id);
    expect(s.topTemplates[0]!.uses).toBe(2);
    expect(s.topTemplates[0]!.title).toBe(b.title);
    expect(s.topTemplates[1]!.templateId).toBe(a.id);
    expect(s.topTemplates[1]!.lastUsedAt).toBe("2026-08-06T10:00:00.000Z");
  });

  it("orders recent templates by last use and keeps deleted ids with title null", async () => {
    await service.listTemplates(USER_A);
    const a = (await service.listTemplates(USER_A))[0];
    const mine = await service.createTemplate(USER_A, { title: "Mine", content: "x" } as any);
    await usage.recordTemplateUse(ORG_A, a.id, USER_A, new Date("2026-08-06T08:00:00Z"));
    await usage.recordTemplateUse(ORG_A, mine.id, USER_A, new Date("2026-08-06T11:00:00Z"));
    const s = await usage.templateStats(USER_A, 7, new Date("2026-08-06T12:00:00Z"));
    expect(s.recentTemplates[0]!.templateId).toBe(mine.id);
    expect(s.recentTemplates[0]!.lastUsedAt).toBe("2026-08-06T11:00:00.000Z");
    // Delete the used user template: the ledger keeps id + count, title becomes null.
    await service.deleteTemplate(USER_A, mine.id);
    const s2 = await usage.templateStats(USER_A, 7, new Date("2026-08-06T12:00:00Z"));
    const top = s2.topTemplates.find((t: any) => t.templateId === mine.id);
    expect(top!.uses).toBe(1);
    expect(top!.title).toBeNull();
  });

  it("keeps organizations isolated: org B never sees org A's ledger", async () => {
    const t = seedTemplate({ title: "A's" });
    await usage.recordTemplateUse(ORG_A, t.id, USER_A, new Date("2026-08-06T10:00:00Z"));
    const s = await usage.templateStats(USER_B, 7, new Date("2026-08-06T12:00:00Z"));
    expect(s.totalTemplates).toBe(0);
    expect(s.usesInWindow).toBe(0);
    expect(s.ledgerStart).toBeNull();
  });

  it("reports ledgerAvailable=false and an empty ledger when Redis fails", async () => {
    await service.listTemplates(USER_A);
    const a = (await service.listTemplates(USER_A))[0];
    await usage.recordTemplateUse(ORG_A, a.id, USER_A, new Date());
    const hgetallSpy = vi.spyOn(kv, "hgetall").mockRejectedValueOnce(new Error("redis down"));
    const s = await usage.templateStats(USER_A, 7);
    hgetallSpy.mockRestore();
    expect(s.ledgerAvailable).toBe(false);
    expect(s.usesInWindow).toBe(0);
    expect(s.distinctUseDays).toBe(0);
    expect(s.avgUsesPerDay).toBeNull();
    expect(s.ledgerStart).toBeNull();
    expect(s.topTemplates).toEqual([]);
    // Database side is still measured and reported.
    expect(s.totalTemplates).toBeGreaterThan(0);
  });

  it("sums lifetime uses from usageCount regardless of the ledger", async () => {
    seedTemplate({ title: "Old", usageCount: 41 });
    seedTemplate({ title: "Newer", usageCount: 9 });
    const s = await usage.templateStats(USER_A, 7);
    expect(s.totalTemplates).toBe(2);
    expect(s.totalUses).toBe(50);
    expect(s.usesInWindow).toBe(0); // nothing recorded in the ledger
  });
});
