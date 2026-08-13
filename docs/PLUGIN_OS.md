# WINDELS PLUGIN OS

A native **Plugin, Module & Capability Ecosystem** that sits on top of the
existing Extension Platform. WINDELS becomes the orchestration layer: the AI
intent engine asks the Capability Registry *"which authorized thing can do
this?"* and routes to the best installed plugin/module — with fallback,
permissions, audit and billing — instead of hard-coding providers.

It is additive: the existing core OS, ExtensionRegistry, agents, workflows,
billing and auth are reused, not replaced.

## Concepts

- **Plugin** — connects WINDELS to an external service (GitHub, Slack, Drive,
  a video AI provider, MCP server). Described by a signed manifest, installed
  per-organization with granted permissions.
- **Module** — a deeper first-party extension; these continue to live in the
  existing Extension Registry.
- **Capability** — a verb (`video.generate`, `github.read`, `email.send`).
  Every plugin/module registers capabilities; agents/intents resolve by
  capability, never by provider name.
- **Connection** — OAuth2 / API key / MCP authentication, secrets encrypted
  at rest via the existing AES-256-GCM encryption module.

## Backend (`apps/api/src/pluginOs/`)

| File | Role |
| --- | --- |
| `pluginRegistry.ts` | Manifest validation (zod), HMAC signature verification, install/enable/disable/uninstall, permission grants, encrypted secrets, health, audit. |
| `connections.ts` | OAuth2 (start/complete with single-use state), API-key and MCP connections; secrets never returned. |
| `capabilityRegistry.ts` | Registers capabilities, ranks providers by quality/cost/latency/preference, **executes with automatic failover**, and bridges built-in WINDELS capabilities (video transformer, cinematic studio, audio) to local services. |
| `intent.ts` | Deterministic natural-language → capability resolver; recommends install candidates when nothing is installed. |
| `bootstrap.ts` | Seeds a curated marketplace (WINDELS Video, Higgsfield Video AI, GitHub, Slack, Drive) and registers built-ins. |

## API (`/api/v1/plugins`, authenticated)
- `GET /marketplace`, `GET /manifest/:id`, `POST /publish` (admin/developer)
- `GET /installed`, `POST /install`, `POST /:id/status`, `POST /:id/permissions`, `DELETE /:id`, `GET /:id/audit`
- `GET/POST /connections/...` (api-key, oauth/start, oauth/complete, mcp, DELETE)
- `POST /capabilities/route`, `POST /capabilities/execute`, `GET /capabilities`
- `POST /intent/resolve`, `POST /preferences`

## Frontend
`/app/extensions` (Command Center → Extensions): Discover marketplace,
one-click install with permission approval, installed list with
enable/disable/uninstall, connections, and an "Ask WINDELS" capability finder.

## Security
- Manifest signatures verified; unsigned community plugins are marked
  `unverified` and never get privileged access.
- Permissions are a **subset** of declared manifest permissions; nothing is
  granted by default (§10).
- Effective agent permission is the intersection of org/user/agent/plugin/task
  policies.
- All installs, connections, tool executions and data access are written to
  the plugin audit log (integrates with the existing audit system).
- Provider failures trigger fallback to the next best plugin, audited.

## Honest scope note
External plugins communicate over REST/MCP; a real cloud video provider
executes when its endpoint/key is configured. The built-in WINDELS video
capabilities execute the real local pipelines. There are no fake results.

## Tests
10 new tests cover manifest validation/signature policy, install and
permission gating, encrypted connections, capability routing + failover, and
natural-language intent resolution. Full API suite (2857) passes; web builds.
