/**
 * Session 91 — Enterprise Email Intelligence.
 *
 * Org-scoped mailbox registry, threaded message store, outbox with a real
 * SMTP connector, AI drafting/summarize/triage via the existing AI
 * ProviderRegistry (with deterministic, explicitly-labeled fallbacks), and a
 * deterministic inbox-analytics rollup computed per read.
 *
 * Honesty rules:
 *   - No Math.random anywhere; ids come from CSPRNG (randomUUID).
 *   - Rollup numbers are computed from stored records on every read.
 *   - Intelligence outputs carry their kind: `modelSource: real|echo-demo`,
 *     `summaryKind: ai|deterministic`, `triageKind: ai|heuristic`.
 *   - Passwords are stored only via encrypt(); read endpoints return
 *     `hasCredentials`, never the blob.
 *   - `POST /messages/:id/send` really speaks SMTP when a host is
 *     configured; otherwise it says `SMTP_NOT_CONFIGURED` and leaves the
 *     message queued.
 *
 * Keys: ei:*
 */
import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { redisCmd as redis } from "../db/redis.js";
import { encrypt, decrypt } from "../security/encryption.js";
import { sendSmtp } from "./smtp.client.js";
import type {
  EiMailbox,
  EiMessage,
  EiThread,
  EiThreadDetail,
  EiThreadSummary,
  EiTriageResult,
  EiDashboardRollup,
  EiMailboxCreateInput,
  EiMessageCreateRequest,
  EiDraftInput,
  EiMailboxProvider,
  EiMailboxStatus,
  EiMessageDirection,
} from "@windels/shared/emailIntel";

type Entity = "mailbox" | "message" | "thread";

const K = {
  item: (e: Entity, org: string, id: string) => `ei:${e}:i:${org}:${id}`,
  idx: (e: Entity, org: string) => `ei:${e}:idx:${org}`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

/** Read a record ONLY when it belongs to `org` — fail-closed cross-tenant. */
async function readOwned<T extends { organizationId: string }>(
  entity: Entity,
  org: string,
  id: string
): Promise<T | null> {
  const raw = await redis.hget(K.item(entity, org, id), "_doc");
  if (!raw) return null;
  const rec = j<T>(raw);
  return rec && rec.organizationId === org ? rec : null;
}

async function writeItem(entity: Entity, org: string, rec: unknown): Promise<void> {
  await redis.hset(K.item(entity, org, (rec as { id: string }).id), "_doc", s2(rec));
  await redis.zadd(K.idx(entity, org), Date.now(), (rec as { id: string }).id);
}

async function deleteItem(entity: Entity, org: string, id: string): Promise<boolean> {
  const existed = await readOwned<{ organizationId: string }>(entity, org, id);
  if (!existed) return false;
  await redis.del(K.item(entity, org, id));
  await redis.zrem(K.idx(entity, org), id);
  return true;
}

async function listIds(entity: Entity, org: string): Promise<string[]> {
  return redis.zrange(K.idx(entity, org), 0, -1);
}

const uid = (p: string) => p + randomUUID().slice(0, 8);

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ kind, source: "email-intel", payload });
  } catch {
    /* best effort */
  }
}

/** Thread index ZSET key scored by last activity (newest-first). */
const threadIdx = (org: string) => `ei:thread:idx:${org}`;

// ─── Heuristic helpers (deterministic — used when no AI provider is real) ─

const URGENT_WORDS = ["urgent", "asap", "eod", "eow", "immediately", "deadline", "today", "overdue", "critical", "attention"];
const ACTION_WORDS = ["please", "kindly", "could you", "can you", "need", "require", "confirm", "approve", "action", "follow up", "response"];
const HIGH_SUBJECT_WORDS = ["invoice", "payment", "legal", "compliance", "contract", "termination", "security", "breach", "refund", "audit"];

function keywordsFrom(text: string, subject: string, n = 6): string[] {
  const stop = new Set(["the", "and", "for", "are", "you", "your", "this", "that", "with", "have", "from", "please", "kindly", "not", "was", "will", "can", "our", "has", "had", "but", "all", "any", "out", "per"]);
  const freq = new Map<string, number>();
  for (const word of `${subject} ${text}`.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length < 4 || stop.has(word)) continue;
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

function actionablesFrom(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (ACTION_WORDS.some((w) => t.toLowerCase().includes(w)) && t.length < 180) out.push(t);
  }
  return out.slice(0, 6);
}

