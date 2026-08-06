# SESSION 115 SPECIFICATION — LEAD DISCOVERY COMPLETION

**Module:** `leadDiscovery`
**Prior state:** PARTIAL — 6 routes, a web client, one unit suite, **no shared contract**
**Delivered state:** COMPLETE — 23 routes, 452-LOC shared contract, pipeline console, 2 unit suites
**Session date:** 2026-08-06
**Verification status:** 🟡 VERIFIED (partial) — runtime validation against live Redis pending

---

## 1. Objective

Session 85 built the *discovery* half of this module and built it honestly. It
calls Google Places text search with a real key, refuses with `503` when no key
is configured rather than returning an empty list that reads like "we searched
and found nobody", stores only fields the provider returned, and labels every
record `verificationStatus: "source_returned"` — the provider listed it, nobody
confirmed it.

None of that is touched by this session. What Session 115 adds is everything
that happens *after* a lead is discovered, all of which was missing:

| Gap in the shipped module | Consequence |
| --- | --- |
| No workflow at all | A lead was found and then nothing. The module could not answer "which of these have we contacted?" |
| **No deduplication** | Running the same search twice stored the same business twice under two ids. The service's own comment referred to "dedupe" but no dedupe existed anywhere in the module. Repeat searches inflated the list and CRM exports shipped the same company more than once. |
| No provenance for empty columns | `phone` and `website` are declared on the lead and emitted as CSV columns, but Places **text search does not return either field**. Every export read like "these businesses have no phone number" — a claim about the businesses rather than about the API call that was made. |
| No collection maintenance | A collection could be created and appended to, never renamed, never deleted, and a lead could not be taken back out. A mistyped name was permanent. |
| No record of what was searched | Spend on a paid third-party API left no trace. |
| **CSV formula injection** | Business names come from a public directory. A listing called `=HYPERLINK("http://evil","Click")` was written into the CSV verbatim and executes on open in Excel and Google Sheets. |
| No shared contract | The lead shape was declared twice — once in the API service, once in the web client — with no compiler keeping them in step. |

---

## 2. Domain model

Two records per lead, deliberately separate:

* **The provider record** (Session 85, `leads85:<org>:lead:<id>`) — what Google
  returned. Never rewritten by this session.
* **The pipeline record** (Session 115, `lead:pipe:<org>:<leadId>`) — what a
  human decided. Status, owner, note count, duplicate pointer.

Keeping them apart means provider output and human judgement can never overwrite
one another, and a lead nobody has touched costs no storage: the default
pipeline record is materialised on read, so Session 85's write path is unchanged.

### Pipeline statuses

| Status | Meaning as stated to the user |
| --- | --- |
| `new` | Discovered and not yet worked. |
| `contacted` | Somebody recorded an outreach attempt. **Not** a claim that anyone replied. |
| `qualified` | An operator judged this worth pursuing. **Not** a verification of the business. |
| `disqualified` | An operator ruled this out. The record is kept so it is not rediscovered as new. |
| `duplicate` | The same provider listing as another lead; the earliest record is the keeper. |

`duplicate` is not settable by hand. It carries a `duplicateOf` pointer that
only the grouping pass can establish, and a hand-set duplicate with no keeper
would be unexplainable on screen. `LeadStatusUpdateSchema` therefore accepts
only the other four — a constraint the TypeScript compiler enforced during
development by flagging the (now removed) unreachable branch that handled it.

---

## 3. Deduplication: what it does and does not claim

Grouping is on **the provider's own place identifier and nothing else**. Two
records with similar names, or the same address typed differently, are left
alone: the provider did not say they are the same listing, and inferring it
would be a guess dressed as a fact. A test pins this — two branches of one chain
with different `place_id`s are two listings, not a duplicate group.

**Ordering.** The keeper is the earliest record. `discoveredAt` decides it
whenever the two differ, but two searches run inside the same millisecond
produce identical timestamps — which is exactly what a repeated search looks
like. The tie is broken by position in the organization's own index list, where
a larger position is an older record. The first implementation broke the tie by
comparing UUIDs, which picked an arbitrary record and then called it "the
earliest"; the test suite caught it, and the fix uses real insertion order the
store already maintains.

**Resolution marks, never deletes.** Deleting was the obvious implementation and
is deliberately not what happens: a lead somebody had already worked would
vanish along with its notes. Resolution sets the later records to `duplicate`
with a pointer to the keeper. Moving such a record to any other status returns
it to the pipeline and clears the pointer, so a wrong grouping is reversible. A
test asserts the record *and its notes* survive resolution.

---

## 4. Field coverage: reporting absence honestly

`GET /coverage` reports, per field, how many stored leads carry a value — and
crucially whether the provider endpoint in use supplies that field at all.

For `phone` and `website`, `suppliedByProvider` is `false` and the detail reads:

> Places text search does not return phone numbers. This column is empty because
> the field was never requested — it requires a separate Place Details call this
> deployment does not make.

With no leads at all, `percentPresent` is `null`, not `0`: 0% would read as
"none of them have a name" when the truth is that there is nothing to measure.

---

## 5. Storage

