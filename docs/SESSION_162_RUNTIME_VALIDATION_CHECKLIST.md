# Session 162 — Runtime validation checklist (`voiceStudio`)

Runtime validation requires live PostgreSQL 17 + Redis 8 + `prisma generate`.
This sandbox reaches none of them, so Session 162 ships 🟡 **VERIFIED (partial)**.

**§2 is a security regression gate — run it before anything else.**

## Prerequisites

```bash
pnpm install && pnpm --filter @windels/shared build
cd apps/api && pnpm exec prisma generate
pnpm dev
```

Register a second organization to test against:

```bash
curl -sX POST localhost:4000/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"b@example.test","password":"W1ndels!Tenant#2026","displayName":"B","organizationName":"Tenant-B"}'
```

## 1. Migration of pre-S162 data

- [ ] On a database that predates S162, boot once and confirm the log line
      `[voice-studio] migrated pre-S162 global records into org namespace`.
- [ ] Every adopted voice/preset/job carries `migratedFrom: "global"`.
- [ ] Adopted records keep their original `createdAt` — no invented timestamp.
- [ ] Boot a second time: nothing is migrated again (`vs:migrated` guard).
- [ ] Legacy keys (`vs:custom`, `vs:cv:<id>`, `vs:presets`, `vs:jobs`) are left
      in place, not deleted — rollback stays possible.

## 2. Cross-tenant isolation (**the security gate**)

With tokens for org A and org B:

- [ ] A clones a voice. `GET /voice-studio/voices/custom` as **B** does not
      contain it.
- [ ] A creates a preset. `GET /voice-studio/presets` as **B** does not
      contain it.
- [ ] A synthesizes. `GET /voice-studio/jobs` as **B** does not contain it.
- [ ] `PATCH /voice-studio/voices/<A's id>/settings` as **B** → 404.
- [ ] A triggers a consent violation; B's `consentViolations` is unchanged.
- [ ] `redis-cli --scan --pattern 'vs:cv:*'` — every key has the form
      `vs:cv:<org>:<id>`; none is `vs:cv:<id>`.
- [ ] Any endpoint called without an organization context → 403 FORBIDDEN.
- [ ] Tenant-isolation sweep reports no unscoped `vs:*` namespace, and no bare
      `vs` entry exists in `TI_NAMESPACE_CATALOG`.

## 3. Honest metrics

- [ ] Fresh org: `avgSynthLatencyMs` is JSON `null`, **not** `180`.
- [ ] After one successful synthesis it becomes that job's duration.
- [ ] `languages` equals the distinct count across built-ins + this org's
      custom voices. Cloning an `en` voice does **not** increase it; cloning a
      genuinely new language increases it by exactly 1.
- [ ] `emotions` equals `VS_EMOTIONS.length` (13).
- [ ] `ttsJobs24h` ≤ `ttsJobsTotal`. Age a job's `requestedAt` past 24h and
      confirm `ttsJobs24h` drops while `ttsJobsTotal` holds.
- [ ] `provenance` is present and describes each figure.

## 4. Consent gate

- [ ] `POST /voice-studio/voices/clone` with `consentGranted: false` → 400
      `CONSENT_REQUIRED`, and the org's `consentViolations` increments.
- [ ] With consent: `consent: "consent-recorded"`, `consentRecordedAt` set,
      `consentRecordedBy` set, `visibility: "private"`.
- [ ] `trainedEpochs` is `null` for every method, including `hf-clone`.

## 5. Reads never seed

- [ ] `GET /voice-studio/voices/builtin` on a fresh Redis writes **no** keys
      (`--scan --pattern 'vs:*'` stays empty).
- [ ] `GET /voice-studio/dashboard/rollup` likewise writes nothing.
- [ ] With `WINDELS_DEMO_DATA` unset, boot creates **no** demo voice, no
      presets and no warm TTS job.
- [ ] With `WINDELS_DEMO_DATA=true`, the demo voice and two presets appear —
      and latency still reads `null`, because the seed performs no synthesis.

## 6. Synthesis

- [ ] Without `ELEVENLABS_API_KEY` / `PLAYHT_API_KEY`, a job returns status
      `demo` or `failed` with the "VOICE MODEL NOT CONFIGURED" warning — never
      `ready` with no audio.
- [ ] With a key configured, a real job reaches `ready` and its `durationMs`
      feeds `avgSynthLatencyMs`.

## 7. UI

- [ ] `/app/voice-studio` loads; sidebar shows "Voice Studio (Org)".
- [ ] The pre-existing `/app/voice` playback page still works and is now
      labelled "Voice Playback" (the two entries were both "Voice Studio").
- [ ] Avg latency renders "—" on a fresh org, never "180ms".
- [ ] Admin → Platform → Voice Studio tab shows "—" avg, not "nullms".
- [ ] Migrated records show a `migrated` badge.

## 8. Regression

- [ ] Existing paths keep their envelopes: `/dashboard/rollup`,
      `/voices/builtin`, `/voices/custom`, `/voices/clone`,
      `/voices/:id/settings`, `/presets`, `/synthesize`, `/jobs`,
      `/voices/registry`, `/audio/:file`, and the four `/notes` paths.
- [ ] `pnpm test` — `src/voiceStudio/voiceStudio.test.ts` 21/21.
- [ ] `pnpm exec playwright test tests/e2e/voiceStudio.spec.ts` — 10/10.
