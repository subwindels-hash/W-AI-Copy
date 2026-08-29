/**
 * Session 112 — conversation operations.
 *
 * These tests pin the properties that make the module trustworthy rather than
 * merely present:
 *
 *   - tenant and participant scoping on every new read and write;
 *   - unread counts that report their own basis and exclude the caller's own
 *     messages;
 *   - usage totals that stay `null` when no message recorded them, instead of
 *     collapsing "unknown" into a confident zero;
 *   - search that returns verbatim excerpts at a reported offset and never
 *     leaves the caller's organization;
 *   - edits and redactions that are append-only and keep the row for audit;
 *   - a digest that is deterministic and labelled as non-AI.
 *
 * Everything runs on FakePrisma, so no database is required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakePrisma, cuid } from "../testUtils/fakePrisma.js";

const db = new FakePrisma();
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const ops = await import("./conversationOps.service.js");
const conversations = await import("./conversations.service.js");

const ORG_A = "org-alpha";
const ORG_B = "org-beta";
const USER_A = "user-alpha";
const USER_B = "user-beta";
const USER_C = "user-carol";

function seedTenants() {
  db.seed("Organization", [{ id: ORG_A, name: "Alpha" }, { id: ORG_B, name: "Beta" }]);
  db.seed("Workspace", [{ id: "ws-a", organizationId: ORG_A }, { id: "ws-b", organizationId: ORG_B }]);
  db.seed("Membership", [
    { id: cuid(), userId: USER_A, organizationId: ORG_A, workspaceId: "ws-a", joinedAt: new Date(1) },
    { id: cuid(), userId: USER_C, organizationId: ORG_A, workspaceId: "ws-a", joinedAt: new Date(1) },
    { id: cuid(), userId: USER_B, organizationId: ORG_B, workspaceId: "ws-b", joinedAt: new Date(1) },
  ]);
  db.seed("User", [
    { id: USER_A, email: "alpha@example.com" },
    { id: USER_C, email: "carol@example.com" },
    { id: USER_B, email: "beta@example.com" },
  ]);
  db.seed("UserProfile", [{ id: cuid(), userId: USER_A, displayName: "Alpha Owner" }]);
  db.seed("Agent", [
    { id: "agent-a", organizationId: ORG_A, name: "Researcher", color: "#fff", emoji: "🔎" },
    { id: "agent-b", organizationId: ORG_B, name: "Outsider", color: "#000", emoji: "🚫" },
  ]);
}

/** Seed a message directly so its timestamp and usage counters are explicit. */
function addMessage(
  conversationId: string,
  opts: {
    role?: string;
    content?: string;
    userId?: string | null;
    at?: number;
    tokensIn?: number;
    tokensOut?: number;
    costMicros?: number;
    durationMs?: number;
  } = {}
) {
  const id = cuid();
  db.seed("Message", [
    {
      id,
      conversationId,
      role: opts.role ?? "USER",
      content: opts.content ?? "hello",
      status: "COMPLETED",
      userId: opts.userId === undefined ? USER_A : opts.userId,
      createdAt: new Date(opts.at ?? 1_000),
      ...(opts.tokensIn !== undefined ? { tokensIn: opts.tokensIn } : {}),
      ...(opts.tokensOut !== undefined ? { tokensOut: opts.tokensOut } : {}),
      ...(opts.costMicros !== undefined ? { costMicros: opts.costMicros } : {}),
      ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
    },
  ]);
  return id;
}

async function newConversation(title = "Kickoff") {
  return conversations.createConversation(USER_A, { title } as any);
}

beforeEach(() => {
  db.reset();
  seedTenants();
});

/* ── Participants ─────────────────────────────────────────────────────── */

