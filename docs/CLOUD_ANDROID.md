# WINDELS AI Cloud Android

> **Positioning:** WINDELS AI Cloud Android is the cloud Android infrastructure where humans and AI agents can operate the same isolated virtual devices.

## Current delivery posture

This release implements the vendor-neutral WINDELS control plane, APIs, durable metadata, policy/approval/session model, native agent tools, public developer surface, usage records and responsive dashboard.

It deliberately does **not** fabricate an Android runtime. `CLOUD_ANDROID_ENABLED` defaults to `false`. Device creation returns unavailable and persists no fake device until a signed, healthy `CloudAndroidProvider` passes real provision/boot/screen/control/verification tests.

A production deployment is not accepted until a real Android virtualization provider, interactive screen transport, network policy enforcement, storage, billing and scale tests pass the checklist below.

## Architecture

```text
Human UI / WINDELS agents / external developer API
                         │
             WINDELS auth, IAM and API keys
                         │
              Cloud Android Orchestrator
       ┌─────────────────┼─────────────────┐
       │                 │                 │
 Session/lock       Policy/approval   Usage/audit
       └─────────────────┼─────────────────┘
                         │ signed HMAC request/response
              CloudAndroidProvider v1
                         │
          Replaceable Android virtualization fleet
```

The Express control plane never exposes provider device IDs, raw virtualization endpoints or provider credentials. Public objects use WINDELS device/session/action identifiers.

## Provider abstraction

`CloudAndroidProvider` has two operations:

```ts
health(): ProviderHealth
execute(action: CloudAndroidProviderAction): CloudAndroidProviderResult
```

The HTTP implementation uses:

```text
POST <provider>/v1/provider/health
POST <provider>/v1/provider/actions
```

Every request and response carries a five-minute timestamp and `v1=<HMAC-SHA256>` signature over `<timestamp>.<exact body>`. Production requires HTTPS and a 32+ character secret. Missing, stale, unsigned, mismatched or malformed responses fail closed.

Provider capabilities and supported regions/Android versions are read from the live health response. Provisioning is denied when the requested configuration is not advertised.

Configuration:

```text
CLOUD_ANDROID_ENABLED=false
CLOUD_ANDROID_PROVIDER_URL=
CLOUD_ANDROID_PROVIDER_HMAC_SECRET=
CLOUD_ANDROID_PROVIDER_ID=windels-provider
CLOUD_ANDROID_PROVIDER_NAME=WINDELS Cloud Android Provider
CLOUD_ANDROID_PROVIDER_TIMEOUT_MS=120000
```

Enable only after provider acceptance testing.

## Durable control-plane entities

PostgreSQL/Prisma models:

- `CloudAndroidProviderRegistration`
- `CloudAndroidTemplate`
- `CloudAndroidImage`
- `CloudAndroidDevice`
- `CloudAndroidAgentGrant`
- `CloudAndroidSession`
- `CloudAndroidAction`
- `CloudAndroidApproval`
- `CloudAndroidSnapshot`
- `CloudAndroidUsageRecord`

Every tenant-bearing table has PostgreSQL RLS matching the existing WINDELS tenant context. Application queries additionally include `organizationId`.

Raw provider references stay server-side. Provider action tokens are AES-256-GCM encrypted at rest and only their SHA-256 is used for matching.

## Device lifecycle

```text
CREATING → PROVISIONING → STOPPED → BOOTING → RUNNING
RUNNING → SUSPENDED / SNAPSHOTTING / RESTORING / REBOOTING
FAILED / DEGRADED → operator reconciliation
DESTROYING → DESTROYED
```

A state transition is written only after the provider returns a signed result. Failed provisioning leaves a visible `FAILED` row only when the provider had already accepted a device request; an unconfigured/unhealthy provider creates no device.

Device configuration includes CPU, RAM, storage, Android version, region, locale, timezone, network policy, security profile, image/template and managed applications.

## Human, AI and collaborative control

Session modes:

- `HUMAN`
- `AI`
- `COLLABORATIVE`

Only one active session holds the device write lock. A collaborative session supports explicit human and AI takeover. The control generation increments on every lock transfer/release.

AI and collaborative sessions require an active device-specific agent grant. Grants contain only explicit capabilities, sensitive-action declarations, domain allowlists and expiry. They do not contain Android or application secrets.

## Semantic perception and verification

A provider observation must include:

```json
{
  "capturedAt": "...",
  "screenshot": { "mimeType": "image/png", "dataBase64": "...", "width": 1080, "height": 2400, "sha256": "..." },
  "elements": [],
  "accessibilityTree": {},
  "app": { "packageName": "...", "activity": "..." },
  "window": { "title": "...", "focusedElementId": "..." },
  "deviceState": {}
}
```

The preferred hierarchy is semantic element ID → accessibility tree → managed app interface → coordinates. The dashboard and agent tools expose semantic elements first.

Every control operation follows:

```text
Observe → Prepare → Policy/approval → Execute → Observe → Verify
```

A changed screen alone is not success. The provider must return `evidence.verificationPassed=true` and the control plane must receive a valid post-action observation. Otherwise the action is stored as `FAILED / ACTION_VERIFICATION_FAILED`.

## Approval gateway

For agent-owned sessions, every provider-classified action other than `NONE` pauses. This includes `UNKNOWN`.

The prepared provider token is encrypted; the AI never receives it. The approval row records sensitivity, description, target, agent, session, expiry and human decision.

On approval, WINDELS sends the one-time token to the provider, observes the device again and consumes the approval only after verification. Rejection never calls execute.

## Native WINDELS agent tools

The existing `ToolRegistry` receives native tools:

