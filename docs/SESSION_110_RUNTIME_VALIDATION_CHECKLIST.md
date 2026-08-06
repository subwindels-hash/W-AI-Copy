# Session 110 Runtime Validation Checklist — Cognitive / World Model

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed. Until every box is
> ticked and signed, Session 110 stays 🟡 VERIFIED (partial).

## Isolation and storage

- [ ] Two organizations create entities, observations and hypotheses with
      identical names. Each can list, read, update, resolve and delete only its
      own records; every cross-organization attempt returns `404`/`null` and
      leaves the other tenant's data byte-identical.
- [ ] New records land under `cog:entity:i:<org>:<id>`, `cog:obs:i:<org>:<id>`,
      `cog:hypothesis:i:<org>:<id>` with matching `…:idx:<org>` sorted sets and
      `cog:meta:i:<org>:register`.
- [ ] The Session 89 namespace audit reports `cog:meta`, `cog:entity`,
      `cog:obs` and `cog:hypothesis` as org-scoped with zero leaked keys.
- [ ] A record whose stored `organizationId` does not match its key is invisible
      to reads (fail-closed), not merely absent from a list.

## Migration

- [ ] An organization holding Session 69 `tenantStore` observation envelopes
      (`{ id, organizationId, createdAt, createdBy, data: {…} }`) lists them
      after upgrade with `domain`, `origin`, `aiAssisted`, `confidenceKind` and
      `recordedBy` populated.
- [ ] Re-reading the same organization produces no duplicate rows and no
      additional index members; the stored document no longer has a `data`
      envelope.
- [ ] No observation is lost or renumbered by the migration (compare ids before
      and after).

## Honesty

- [ ] A brand-new organization reports `entityCount`/`observationCount`/
      `hypothesisCount` `0`, `evidenceCoveragePct` `0`,
      `avgRecordedConfidencePct` `null`, `confidenceKind` `none`,
      `lastObservationAt` `null` and all twelve domains uncovered.
- [ ] Two consecutive `GET /api/v1/cognitive/world-model` responses for an
      unchanged organization are identical byte-for-byte.
- [ ] An `ai_assisted` observation is stored with `aiAssisted: true`, counted in
      `aiAssistedObservations`, excluded from `humanObservations`, and rendered
      with the "AI-assisted (advisory)" badge in `/app/cognitive`.
- [ ] Hypotheses are created `open`; nothing in the platform moves one without
      a human `POST /hypotheses/:id/resolve` carrying a note. `resolvedBy`
      records the authenticated user id.
- [ ] The PlatformPage Cognitive tab shows the AI success rate as a plain
      percent and memory entries as a raw count (no `×100`, no `M` suffix).
- [ ] `grep -R "Math.random" apps/api/src/cognitive` returns nothing;
      `noRandomData.guard.test.ts` and `noFakeVerdict.guard.test.ts` pass.

## RBAC and validation

- [ ] Unauthenticated calls to every `/api/v1/cognitive/*` path are rejected.
- [ ] A non-admin member can read entities/observations/hypotheses/rollups but
      receives `403` on create, update, delete and resolve.
- [ ] Invalid input is rejected: out-of-range `confidence`, unknown `kind`,
      unknown `domain`, unknown `origin`, `horizonMonths` `0`, note-less
      resolution, and resolving an already-resolved hypothesis (`409`).
- [ ] Deleting an entity with observations returns `409` naming the count;
      deleting an observation removes its id from every citing hypothesis.

## Integration

- [ ] `GET /dashboard/rollup` still returns the Session 69 fields plus
      `observations` and `worldModel` for existing clients.
- [ ] Kernel events `cognitive.entity_created`,
      `cognitive.observation_recorded` and `cognitive.hypothesis_resolved`
      appear on the bus for writes only, and a kernel outage does not fail a
      write.
- [ ] `/app/cognitive` renders live data, blind spots and read-only state for a
      non-admin session.
- [ ] Capture request ids, Redis key dumps, the namespace-audit output and this
      checklist before marking Session 110 🟢.

**Operator:** ____________________  **Environment:** ____________________

**Executed at (UTC):** ___________  **Release/commit:** ____________________
