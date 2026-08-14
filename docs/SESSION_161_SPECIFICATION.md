# Session 161 — Cyber completion (unfinished-module track, 7/N)

**Module:** `cyber` (Session 82 — Cybersecurity Academy, Ethical Hacking & Multi-Cloud Security)
**Status:** 🟡 VERIFIED (partial)

## What was unfinished

An earlier pass removed the RNG from `dashboard()` (no more invented learner
counts or bug-bounty earnings) and made `startLab` actually persist. The
remaining defects are more serious than the ones that were fixed, because they
present **static fiction as measured security posture**:

- **`dashboard()` (l.84) calls `ensureBootstrapped` on a read**, and the seed is
  not gated by `WINDELS_DEMO_DATA`. This is the S156 defect verbatim.
- **Ten fabricated cloud security findings are served to every org.** A fresh
  tenant that has connected no cloud account is told it has a public S3 bucket
  ACL, root account access keys, and a GCP default service account with editor
  role — with `cloudFindingsCritical: 2`. This is the single most dangerous lie
  in the repo: an operator could act on it, or worse, be reassured by
  `cloudFindingsRemediated30d: 4` for remediation that never happened.
- **Finding status is assigned by `i % 3` / `i % 5` round-robin**, so
  "remediated" and "accepted" are positional, not recorded (the S160
  fabricated-coverage defect).
- **Six fabricated certifications are served as held credentials** —
  `CompTIA Security+ passed 88%`, `CISSP passed 82%`, `AWS Security Specialty
  91%`, with achievement and expiry dates. `certificationsHeld: 4` on an org
  where nobody sat an exam. A fabricated credential is the exact defect S159
  called out in `education`.
- **`enrolled: 0` / `rating: 0` / `solvedBy: 0`** are structural zeros presented
  as registry statistics that are simply not collected — must be `null`.
- **Challenge `points` and `difficulty` are assigned by `i % 6` / `i % 4`**
  round-robin over a title list; `domain` by `i % 26`. "Buffer Overflow 101" is
  labelled with whatever domain its index lands on.
- `learners: 0` and `leaderboardRank: 0` are structural zeros — rank 0 is not a
  rank, and there is no leaderboard.
- `ranges: []` with `upcomingRanges: 0 / activeRanges: 0` — `RANGE_KINDS` is
  declared and never used; there is no range register at all.
- No unit tests, no `/app/cyber` console, no TI catalog entry for `csec:*`, and
  the notes ledger writes `cy:notes` (a *different* prefix from the service's
  `csec:*`) which is also uncatalogued.

## What this session adds

**Reads never seed.** `dashboard()` no longer calls `ensureBootstrapped`. The
demo seed is gated behind `WINDELS_DEMO_DATA` and writes only labelled records.

**The catalogue is separated from the posture.** Courses, certification *tracks*
and challenge definitions are static curriculum — legitimate configuration, kept
and explicitly labelled `catalog`. But:

- **Cloud findings are a register, not a catalogue.** `findings` is empty until
  a real finding is recorded via `POST /findings` (operator/scanner entered,
  `source: "operator_entered" | "scanner_reported"`). The ten `FINDING_SEEDS`
  move behind the demo gate and are tagged `demo_seed`. `cloudFindingsOpen` /
  `Critical` / `Remediated30d` count real records; `Remediated30d` is a genuine
  30-day window on `remediatedAt`, not a status tally.
- **Certifications are earned, not served.** `certifications` is the org's own
  register (`POST /certifications`), empty by default. The six vendor certs
  become a `certificationTracks` catalogue — available exams, with no
  `passed`/`scorePct`. `certificationsHeld` counts real passed records.
- **Enrollment/rating/solve counts are `number | null`.** `enrolled`, `rating`
  and `solvedBy` are `null` — not collected — never `0`.
- **Challenge metadata is authored, not positional.** Each challenge carries its
  real `domain`, `points` and `difficulty` in the definition table.
- `learners` is the distinct set of users with recorded academy activity.
  `leaderboardRank` is `null` (no leaderboard exists).
- **Ranges are a real register** (`POST /ranges`, `GET /ranges`) with
  `scheduled`/`live`/`completed` lifecycle; `RANGE_KINDS` is now used.
- **Labs get the lifecycle they were missing**: `GET /labs`, `POST /labs/:id/stop`,
  and expiry is computed (`expired` when `expiresAt` has passed) rather than a
  status that lies after two hours.

**Provenance on every figure.** `dashboard.provenance` names the source of each
number, following the S155 pattern.

**Surfaces.** `/app/cyber` console (Academy / Labs / Challenges / Cloud Posture /
Certifications / Ranges) + sidebar. Typed web client `apps/web/src/lib/cyber.ts`.

**Tenant isolation.** `csec:meta/lab/labs/progress/activity/find/finds/cert/certs/rng/rngs`
catalogued org-scoped, plus the pre-existing `cy:notes`. A bare `csec` entry is
never added (two-segment rule).

## Not claimed

No live AWS/Azure/GCP security scanner, no CSPM integration, no real cyber range
provisioning, no exam proctoring. A lab row is a register entry — no container
or VM is provisioned by this process. A finding is what an operator or an
external scanner posted, and it says so via `source`.

## Additive-only

`GET /dashboard/rollup`, `POST /labs` and the four notes paths keep their paths
and response envelopes. Fields are added, and three fields change from a
fabricated number to `null` (`enrolled`, `rating`, `solvedBy`) or from fiction
to an empty register (`findings`, `certifications`) — which is the point of the
session.