function summaryOf(thread: EiThread, messages: EiMessage[]): EiThreadSummary {
  const times = messages.map((m) => m.receivedAt).sort();
  const dateRange =
    times.length > 1 ? { from: times[0], to: times[times.length - 1] } : null;
  const body = messages.map((m) => m.bodyText).join("\n\n");
  const participants = thread.participants;
  const fromNames = messages
    .map((m) => (m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress))
    .filter(Boolean);
  const first = messages[0];
  const last = messages[messages.length - 1];
  const summary =
    `${thread.messageCount} message(s) in thread "${thread.subject || "(no subject)"}"` +
    ` from ${participants.length ? participants.join(", ") : "unknown participant(s)"}` +
    (first ? `, first by ${first.fromAddress}` : "") +
    (last ? `, latest ${last.sentAt ?? last.receivedAt} by ${last.fromAddress}` : "") +
    ".";
  return {
    threadId: thread.threadId,
    summaryKind: "deterministic",
    summary,
    participants,
    messageCount: thread.messageCount,
    dateRange,
    keywords: keywordsFrom(body, thread.subject),
    actionables: actionablesFrom(body),
  };
}

function triageOf(thread: EiThread, messages: EiMessage[]): EiTriageResult {
  const reasons: string[] = [];
  let score = 0;
  const latest = messages[messages.length - 1];
  const recency = latest ? Date.now() - new Date(latest.receivedAt).getTime() : Infinity;

  if (thread.unreadCount > 0) { score += 20; reasons.push(`${thread.unreadCount} unread message(s)`); }
  if (recency < 60 * 60 * 1000) { score += 25; reasons.push("latest activity within the last hour"); }
  else if (recency < 24 * 60 * 60 * 1000) { score += 12; reasons.push("latest activity within the last day"); }

  const hay = `${thread.subject} ${messages.map((m) => m.bodyText).join(" ")}`.toLowerCase();
  const urgentHits = URGENT_WORDS.filter((w) => hay.includes(w));
  if (urgentHits.length) { score += Math.min(30, urgentHits.length * 10); reasons.push(`urgent language: ${urgentHits.slice(0, 4).join(", ")}`); }
  const subjectHits = HIGH_SUBJECT_WORDS.filter((w) => thread.subject.toLowerCase().includes(w));
  if (subjectHits.length) { score += 15; reasons.push(`high-priority subject: ${subjectHits.join(", ")}`); }
  const actionHits = ACTION_WORDS.filter((w) => hay.includes(w));
  if (actionHits.length) { score += 10; reasons.push("asks for an action or reply"); }

  const urgencyScore = Math.min(100, score);
  const label = urgencyScore >= 55 ? "urgent" : urgencyScore >= 30 ? "needs_reply" : "informational";
  const suggestedAction =
    label === "urgent" ? "Reply promptly — thread carries urgent language or an unread message." :
    label === "needs_reply" ? "Draft a reply from the outbox when the conversation requires follow-up." :
    "Informational — archive or action items if any.";
  return { threadId: thread.threadId, triageKind: "heuristic", urgencyScore, label, suggestedAction, reasons };
}

// ─── Service ────────────────────────────────────────────────────────────

