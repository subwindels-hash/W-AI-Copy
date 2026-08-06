# SESSION 95 SPECIFICATION — ENTERPRISE HELPDESK & CUSTOMER SUPPORT

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S94, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Enterprise Applications
```

---

## 1. OBJECTIVES & ARCHITECTURE

The platform now ships all Phase-3 named Enterprise Applications (CRM, ERP,
Website Builder, Email Intelligence, Social Platform, Trading, Marketplace).
The master spec's enterprise capability catalog names **Customer Support**
among its AI Workforces, and classic enterprise stacks pair CRM with a
support desk. Session 95 adds the helpdesk application layer:

1. **Tickets** — org-scoped with a human ticket number (`HD-1001`), subject,
   description, an honest lifecycle (`new → open → pending → resolved |
   closed`), priority, channel, requester identity, optional assignment, and
   optional CRM links (contact/company).
2. **Timeline** — ticket comments/notes (author-attributed, with an
   `internal` flag for staff-only notes).
3. **Deterministic SLA tracking** — target resolution hours per priority;
   `slaDueAt` computed at create/priority-change; rollup SLA-compliance and
   overdue are measured from real timestamps.
4. **Assignment** — assign/unassign tickets; rollup counts by assignee.
5. **Deterministic rollup** — open/overdue counts, by-priority breakdown,
   SLA compliance %, avg resolution time (from real `resolvedAt − createdAt`
   pairs), recent tickets.
6. **CRM integration** — linking a ticket to a contact/company writes a real
   Session 90 CRM activity.
7. **Tenant isolation by construction** — `hd:*` org-scoped keys, fail-closed
   reads, namespaces registered in the Session 89 isolation-audit catalog.

```
                 ENTERPRISE HELPDESK
                 -------------------
   [tickets]  ->  hd:ticket:i:<org>:<id>      (tickets + lifecycle + SLA)
   [comments] ->  hd:comment:i:<org>:<id>     (timeline, internal flag)
   [rollup]   ->  computed per read (never invented)
