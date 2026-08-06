# SESSION 91 SPECIFICATION — ENTERPRISE EMAIL INTELLIGENCE

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S90, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Enterprise Applications
```

---

## 1. OBJECTIVES & ARCHITECTURE

The master specification lists **Email Intelligence** in the Phase-3 Enterprise
Applications ("CRM, ERP, Website Builder, Email Intelligence, Social Platform,
Trading Intelligence, Marketplace") and in the enterprise capability catalog,
but the platform has had no email surface at all. Session 91 adds the first:

1. **Mailbox registry** — org-scoped, real CRUD for connected mail accounts
   (IMAP/SMTP endpoints, encrypted credentials at rest, per-mailbox health).
2. **Threaded message store** — inbound/outbound messages, RFC-style
   `messageId` / `references` threading, labels, read state, attachments
   metadata — all org-scoped Redis records.
3. **Outbox with a real SMTP connector** — a dependency-free SMTP client over
   `node:net`/`node:tls` (EHLO/AUTH PLAIN/MAIL/RCPT/DATA/QUIT) that actually
   delivers when a host is configured; otherwise messages stay `queued` and
   the response says so honestly (`SMTP_NOT_CONFIGURED`).
4. **AI drafting & intelligence** — draft, summarize and triage via the
   existing AI ProviderRegistry (real providers when configured; the Echo demo
   provider otherwise, explicitly flagged `modelSource: "echo-demo"`), with
   deterministic heuristic fallbacks that are always labeled
   `summaryKind: "deterministic"` / `triageKind: "heuristic"`.
5. **Deterministic inbox analytics** — a dashboard rollup computed per read
   from stored records (unread, last-7d volume, top senders, average response
   time measured from real timestamps) — no fabricated numbers.
6. **CRM integration** — linking a message to a contact/deal/company writes a
   real `email` activity into the Session 90 CRM ledger.
7. **Tenant isolation by construction** — every record lives under an
   org-scoped key (`ei:*:<org>:*`), every read re-checks the org segment, and
   the namespaces are registered in the Session 89 isolation-audit catalog.

```
                 ENTERPRISE EMAIL INTELLIGENCE
                 ------------------------------
   [mailboxes] ->  ei:mailbox:i:<org>:<id>       (accounts, encrypted creds)
   [messages]  ->  ei:message:i:<org>:<id>       (inbound + outbox records)
   [threads]   ->  ei:thread:i:<org>:<tid>       (derived grouping metadata)
   [rollup]    ->  computed per read (never invented)
   [smtp]      ->  real SMTP client (net/tls) — delivers when configured
