# Session 162 — Voice Studio completion (unfinished-module track, 8/N)

**Module:** `voiceStudio` (Session 40 — Enterprise Voice Studio)
**Status:** 🟡 VERIFIED (partial)

## What was unfinished

The audit flagged a hardcoded latency fallback. Inspection found that, plus a
**cross-tenant data leak in a biometric store** — which makes this the most
serious defect the track has closed.

### 1. Cloned voices are global — every tenant can read every other tenant's

`voiceStudio` has **no organization segment in any key**. `grep -c organizationId`
on the service returns **0**. The stores are:

```
vs:builtin   vs:custom   vs:cv:<id>   vs:presets
vs:jobs      vs:jobs24   vs:lats      vs:consent-viol
```

- `listCustom(ownerId?)` filters by owner **only if the caller passes one**, and
  the route passes `req.user?.id` — optional chaining. Any request without a
  resolved user id returns **every cloned voice in the deployment**.
- `updateSettings` checks `cv.ownerId !== ownerId` — an ownership check, not a
  tenancy check. It is the only access control in the module.
- **`listPresets()` and `listJobs()` take no scope at all.** Every organization
  sees every other organization's TTS job history — `voiceId`, `audioUrl` and
  timestamps — and every voice preset.
- `vs:jobs24`, `vs:lats` and `vs:consent-viol` are single global counters, so
  one tenant's synthesis volume, latency and **consent violations** are reported
  on every other tenant's dashboard.

A cloned voice is biometric data gated by a consent record. Leaking it across
tenants is a compliance breach, and `consentViolations` — the metric that exists
specifically to surface misuse — was itself cross-tenant.

`vs:*` also appears **nowhere** in `TI_NAMESPACE_CATALOG`, so the Session 89
isolation sweep never audited any of it. The only catalogued cousin, `vs:notes`,
is a separate `tenantStore` ledger in the route file.

### 2. Fabricated and structurally wrong dashboard figures

- **`avgSynthLatencyMs` falls back to a hardcoded `180`** when no samples exist.
  A fresh deployment reports a synthesis latency it has never measured.
- **`languages: 19 + langs.size`.** The 19 is a hardcoded constant added to a
  measured set, so the count is inflated by 19 and double-counts any custom
  voice whose language is already a built-in. A deployment with no custom
  voices claims 19 languages.
- **`emotions: 13`** is a hardcoded literal, not `VS_EMOTIONS.length`.
- **`vs:jobs24` is named "24h" but is a monotonic counter that never resets** —
  `incr` on every synthesis, never expired or windowed. It is a lifetime total
  mislabelled as a day's traffic.

### 3. Reads seed

`listBuiltIn()` and `summary()` both call `ensureBootstrapped()` (l.125, l.209) —
the S156 defect. The built-in catalogue is legitimate static configuration, so
the fix is to serve it from memory rather than round-tripping it through Redis
on a read.

### 4. Other

- `trainedEpochs: method === "hf-clone" ? 12 : 3` — an invented training figure
  for a process that trains nothing.
- No unit tests, no `/app/voice-studio` console (only a buried PlatformPage tab).

## What this session adds

**Tenant isolation.** Every mutable store gains an org segment:

```
vs:cv:<org>:<id>    vs:custom:<org>     vs:preset:<org>:<id>  vs:presets:<org>
vs:job:<org>:<id>   vs:jobs:<org>       vs:lats:<org>         vs:cviol:<org>
```

`listCustom`, `listPresets`, `listJobs`, `createPreset`, `updateSettings`,
`cloneVoice`, `synthesize` and `summary` all **require** an organization id.
`updateSettings` checks tenancy first, then ownership. All eight namespaces are
catalogued org-scoped, alongside the existing `vs:notes`.

**Legacy keys are migrated, not stranded.** `ensureBootstrapped` moves any
pre-existing global `vs:cv:*` / `vs:presets` / `vs:jobs` records into the
default org's namespace once, flagging each with `migratedFrom: "global"` —
never inventing a timestamp for a record that lacked one (the standing rule).

**Honest dashboard.**

- `avgSynthLatencyMs` is `number | null` — null until a real sample exists.
- `languages` counts the distinct languages actually present (built-ins plus
  this org's custom voices), never `19 + n`.
- `emotions` is `VS_EMOTIONS.length`.
- `ttsJobs24h` is a **real 24-hour window** computed from the job ledger's
  timestamps. The lifetime total ships separately as `ttsJobsTotal`.
- `provenance` names the source of each figure.

**Reads never seed.** The built-in catalogue is served from the in-memory
`BUILTIN` array. `ensureBootstrapped` only performs the one-time legacy
migration.

**`trainedEpochs` is dropped from the invented path** — it is only set when a
real training run reports one, and is `number | null` otherwise.

**Surfaces.** `/app/voice-studio` console (Voices / Clone / Presets / Jobs) +
sidebar, and a typed web client extended with the org-scoped calls.

## Not claimed

No voice model is trained by this process. Cloning records consent and
registers a voice; synthesis delegates to `VoiceService`, which requires
`ELEVENLABS_API_KEY` or `PLAYHT_API_KEY` and otherwise returns an explicit
"VOICE MODEL NOT CONFIGURED" warning. `trainedEpochs` is not a training result.

## Additive-only

All existing paths and response envelopes are preserved. `avgSynthLatencyMs`
changes from a fabricated `180` to `null`, and `languages` from an inflated
count to a real one — which is the point of the session. The org-scoping
change is a security fix and is intentionally not backwards compatible for
callers that relied on reading another tenant's data.
