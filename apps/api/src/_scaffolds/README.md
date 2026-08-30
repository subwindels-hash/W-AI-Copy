# `_scaffolds/` — unwired generated drafts

**Nothing in this directory is part of the running product.** These files are
bulk-generated service scaffolds that are imported by no route, no service, no
test, and not by `src/index.ts`. They are kept because several sketch a real
design intent that is worth reading before rebuilding the same idea — not
because they work.

Moved here in S212 from `apps/api/src/services/`, which previously held 304
`*.service.ts` files of which **263 (94%) were unreachable**. That ratio made
the services directory unreadable: the 41 real services were a rounding error
inside it. `src/services/` now contains only reachable code.

## Rules

1. **Do not import from this directory.** A lint/CI rule should enforce it; for
   now the build gate excludes the whole directory via
   `apps/api/tsconfig.orphans.json`, and these files do not typecheck.
2. **To revive a file:** move it back to `src/services/`, fix its types, wire a
   route + shared contract + client + tests, then re-run
   `node scripts/find-orphans.mjs --write`. Treat it as new code under review,
   not as existing code being re-enabled — see the warning below.
3. **Do not treat anything here as verified.** These files were never executed.

## ⚠️ Safety guards — read before reviving

Some of these scaffolds do not merely fail to work; they **silently claim
success**, which is worse than being absent. Three were neutralized in place so
that reviving one fails loudly rather than quietly certifying a lie. Each guard
is marked `S212 SAFETY GUARD` with the original code left directly beneath it.

| File | What it did | Why it is dangerous |
|---|---|---|
| `automatedComplianceScanning.service.ts` | `checkPIIInLogs`, `checkEncryptionAtRest`, `checkDataExport`, `checkDataErasure` each returned an empty `violations` array that nothing ever pushed to | A compliance scanner that **always reports "no violations"**. A passing scan is evidence of nothing while looking like evidence of compliance. |
| `modelPackaging.service.ts` — `signPackage` | `sha256(checksum + privateKey)` | A keyed hash, **not a signature**. Symmetric, so anyone who can verify can forge. Packages were marked `signed: true` with no authenticity guarantee. |
| `modelPackaging.service.ts` — `verifyPackage` | recomputed `sha256(checksum + publicKey)` and compared with `===` | Mixes in the **caller-supplied public key**, so any caller could mint a value that "verifies". Also not constant-time. |
| `modelPackaging.service.ts` — `calculateChecksum` | hashed the **URL string**, not the file | Stable regardless of what the artifact behind the URL becomes: detects neither corruption nor tampering, the only two things a checksum exists for. |

Reviewed and deliberately **not** guarded:

- `tamperProofAudit.service.ts` uses genuine asymmetric crypto
  (`createSign`/`createVerify`) and already fails safe — no key yields an empty
  signature, and verification rejects an empty signature. Its weakness is key
  *storage* (private key in Redis), which is a deployment concern, not a
  fabricated guarantee. Move the key to KMS/Vault before production use.

## Known fabrications (not guarded — inert and clearly labelled)

These return invented data. They are harmless while unreachable, but must not
be revived as-is:

| File | Line | What it fabricates |
|---|---|---|
| `aiModelSelection.service.ts` | ~604 | `getAvailableModels()` returns a hardcoded GPT-4 entry with invented latency/cost/quality numbers |
| `aiModelLifecycleInsights.service.ts` | ~276 | pushes a fabricated "Validation Stage Bottleneck" with invented 5.2-day metrics |
| `queryAnalysis.service.ts` | ~370 | `p95 = max * 0.8`, `p99 = max * 0.95` — percentiles invented from the max |
| `aiTaskScheduling.service.ts` | ~423 | `setTimeout(..., 100)` in place of a real queue |
| `dataMasking.service.ts` | ~319 | rules carrying a `condition` are silently skipped, so conditional masking never applies |
| `aiFeatureServing.service.ts` | 2 sites | "would fetch from a feature store" / "would compare with baseline statistics" |
| `apiCaching.service.ts` | 1 site | invalidation just logs |
| `planning.service.ts` | 1 site | returns a template plan |

## Counts (verified S212, not copied from a prior audit)

- Files moved here: **263**
- Left in `src/services/` because reachable code imports them: **2**
  (`automatedBackup.service.ts` ← `src/qa/drTest.service.ts`;
  `rowLevelSecurity.service.ts` ← `src/index.ts`, `http/middleware/tenantContext.ts`)
- Marker comments (`for now,` / `in a real implementation` / `mock data`)
  across the whole repo: **25**, of which **21 are in 10 files in this
  directory**. A previous audit reported 429; that figure could not be
  reproduced and appears to have counted substring matches such as the
  `for (const name of ...)` loop in `projectIntake.service.ts`.