```

---

## 2. DATA MODEL

All types live in `packages/shared/src/emailIntel.ts` (single source shared by
API, routes and web client). Types are prefixed `Ei`.

### 2.1 Mailbox (account)

| Field | Type | Notes |
|---|---|---|
| `id` | string | `eimb-` + 8 hex chars (CSPRNG) |
| `organizationId` | string | tenant segment |
| `name` | string | display label, required |
| `emailAddress` | string | validated email, required |
| `provider` | `gmail \| outlook \| custom \| other` | connector hint |
| `imapHost` / `imapPort` | string / int \| null | ingest endpoint (optional) |
| `smtpHost` / `smtpPort` | string / int \| null | send endpoint (optional) |
| `username` | string \| null | login for both protocols |
| `passwordEnc` | string \| null | `encrypt()` envelope (AES-256-GCM) — never plaintext |
| `status` | `configured \| pending \| error` | `configured` only when a send path exists |
| `lastSyncAt` / `error` | ISO / string \| null | honest state |

### 2.2 Message

`id` (`eimsg-`), `organizationId`, `mailboxId`, `threadId`, `messageId`
(external RFC id or generated `wmsg-…`), `direction` (`inbound | outbound`),
`fromName`/`fromAddress`, `to[]`, `cc[]`, `subject`, `bodyText`, `bodyHtml?`,
`sentAt?`, `receivedAt` (server-set), `labels[]`, `isRead`, `attachmentsCount`,
`inReplyTo?`, `references[]`, nullable CRM links `contactId`/`dealId`/
`companyId`, outbox fields `outboxStatus`
(`none | queued | sending | sent | failed`), `outboxError?`, `smtpResponse?`,
`deliveredAt?`.

### 2.3 Thread (derived, with a lightweight stored index)

A thread is the conversation group: `threadId` (`eith-…`) is resolved on create
from `inReplyTo` (existing messageId) → existing thread, else normalized-subject
match in the same mailbox, else a new thread. Stored metadata per thread:
`subject`, `lastActivityAt`, `messageCount`, `participants` (unique emails),
`labels` (union), `unreadCount`, `lastMessageId`. Message lists are always
derived from the actual message records — the index is a cache of facts, never
a source of truth on its own.

### 2.4 Dashboard rollup (computed, never stored)

- `counts`: `mailboxes`, `messages`, `unread`, `inbound`, `outbound`,
  `queued`, `sent`, `failed`, `threads`
- `last7dMessages`
- `topSenders`: up to 5 `{ email, count }` from inbound `fromAddress`
- `avgResponseMs`: mean of `sentAt − receivedAt` for every outbound reply to
  an inbound message in the same thread (real timestamps), or `null` when no
  measured pair exists
- `unreadByMailbox`, `openThreads` (threads with unread > 0), `recentMessages`
  (up to 8), `lastUpdatedAt`

### 2.5 Intelligence outputs (honest labeling)

- `draft`: `{ subject?, body, provider, modelSource: "real" | "echo-demo",
  durationMs }` — AI draft via `aiRegistry.complete`; the UI shows the demo
  banner when `modelSource === "echo-demo"`.
- `summary`: `{ threadId, summaryKind: "ai" | "deterministic", summary,
  participants, messageCount, dateRange, keywords?, actionables? }` — AI when
  available, deterministic keyword extraction otherwise; kind is always
  explicit.
- `triage`: `{ threadId, triageKind: "ai" | "heuristic", urgencyScore (0–100),
  label: "urgent" | "needs_reply" | "informational", suggestedAction,
  reasons[] }` — deterministic heuristics (recency, unread, urgent keywords,
  action verbs, sender domain) unless AI is configured.

---

## 3. STORAGE & TENANT ISOLATION

- Redis-backed; every key embeds the org: `ei:<entity>:i:<org>:<id>`.
- Reads re-parse the stored `organizationId` and refuse on mismatch
  (fail-closed, per Session 89).
- The Session 89 namespace catalog gains `ei:mailbox`, `ei:message`,
  `ei:thread` as `org_scoped`.
- All writes emit Kernel events (`ei.mailbox.created`, `ei.message.created`,
  `ei.message.sent`, …) best-effort via `KernelService.dispatch`.

## 4. CREDENTIALS & SMTP

- Mailbox passwords are stored only through the platform's `encrypt()`
  (AES-256-GCM envelope); never returned by any read endpoint (a `hasCredentials`
  boolean is returned instead).
- `POST /mailboxes/:id/test` runs a **real TCP connect** to the configured
  `smtpHost:port` (2s timeout) and reports `{ reachable, detail }`; when no
  host is configured it reports `not_configured` — never a fabricated pass.
- `POST /messages/:id/send` runs the real SMTP client against the mailbox's
  SMTP config (or `WINDELS_SMTP_HOST`/`WINDELS_SMTP_PORT` when set for a
  default relay); success stores `sent` + the server's final response; failure
  stores `failed` + the error; missing config returns
  `{ sent: false, reason: "SMTP_NOT_CONFIGURED" }` and leaves the message
  `queued`.

## 5. DEMO DATA POLICY

Fresh orgs start empty. `WINDELS_DEMO_DATA=true` seeds an idempotent demo
(`org-demo-ei`): one mailbox (`demo@windels.example.com`, no credentials →
`pending`), a 3-message inbound thread, one outbound message `queued` in the
outbox, mixed read/unread. See `apps/api/src/emailIntel/bootstrap.ts`.

## 6. API SURFACE (`/api/v1/email-intel`, authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/rollup` | computed inbox analytics |
| GET/POST | `/mailboxes` | list / create |
| GET/PATCH/DELETE | `/mailboxes/:id` | read / update / delete |
| POST | `/mailboxes/:id/test` | real TCP reachability probe |
| GET | `/threads` | list threads (filter `mailboxId`, `unreadOnly`, `q`) |
| GET | `/threads/:threadId` | messages + metadata + summary + triage |
| GET | `/messages` | list (filter `threadId`, `mailboxId`, `direction`) |
| POST | `/messages` | create (auto-threading, optional CRM links, outbox if outbound) |
| PATCH/DELETE | `/messages/:id` | update (read/labels/links) / delete |
| POST | `/messages/:id/send` | deliver via real SMTP connector |
| POST | `/intelligence/draft` | AI email draft (flagged provider) |
| POST | `/intelligence/summarize` | thread summary (`kind: ai|deterministic`) |
| POST | `/intelligence/triage` | thread triage (`kind: ai|heuristic`) |

## 7. DELIVERY SLICE (vertical, in order)

1. `packages/shared/src/emailIntel.ts` (+ index export)
2. `apps/api/src/emailIntel/smtp.client.ts` — dependency-free SMTP client
3. `apps/api/src/emailIntel/emailIntel.service.ts` — org-scoped service
4. `apps/api/src/emailIntel/bootstrap.ts` — demo seed (gated)
5. `apps/api/src/http/routes/emailIntel.ts` + server + index wiring
6. `tenantIsolation.service.ts` — register `ei:*` namespaces (additive)
7. `apps/web/src/lib/emailIntel.ts` + `pages/emailIntel/EmailIntelPage.tsx`
   + router + sidebar
8. `apps/api/src/emailIntel/emailIntel.test.ts` — CRUD, threading, rollup
   determinism, heuristics, cross-tenant isolation, outbox lifecycle, and a
   real SMTP round-trip against an in-process fake SMTP server
9. Decision log (`CONVENTIONS.md`), `PROGRESS.md`, `docs/CHANGELOG.md`

## 8. DEFINITION OF DONE

- [ ] `pnpm build` and `pnpm typecheck` pass.
- [ ] Unit suite green — Email Intelligence suite included; `make verify` green.
- [ ] No `Math.random` in any read path; guards (`noRandomData`,
      `noFakeVerdict`, `demoCleanup`, `seedGate`) pass.
- [ ] Cross-tenant test proves org B cannot read org A's mail.
- [ ] SMTP test proves a real protocol exchange against a local fake server
      (EHLO/MAIL/RCPT/DATA) and an honest `SMTP_NOT_CONFIGURED` path.
- [ ] UI renders real API data; AI outputs carry explicit provider labeling.
