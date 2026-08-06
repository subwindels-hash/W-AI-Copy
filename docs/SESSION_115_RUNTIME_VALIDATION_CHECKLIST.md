# Session 115 Runtime Validation Checklist — Lead Discovery Pipeline

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted.
> Until every box is ticked and signed, Session 115 stays 🟡 VERIFIED (partial).

## Route mounting and backwards compatibility

- [ ] All six Session 85 endpoints answer on their original paths after the
      Session 115 router was mounted ahead of them on the same prefix:
      `POST /search`, `GET /leads`, `GET|POST /collections`,
      `POST /collections/:id/leads`, `POST /export`.
- [ ] `POST /api/v1/lead-discovery/export` still returns the original **eleven**
      columns, unchanged — the pipeline CSV is a separate endpoint.
- [ ] Every Session 115 path returns `401` without a token.
- [ ] `POST /duplicates/resolve` and `DELETE /collections/:id` return `403` for
      a non-admin member; the other fifteen succeed for an ordinary member.
- [ ] A session with no organization receives `403` (not a key containing the
      literal string `undefined`) from every Session 115 path.
- [ ] An unknown path under `/lead-discovery` returns `404`, not a stack trace.

## Discovery integration

- [ ] With a real `GOOGLE_PLACES_API_KEY`, a live `POST /search` returns results
      **and** writes exactly one `lead:hist:<org>` entry naming the query, the
      caller and the counts.
- [ ] Without the key, `POST /search` still returns `503` and writes **no**
      ledger entry.
- [ ] Stop Redis mid-flight (or point the ledger key at a failing instance) and
      confirm a search that already reached Google still returns its results —
      the ledger write is best-effort by design.
- [ ] Run the *same* query twice against live Places. The second entry reports
      `repeatListings` equal to the number of listings already held, and
      `newListings` for the rest.

## Tenant isolation (Session 89 sweep)

- [ ] `GET /api/v1/tenant-isolation/...` compliance run reports the five new
      namespaces (`leads85`, `lead:pipe`, `lead:note`, `lead:noteidx`,
      `lead:hist`) with `leakedKeys: []`.
- [ ] Two organizations each store leads. `GET /pipeline`, `/summary`,
      `/duplicates`, `/coverage` and `/history` return only the caller's rows.
- [ ] `GET /leads/:id` with the other organization's lead id returns `404` and
      the record is unchanged afterwards
      (`GET leads85:<otherOrg>:lead:<id>` identical).
- [ ] Plant `lead:pipe:<orgB>:<leadId>` whose payload carries
      `organizationId: "<orgA>"`; org B reads the **default** pipeline record,
      not the planted one.
- [ ] `POST /export/csv` with another organization's lead id returns `404`.

## Deduplication over real Redis

- [ ] Two searches inside the same second that return the same `place_id`
      produce one duplicate group whose `keeperId` is the **first** record —
      verify against `LRANGE leads85:<org>:leads 0 -1` ordering, since the
      `discoveredAt` timestamps may be identical.
- [ ] `POST /duplicates/resolve` marks only the non-keepers; `GET /leads/<keeper>`
      still reports `new`.
- [ ] After resolution, every marked record is still readable and its notes are
      intact (`GET /leads/:id/notes`).
- [ ] Setting a marked record to `contacted` clears `duplicateOf` and the group
      returns to `unresolved` in the next report.
- [ ] Two listings with identical names but different `place_id`s are **not**
      grouped.

## Scale and latency

- [ ] With 10 000 stored leads (the retention cap), measure `GET /summary`,
      `GET /pipeline` and `GET /duplicates`. Each performs a full scan of the
      organization's leads plus one pipeline read per lead. Record the timings
      and decide whether an index is warranted; do **not** silently cap the scan,
      which would understate every count.
- [ ] Confirm `LTRIM` keeps `lead:hist:<org>` at 250 entries and `stored` /
      `oldestAt` report the surviving window.
- [ ] Confirm the 200-note cap returns `409` rather than discarding an older
      note.

## Export

- [ ] Export a lead whose provider name begins with `=`, `+`, `-` or `@`. Open
      the CSV in Excel **and** Google Sheets: the cell renders as text with a
      visible leading apostrophe and no formula executes.
- [ ] `POST /export/preview` reports `alwaysEmpty: true` for `phone` and
      `website` on a real selection, and `false` for every column when nothing
      resolved.
- [ ] `missingIds` names ids that do not resolve; `duplicatesInSelection`
      reports repeated ids in the request.
- [ ] The pipeline CSV carries the `status` and `ownerId` columns and uses CRLF
      line endings.

## Collections

- [ ] `DELETE /collections/:id` removes the record **and** its id from
      `leads85:<org>:collections` (verify with `LRANGE`), and the leads it
      grouped are still returned by `GET /leads`.
- [ ] `PATCH /collections/:id` renames without changing `createdAt` or membership.
- [ ] `DELETE /collections/:id/leads/:leadId` returns `404` when the lead was
      never a member.
- [ ] `GET /collections/:id` names any member id that no longer resolves in
      `missingLeadIds` rather than dropping it silently.

## Web surface

- [ ] `/app/lead-pipeline` loads for a member; the duplicate-resolution button
      and the collection delete control are absent for a non-admin.
- [ ] The overview shows records held and distinct listings as two separate
      figures.
- [ ] The coverage tab renders the API's own explanation beneath the phone and
      website rows.
- [ ] An organization with no recorded search shows "no search has been
      recorded", not a zero date.
- [ ] `/app/leads` (Session 85) is unchanged and both pages link to each other.

## Regression sweep

- [ ] `make verify` green on the target host (expect 1336 passing, 51 skipped).
- [ ] `tests/e2e/leadPipeline.spec.ts` green against the live API.
- [ ] `node audit/build-inventory.mjs` still reports `leadDiscovery` COMPLETE
      with 23 routes.

---

**Signed off by:** _______________  **Date:** ____________