All keys are organization-scoped and audited by the Session 89 namespace sweep,
which now also covers Session 85's own `leads85` namespace — org-scoped since it
shipped but never in the catalogue until now.

```
leads85:<org>:…                Session 85. Read here; written only by the two
                               collection-maintenance operations.
lead:pipe:<org>:<leadId>       pipeline record
lead:note:<org>:<noteId>       note
lead:noteidx:<org>:<leadId>    note id list
lead:hist:<org>                search ledger, trimmed to 250 entries
```

Every read re-checks the `organizationId` stored *inside* the record, so a key
crafted with another tenant's id resolves to the default or a `404` rather than
to data. A test plants a forged pipeline record to prove it.

---

## 6. Endpoints

Seventeen new endpoints on the existing `/api/v1/lead-discovery` prefix, served
by a second router registered **ahead of** Session 85's. It attaches
`authenticate` per handler rather than with `router.use`, so an unmatched path
falls straight through to the original six with their behaviour unchanged.

| Method + path | Access | Purpose |
| --- | --- | --- |
| `GET /summary` | member | Records held vs distinct listings, statuses, ownership, last recorded search |
| `GET /coverage` | member | Per-field coverage with the reason each column is empty |
| `GET /history` | member | Recorded searches |
| `GET /pipeline` | member | Filtered, paged leads joined with pipeline state |
| `GET /leads/:id` | member | One lead with its pipeline record |
| `PATCH /leads/:id/status` | member | Move through the pipeline, optionally with a note |
| `PATCH /leads/:id/owner` | member | Assign, or release with `null` |
| `GET|POST /leads/:id/notes` | member | Append-only notes |
| `GET /duplicates` | member | Read-only duplicate report |
| `POST /duplicates/resolve` | **admin** | Mark repeats across the organization |
| `GET /collections/:id` | member | Collection with its leads and any unresolved member ids |
| `PATCH /collections/:id` | member | Rename |
| `DELETE /collections/:id` | **admin** | Delete the grouping, keep the leads |
| `DELETE /collections/:id/leads/:leadId` | member | Remove one lead |
| `POST /export/preview` | member | What the CSV would contain, before download |
| `POST /export/csv` | member | CSV with pipeline columns and the formula guard |

The two administrator-gated operations are the ones that change many records at
once or destroy a grouping. Working the pipeline is the daily job and is open to
any authenticated member.

---

## 7. Integration into the live path

`LeadDiscoveryService.search()` gains one call and one optional parameter:

* `actorId` (defaults to `null`) so a search can be attributed. It is used for
  the ledger only, never for authorization.
* After results are stored, `LeadPipelineService.recordSearch(...)` writes the
  ledger entry — **best-effort, `.catch(() => {})`**. This module spends money on
  a third-party API, and a failed bookkeeping write must never turn a
  successful, already-paid-for search into an error for the caller. A test spies
  on `recordSearch`, forces it to reject, and asserts the search still returns
  its results.

`newListings` / `repeatListings` are computed by counting how many stored leads
now share each returned provider id: held exactly once means new to this
organization, more than once means this search repeated something already there.
That is exact and needs no second index that could drift from the leads
themselves.

---

## 8. Export safety

`leadCsvCell()` escapes quotes and prefixes any cell beginning with `=`, `+`,
`-`, `@`, tab or carriage return with an apostrophe, forcing the text
interpretation. The apostrophe is visible in the cell rather than silently
altering what was exported, and `LEAD_CSV_INJECTION_NOTE` explains the rewrite
in the preview payload.

The preview also reports `alwaysEmpty` per column — but only when at least one
row resolved, since every column is empty for an empty selection and calling
that "always empty" would be an artefact of the selection rather than a fact
about the data.

---

## 9. Web surface

`/app/lead-pipeline`, a five-tab console (overview · pipeline · duplicates ·
field coverage · search log). Session 85's `/app/leads` is untouched and the two
pages link to each other.

The page is built to avoid four comfortable lies: it shows records held **and**
distinct listings side by side; it renders the API's coverage explanation next
to the zero; it prints the status legend in the API's own words on the screen
where statuses are set; and it offers an export preview naming the empty columns
before the file downloads. Counts that were never measured render as "none
recorded", not as a confident `0`. Administrator-only controls are hidden rather
than shown and rejected.

---

## 10. Verification

* **42 unit tests** (`apps/api/src/leadDiscovery/leadPipeline.test.ts`), all
  passing. Leads are seeded **through the real Session 85 service**, so the two
  files' key layouts must genuinely agree — a drift fails the suite rather than
  silently returning empty lists.
* Session 85's own 15 tests still pass unchanged.
* **11 Playwright cases** (`tests/e2e/leadPipeline.spec.ts`).
* `make verify`: 7/7 tasks, **1336 tests passing**, 51 skipped, 0 failures
  (1294 before this session).
* API and web typechecks clean apart from the pre-existing Prisma-generated-type
  errors that this sandbox cannot resolve.
* Inventory: `leadDiscovery` PARTIAL → COMPLETE (routes 6 → 23).

Runtime validation against live Redis remains pending; see
`SESSION_115_RUNTIME_VALIDATION_CHECKLIST.md`.
