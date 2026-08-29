# Session 158 — Legal completion (unfinished-module track, 4/N)

**Module:** `legal` (Session 66)
**Status:** 🟡 VERIFIED (partial)

## What was unfinished

- `dashboard()` called `ensureBootstrapped()` on first GET (seed gated, but a read was still a seeder).
- Empty org: `compliancePassRate: 1` (100% compliant) and `riskAvg: 0` (a score).
- No list endpoints for matters/contracts/updates/research.
- No dedicated console, no unit tests, no TI catalog.

## What this session adds

- Reads never seed.
- `compliancePassRate` / `riskAvg` are `number | null`.
- List + create for contracts and regulatory updates; list matters/research.
- `/app/legal` console. Research still logs the query and invents no citations.
- `leg:m/ms/u/us/c/cs/r/rs/chk/chks` catalogued.
- Existing dashboard/matter/research/ack paths kept.

## Not claimed

Westlaw / LexisNexis / PACER citation lookup.
