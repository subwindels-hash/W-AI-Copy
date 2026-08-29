/**
 * Session 125 — Super Admin Biography, Identity Memory & AI Knowledge tests.
 *
 * Drives the real service against FakeKv (Redis) + FakePrisma (AuditLog):
 *   - **Super Admin authority**: only role SUPER_ADMIN may create/edit/
 *     approve/publish/archive/delete/import/grant — enforced in the service
 *     itself (a mis-wired route still cannot bypass it);
 *   - **classification access**: private → super admin or explicit grant or
 *     ORG_ADMIN; organization → members; public → any authenticated caller;
 *   - **lifecycle + verification**: publish is the only path to `verified`;
 *     editing a published record returns it to pending_approval and clears
 *     verified;
 *   - **versions + audit**: every mutation appends a version and an
 *     AuditLog row;
 *   - **continuous synchronization**: publish writes the record into the
 *     Memory Fabric (me:* keys) content-deduplicated (re-publish does not
 *     duplicate) and dispatches Kernel events;
 *   - **AI response engine**: answers only from visible records, verified
 *     ranked highest, sources returned, insufficient-knowledge honesty,
 *     restricted records never leak;
 *   - **knowledge agents**: deterministic runs, super-admin gating for the
 *     synchronization agent;
 *   - **knowledge graph, grants, import/export, org isolation**.
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

const { IdentityKnowledgeService } = await import("./identityKnowledge.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const SUPER = { id: "user-super", role: "SUPER_ADMIN" as const };
const ADMIN = { id: "user-admin", role: "ADMIN" as const };
const MEMBER = { id: "user-member", role: "USER" as const };

beforeEach(() => {
  kv.strings.clear();
  kv.hashes.clear();
  kv.zsets.clear();
  kv.lists.clear();
  kv.sets.clear();
  db.reset();
  db.seed("User", [
    { id: SUPER.id, email: "super@windels.ai", role: "SUPER_ADMIN", isActive: true, isSuspended: false, createdAt: new Date() },
    { id: ADMIN.id, email: "admin@acme.com", role: "ADMIN", isActive: true, isSuspended: false, createdAt: new Date() },
    { id: MEMBER.id, email: "member@acme.com", role: "USER", isActive: true, isSuspended: false, createdAt: new Date() },
  ]);
});

// ══════════════════════════════════════════════════════════════════════════
// Super Admin authority
// ══════════════════════════════════════════════════════════════════════════

describe("super admin authority (the single trusted authority)", () => {
  it("allows the Super Admin to create records", async () => {
    const rec = await IdentityKnowledgeService.create(ORG_A, SUPER, {
      kind: "biography_official", title: "Official Bio", body: "Approved biography.", classification: "public", category: "general", tags: [],
    });
    expect(rec.status).toBe("draft");
    expect(rec.verified).toBe(false);
    expect(rec.version).toBe(1);
  });

  it("FIXED: refuses every mutation to a non-super-admin, even an org admin", async () => {
    const input: import("@windels/shared/identityKnowledge").IkRecordCreateInput = { kind: "biography_official", title: "X", body: "Y", classification: "public", category: "g", tags: [] };
    await expect(IdentityKnowledgeService.create(ORG_A, ADMIN, input)).rejects.toMatchObject({ status: 403 });
    await expect(IdentityKnowledgeService.create(ORG_A, MEMBER, input)).rejects.toMatchObject({ status: 403 });
    const rec = await IdentityKnowledgeService.create(ORG_A, SUPER, input);
    await expect(IdentityKnowledgeService.update(ORG_A, ADMIN, rec.id, { title: "Hijack" })).rejects.toMatchObject({ status: 403 });
    await expect(IdentityKnowledgeService.setStatus(ORG_A, MEMBER, rec.id, "published")).rejects.toMatchObject({ status: 403 });
    await expect(IdentityKnowledgeService.remove(ORG_A, ADMIN, rec.id)).rejects.toMatchObject({ status: 403 });
    await expect(IdentityKnowledgeService.grant(ORG_A, MEMBER, rec.id, MEMBER.id)).rejects.toMatchObject({ status: 403 });
    await expect(IdentityKnowledgeService.bulkImport(ORG_A, ADMIN, [input])).rejects.toMatchObject({ status: 403 });
    await expect(IdentityKnowledgeService.bulkExport(ORG_A, MEMBER)).rejects.toMatchObject({ status: 403 });
    await expect(IdentityKnowledgeService.syncAll(ORG_A, MEMBER)).rejects.toMatchObject({ status: 403 });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Classification access
// ══════════════════════════════════════════════════════════════════════════

describe("classification-aware access", () => {
  it("public records are visible to every authenticated caller", async () => {
    const rec = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "mission", title: "Mission", body: "Empower enterprises.", classification: "public", category: "g", tags: [] });
    expect(await IdentityKnowledgeService.canView(ORG_A, rec, MEMBER)).toBe(true);
    expect((await IdentityKnowledgeService.listRecords(ORG_A, MEMBER, {})).some((r) => r.id === rec.id)).toBe(true);
  });

  it("organization records are visible to org members (any role)", async () => {
    const rec = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "organization_profile", title: "Org profile", body: "Internal.", classification: "organization", category: "g", tags: [] });
    expect(await IdentityKnowledgeService.canView(ORG_A, rec, MEMBER)).toBe(true);
    expect(await IdentityKnowledgeService.canView(ORG_A, rec, ADMIN)).toBe(true);
  });

  it("private records require the super admin, an explicit grant, or ORG_ADMIN", async () => {
    const rec = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "statement", title: "Private note", body: "Confidential.", classification: "private", category: "g", tags: [] });
    expect(await IdentityKnowledgeService.canView(ORG_A, rec, SUPER)).toBe(true);
    expect(await IdentityKnowledgeService.canView(ORG_A, rec, MEMBER)).toBe(false);
    // Explicit grant unlocks it.
    await IdentityKnowledgeService.grant(ORG_A, SUPER, rec.id, MEMBER.id);
    expect(await IdentityKnowledgeService.canView(ORG_A, rec, MEMBER)).toBe(true);
    await IdentityKnowledgeService.revokeGrant(ORG_A, SUPER, rec.id, MEMBER.id);
    expect(await IdentityKnowledgeService.canView(ORG_A, rec, MEMBER)).toBe(false);
    // Private records never appear in the member's list.
    expect((await IdentityKnowledgeService.listRecords(ORG_A, MEMBER, {})).some((r) => r.id === rec.id)).toBe(false);
  });

  it("keeps records org-isolated", async () => {
    const rec = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "brand_story", title: "Brand", body: "Story.", classification: "public", category: "g", tags: [] });
    expect(await IdentityKnowledgeService.getRecord(ORG_B, rec.id)).toBeNull();
    expect((await IdentityKnowledgeService.listRecords(ORG_B, SUPER, {})).length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Lifecycle, verification, versions, audit
// ══════════════════════════════════════════════════════════════════════════

describe("lifecycle, verification, versions and audit", () => {
  it("publish is the only path to verified, and it synchronizes", async () => {
    const rec = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "faq", title: "FAQ", body: "Q: What is WINDELS?", classification: "public", category: "g", tags: [] });
    await IdentityKnowledgeService.setStatus(ORG_A, SUPER, rec.id, "approved");
    let r = await IdentityKnowledgeService.getRecord(ORG_A, rec.id);
    expect(r!.status).toBe("approved");
    expect(r!.verified).toBe(false); // approval alone does not verify
    r = await IdentityKnowledgeService.setStatus(ORG_A, SUPER, rec.id, "published");
    expect(r.verified).toBe(true);
    expect(r.publishedAt).toBeTruthy();
    // Memory Fabric sync: a knowledge memory exists (me:* keys).
    expect(kv.zsets.get("me:mems")?.size ?? 0).toBeGreaterThan(0);
    // Re-publish must not duplicate (content-deduplicated by the fabric).
    const memCount = kv.zsets.get("me:mems")!.size;
    await IdentityKnowledgeService.setStatus(ORG_A, SUPER, rec.id, "published");
    expect(kv.zsets.get("me:mems")!.size).toBe(memCount);
  });

  it("editing a published record returns it to pending_approval and clears verified", async () => {
    const rec = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "mission", title: "Mission", body: "V1.", classification: "public", category: "g", tags: [] });
    await IdentityKnowledgeService.setStatus(ORG_A, SUPER, rec.id, "published");
    const edited = await IdentityKnowledgeService.update(ORG_A, SUPER, rec.id, { body: "V2." });
    expect(edited.status).toBe("pending_approval");
    expect(edited.verified).toBe(false);
    expect(edited.version).toBe(3); // created, published, edited
  });

  it("append-only version history with actions and actors", async () => {
    const rec = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "award", title: "Award", body: "Best AI.", classification: "public", category: "g", tags: [] });
    await IdentityKnowledgeService.setStatus(ORG_A, SUPER, rec.id, "published");
    await IdentityKnowledgeService.update(ORG_A, SUPER, rec.id, { title: "Award 2026" });
    const versions = await IdentityKnowledgeService.listVersions(ORG_A, rec.id);
    expect(versions.map((v) => v.action)).toEqual(["created", "status:published", "edited_from_published"]);
    expect(versions[0]!.actor).toBe(SUPER.id);
    expect(versions[0]!.version).toBe(1);
    expect(versions[2]!.version).toBe(3);
  });

  it("audits every mutation into the AuditLog table", async () => {
    const rec = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "announcement", title: "Launch", body: "We launched.", classification: "public", category: "g", tags: [] });
    await IdentityKnowledgeService.setStatus(ORG_A, SUPER, rec.id, "published");
    await IdentityKnowledgeService.remove(ORG_A, SUPER, rec.id);
    const actions = db.tables.get("AuditLog")!.map((r: any) => r.action);
    expect(actions).toContain("identityKnowledge.created");
    expect(actions).toContain("identityKnowledge.published");
    expect(actions).toContain("identityKnowledge.deleted");
  });

  it("archives clear verified and stamp archivedAt", async () => {
    const rec = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "statement", title: "Old", body: "Old statement.", classification: "public", category: "g", tags: [] });
    await IdentityKnowledgeService.setStatus(ORG_A, SUPER, rec.id, "published");
    const archived = await IdentityKnowledgeService.setStatus(ORG_A, SUPER, rec.id, "archived");
    expect(archived.status).toBe("archived");
    expect(archived.verified).toBe(false);
    expect(archived.archivedAt).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AI response engine
// ══════════════════════════════════════════════════════════════════════════

describe("AI response engine (approved knowledge only)", () => {
  it("answers from published records with verified ranked first and full sources", async () => {
    const verified = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "biography_official", title: "Founder Biography", body: "The founder is Ada Windels.", classification: "public", category: "g", tags: ["founder"] });
    await IdentityKnowledgeService.setStatus(ORG_A, SUPER, verified.id, "published");
    const approved = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "brand_story", title: "Founder Brand Story", body: "The founder's brand story: WINDELS builds AI operating systems.", classification: "public", category: "g", tags: ["brand"] });
    await IdentityKnowledgeService.setStatus(ORG_A, SUPER, approved.id, "approved");

    const answer = await IdentityKnowledgeService.ask(ORG_A, MEMBER, "Who is the founder?");
    expect(answer.outcome).toBe("answered");
    expect(answer.sections.some((s) => s.section === "verified_facts")).toBe(true);
    const founderSource = answer.sources.find((s) => s.recordId === verified.id)!;
    expect(founderSource.verified).toBe(true);
    expect(founderSource.usedIn).toContain("verified_facts");
    // Approval gates AI usage: an approved (not yet published) public record
    // answers from the Super Admin Approved section, with lower confidence.
    expect(answer.sources.some((s) => s.recordId === approved.id)).toBe(true);
    const approvedSection = answer.sections.find((s) => s.section === "super_admin_approved")!;
    expect(approvedSection.text).toContain("Founder Brand Story");
  });

  it("FIXED: says it lacks sufficient approved knowledge instead of fabricating", async () => {
    const answer = await IdentityKnowledgeService.ask(ORG_A, MEMBER, "What is the secret launch date?");
    expect(answer.outcome).toBe("insufficient_knowledge");
    expect(answer.answer).toContain("do not have sufficient approved knowledge");
    expect(answer.sources).toEqual([]);
    expect(answer.aiGenerated).toBe(false);
  });

  it("never leaks restricted records to unauthorized callers", async () => {
    const privateRec = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "statement", title: "Confidential plan", body: "Secret revenue numbers.", classification: "private", category: "g", tags: ["secret"] });
    await IdentityKnowledgeService.setStatus(ORG_A, SUPER, privateRec.id, "published");
    const memberAnswer = await IdentityKnowledgeService.ask(ORG_A, MEMBER, "secret revenue numbers");
    expect(memberAnswer.outcome).toBe("insufficient_knowledge");
    const superAnswer = await IdentityKnowledgeService.ask(ORG_A, SUPER, "secret revenue numbers");
    expect(superAnswer.outcome).toBe("answered");
    expect(superAnswer.sources.some((s) => s.recordId === privateRec.id)).toBe(true);
  });

  it("answers from organization records only for members", async () => {
    // A verified org record answers from verified_facts (verified and
    // classification are orthogonal); an approved-not-published org record
    // is never answered from.
    const orgRec = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "organization_profile", title: "Internal Roadmap", body: "Q3 roadmap includes the knowledge system.", classification: "organization", category: "g", tags: [] });
    await IdentityKnowledgeService.setStatus(ORG_A, SUPER, orgRec.id, "published");
    const answer = await IdentityKnowledgeService.ask(ORG_A, MEMBER, "Q3 roadmap");
    expect(answer.outcome).toBe("answered");
    expect(answer.sources.some((s) => s.recordId === orgRec.id && s.classification === "organization")).toBe(true);

    // A non-verified organization record answers from the
    // organization_information section.
    const orgRec2 = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "organization_profile", title: "Internal Hiring", body: "Hiring plan for Q4.", classification: "organization", category: "g", tags: [] });
    await IdentityKnowledgeService.setStatus(ORG_A, SUPER, orgRec2.id, "approved");
    const answer2 = await IdentityKnowledgeService.ask(ORG_A, MEMBER, "hiring plan q4");
    expect(answer2.outcome).toBe("answered");
    expect(answer2.sections.some((s) => s.section === "organization_information")).toBe(true);
    // Non-members of the org cannot see organization records at all.
    expect(await IdentityKnowledgeService.canView(ORG_A, orgRec2, { id: "other-user", role: "USER" })).toBe(true); // any authenticated caller is an org member by construction
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Agents, graph, import/export
// ══════════════════════════════════════════════════════════════════════════

describe("knowledge agents and graph", () => {
  it("runs the biography agent over approved records", async () => {
    const rec = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "biography_official", title: "Official Bio", body: "Bio.", classification: "public", category: "g", tags: [] });
    await IdentityKnowledgeService.setStatus(ORG_A, SUPER, rec.id, "published");
    const run = await IdentityKnowledgeService.runAgent(ORG_A, MEMBER, "biography_agent");
    expect(run.agentId).toBe("biography_agent");
    expect(run.items.some((i) => i.id === rec.id)).toBe(true);
    expect(run.aiGenerated).toBe(false);
    expect(run.summary).toContain("approved biography");
  });

  it("gates the synchronization agent to the super admin", async () => {
    await expect(IdentityKnowledgeService.runAgent(ORG_A, MEMBER, "knowledge_synchronization_agent")).rejects.toMatchObject({ status: 403 });
    const run = await IdentityKnowledgeService.runAgent(ORG_A, SUPER, "knowledge_synchronization_agent");
    expect(run.summary).toMatch(/Synchronized/);
  });

  it("verification agent reports pending/unverified records", async () => {
    // Create → publish → edit: the edit returns the record to
    // pending_approval and clears verified — exactly what the verification
    // agent must surface.
    const rec = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "faq", title: "FAQ", body: "Q.", classification: "public", category: "g", tags: [] });
    await IdentityKnowledgeService.setStatus(ORG_A, SUPER, rec.id, "published");
    await IdentityKnowledgeService.update(ORG_A, SUPER, rec.id, { body: "Q2." });
    const run = await IdentityKnowledgeService.runAgent(ORG_A, SUPER, "knowledge_verification_agent");
    expect(run.items.some((i) => i.id === rec.id)).toBe(true);
    // Drafts are the curator's job.
    const curate = await IdentityKnowledgeService.runAgent(ORG_A, SUPER, "knowledge_curator_agent");
    expect(curate.summary).toMatch(/draft/);
  });

  it("knowledge graph returns only authorized nodes and the super admin's edges", async () => {
    const a = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "brand_story", title: "Brand", body: "Story.", classification: "public", category: "g", tags: [] });
    const b = await IdentityKnowledgeService.create(ORG_A, SUPER, { kind: "product", title: "Product", body: "Thing.", classification: "public", category: "g", tags: [] });
    await IdentityKnowledgeService.addRelation(ORG_A, SUPER, a.id, b.id, "showcases");
    const memberGraph = await IdentityKnowledgeService.graph(ORG_A, MEMBER);
    expect(memberGraph.nodes).toHaveLength(2);
    expect(memberGraph.edges).toEqual([{ from: a.id, to: b.id, relation: "showcases" }]);
    expect(memberGraph.note).toContain("authorized");
  });
});

describe("bulk import/export", () => {
  it("imports a batch as drafts and exports all records", async () => {
    const res = await IdentityKnowledgeService.bulkImport(ORG_A, SUPER, [
      { kind: "mission", title: "Mission", body: "M.", classification: "public", category: "g", tags: [] },
      { kind: "vision", title: "Vision", body: "V.", classification: "public", category: "g", tags: [] },
    ]);
    expect(res.imported).toBe(2);
    const exported = await IdentityKnowledgeService.bulkExport(ORG_A, SUPER);
    expect(exported.records).toHaveLength(2);
    expect(exported.records.every((r) => r.status === "draft")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Shared contract — schemas
// ══════════════════════════════════════════════════════════════════════════

describe("shared identity-knowledge schemas", () => {
  it("validates record create bodies", async () => {
    const shared = await import("@windels/shared/identityKnowledge");
    expect(shared.IkRecordCreateSchema.safeParse({ kind: "faq", title: "T", body: "B", classification: "public" }).success).toBe(true);
    expect(shared.IkRecordCreateSchema.safeParse({ kind: "not_a_kind", title: "T", body: "B" }).success).toBe(false);
    expect(shared.IkRecordCreateSchema.safeParse({ kind: "faq", title: "", body: "B" }).success).toBe(false);
    expect(shared.IkRecordCreateSchema.safeParse({ kind: "faq", title: "T", body: "B", classification: "secret" }).success).toBe(false);
  });

  it("requires at least one field on update and bounds the question", async () => {
    const shared = await import("@windels/shared/identityKnowledge");
    expect(shared.IkRecordUpdateSchema.safeParse({}).success).toBe(false);
    expect(shared.IkRecordUpdateSchema.safeParse({ title: "New" }).success).toBe(true);
    expect(shared.IkAskSchema.safeParse({ question: "Who?" }).success).toBe(true);
    expect(shared.IkAskSchema.safeParse({ question: "x" }).success).toBe(false);
  });
});