```text
cloud_android_device_list
cloud_android_device_get
cloud_android_screen_inspect
cloud_android_session_start
cloud_android_session_end
cloud_android_ui_tap
cloud_android_ui_type
cloud_android_ui_swipe
cloud_android_app_launch
```

Tools require authenticated organization, user and agent context. The orchestrator then requires a device grant and action-specific permission. Tool registration does not grant access by itself.

## Permissions

WINDELS RBAC permissions:

```text
CLOUD_ANDROID_READ
CLOUD_ANDROID_CONTROL
CLOUD_ANDROID_MANAGE
CLOUD_ANDROID_APP
CLOUD_ANDROID_FILE
CLOUD_ANDROID_SENSITIVE
CLOUD_ANDROID_ADMIN
```

API-key scopes:

```text
cloud-android:read
cloud-android:control
cloud-android:manage
cloud-android:apps
cloud-android:files
cloud-android:approve
```

Agent grants are more granular, including screen, UI, app, file, network and sensitive-action capabilities.

## API surfaces

Authenticated application API:

```text
/api/v1/cloud-android/status
/api/v1/cloud-android/dashboard
/api/v1/cloud-android/devices
/api/v1/cloud-android/devices/{id}/...
/api/v1/cloud-android/sessions
/api/v1/cloud-android/approvals
/api/v1/cloud-android/audit
/api/v1/cloud-android/templates
/api/v1/cloud-android/fleet/...
```

Public API-key surface:

```text
POST /v1/cloud-android/devices
GET  /v1/cloud-android/devices
GET  /v1/cloud-android/devices/{id}
POST /v1/cloud-android/devices/{id}/start|stop|restart
POST /v1/cloud-android/devices/{id}/sessions
POST /v1/cloud-android/devices/{id}/apps/install|launch
POST /v1/cloud-android/devices/{id}/ui/tap|type|swipe
GET  /v1/cloud-android/devices/{id}/screen
POST /v1/cloud-android/devices/{id}/snapshot
GET  /v1/cloud-android/sessions
GET  /v1/cloud-android/approvals
POST /v1/cloud-android/approvals/{id}/decision
GET  /v1/cloud-android/audit
```

The public API reuses WND keys, IP restrictions, rate limits, usage metering, billing gates and native error envelopes.

## Fleet and auto-healing

The control plane supports bounded bulk lifecycle calls (maximum 100 devices per request), fleet rollups and health reconciliation.

Health reconciliation records provider metrics and marks threshold/unresponsive devices `DEGRADED`. It does not silently destroy/recreate a device. Automated replacement remains an explicit policy extension because replacement can destroy volatile user state.

## Billing and usage

`CloudAndroidUsageRecord` stores measured quantities only. Session end records control-plane-clock runtime seconds. Provider metrics are recorded with provider units and source. Snapshot sizes are accepted only from signed provider results.

Public API calls also use the existing `ApiUsageRecord` and `ApiSubscription` billing pipeline with product slug `cloud-android`. No separate wallet/billing system is created.

Potential billable metrics—runtime, storage, bandwidth, screenshots, streams, automation and snapshots—must receive signed provider measurements before charges are computed. Unknown cost remains null.

## Dashboard

`/app/cloud-android` provides:

- truthful provider status;
- fleet/device inventory and lifecycle controls;
- device resources, security and errors;
- agent assignment and mode selection;
- provider screenshot polling and semantic element controls;
- coordinate tap fallback and keyboard/navigation controls;
- human/AI takeover;
- approval inbox;
- sessions, templates and action audit.

When no provider is configured the dashboard stays empty and explains why.

## Not yet production-certified

These requested layers require a real provider/deployment and are intentionally not claimed complete here:

- low-latency WebRTC/WebSocket video transport and session recording;
- file transfer against real Android storage;
- image creation from a real device snapshot;
- GraphQL API;
- OAuth/service-account issuance beyond existing WINDELS API keys/JWT/service tokens;
- generated Java/Python/Go/PHP SDK packages;
- Kubernetes scheduling at thousands/millions of devices;
- provider-enforced VPC/DNS/bandwidth policies;
- real marketplace image publication;
- real voice-to-device task acceptance.

The REST contracts and provider abstraction are stable foundations for these phases, but endpoint existence is not runtime proof.

## Production acceptance checklist

1. Configure an approved Android virtualization provider with HMAC and HTTPS.
2. Verify provisioning Android 15 in each advertised region.
3. Verify boot/start/stop/restart/destroy and state convergence.
4. Open a real screen, tap, swipe, type, back/home and verify post-action observations.
5. Install and launch a managed application.
6. Run a WINDELS agent with a least-privilege grant.
7. Trigger a sensitive submit/purchase test and prove no provider execute call occurs before approval.
8. Test rejection, expiry, replay and token mismatch.
9. Test human takeover while AI controls and AI resume afterward.
10. Attempt concurrent agent control and prove the second writer is rejected.
11. Attempt cross-tenant device/session/action/snapshot access under application JWT and WND API keys.
12. Verify screenshots and provider references do not leak into logs or other tenants.
13. Validate network allowlist/blocklist and secret injection without exposing secrets to AI.
14. Validate snapshot/restore checksums on disposable devices.
15. Test crash/unresponsive/high-resource detection and verified recovery.
16. Run fleet bulk operations and load tests against the target scheduler.
17. Verify measured runtime/storage/bandwidth usage against provider invoices and existing WINDELS billing.
18. Complete WebSocket/WebRTC interruption, latency and concurrency tests before calling live screen production-ready.

Until these pass, keep `CLOUD_ANDROID_ENABLED=false` in production.
