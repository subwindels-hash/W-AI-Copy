# Session 125 Runtime Validation Checklist — Super Admin Biography, Identity Memory & AI Knowledge System

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted.
> Until every box is ticked and signed, Session 125 stays 🟡 VERIFIED (partial).

The unit suite proves authority, classification access, lifecycle, versions,
audit, memory-fabric sync, the ask engine and agents against in-memory fakes;
only a live deployment proves the real AuditLog table, the real Redis
keyspace and the Session 89 sweep behave as this module assumes.

## Route mounting & authority

- [ ] All 22 `/api/v1/identity-knowledge` routes answer; anonymous callers get
      `401` on every one.
- [ ] With a **non-super-admin** token (org admin or member): `POST /records`,
      `PATCH/DELETE /records/:id`, `/approve`, `/publish`, `/archive`,
      `/sync`, `/import`, `/export`, `/documents`, grants and relations all
      answer **403** — even for an org admin.
- [ ] With the **super admin** token the full lifecycle works:
      create (201, `draft`) → approve (`approved`, not verified) → publish
      (`published`, `verified: true`, `publishedAt` set) → archive
      (`archived`, verified cleared).
- [ ] `PATCH /records/:id` on a published record returns it to
      `pending_approval` and clears `verified`.
- [ ] `GET /records/:id/versions` returns the append-only history in
      chronological order with actor + action per version.

## Classification access (live)

- [ ] Public record: visible to a freshly registered member; answers from it.
- [ ] Organization record: visible to any org member; absent for a user with
      no membership in the org.
- [ ] Private record: visible to the Super Admin; hidden from members until an
      explicit grant (`POST /records/:id/grants`) unlocks it for the granted
      user; an ORG_ADMIN (via `hasPermission`) can also view.
- [ ] Two organizations: records, versions, grants and activity are fully
      isolated; `KEYS ik:*` with a live Session 89 sweep shows every key
      conforming (org segment straight after `ik:`), no findings.

## Audit & compliance

- [ ] For each action (created, updated, approved, published, archived,
      deleted, granted, document_uploaded, sync_all, agent_run, bulk_import,
      bulk_export), an `AuditLog` row exists with
      `resourceType: "IdentityKnowledgeRecord"`, the record id and metadata.
- [ ] The AuditLog rows are visible through the existing audit/security
      surfaces (no separate audit store).

## AI response engine (live)

- [ ] Ask a question matching a **published** record: `outcome: "answered"`,
      a `verified_facts` section, `sources[]` containing the record with
      `verified: true` and `usedIn` naming the section.
- [ ] Ask a question matching an **approved** (not published) public record:
      answered from the `super_admin_approved` section, source `verified:
      false`.
- [ ] Ask about something with no approved match: `outcome:
      "insufficient_knowledge"` and the answer text says the system does not
      have sufficient approved knowledge.
- [ ] Ask about a **private** record as a member: not answered; as the Super
      Admin (or a granted user): answered and the source lists it.
- [ ] Drafts and archived records never answer.

## Continuous memory synchronization

- [ ] Publish a record, then inspect Redis: a `me:*` knowledge memory exists
      with the record's content and scope `org:<oid>`.
- [ ] Re-publish or re-sync: the memory count does **not** increase (the
      fabric deduplicates by content).
- [ ] Kernel events `identity-knowledge.*` are visible in the kernel event
      log after create/update/approve/publish/archive/sync/agent runs.
- [ ] `POST /sync` reports `{ synced, failed, skipped }` matching the
      published/unpublished counts.

## Knowledge agents, graph, documents, search

- [ ] The 8 agents list; each read agent runs for members; the
      `knowledge_synchronization_agent` answers 403 for members and performs
      the sync for the Super Admin.
- [ ] `GET /graph` returns only nodes the caller may view and the edges the
      Super Admin defined.
- [ ] Upload a PDF/TXT via `POST /documents` (multipart): a governed
      `document` record is created referencing the attachment; its bytes are
      readable through the attachments surface; the record respects
      classification.
- [ ] `POST /import` (JSON array) creates drafts; `GET /export` returns all
      records for the Super Admin.
- [ ] Enterprise Search with `types=knowledge` returns published records the
      caller may see; private records never appear in any search result.

## Console (web)

- [ ] `/app/identity-knowledge` as Super Admin shows the Biography Manager,
      Approval Center, Document Upload, Knowledge Graph and Activity tabs;
      as a regular member it shows only Library + AI Knowledge Insights with
      the "Only the Super Admin can manage records" notice.
- [ ] The Ask tab renders sections and the source list per answer.