```

---

## 2. DATA MODEL

All types live in `packages/shared/src/helpdesk.ts` (prefixed `Hd`).

### 2.1 Ticket

| Field | Type | Notes |
|---|---|---|
| `id` | string | `hdt-` + 8 hex (CSPRNG) |
| `number` | string | human number `HD-1001` (unique per org, monotonic) |
| `organizationId` | string | tenant segment |
| `subject` | string | required, 1–200 chars |
| `description` | string \| null | 1–8000 |
| `status` | `new \| open \| pending \| resolved \| closed` | lifecycle |
| `priority` | `low \| medium \| high \| urgent` | default `medium` |
| `channel` | `email \| chat \| phone \| web \| other` | default `web` |
| `requesterName` | string | required |
| `requesterEmail` | string \| null | validated when present |
| `assigneeId` | string \| null | platform user id |
| `contactId` / `companyId` | string \| null | CRM links (S90) |
| `tags` | string[] | ≤ 20 |
| `slaDueAt` | string \| null | computed from priority target hours |
| `resolvedAt` / `closedAt` | string \| null | stamped only on real transition |
| `createdAt` / `updatedAt` | ISO | server-set |

Ticket number: `HD-` + org-local monotonic counter persisted in Redis
(`hd:seq:<org>`), so numbers are stable and never collide.

### 2.2 SLA target hours (default, per priority)

| priority | target hours |
|---|---|
| low | 72 |
| medium | 24 |
| high | 8 |
| urgent | 2 |

`slaDueAt = createdAt + target` at creation; a priority change recomputes it
(only forward — never makes an already-met deadline stricter retroactively
unless the priority rises; the rule is: recompute from `max(createdAt,
priorityChangedAt)`).

### 2.3 Comment (timeline entry)

`id` (`hdc-`), `organizationId`, `ticketId`, `authorName` (required),
`authorId?`, `body` (1–4000), `internal` (bool, default false), `createdAt`.

### 2.4 Ticket detail

`HdTicketDetail extends HdTicket` — `comments: HdComment[]`.

### 2.5 Rollup (computed per read)

`HdRollup`:

- `counts`: `tickets`, `open` (new+open+pending), `resolved`, `closed`,
  `overdue` (open tickets with `slaDueAt < now`), `unassigned`
- `byPriority`: per priority `{ priority, count }`
- `slaCompliancePct`: `resolvedWithinSla / resolvedTotal` over **resolved**
  tickets (measured: `resolvedAt ≤ slaDueAt`), or `null` when none resolved
- `avgResolutionHours`: mean of `(resolvedAt − createdAt)` in hours over
  resolved tickets, or `null`
- `byAssignee`: `{ assigneeId, count }` for open tickets
- `recentTickets`: up to 6 tickets by recency
- `lastUpdatedAt`

---

## 3. STORAGE & TENANT ISOLATION

- Redis-backed, org-scoped: `hd:ticket:i:<org>:<id>`,
  `hd:comment:i:<org>:<id>`, `hd:seq:<org>` (counter).
- Reads re-parse the stored `organizationId` and refuse on mismatch.
- The Session 89 catalog gains `hd:ticket`, `hd:comment` as `org_scoped`.
- Writes emit Kernel events (`hd.ticket.created`, `hd.ticket.resolved`,
  `hd.comment.created`, …).

## 4. CRM INTEGRATION

Creating or updating a ticket with `contactId`/`companyId` (or `dealId` via
comment) writes a real `note` activity into the Session 90 CRM ledger
(best-effort — never fails the ticket write). This mirrors the Session 91
email→CRM integration.

## 5. DEMO DATA POLICY

Fresh orgs start empty. `WINDELS_DEMO_DATA=true` seeds an idempotent demo
(`org-demo-hd`): 5 tickets across statuses/priorities (one overdue, one
resolved with measured SLA outcome), 3 comments, assignment on two tickets.
See `apps/api/src/helpdesk/bootstrap.ts`.

## 6. API SURFACE (`/api/v1/helpdesk`, authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/rollup` | computed helpdesk intelligence |
| GET/POST | `/tickets` | list (filter `status`, `priority`, `assigneeId`, `q`) / create |
| GET/PATCH/DELETE | `/tickets/:id` | read (detail) / update / delete |
| POST | `/tickets/:id/assign` | assign (or unassign with null) |
| POST | `/tickets/:id/transition` | status transition (validates lifecycle + stamps timestamps) |
| GET/POST | `/tickets/:id/comments` | list / add comment |
| DELETE | `/comments/:id` | delete comment |

## 7. DELIVERY SLICE

1. `packages/shared/src/helpdesk.ts` (+ index export)
2. `apps/api/src/helpdesk/helpdesk.service.ts`
3. `apps/api/src/helpdesk/bootstrap.ts` — demo seed (gated)
4. `apps/api/src/http/routes/helpdesk.ts` + server/index wiring
5. `tenantIsolation.service.ts` — register `hd:*` namespaces
6. `apps/web/src/lib/helpdesk.ts` + `pages/helpdesk/HelpdeskPage.tsx` + router + sidebar
7. `apps/api/src/helpdesk/helpdesk.test.ts`
8. Decision log, PROGRESS.md, CHANGELOG.md

## 8. DEFINITION OF DONE

- [ ] `pnpm build` + `pnpm typecheck` pass; `make verify` green.
- [ ] No `Math.random` in read paths; all guard suites pass.
- [ ] Cross-tenant test proves org B cannot read org A's tickets.
- [ ] SLA due dates are computed deterministically; compliance measured from
      real timestamps; ticket numbers monotonic + unique per org.
- [ ] CRM activity written when a ticket links a contact/company.
- [ ] UI renders real API data with demo-honesty rules intact.
