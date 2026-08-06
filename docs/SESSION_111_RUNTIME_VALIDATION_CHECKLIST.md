# Session 111 Runtime Validation Checklist — Global Command Center

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed. Until every box is
> ticked and signed, Session 111 stays 🟡 VERIFIED (partial).

## Isolation and storage

- [ ] Two organizations register regions with the same `code` and declare
      incidents with identical titles. Each can list, read, update, acknowledge,
      resolve and delete only its own records; every cross-organization attempt
      returns `404`/`null` and leaves the other tenant's data byte-identical.
- [ ] New records land under `cmd:incident:i:<org>:<id>`,
      `cmd:region:i:<org>:<id>`, `cmd:briefing:i:<org>:<id>`,
      `cmd:initiative:i:<org>:<id>` and `cmd:dir:i:<org>:<id>` with matching
      `…:idx:<org>` sorted sets and `cmd:meta:i:<org>:center`.
- [ ] The Session 89 namespace audit reports `cmd:meta`, `cmd:incident`,
      `cmd:region`, `cmd:briefing`, `cmd:initiative` and `cmd:dir` as org-scoped
      with zero leaked keys.
- [ ] A record whose stored `organizationId` does not match its key is invisible
      to reads (fail-closed), not merely absent from a list.

## Migration

- [ ] An organization holding Session 70 `tenantStore` directive envelopes
      (`{ id, organizationId, createdAt, createdBy, data: {…} }`) lists them
      after upgrade with `issuedBy` populated from the envelope's `createdBy`
      and `statusChangedAt`/`statusChangedBy`/`statusNote` left `null`.
- [ ] Re-reading the same organization produces no duplicate rows and no
      additional index members; the stored document no longer has a `data`
      envelope.
- [ ] No directive is lost or renumbered by the migration (compare ids before
      and after).

## Measured MTTR

- [ ] A brand-new organization reports `meanTimeToResolveMinutes: null`,
      `mttrSampleSize: 0`, `mttrKind: "none"`, and `/app/command` renders `—`
      with "no incident has been resolved yet".
- [ ] Declare an incident, wait a known interval, resolve it with a note, and
      confirm `timeToResolveMinutes` matches the real elapsed minutes (±1) and
      that `mttrSampleSize` incremented by exactly one.
- [ ] `GET /command/dashboard/rollup` reports the same value in `mttrMinutes`,
      and the PlatformPage tab shows `—` when `operations.mttrKind === "none"`.
- [ ] Nothing in the platform resolves an incident without a
      `POST /incidents/:id/resolve` carrying a note; `resolvedBy` records the
      authenticated user id.

## Regional honesty

- [ ] A newly registered region reports `health: "unreported"`, `servicesUp`,
      `latencyMs` and `activeUsers` all `null`, and `healthBasis` says no
      operator report has been filed.
- [ ] Filing reports of `4/4`, `2/4` and `0/4` produces `healthy`, `degraded`
      and `down` respectively, each with a matching `healthBasis`.
- [ ] A region reported fully up but carrying an unresolved critical incident
      reports `degraded` and names the incident count in `healthBasis`.
- [ ] `POST /regions/:id/status` with `servicesUp` above the declared
      `servicesTotal` returns `400` and does not mutate the region.
- [ ] `/app/command` and the PlatformPage tab render unreported latency and user
      counts as absent, never as `0`.

## Honesty (general)

- [ ] Two consecutive `GET /api/v1/command/operations` responses for an
      unchanged organization are identical byte-for-byte.
- [ ] An `ai_assisted` briefing is stored with `aiAssisted: true`, counted in
      `aiAssistedBriefings`, excluded from `humanBriefings`, badged
      "AI-assisted (advisory)" in `/app/command` and prefixed
      `[AI-assisted — advisory]` in the legacy `briefings` array.
- [ ] Initiative progress is only ever the number an owner submitted;
      `progressKind` is `self_reported` on every record and
      `self_reported_average` (or `none`) on the rollup.
- [ ] `globalRevenueMtd` and `humanOverrides24h` remain `0` and are not
      presented as measurements.
- [ ] `grep -R "Math.random" apps/api/src/command` returns nothing;
      `noRandomData.guard.test.ts` and `noFakeVerdict.guard.test.ts` pass.

## RBAC and validation

- [ ] Unauthenticated calls to every `/api/v1/command/*` path are rejected.
- [ ] A non-admin member can read incidents/regions/briefings/initiatives/
      directives and both rollups but receives `403` on every create, update,
      delete, acknowledge, resolve and status report.
- [ ] Invalid input is rejected: missing `severity`, unknown severity, uppercase
      or spaced region `code`, negative `servicesTotal`, `progressPct` above
      100, a non-ISO `dueAt`, a note-less resolution, and an unknown directive
      transition.
- [ ] Re-acknowledging, re-resolving and re-transitioning return `409`;
      deleting a region with unresolved incidents returns `409` naming the count.

## Integration

- [ ] `GET /dashboard/rollup` still returns the Session 70 fields, now with
      populated `regions`, `incidents`, `briefings` and `strategicInitiatives`,
      plus `directives` and `operations` for new clients.
- [ ] Kernel events `command.incident_declared`,
      `command.incident_acknowledged`, `command.incident_resolved`,
      `command.region_status_reported` and `command.directive_issued` appear on
      the bus for writes only, and a kernel outage does not fail a write.
- [ ] `/app/command` renders live data and read-only state for a non-admin
      session; the PlatformPage "Command Center" tab still renders.
- [ ] Capture request ids, Redis key dumps, the namespace-audit output and this
      checklist before marking Session 111 🟢.

**Operator:** ____________________  **Environment:** ____________________

**Executed at (UTC):** ___________  **Release/commit:** ____________________
