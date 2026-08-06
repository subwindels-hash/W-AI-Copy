/**
 * Session 91 — Enterprise Email Intelligence.
 *
 * Exercises the real service against a fake KV (same pattern as the other
 * Redis-backed suites): mailbox CRUD with credential encryption, threading by
 * reply-chain and normalized subject, message filters, outbox lifecycle with
 * the honest SMTP_NOT_CONFIGURED path, deterministic rollup math, heuristic
 * summary/triage (always explicitly labeled), cross-tenant isolation,
 * demo-seed idempotency, and the shared Zod input contracts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { fake } = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, Map<string, string> | Set<string> | string>();
    async keys(pattern: string) {
      const regex = new RegExp("^" + pattern.replace(/[*]/g, ".*") + "$");
      return Array.from(this.store.keys()).filter((k) => regex.test(k));
    }
    async del(key: string) { return this.store.delete(key) ? 1 : 0; }
    async hset(key: string, field: string, value: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(field, value); return 1;
    }
    async hget(key: string, field: string) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return null;
      const v = map.get(field);
      return v !== undefined ? String(v) : null;
    }
    async zadd(key: string, score: number, member: string) {
      let map = this.store.get(key);
      if (!(map instanceof Map)) { map = new Map(); this.store.set(key, map); }
      map.set(member, String(score)); return 1;
    }
    async zrange(key: string, start: number, stop: number) {
      const map = this.store.get(key);
      if (!(map instanceof Map)) return [];
      const entries = Array.from(map.entries());
      entries.sort((a, b) => Number(a[1]) - Number(b[1]) || (a[0] < b[0] ? -1 : 1));
      const slice = entries.slice(start, stop === -1 ? undefined : stop + 1);
      return slice.map(([m]) => m);
    }
    async zrem(key: string, member: string) {
      const map = this.store.get(key);
      if (map instanceof Map) return map.delete(member) ? 1 : 0;
      return 0;
    }
  }
  return { fake: new FakeRedis() };
});

vi.mock("../db/redis.js", () => ({
  redisCmd: fake,
}));
// The AI registry is environment-dependent (real providers need keys); in
// unit tests it resolves to the Echo demo provider, which makes the
// intelligence paths fall back to their deterministic, explicitly-labeled
// implementations — exactly what these tests assert.
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: {
    complete: async () => ({
      content: "",
      usage: { tokensIn: 0, tokensOut: 0, costMicros: 0, model: "echo" },
      model: "echo",
      provider: "echo",
      durationMs: 1,
      modelSource: "echo-demo",
    }),
  },
}));
// Encryption is mocked for unit tests (real AES-256-GCM covered by
// security/encryption.test.ts); we only assert the at-rest discipline
// (plaintext never stored, hasCredentials flag reflects it).
vi.mock("../security/encryption.js", () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string | null | undefined) =>
    typeof s === "string" && s.startsWith("enc:") ? s.slice(4) : s,
}));

import { EmailIntelService } from "./emailIntel.service.js";
import {
  EiMailboxUpsertSchema,
  EiMessageCreateSchema,
  EiDraftSchema,
} from "@windels/shared/emailIntel";

const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(() => {
  fake.store.clear();
});

async function mkMailbox(org: string, overrides: Record<string, unknown> = {}) {
  return EmailIntelService.createMailbox(org, {
    name: "Shared inbox",
    emailAddress: "inbox@example.com",
    smtpHost: "smtp.example.com",
    smtpPort: 587,
    ...overrides,
  } as any, null);
}

describe("EI — mailboxes (org-scoped, credentials at rest)", () => {
  it("creates, reads, lists, updates and deletes a mailbox; never exposes the password", async () => {
    const mb = await EmailIntelService.createMailbox(ORG_A, {
      name: "Support",
      emailAddress: "support@example.com",
      provider: "gmail",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      username: "support@example.com",
      password: "sup3r-secret",
    }, "user-1");

    expect(mb.id).toMatch(/^eimb-/);
    expect(mb.status).toBe("configured");
    expect(mb.hasCredentials).toBe(true);
    expect((mb as any).passwordEnc).toBeUndefined();

    // The stored doc carries only the encrypted blob (never the plaintext
    // field; the mock encrypt() envelope is what a real encrypt() produces).
    const storedRaw = fake.store.get(`ei:mailbox:i:${ORG_A}:${mb.id}`) as Map<string, string>;
    const stored = JSON.parse(storedRaw.get("_doc")!);
    expect(stored.passwordEnc).toBe("enc:sup3r-secret");
    expect(stored.password).toBeUndefined();
    expect(stored.passwordEnc).not.toBe("sup3r-secret");

    const got = await EmailIntelService.getMailbox(ORG_A, mb.id);
    expect(got?.emailAddress).toBe("support@example.com");

    const updated = await EmailIntelService.updateMailbox(ORG_A, mb.id, { name: "Support (priority)" }, null);
    expect(updated?.name).toBe("Support (priority)");
    expect((updated as any).passwordEnc).toBeUndefined();

    expect(await EmailIntelService.deleteMailbox(ORG_A, mb.id)).toBe(true);
    expect(await EmailIntelService.getMailbox(ORG_A, mb.id)).toBeNull();
  });

  it("marks a mailbox pending when no SMTP host is configured", async () => {
    const mb = await EmailIntelService.createMailbox(ORG_A, {
      name: "Read-only", emailAddress: "ro@example.com",
    }, null);
    expect(mb.status).toBe("pending");
    expect(mb.error).toContain("SMTP not configured");
  });

  it("testMailbox reports not_configured honestly (no fabricated reachability)", async () => {
    const mb = await EmailIntelService.createMailbox(ORG_A, {
      name: "No host", emailAddress: "nohost@example.com",
    }, null);
    const res = await EmailIntelService.testMailbox(ORG_A, mb.id);
    expect(res).toEqual({ reachable: false, detail: "not_configured" });
  });
});

describe("EI — threading", () => {
  it("groups replies by messageId chain and by normalized subject", async () => {
    const mb = await mkMailbox(ORG_A);
    const m1 = await EmailIntelService.createMessage(ORG_A, {
      mailboxId: mb.id, fromAddress: "a@example.com", to: ["inbox@example.com"],
      subject: "Q3 planning", bodyText: "When is the planning session?",
    }, null);
    // Reply via inReplyTo → same thread as m1.
    await EmailIntelService.createMessage(ORG_A, {
      mailboxId: mb.id, fromAddress: "b@example.com", to: ["a@example.com"],
      subject: "Re: Q3 planning", bodyText: "Thursday works.", inReplyTo: m1.messageId,
    }, null);
    // No explicit inReplyTo but same normalized subject → same thread.
    await EmailIntelService.createMessage(ORG_A, {
      mailboxId: mb.id, fromAddress: "a@example.com", to: ["b@example.com"],
      subject: "RE: Q3 planning", bodyText: "Confirmed.", isRead: true,
    }, null);
    // Different subject → new thread.
    await EmailIntelService.createMessage(ORG_A, {
      mailboxId: mb.id, fromAddress: "c@example.com", to: ["inbox@example.com"],
      subject: "Invoice attached", bodyText: "Please find the invoice attached.",
    }, null);

    const threads = await EmailIntelService.listThreads(ORG_A);
    expect(threads).toHaveLength(2);

    const planning = threads.find((t) => t.subject.includes("Q3 planning"));
    expect(planning).toBeTruthy();
    expect(planning?.messageCount).toBe(3);
    expect(planning?.participants.sort()).toEqual(["a@example.com", "b@example.com"]);
    expect(planning?.unreadCount).toBe(2);

    const detail = await EmailIntelService.getThread(ORG_A, planning!.threadId);
    expect(detail?.messages).toHaveLength(3);
    expect(detail?.messages[0].subject).toBe("Q3 planning");
  });

  it("creates a new thread for a brand-new subject", async () => {
    const mb = await mkMailbox(ORG_A);
    await EmailIntelService.createMessage(ORG_A, {
      mailboxId: mb.id, fromAddress: "x@example.com", subject: "Brand new", bodyText: "hi",
    }, null);
    expect(await EmailIntelService.listThreads(ORG_A)).toHaveLength(1);
  });
});

describe("EI — outbox lifecycle", () => {
  it("queues outbound messages and reports SMTP_NOT_CONFIGURED honestly when no relay exists", async () => {
    const mb = await EmailIntelService.createMailbox(ORG_A, {
      name: "No relay", emailAddress: "norelay@example.com",
    }, null);
    const msg = await EmailIntelService.createMessage(ORG_A, {
      mailboxId: mb.id, direction: "outbound", fromAddress: "norelay@example.com",
      to: ["boss@example.com"], subject: "Status", bodyText: "All good.",
    }, null);
    expect(msg.outboxStatus).toBe("queued");

    const res = await EmailIntelService.sendMessage(ORG_A, msg.id);
    expect(res.sent).toBe(false);
    expect(res.reason).toBe("SMTP_NOT_CONFIGURED");

    const after = await EmailIntelService.getMessage(ORG_A, msg.id);
    expect(after?.outboxStatus).toBe("queued");
    expect(after?.outboxError).toContain("SMTP_NOT_CONFIGURED");
  });

  it("refuses to send non-outbound messages and reports already-sent", async () => {
    const mb = await mkMailbox(ORG_A);
    const inbound = await EmailIntelService.createMessage(ORG_A, {
      mailboxId: mb.id, fromAddress: "a@example.com", subject: "In", bodyText: "hi",
    }, null);
    expect((await EmailIntelService.sendMessage(ORG_A, inbound.id)).reason).toBe("NOT_OUTBOUND");

    const out = await EmailIntelService.createMessage(ORG_A, {
      mailboxId: mb.id, direction: "outbound", fromAddress: "inbox@example.com",
      to: ["a@example.com"], subject: "Out", bodyText: "bye",
    }, null);
    await EmailIntelService.markOutbox(ORG_A, out.id, "sent", null, "250 2.0.0 OK queued");
    const again = await EmailIntelService.sendMessage(ORG_A, out.id);
    expect(again.sent).toBe(true);
    expect(again.reason).toBe("ALREADY_SENT");
  });
});

describe("EI — dashboard rollup (deterministic, honest)", () => {
  it("computes counts, unread, senders, threads and response time from stored records", async () => {
    const mb = await mkMailbox(ORG_A);
    const i1 = await EmailIntelService.createMessage(ORG_A, {
      mailboxId: mb.id, fromName: "Ada", fromAddress: "ada@example.com",
      subject: "Follow up", bodyText: "Please confirm by end of day.", isRead: false,
    }, null);
    await EmailIntelService.createMessage(ORG_A, {
      mailboxId: mb.id, fromAddress: "chidi@example.com",
      subject: "Invoice", bodyText: "Invoice due today.", isRead: true,
    }, null);
    // A real reply pair (sent after the inbound it answers).
    const out = await EmailIntelService.createMessage(ORG_A, {
      mailboxId: mb.id, direction: "outbound", fromAddress: "inbox@example.com",
      to: ["ada@example.com"], subject: "Re: Follow up", bodyText: "Confirmed.",
      inReplyTo: i1.messageId,
    }, null);
    await EmailIntelService.markOutbox(ORG_A, out.id, "sent", null, "250 OK");

    const r1 = await EmailIntelService.rollup(ORG_A);
    const r2 = await EmailIntelService.rollup(ORG_A);
    expect(r2).toEqual(r1); // deterministic

    expect(r1.counts.mailboxes).toBe(1);
    expect(r1.counts.messages).toBe(3);
    expect(r1.counts.unread).toBe(1);
    expect(r1.counts.inbound).toBe(2);
    expect(r1.counts.outbound).toBe(1);
    expect(r1.counts.sent).toBe(1);
    expect(r1.counts.threads).toBe(2);

    const ada = r1.topSenders.find((s) => s.email === "ada@example.com");
    expect(ada?.count).toBe(1);

    // The reply pair must yield a measured (small positive) response time.
    expect(r1.avgResponseMs).not.toBeNull();
    expect(r1.avgResponseMs!).toBeGreaterThan(0);

    expect(r1.openThreads).toHaveLength(1);
    expect(r1.unreadByMailbox[0].unread).toBe(1);
    expect(r1.recentMessages).toHaveLength(3);
    expect(r1.lastUpdatedAt).toBeTruthy();
  });

  it("returns an honest empty rollup for a fresh org (no fabricated numbers)", async () => {
    const r = await EmailIntelService.rollup(ORG_B);
    expect(r.counts.mailboxes).toBe(0);
    expect(r.counts.messages).toBe(0);
    expect(r.counts.unread).toBe(0);
    expect(r.avgResponseMs).toBeNull();
    expect(r.topSenders).toEqual([]);
    expect(r.lastUpdatedAt).toBeNull();
  });
});

describe("EI — intelligence (explicit kinds, no fabricated AI)", () => {
  it("summarize and triage return labeled deterministic results without a real AI provider", async () => {
    const mb = await mkMailbox(ORG_A);
    await EmailIntelService.createMessage(ORG_A, {
      mailboxId: mb.id, fromAddress: "ada@example.com",
      subject: "URGENT: payment due today", bodyText: "Please confirm the payment asap — deadline today.",
      isRead: false,
    }, null);
    const threads = await EmailIntelService.listThreads(ORG_A);

    const summary = await EmailIntelService.summarizeThread(ORG_A, threads[0].threadId);
    expect(summary.summaryKind).toBe("deterministic");
    expect(summary.messageCount).toBe(1);
    expect(summary.keywords.length).toBeGreaterThan(0);

    const triage = await EmailIntelService.triageThread(ORG_A, threads[0].threadId);
    expect(triage.triageKind).toBe("heuristic");
    expect(triage.label).toBe("urgent");
    expect(triage.urgencyScore).toBeGreaterThanOrEqual(55);
    expect(triage.reasons.length).toBeGreaterThan(0);
  });

  it("draft returns a usable email with explicit provider labeling", async () => {
    const d = await EmailIntelService.draftEmail({
      context: "Tell the client we shipped v2 and ask for feedback by Friday.",
      tone: "professional", length: "short", subjectHint: "v2 shipped",
    });
    expect(d.subject).toBe("v2 shipped");
    expect(d.body.length).toBeGreaterThan(0);
    expect(["real", "echo-demo"]).toContain(d.modelSource);
    expect(d.provider.length).toBeGreaterThan(0);
  });
});

describe("EI — cross-tenant isolation (fail-closed)", () => {
  it("org B cannot read org A mailboxes, messages or threads", async () => {
    const mb = await mkMailbox(ORG_A);
    const msg = await EmailIntelService.createMessage(ORG_A, {
      mailboxId: mb.id, fromAddress: "a@example.com", subject: "Secret", bodyText: "confidential",
    }, null);
    const threads = await EmailIntelService.listThreads(ORG_A);

    expect(await EmailIntelService.getMailbox(ORG_B, mb.id)).toBeNull();
    expect(await EmailIntelService.listMailboxes(ORG_B)).toHaveLength(0);
    expect(await EmailIntelService.getMessage(ORG_B, msg.id)).toBeNull();
    expect(await EmailIntelService.listMessages(ORG_B)).toHaveLength(0);
    expect(await EmailIntelService.listThreads(ORG_B)).toHaveLength(0);
    expect(await EmailIntelService.getThread(ORG_B, threads[0].threadId)).toBeNull();
    expect(await EmailIntelService.sendMessage(ORG_B, msg.id)).toMatchObject({ sent: false, reason: "NOT_FOUND" });
    expect(await EmailIntelService.deleteMessage(ORG_B, msg.id)).toBe(false);

    // Org A data intact afterwards.
    expect((await EmailIntelService.getMessage(ORG_A, msg.id))?.subject).toBe("Secret");
  });
});

describe("EI — demo seed is idempotent", () => {
  it("seeds the demo org once and skips on the second call", async () => {
    expect(await EmailIntelService.ensureDemoSeed()).toBe(true);
    const r = await EmailIntelService.rollup("org-demo-ei");
    expect(r.counts.mailboxes).toBe(1);
    expect(r.counts.messages).toBe(4);
    expect(r.counts.inbound).toBe(3);
    expect(r.counts.outbound).toBe(1);
    expect(r.counts.queued).toBe(1);

    expect(await EmailIntelService.ensureDemoSeed()).toBe(false);
    expect((await EmailIntelService.rollup("org-demo-ei")).counts.messages).toBe(4);
  });
});

describe("EI — shared input contracts", () => {
  it("rejects malformed mailbox input", () => {
    expect(EiMailboxUpsertSchema.safeParse({ name: "", emailAddress: "x@y.z" }).success).toBe(false);
    expect(EiMailboxUpsertSchema.safeParse({ name: "A", emailAddress: "not-an-email" }).success).toBe(false);
    expect(EiMailboxUpsertSchema.safeParse({ name: "A", emailAddress: "a@b.co" }).success).toBe(true);
    expect(EiMailboxUpsertSchema.safeParse({ name: "A", emailAddress: "a@b.co", smtpPort: 99999 }).success).toBe(false);
  });

  it("rejects malformed message input", () => {
    expect(EiMessageCreateSchema.safeParse({ mailboxId: "m", fromAddress: "a@b.co", bodyText: "" }).success).toBe(false);
    expect(EiMessageCreateSchema.safeParse({ mailboxId: "m", fromAddress: "a@b.co", bodyText: "hi", direction: "nope" }).success).toBe(false);
    expect(EiMessageCreateSchema.safeParse({ mailboxId: "m", fromAddress: "a@b.co", bodyText: "hi" }).success).toBe(true);
    expect(EiMessageCreateSchema.safeParse({ mailboxId: "m", fromAddress: "bad", bodyText: "hi" }).success).toBe(false);
  });

  it("rejects empty draft context", () => {
    expect(EiDraftSchema.safeParse({ context: "" }).success).toBe(false);
    expect(EiDraftSchema.safeParse({ context: "Draft something" }).success).toBe(true);
  });
});
