# Advanced Lead Discovery Upgrade

This upgrade is additive to the existing Lead Discovery module. The original `POST /api/v1/lead-discovery/search`, stored-lead view, collections, pipeline, and legacy exports remain available. Advanced modes reuse the same tenant-scoped Redis lead records (`leads85:<organization>:*`) and lead IDs; they do not create another lead database or another pipeline.

## Modes and real provider requirements

| Mode | Provider | Runtime configuration | What is persisted |
|---|---|---|---|
| **Apollo Mode** | Apollo People API Search | `LEAD_APOLLO_API_KEY` with Apollo `mixed_people_api_search` scope | Only fields returned by Apollo: person/company/location/profile data where present. Apollo People Search does not normally return email or phone data. |
| **Business Mode** | Google Places Text Search + Place Details | `GOOGLE_PLACES_API_KEY`, with both APIs enabled | Businesses returned by Google. Phone, website, map URL and address components are kept only when Place Details actually returns them. |
| **Person Mode** | Apollo People API Search | `LEAD_APOLLO_API_KEY` with Apollo `mixed_people_api_search` scope | Only permitted, provider-returned person fields. Personal-domain filtering evaluates returned email values only and is disabled by default by compliance policy. |
| **Email verification** | NeverBounce Single Check | `LEAD_NEVERBOUNCE_API_KEY` | A per-lead evidence record. `valid` maps to **Verified**, `catchall` to **Likely Valid**, `invalid`/`disposable` to **Invalid**, and unknown results stay **Unverified**. |

Credentials can be injected as deployment secrets or saved by a Super Admin in **Site & platform control → APIs**. Dashboard values are AES-256-GCM encrypted at rest and are never returned by the API. The Super Admin API catalog contains:

- Google Places Lead Discovery
- Apollo Lead Intelligence
- NeverBounce Email Verification

A configured credential is *not* presented as a successful provider test. When no credential or required provider scope exists, the search job fails with a specific configuration message. The system never substitutes sample data, generated leads, constructed URLs, or guessed emails.

## Search lifecycle

`POST /api/v1/lead-discovery/advanced/search` returns `202 Accepted` and a job ID. The server moves the job through:

```text
queued → provider_search → normalization → deduplication → completed | failed
```

Poll `GET /api/v1/lead-discovery/advanced/jobs/:id`; completed-result IDs are available from `GET /api/v1/lead-discovery/advanced/jobs/:id/results`. This prevents provider work from blocking the UI.

Each trace entry stores the actual provider, provider record ID, returned source URL when one exists, method, search mode, exact query criteria, and timestamp. Verification stores its provider, method, timestamp, and returned classification separately.

## Verification and quality semantics

- **Verified** — an authorized verification provider returned a positive result for the named field.
- **Likely Valid** — the provider returned an inconclusive-but-qualified result (currently NeverBounce `catchall`).
- **Unverified** — no positive authorized verification evidence is stored.
- **Invalid** — the provider returned `invalid` or `disposable`.

A quality score is deterministic field completeness (name, company, title, email, phone, website, location, source traceability). It is **not** a conversion probability, consent signal, deliverability guarantee, or verification score.

## Compliance controls and access

`GET/PATCH /api/v1/lead-discovery/advanced/admin/*` require `SUPER_ADMIN`.

The policy controls module enablement, verification and export enablement, personal email-domain filtering, max provider results per search, and retention period. Retention is enforced on advanced lead and job-history reads/search operations, including removal from existing lists. Searches, verification, and agent operations use the dedicated user-scoped lead-discovery rate limit in addition to the platform global API limit.

All advanced records are organization-scoped. Deleting a lead requires an administrator. Tags, lists, and the existing pipeline retain their existing RBAC behavior. Significant search, provider-error, verification, tag, deletion, handoff, and policy actions are sent to the existing audit service; searches, discovered leads, verification requests, agent interpretations, and exports are metered in the existing `usg:evt` usage ledger.

## API surface

- `POST /lead-discovery/advanced/search` — queue Apollo, Business, or Person search
- `GET /lead-discovery/advanced/jobs` — newest-first organization-scoped advanced search history
- `GET /lead-discovery/advanced/jobs/:id` — search progress
- `GET /lead-discovery/advanced/jobs/:id/results` — normalized results for a job
- `GET /lead-discovery/advanced/leads` — query stored normalized leads
- `GET /lead-discovery/advanced/leads/:id` — lead with quality, source, verification, tags, pipeline state
- `PATCH /lead-discovery/advanced/leads/:id/tags` — save tags
- `POST /lead-discovery/advanced/leads/:id/verify` — user-initiated email verification
- `DELETE /lead-discovery/advanced/leads/:id` — admin-only lead removal
- `POST /lead-discovery/advanced/export` — policy-gated structured export
- `POST /lead-discovery/advanced/outreach/handoff` — explicit handoff preparation only; it does not create or send a message
- `POST /lead-discovery/advanced/agent/interpret` — real AI interpretation when a real WINDELS AI provider is configured, otherwise clearly marked deterministic parsing
- `POST /lead-discovery/advanced/agent/recommendations` — user-requested local evidence review for normalization/classification, confident duplicates, completeness, missing fields, verification, and explicit list recommendations; it never updates a lead or sends data to an AI provider
- `GET /lead-discovery/advanced/admin/status` and `PATCH /lead-discovery/advanced/admin/policy` — Super Admin controls

## AI Workforce and outreach

The Lead Discovery AI Agent sends queued, completed, failed, verification, interpretation, and evidence-review events through the existing Kernel/God-Node orchestrator. Natural-language criteria are passed to the existing AI registry only when a real AI provider is available. Without one, deterministic parsing is marked `heuristic`; it is not represented as AI output.

The lead-detail **Agent review** is intentionally local and deterministic even when an AI provider is configured: it reads only the stored lead/source/verification evidence and reports normalized fields, source-derived classification/tag suggestions, confident duplicate identifiers, completeness/missing fields, verification next steps, and an explicit list recommendation. This avoids unnecessarily transferring provider-returned personal data to another provider. It never changes data, adds tags, creates a list, or starts outreach.

**Use with Outreach** is a deliberate, no-send handoff to Email Intelligence. It returns only selected lead IDs that have a provider-returned email address and tells the user to choose a configured mailbox, review lawful basis/consent, compose, and explicitly send. Lead discovery never starts outreach on its own.

## Live-provider acceptance checklist

Before representing a provider as operational in a deployment:

1. Save its credential through Super Admin controls or deploy its environment secret.
2. Confirm the provider account scopes and billing plan allow the relevant endpoint.
3. Run a narrowly scoped real search with a lawful business criterion.
4. Check returned source links and data fields against the provider response.
5. If verifying email, execute an explicit NeverBounce request and confirm the saved evidence matches its response.
6. Confirm usage and audit entries in the existing platform views.
7. Review retention and personal-domain policy with the organization’s privacy/compliance owner.