describe("conversation participants (S112)", () => {
  it("lists the creator's participant row with a human label", async () => {
    const conv = await newConversation();
    const rows = await ops.listParticipants(USER_A, conv.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("user");
    expect(rows[0]!.isCreator).toBe(true);
    expect(rows[0]!.displayName).toBe("Alpha Owner");
    // Nobody has marked the thread read yet, and the contract says so.
    expect(rows[0]!.lastReadAt).toBeNull();
  });

  it("adds an agent from the same organization", async () => {
    const conv = await newConversation();
    const added = await ops.addParticipant(USER_A, conv.id, { agentId: "agent-a" });
    expect(added.kind).toBe("agent");
    expect(added.displayName).toBe("Researcher");
    expect(await ops.listParticipants(USER_A, conv.id)).toHaveLength(2);
  });

  it("refuses to add an agent belonging to another organization", async () => {
    const conv = await newConversation();
    await expect(ops.addParticipant(USER_A, conv.id, { agentId: "agent-b" })).rejects.toThrow(/Agent not found/);
  });

  it("refuses to add a user who is not a member of the organization", async () => {
    const conv = await newConversation();
    await expect(ops.addParticipant(USER_A, conv.id, { userId: USER_B })).rejects.toThrow(/not a member/);
  });

  it("rejects a duplicate participant instead of creating a second row", async () => {
    const conv = await newConversation();
    await ops.addParticipant(USER_A, conv.id, { userId: USER_C });
    await expect(ops.addParticipant(USER_A, conv.id, { userId: USER_C })).rejects.toThrow(/already a participant/);
    expect(await ops.listParticipants(USER_A, conv.id)).toHaveLength(2);
  });

  it("removes an added participant but never the creator", async () => {
    const conv = await newConversation();
    const carol = await ops.addParticipant(USER_A, conv.id, { userId: USER_C });
    const creator = (await ops.listParticipants(USER_A, conv.id)).find((p) => p.isCreator)!;

    await expect(ops.removeParticipant(USER_A, conv.id, creator.id)).rejects.toThrow(/creator cannot be removed/);
    const removed = await ops.removeParticipant(USER_A, conv.id, carol.id);
    expect(removed.removed).toBe(true);
    expect(await ops.listParticipants(USER_A, conv.id)).toHaveLength(1);
  });
});

/* ── Read state ───────────────────────────────────────────────────────── */

describe("conversation read state (S112)", () => {
  it("reports never_marked_read and excludes the caller's own messages", async () => {
    const conv = await newConversation();
    addMessage(conv.id, { content: "mine", at: 1_000 });
    addMessage(conv.id, { content: "also mine", at: 2_000 });
    addMessage(conv.id, { role: "ASSISTANT", userId: null, content: "reply", at: 3_000 });

    const state = await ops.getReadState(USER_A, conv.id);
    expect(state.basis).toBe("never_marked_read");
    expect(state.lastReadAt).toBeNull();
    expect(state.excludesOwnMessages).toBe(true);
    // Only the assistant reply is unread — the caller's two messages are not.
    expect(state.unreadCount).toBe(1);
  });

  it("marks the thread read and switches the basis to last_read_at", async () => {
    const conv = await newConversation();
    addMessage(conv.id, { role: "ASSISTANT", userId: null, content: "reply", at: 3_000 });

    const marked = await ops.markRead(USER_A, conv.id, {});
    expect(marked.basis).toBe("last_read_at");
    expect(marked.unreadCount).toBe(0);
    expect(marked.lastReadAt).toBeTruthy();

    const persisted = await ops.getReadState(USER_A, conv.id);
    expect(persisted.unreadCount).toBe(0);
    expect(persisted.basis).toBe("last_read_at");
  });

  it("refuses a read marker dated in the future", async () => {
    const conv = await newConversation();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await expect(ops.markRead(USER_A, conv.id, { at: future })).rejects.toThrow(/future/);
  });

  it("summarises unread across conversations and reports truncation honestly", async () => {
    const a = await newConversation("A");
    const b = await newConversation("B");
    const c = await newConversation("C");
    for (const conv of [a, b, c]) {
      addMessage(conv.id, { role: "ASSISTANT", userId: null, content: "ping", at: 4_000 });
    }
    await ops.markRead(USER_A, c.id, {});

    const all = await ops.unreadSummary(USER_A, { limit: 50 });
    expect(all.inspectedConversations).toBe(3);
    expect(all.truncated).toBe(false);
    expect(all.conversationsWithUnread).toBe(2);
    expect(all.totalUnread).toBe(2);
    expect(all.items.map((i) => i.conversationId)).not.toContain(c.id);

    const capped = await ops.unreadSummary(USER_A, { limit: 2 });
    expect(capped.inspectedConversations).toBe(2);
    expect(capped.truncated).toBe(true);
  });
});

/* ── Statistics ───────────────────────────────────────────────────────── */

describe("conversation statistics (S112)", () => {
  it("returns null usage totals when no message recorded usage", async () => {
    const conv = await newConversation();
    addMessage(conv.id, { content: "one", at: 1_000 });
    addMessage(conv.id, { content: "two", at: 2_000 });

    const stats = await ops.conversationStats(USER_A, conv.id);
    expect(stats.messageCount).toBe(2);
    expect(stats.usage.messagesWithUsage).toBe(0);
    expect(stats.usage.messagesMissingUsage).toBe(2);
    expect(stats.usage.tokensIn).toBeNull();
    expect(stats.usage.costMicros).toBeNull();
    expect(stats.usage.avgAssistantDurationMs).toBeNull();
    expect(stats.measuredFrom).toBe("stored_messages");
  });

  it("sums only recorded usage and averages recorded assistant durations", async () => {
    const conv = await newConversation();
    addMessage(conv.id, { content: "prompt", at: 1_000 });
    addMessage(conv.id, {
      role: "ASSISTANT", userId: null, content: "answer", at: 2_000,
      tokensIn: 10, tokensOut: 20, costMicros: 5, durationMs: 100,
    });
    addMessage(conv.id, {
      role: "ASSISTANT", userId: null, content: "answer 2", at: 3_000,
      tokensIn: 30, tokensOut: 40, costMicros: 7, durationMs: 300,
    });

    const stats = await ops.conversationStats(USER_A, conv.id);
    expect(stats.byRole.user).toBe(1);
    expect(stats.byRole.assistant).toBe(2);
    expect(stats.byStatus.completed).toBe(3);
    expect(stats.usage.messagesWithUsage).toBe(2);
    expect(stats.usage.messagesMissingUsage).toBe(1);
    expect(stats.usage.tokensIn).toBe(40);
    expect(stats.usage.tokensOut).toBe(60);
    expect(stats.usage.costMicros).toBe(12);
    expect(stats.usage.avgAssistantDurationMs).toBe(200);
    expect(stats.firstMessageAt).toBe(new Date(1_000).toISOString());
    expect(stats.lastMessageAt).toBe(new Date(3_000).toISOString());
  });
});

/* ── Search ───────────────────────────────────────────────────────────── */

describe("conversation search (S112)", () => {
  it("matches message bodies case-insensitively and returns a verbatim excerpt", async () => {
    const conv = await newConversation("Quarterly");
    addMessage(conv.id, { content: "The MIGRATION plan ships on Friday", at: 1_000 });
    addMessage(conv.id, { content: "unrelated chatter", at: 2_000 });

    const result = await ops.searchMessages(USER_A, { q: "migration", page: 1, perPage: 20 });
    expect(result.matchKind).toBe("substring_case_insensitive");
    expect(result.pagination.total).toBe(1);
    expect(result.searchedConversations).toBe(1);
    const hit = result.hits[0]!;
    expect(hit.conversationTitle).toBe("Quarterly");
    // Verbatim: the excerpt preserves the stored casing, and the offset points
    // at the real match position in the stored body.
    expect(hit.excerpt).toContain("MIGRATION");
    expect(hit.matchOffset).toBe(4);
  });

  it("never returns messages from another organization", async () => {
    const conv = await newConversation();
    addMessage(conv.id, { content: "alpha secret roadmap", at: 1_000 });

    const asOutsider = await ops.searchMessages(USER_B, { q: "secret", page: 1, perPage: 20 });
    expect(asOutsider.searchedConversations).toBe(0);
    expect(asOutsider.hits).toHaveLength(0);
    expect(asOutsider.pagination.total).toBe(0);
  });
});

/* ── Edit / redact ────────────────────────────────────────────────────── */

describe("message edit and redaction (S112)", () => {
  it("edits an authored message and keeps an append-only trail", async () => {
    const conv = await newConversation();
    const id = addMessage(conv.id, { content: "teh plan", at: 1_000 });

    const first = await ops.editMessage(USER_A, conv.id, id, { content: "the plan", reason: "typo" });
    expect(first.content).toBe("the plan");
    expect(first.edits).toHaveLength(1);
    expect(first.edits[0]!.previousLength).toBe("teh plan".length);
    expect(first.edits[0]!.reason).toBe("typo");

    const second = await ops.editMessage(USER_A, conv.id, id, { content: "the revised plan" });
    expect(second.edits).toHaveLength(2);
    expect(second.edits[0]!.reason).toBe("typo"); // earlier entry survives
  });

  it("refuses to edit model output or another person's message", async () => {
    const conv = await newConversation();
    await ops.addParticipant(USER_A, conv.id, { userId: USER_C });
    const assistant = addMessage(conv.id, { role: "ASSISTANT", userId: null, content: "generated", at: 2_000 });
    const mine = addMessage(conv.id, { content: "mine", at: 1_000 });

    await expect(ops.editMessage(USER_A, conv.id, assistant, { content: "rewritten" }))
      .rejects.toThrow(/Only a user message can be edited/);
    await expect(ops.editMessage(USER_C, conv.id, mine, { content: "rewritten" }))
      .rejects.toThrow(/Only the author/);
  });

  it("redacts a body without destroying the row, and refuses a second redaction", async () => {
    const conv = await newConversation();
    const id = addMessage(conv.id, { content: "api key sk-live-123", at: 1_000, tokensIn: 9 });

    const redacted = await ops.redactMessage(USER_A, conv.id, id, { reason: "leaked credential" });
    expect(redacted.content).toBe("");
    expect(redacted.redaction).not.toBeNull();
    expect(redacted.redaction!.redactedBy).toBe(USER_A);
    expect(redacted.redaction!.redactedLength).toBe("api key sk-live-123".length);
    expect(redacted.redaction!.reason).toBe("leaked credential");
    // The row survives with its usage counter intact.
    expect(redacted.tokensIn).toBe(9);
    expect(db.tables.get("Message")!.find((m) => m.id === id)).toBeTruthy();

    await expect(ops.redactMessage(USER_A, conv.id, id, {})).rejects.toThrow(/already redacted/);
    await expect(ops.editMessage(USER_A, conv.id, id, { content: "restore" }))
      .rejects.toThrow(/redacted message cannot be edited/);
  });
});

/* ── Transcript and digest ────────────────────────────────────────────── */

describe("transcript and digest (S112)", () => {
  it("renders a markdown transcript that marks redacted entries", async () => {
    const conv = await newConversation("Launch review");
    addMessage(conv.id, { content: "ship it", at: 1_000 });
    const secret = addMessage(conv.id, { content: "password hunter2", at: 2_000 });
    await ops.redactMessage(USER_A, conv.id, secret, { reason: "credential" });

    const doc = await ops.transcript(USER_A, conv.id, { format: "markdown", includeSystem: "true" });
    expect(doc.format).toBe("markdown");
    expect(doc.messageCount).toBe(2);
    expect(doc.redactedMessages).toBe(1);
    expect(doc.markdown).toContain("# Launch review");
    expect(doc.markdown).toContain("[redacted]");
    expect(doc.markdown).not.toContain("hunter2");
    expect(doc.entries[0]!.author).toBe("Alpha Owner");

    const json = await ops.transcript(USER_A, conv.id, { format: "json", includeSystem: "true" });
    expect(json.markdown).toBeNull();
  });

  it("produces a deterministic, explicitly non-AI digest that skips redacted bodies", async () => {
    const conv = await newConversation();
    addMessage(conv.id, { content: "Deployment deployment pipeline needs review", at: 1_000 });
    addMessage(conv.id, { role: "ASSISTANT", userId: null, content: "pipeline pipeline pipeline hardening", at: 2_000 });
    const secret = addMessage(conv.id, { content: "token abcdef", at: 3_000 });
    await ops.redactMessage(USER_A, conv.id, secret, {});

    const first = await ops.digest(USER_A, conv.id, { maxKeywords: 3 });
    expect(first.kind).toBe("extractive_deterministic");
    expect(first.aiGenerated).toBe(false);
    expect(first.disclaimer).toMatch(/No language model/);
    expect(first.messageCount).toBe(3);
    expect(first.skippedMessages).toBe(1);
    expect(first.keywords[0]).toEqual({ term: "pipeline", occurrences: 4 });
    // Excerpts are verbatim slices of stored bodies, redacted ones excluded.
    expect(first.openingExcerpt).toBe("Deployment deployment pipeline needs review");
    expect(first.latestExcerpt).toBe("pipeline pipeline pipeline hardening");
    expect(first.keywords.some((k) => k.term === "abcdef")).toBe(false);

    const second = await ops.digest(USER_A, conv.id, { maxKeywords: 3 });
    expect(second.keywords).toEqual(first.keywords);
  });
});

/* ── Soft-delete recovery ─────────────────────────────────────────────── */

describe("soft-deleted conversation recovery (S112)", () => {
  it("lists and restores a soft-deleted conversation for its creator", async () => {
    const conv = await newConversation("Recoverable");
    addMessage(conv.id, { content: "context", at: 1_000 });
    await conversations.deleteConversation(USER_A, conv.id);

    const deleted = await ops.listDeletedConversations(USER_A, { page: 1, perPage: 20 });
    expect(deleted.pagination.total).toBe(1);
    expect(deleted.items[0]!.id).toBe(conv.id);
    expect(deleted.items[0]!.messageCount).toBe(1);
    expect(deleted.items[0]!.restorableByCaller).toBe(true);

    const restored = await ops.restoreConversation(USER_A, conv.id);
    expect(restored.id).toBe(conv.id);
    const list = await conversations.listConversations(USER_A, { page: 1, perPage: 20 } as any);
    expect(list.items.map((c: any) => c.id)).toContain(conv.id);
    await expect(ops.restoreConversation(USER_A, conv.id)).rejects.toThrow(/not deleted/);
  });

  it("refuses to restore a conversation the caller did not create", async () => {
    const conv = await newConversation("Not yours");
    await conversations.deleteConversation(USER_A, conv.id);
    // USER_C is in the same organization but did not create the thread.
    await expect(ops.restoreConversation(USER_C, conv.id)).rejects.toThrow(/Only the creator/);
  });
});

/* ── Tenant isolation ─────────────────────────────────────────────────── */

describe("tenant isolation on the S112 surface", () => {
  it("hides another organization's conversation from every new operation", async () => {
    const conv = await newConversation("Alpha only");
    const id = addMessage(conv.id, { content: "internal", at: 1_000 });

    await expect(ops.listParticipants(USER_B, conv.id)).rejects.toThrow(/not found/i);
    await expect(ops.getReadState(USER_B, conv.id)).rejects.toThrow(/not found/i);
    await expect(ops.markRead(USER_B, conv.id, {})).rejects.toThrow(/not found/i);
    await expect(ops.conversationStats(USER_B, conv.id)).rejects.toThrow(/not found/i);
    await expect(ops.transcript(USER_B, conv.id, { format: "json", includeSystem: "true" })).rejects.toThrow(/not found/i);
    await expect(ops.digest(USER_B, conv.id, { maxKeywords: 5 })).rejects.toThrow(/not found/i);
    await expect(ops.getMessage(USER_B, conv.id, id)).rejects.toThrow(/not found/i);
    await expect(ops.redactMessage(USER_B, conv.id, id, {})).rejects.toThrow(/not found/i);
    await expect(ops.restoreConversation(USER_B, conv.id)).rejects.toThrow(/not found/i);
  });

  it("hides the conversation from a same-org non-participant", async () => {
    const conv = await newConversation("Private");
    await expect(ops.conversationStats(USER_C, conv.id)).rejects.toThrow(/not found/i);
    // ...and grants access once they are added as a participant.
    await ops.addParticipant(USER_A, conv.id, { userId: USER_C });
    const stats = await ops.conversationStats(USER_C, conv.id);
    expect(stats.participantCount).toBe(2);
  });
});