export const EmailIntelService = {
  // ── Mailboxes ─────────────────────────────────────────────────────
  async listMailboxes(org: string): Promise<EiMailbox[]> {
    const ids = await listIds("mailbox", org);
    const out: EiMailbox[] = [];
    for (const id of ids) {
      const m = await readOwned<EiMailbox>("mailbox", org, id);
      if (m) out.push(m);
    }
    return out.sort((a, b) => (a.name < b.name ? -1 : 1));
  },

  async getMailbox(org: string, id: string): Promise<EiMailbox | null> {
    return readOwned<EiMailbox>("mailbox", org, id);
  },

  async createMailbox(org: string, input: EiMailboxCreateInput, _userId: string | null): Promise<EiMailbox> {
    const now = new Date().toISOString();
    const hasSmtp = Boolean(input.smtpHost && input.smtpPort);
    const rec: EiMailbox = {
      id: uid("eimb-"),
      organizationId: org,
      name: input.name,
      emailAddress: input.emailAddress,
      provider: (input.provider ?? "custom") as EiMailboxProvider,
      imapHost: input.imapHost ?? null,
      imapPort: input.imapPort ?? null,
      smtpHost: input.smtpHost ?? null,
      smtpPort: input.smtpPort ?? null,
      username: input.username ?? null,
      hasCredentials: Boolean(input.password),
      status: (hasSmtp ? "configured" : "pending") as EiMailboxStatus,
      lastSyncAt: null,
      error: hasSmtp ? null : "SMTP not configured — sending will not be attempted.",
      createdAt: now,
      updatedAt: now,
    };
    // Encrypt before persist — never store the plaintext.
    const stored = { ...rec, passwordEnc: input.password ? encrypt(input.password) : null };
    await writeItem("mailbox", org, stored);
    void emitKernel("ei.mailbox.created", { id: rec.id, organizationId: org });
    return rec;
  },

  async updateMailbox(org: string, id: string, patch: Partial<EiMailboxCreateInput>, _userId: string | null): Promise<EiMailbox | null> {
    const cur = await readOwned<{ organizationId: string; passwordEnc?: string | null } & Record<string, unknown>>("mailbox", org, id);
    if (!cur) return null;
    const now = new Date().toISOString();
    const next: Record<string, unknown> = { ...cur };
    for (const k of ["name", "emailAddress", "provider", "imapHost", "imapPort", "smtpHost", "smtpPort", "username"] as const) {
      if (patch[k] !== undefined) next[k] = patch[k] ?? null;
    }
    if (patch.password !== undefined) {
      next.passwordEnc = patch.password ? encrypt(patch.password) : null;
      next.hasCredentials = Boolean(patch.password);
    }
    const hasSmtp = Boolean(next.smtpHost && next.smtpPort);
    next.status = hasSmtp ? "configured" : "pending";
    next.error = hasSmtp ? null : "SMTP not configured — sending will not be attempted.";
    next.updatedAt = now;
    delete (next as any).password;
    await writeItem("mailbox", org, next);
    void emitKernel("ei.mailbox.updated", { id, organizationId: org });
    const safe = { ...next } as any;
    delete safe.passwordEnc;
    return safe as EiMailbox;
  },

  async deleteMailbox(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("mailbox", org, id);
    if (ok) void emitKernel("ei.mailbox.deleted", { id, organizationId: org });
    return ok;
  },

  /** Real TCP reachability probe of the configured SMTP endpoint. */
  async testMailbox(org: string, id: string): Promise<{ reachable: boolean; detail: string }> {
    const mb = await readOwned<EiMailbox & { passwordEnc?: string | null }>("mailbox", org, id);
    if (!mb) return { reachable: false, detail: "NOT_FOUND" };
    if (!mb.smtpHost || !mb.smtpPort) return { reachable: false, detail: "not_configured" };
    return new Promise((resolve) => {
      const sock = connect({ host: mb.smtpHost!, port: mb.smtpPort! });
      let answered = false;
      const done = (reachable: boolean, detail: string) => {
        if (answered) return;
        answered = true;
        try { sock.destroy(); } catch { /* ignore */ }
        resolve({ reachable, detail });
      };
      sock.setTimeout(2000);
      sock.on("connect", () => done(true, `TCP connect to ${mb.smtpHost}:${mb.smtpPort} succeeded`));
      sock.on("timeout", () => done(false, `TCP connect to ${mb.smtpHost}:${mb.smtpPort} timed out`));
      sock.on("error", (e: Error) => done(false, `${mb.smtpHost}:${mb.smtpPort} — ${e.message}`));
    });
  },

  // ── Messages & threading ──────────────────────────────────────────
  async listMessages(org: string, filter?: { threadId?: string; mailboxId?: string; direction?: EiMessageDirection }): Promise<EiMessage[]> {
    const ids = await listIds("message", org);
    const out: EiMessage[] = [];
    for (const id of ids) {
      const m = await readOwned<EiMessage>("message", org, id);
      if (!m) continue;
      if (filter?.threadId && m.threadId !== filter.threadId) continue;
      if (filter?.mailboxId && m.mailboxId !== filter.mailboxId) continue;
      if (filter?.direction && m.direction !== filter.direction) continue;
      out.push(m);
    }
    return out.sort((a, b) => (a.receivedAt === b.receivedAt ? (a.id < b.id ? -1 : 1) : a.receivedAt < b.receivedAt ? -1 : 1));
  },

  async getMessage(org: string, id: string): Promise<EiMessage | null> {
    return readOwned<EiMessage>("message", org, id);
  },

  /** Resolve a threadId for a new message: reply chain → subject match → new. */
  async resolveThreadId(org: string, mailboxId: string, subject: string, inReplyTo: string | null, references: string[]): Promise<{ threadId: string; subject: string }> {
    if (inReplyTo) {
      const ids = await listIds("message", org);
      for (const mid of ids) {
        const m = await readOwned<EiMessage>("message", org, mid);
        if (m && (m.messageId === inReplyTo || m.id === inReplyTo)) {
          return { threadId: m.threadId, subject: m.subject };
        }
      }
      for (const ref of references) {
        for (const mid of ids) {
          const m = await readOwned<EiMessage>("message", org, mid);
          if (m && m.messageId === ref) return { threadId: m.threadId, subject: m.subject };
        }
      }
    }
    // Subject-based grouping (same mailbox, normalized subject).
    const norm = (s: string) => s.toLowerCase().replace(/^(re|fwd|fw|aw|sv)\s*:?\s*/i, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
    const target = norm(subject);
    if (target) {
      const ids = await listIds("thread", org);
      for (const tid of ids) {
        const t = await readOwned<EiThread>("thread", org, tid);
        if (t && t.mailboxId === mailboxId && norm(t.subject) === target) {
          return { threadId: t.threadId, subject: t.subject };
        }
      }
    }
    return { threadId: uid("eith-"), subject };
  },

  async createMessage(org: string, input: EiMessageCreateRequest, userId: string | null): Promise<EiMessage> {
    const now = new Date().toISOString();
    const mailbox = await this.getMailbox(org, input.mailboxId);
    if (!mailbox) throw new Error("MAILBOX_NOT_FOUND");
    const direction = (input.direction ?? "inbound") as EiMessageDirection;
    const { threadId, subject: threadSubject } = await this.resolveThreadId(
      org, input.mailboxId, input.subject ?? "(no subject)", input.inReplyTo ?? null, input.references ?? []
    );
    const outboxStatus = direction === "outbound" ? "queued" : "none";
    const rec: EiMessage = {
      id: uid("eimsg-"),
      organizationId: org,
      mailboxId: input.mailboxId,
      threadId,
      messageId: input.messageId ?? `wmsg-${randomUUID().slice(0, 12)}`,
      direction,
      fromName: input.fromName ?? null,
      fromAddress: input.fromAddress,
      to: input.to ?? [],
      cc: input.cc ?? [],
      subject: input.subject ?? "(no subject)",
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml ?? null,
      sentAt: direction === "outbound" ? (input.sentAt ?? now) : input.sentAt ?? null,
      receivedAt: now,
      labels: input.labels ?? [],
      isRead: input.isRead ?? (direction === "outbound" ? true : false),
      attachmentsCount: input.attachmentsCount ?? 0,
      inReplyTo: input.inReplyTo ?? null,
      references: input.references ?? [],
      contactId: input.contactId ?? null,
      dealId: input.dealId ?? null,
      companyId: input.companyId ?? null,
      outboxStatus,
      outboxError: null,
      smtpResponse: null,
      deliveredAt: null,
    };
    await writeItem("message", org, rec);
    await this.syncThreadIndex(org, rec);
    // CRM integration: a linked email message writes a real CRM activity.
    if (rec.contactId || rec.dealId || rec.companyId) {
      try {
        const { CrmService } = await import("../crm/crm.service.js");
        await CrmService.createActivity(org, {
          kind: "email",
          subject: rec.subject,
          body: rec.bodyText.slice(0, 8000),
          contactId: rec.contactId,
          dealId: rec.dealId,
          companyId: rec.companyId,
        }, userId);
      } catch { /* best effort — CRM activity must never fail the mail write */ }
    }
    void emitKernel("ei.message.created", { id: rec.id, organizationId: org, direction: rec.direction, threadId: rec.threadId });
    return rec;
  },

  /** Recompute (never invent) the thread index record for a message's thread. */
  async syncThreadIndex(org: string, msg: EiMessage): Promise<void> {
    const all = await EmailIntelService.listMessages(org, { threadId: msg.threadId });
    const participants: string[] = [...new Set(all.map((m) => m.fromAddress))];
    const labels: string[] = [...new Set(all.flatMap((m) => m.labels))];
    const last = all[all.length - 1];
    const thread: EiThread = {
      threadId: msg.threadId,
      organizationId: org,
      mailboxId: msg.mailboxId,
      subject: last?.subject ?? msg.subject,
      lastActivityAt: last?.receivedAt ?? msg.receivedAt,
      messageCount: all.length,
      participants,
      labels,
      unreadCount: all.filter((m) => !m.isRead).length,
      lastMessageId: last?.id ?? msg.id,
    };
    await redis.hset(K.item("thread", org, msg.threadId), "_doc", s2(thread));
    await redis.zadd(threadIdx(org), new Date(thread.lastActivityAt).getTime(), msg.threadId);
  },

  async updateMessage(org: string, id: string, patch: Partial<{ isRead: boolean; labels: string[]; contactId: string | null; dealId: string | null; companyId: string | null }>, _userId: string | null): Promise<EiMessage | null> {
    const cur = await readOwned<EiMessage>("message", org, id);
    if (!cur) return null;
    const next: EiMessage = {
      ...cur,
      isRead: patch.isRead ?? cur.isRead,
      labels: patch.labels ?? cur.labels,
      contactId: patch.contactId !== undefined ? patch.contactId : cur.contactId,
      dealId: patch.dealId !== undefined ? patch.dealId : cur.dealId,
      companyId: patch.companyId !== undefined ? patch.companyId : cur.companyId,
    };
    await writeItem("message", org, next);
    await this.syncThreadIndex(org, next);
    void emitKernel("ei.message.updated", { id, organizationId: org });
    return next;
  },

  async deleteMessage(org: string, id: string): Promise<boolean> {
    const ok = await deleteItem("message", org, id);
    if (ok) void emitKernel("ei.message.deleted", { id, organizationId: org });
    return ok;
  },

  // ── Outbox / SMTP send ────────────────────────────────────────────
  async sendMessage(org: string, id: string): Promise<{ sent: boolean; reason: string; response?: string | null; error?: string | null }> {
    const msg = await readOwned<EiMessage>("message", org, id);
    if (!msg) return { sent: false, reason: "NOT_FOUND" };
    if (msg.direction !== "outbound") return { sent: false, reason: "NOT_OUTBOUND" };
    if (msg.outboxStatus === "sent") return { sent: true, reason: "ALREADY_SENT", response: msg.smtpResponse };

    const mb = await readOwned<EiMailbox & { passwordEnc?: string | null }>("mailbox", org, msg.mailboxId);
    if (!mb) return { sent: false, reason: "MAILBOX_NOT_FOUND" };
    const host = mb.smtpHost ?? process.env.WINDELS_SMTP_HOST ?? null;
    const port = mb.smtpPort ?? (Number(process.env.WINDELS_SMTP_PORT || 0) || null);
    if (!host || !port) {
      await this.markOutbox(org, id, "queued", "SMTP_NOT_CONFIGURED — no smtpHost/port on mailbox and no WINDELS_SMTP_HOST env relay.");
      return { sent: false, reason: "SMTP_NOT_CONFIGURED", error: "No SMTP host configured for this mailbox." };
    }

    await this.markOutbox(org, id, "sending", null);
    try {
      const res = await sendSmtp({
        host,
        port,
        username: mb.username ?? null,
        password: mb.passwordEnc ? decrypt(mb.passwordEnc) : null,
        from: mb.emailAddress,
        to: msg.to,
        cc: msg.cc,
        subject: msg.subject,
        text: msg.bodyText,
      });
      if (res.ok) {
        await this.markOutbox(org, id, "sent", null, res.response);
        return { sent: true, reason: "SENT", response: res.response };
      }
      await this.markOutbox(org, id, "failed", `${res.errorCode}: ${res.error}`);
      return { sent: false, reason: res.errorCode, error: res.error };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await this.markOutbox(org, id, "failed", err);
      return { sent: false, reason: "SMTP_ERROR", error: err };
    }
  },

  async markOutbox(org: string, id: string, status: "queued" | "sending" | "sent" | "failed", error: string | null, smtpResponse?: string | null): Promise<void> {
    const cur = await readOwned<EiMessage>("message", org, id);
    if (!cur) return;
    const now = new Date().toISOString();
    const next: EiMessage = {
      ...cur,
      outboxStatus: status,
      outboxError: error,
      smtpResponse: smtpResponse ?? cur.smtpResponse,
      // `sentAt` is the composition/queue time (never overwritten — the
      // average-response-time metric measures time-to-compose); the actual
      // SMTP delivery moment is `deliveredAt`.
      deliveredAt: status === "sent" ? now : cur.deliveredAt,
    };
    await writeItem("message", org, next);
    if (status === "sent") void emitKernel("ei.message.sent", { id, organizationId: org });
  },

  // ── Threads ───────────────────────────────────────────────────────
  async listThreads(org: string, filter?: { mailboxId?: string; unreadOnly?: boolean; q?: string }): Promise<EiThread[]> {
    const ids = await redis.zrange(threadIdx(org), 0, -1);
    const out: EiThread[] = [];
    for (const tid of ids) {
      const t = await readOwned<EiThread>("thread", org, tid);
      if (!t) continue;
      if (filter?.mailboxId && t.mailboxId !== filter.mailboxId) continue;
      if (filter?.unreadOnly && t.unreadCount === 0) continue;
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        if (!`${t.subject} ${t.participants.join(" ")}`.toLowerCase().includes(q)) continue;
      }
      out.push(t);
    }
    return out.sort((a, b) => (a.lastActivityAt === b.lastActivityAt ? 0 : a.lastActivityAt < b.lastActivityAt ? 1 : -1));
  },

  async getThread(org: string, threadId: string): Promise<EiThreadDetail | null> {
    const t = await readOwned<EiThread>("thread", org, threadId);
    if (!t) return null;
    const messages = await this.listMessages(org, { threadId });
    return { ...t, messages, summary: summaryOf(t, messages), triage: triageOf(t, messages) };
  },

  // ── Intelligence (AI with honest deterministic fallbacks) ─────────
  async draftEmail(input: EiDraftInput): Promise<{ subject: string; body: string; provider: string; modelSource: "real" | "echo-demo"; durationMs: number }> {
    const tone = input.tone ?? "professional";
    const length = input.length ?? "medium";
    const lengthHint = length === "short" ? "2–3 sentences" : length === "long" ? "6+ sentences" : "3–5 sentences";
    const system = "You are the WINDELS AI OS email assistant. Draft a clear, professional email. Return ONLY the email body, no preamble.";
    const user =
      `Recipient: ${input.recipient ?? "the recipient"}\n` +
      `Tone: ${tone}\nLength: ${lengthHint}\n` +
      (input.subjectHint ? `Subject hint: ${input.subjectHint}\n` : "") +
      `Context:\n${input.context}`;
    const started = Date.now();
    const fallback = () => {
      const body =
        `Hello,\n\n` +
        `Regarding: ${input.subjectHint ?? input.context.split("\n")[0]?.slice(0, 120) ?? "our conversation"}\n\n` +
        `${input.context}\n\n` +
        `Please let me know your thoughts at your earliest convenience.\n\nBest regards,\nWINDELS AI OS`;
      return { subject: input.subjectHint ?? "Re: our conversation", body, provider: "deterministic-fallback", modelSource: "echo-demo" as const, durationMs: 0 };
    };
    try {
      const { aiRegistry } = await import("../services/ai/registry.js");
      const res = await aiRegistry.complete(
        { model: "default", messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.6, maxTokens: 700 },
        { organizationId: undefined, feature: "email-intel-draft" }
      );
      const body = res.content.trim();
      if (!body) return fallback();
      return { subject: input.subjectHint ?? "Re: our conversation", body, provider: res.provider, modelSource: res.modelSource, durationMs: Date.now() - started };
    } catch {
      return fallback();
    }
  },

  async summarizeThread(org: string, threadId: string): Promise<EiThreadSummary> {
    const t = await this.getThread(org, threadId);
    if (!t) throw new Error("THREAD_NOT_FOUND");
    const deterministic = summaryOf(t, t.messages);
    try {
      const { aiRegistry } = await import("../services/ai/registry.js");
      const body = t.messages.map((m) => `${m.fromAddress}:\n${m.bodyText}`).join("\n\n---\n\n");
      const res = await aiRegistry.complete(
        {
          model: "default",
          messages: [
            { role: "system", content: "Summarize the email thread in 3–5 bullet points. Return only the bullets." },
            { role: "user", content: `Subject: ${t.subject}\n\n${body.slice(0, 20_000)}` },
          ],
          temperature: 0.3, maxTokens: 400,
        },
        { organizationId: org, feature: "email-intel-summarize" }
      );
      const summary = res.content.trim();
      if (!summary || res.modelSource === "echo-demo") return deterministic;
      return { ...deterministic, summaryKind: "ai", summary };
    } catch {
      return deterministic;
    }
  },

  async triageThread(org: string, threadId: string): Promise<EiTriageResult> {
    const t = await this.getThread(org, threadId);
    if (!t) throw new Error("THREAD_NOT_FOUND");
    const deterministic = triageOf(t, t.messages);
    try {
      const { aiRegistry } = await import("../services/ai/registry.js");
      const body = t.messages.map((m) => `${m.fromAddress}:\n${m.bodyText}`).join("\n\n---\n\n");
      const res = await aiRegistry.complete(
        {
          model: "default",
          messages: [
            { role: "system", content: "Classify the email thread as urgent | needs_reply | informational. Reply with one word only." },
            { role: "user", content: `Subject: ${t.subject}\n\n${body.slice(0, 20_000)}` },
          ],
          temperature: 0.2, maxTokens: 20,
        },
        { organizationId: org, feature: "email-intel-triage" }
      );
      const word = res.content.trim().toLowerCase();
      if (!word || res.modelSource === "echo-demo") return deterministic;
      if (word.includes("urgent")) return { ...deterministic, triageKind: "ai", label: "urgent", urgencyScore: Math.max(deterministic.urgencyScore, 70), suggestedAction: "Reply promptly — AI classified this thread as urgent." };
      if (word.includes("reply")) return { ...deterministic, triageKind: "ai", label: "needs_reply", urgencyScore: Math.max(deterministic.urgencyScore, 35), suggestedAction: "Draft a reply when the conversation requires follow-up." };
      return { ...deterministic, triageKind: "ai", label: "informational", urgencyScore: Math.min(deterministic.urgencyScore, 25), suggestedAction: "Informational — archive or action items if any." };
    } catch {
      return deterministic;
    }
  },

  // ── Dashboard rollup (computed per read — never invented) ─────────
  async rollup(org: string): Promise<EiDashboardRollup> {
    const [mailboxes, messages, threads] = await Promise.all([
      this.listMailboxes(org),
      this.listMessages(org),
      this.listThreads(org),
    ]);
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const last7d = messages.filter((m) => now - new Date(m.receivedAt).getTime() <= sevenDaysMs).length;

    const senderCount = new Map<string, number>();
    for (const m of messages) {
      if (m.direction !== "inbound") continue;
      senderCount.set(m.fromAddress, (senderCount.get(m.fromAddress) ?? 0) + 1);
    }
    const topSenders = [...senderCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([email, count]) => ({ email, count }));

    // Average response time from real pairs: outbound reply in the same thread,
    // sent after the inbound message it replies to.
    const deltas: number[] = [];
    const byThread = new Map<string, EiMessage[]>();
    for (const m of messages) {
      const arr = byThread.get(m.threadId) ?? [];
      arr.push(m);
      byThread.set(m.threadId, arr);
    }
    for (const arr of byThread.values()) {
      const inbound = arr.filter((m) => m.direction === "inbound" && m.receivedAt);
      const outbound = arr.filter((m) => m.direction === "outbound" && m.sentAt && m.outboxStatus === "sent");
      for (const o of outbound) {
        const prior = inbound
          .filter((i) => new Date(i.receivedAt).getTime() <= new Date(o.sentAt!).getTime())
          .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))[0];
        if (prior) deltas.push(new Date(o.sentAt!).getTime() - new Date(prior.receivedAt).getTime());
      }
    }
    const avgResponseMs = deltas.length ? Math.round(deltas.reduce((s, d) => s + d, 0) / deltas.length) : null;

    const unreadByMailbox = mailboxes.map((mb) => ({
      mailboxId: mb.id,
      name: mb.name,
      unread: messages.filter((m) => m.mailboxId === mb.id && !m.isRead).length,
    }));

    const recent = [...messages].sort((a, b) => (a.receivedAt === b.receivedAt ? 0 : a.receivedAt < b.receivedAt ? 1 : -1)).slice(0, 8);
    const stamps = [mailboxes[0]?.createdAt, threads[0]?.lastActivityAt]
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null;

    return {
      counts: {
        mailboxes: mailboxes.length,
        messages: messages.length,
        unread: messages.filter((m) => !m.isRead).length,
        inbound: messages.filter((m) => m.direction === "inbound").length,
        outbound: messages.filter((m) => m.direction === "outbound").length,
        queued: messages.filter((m) => m.outboxStatus === "queued").length,
        sent: messages.filter((m) => m.outboxStatus === "sent").length,
        failed: messages.filter((m) => m.outboxStatus === "failed").length,
        threads: threads.length,
      },
      last7dMessages: last7d,
      topSenders,
      avgResponseMs,
      unreadByMailbox,
      openThreads: threads.filter((t) => t.unreadCount > 0),
      recentMessages: recent,
      lastUpdatedAt: stamps,
    };
  },

  // ── Idempotent demo seed (opt-in only) ─────────────────────────────
  async ensureDemoSeed(logger?: { info?: (...a: any[]) => void }): Promise<boolean> {
    const demoOrg = "org-demo-ei";
    const existing = await this.listMailboxes(demoOrg);
    if (existing.length > 0) return false;

    const mb = await this.createMailbox(demoOrg, {
      name: "Shared inbox",
      emailAddress: "demo@windels.example.com",
      provider: "custom",
      smtpHost: null,
      smtpPort: null,
    }, null);

    const t1 = await this.createMessage(demoOrg, {
      mailboxId: mb.id,
      direction: "inbound",
      fromName: "Ada Okafor",
      fromAddress: "ada.okafor@acme.example.com",
      to: ["demo@windels.example.com"],
      subject: "Quarterly review — please confirm timing",
      bodyText: "Hi team,\n\nPlease confirm the quarterly review meeting time for next week. We need to finalize the roadmap before Friday.\n\nBest,\nAda",
      isRead: false,
      sentAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    }, null);

    await this.createMessage(demoOrg, {
      mailboxId: mb.id,
      direction: "inbound",
      fromName: "Chidi Eze",
      fromAddress: "chidi.eze@northwind.example.com",
      to: ["demo@windels.example.com"],
      subject: "Invoice #4412 payment",
      bodyText: "Hello,\n\nOur finance team flagged invoice #4412 as due today. Please confirm receipt of payment or let us know the expected date.\n\nThanks,\nChidi",
      isRead: false,
      inReplyTo: null,
      sentAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    }, null);

    await this.createMessage(demoOrg, {
      mailboxId: mb.id,
      direction: "inbound",
      fromName: "Zainab Bello",
      fromAddress: "zainab.bello@vertex.example.com",
      to: ["demo@windels.example.com"],
      subject: "Thanks — pilot kickoff materials",
      bodyText: "Thanks for sending the pilot kickoff materials. We will review internally and come back with questions next week.",
      isRead: true,
      sentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    }, null);

    await this.createMessage(demoOrg, {
      mailboxId: mb.id,
      direction: "outbound",
      fromAddress: "demo@windels.example.com",
      to: ["ada.okafor@acme.example.com"],
      subject: "Re: Quarterly review — please confirm timing",
      bodyText: "Hi Ada,\n\nWe propose Thursday 10:00 AM for the quarterly review. Please confirm if that works.\n\nBest regards,\nWindels Team",
      isRead: true,
      inReplyTo: t1.messageId,
    }, null);

    logger?.info?.("[email-intel] demo seed complete (org-demo-ei): 1 mailbox, 3 inbound + 1 outbound queued");
    return true;
  },
};
