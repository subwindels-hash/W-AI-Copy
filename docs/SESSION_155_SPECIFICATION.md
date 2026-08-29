# Session 155 — Robotics completion (first unfinished module)

**Module:** `robotics` (Session 57, completed additively)
**Branch:** `arena/019ffd6f-win`
**Status:** 🟡 VERIFIED (partial) — in-sandbox tests green; runtime checklist pending in the target environment.

## What was unfinished

The inventory marked robotics COMPLETE because it had routes, a client and a PlatformPage tab. In substance it was still a simulated fleet:

- No way for a real machine to report a reading (`FleetTelemetry` existed as a type and was unused).
- Dashboard averages used `0` for an empty fleet (0 % battery / 0 % CPU is a measurement).
- Commands flipped a Redis status and implied the robot had been told.
- MQTT / AMQP was listed as the missing provider and nothing honest was said about it.
- No unit tests, no e2e, no dedicated console, no tenant-isolation catalog entries.

## What this session adds (existing six endpoints kept)

| Surface | Change |
|---|---|
| `POST /robots/:id/telemetry` | Live HTTP ingest. Source is always `device_reported`. |
| `GET /robots/:id/telemetry` | Newest-first history, capped at 200. |
| `PATCH` / `DELETE /robots/:id` | Rename/site/firmware; delete removes telemetry too. |
| `GET /alerts` · `POST /alerts/:id/ack` | List + acknowledge. |
| `GET` / `POST /maintenance` | Schedule a window against a robot in the same org. |
| `GET /connectors` · `GET /health` | HTTP ready; MQTT `not_configured` or `configured_not_connected` — never `connected`. |
| Dashboard | `avgBatteryPct` / `avgCpuPct` are `number \| null`. Only `device_reported` robots count. `provenance` names every figure. |
| Predictive scan | Only inspects `device_reported` readings. Operator-entered / demo_seed robots do not invent faults. |
| Command | Sets `lastCommandDispatch: "local_state_only"`. |
| Console | `/app/robotics` (Fleet / Telemetry / Alerts / Maintenance / Connectors). PlatformPage tab kept; null-aware. |
| Isolation | `rob:r` `rob:rs` `rob:mw` `rob:mws` `rob:pa` `rob:pas` `rob:tel` catalogued org-scoped. Bare `rob` is never added. |

## Honesty rules

1. An unmeasured average is `null`, never `0`.
2. MQTT is never labelled connected without a live broker session (this process does not open one).
3. A command that only writes Redis is `local_state_only`.
4. Demo seed stays behind `WINDELS_DEMO_DATA` and is tagged `demo_seed`.
5. Alerts cite the reading that fired them.

## Not claimed

- A live MQTT/AMQP session to a physical PLC, AMR or drone.
- Remote execution of start/stop on hardware.
- Runtime validation against live PostgreSQL + Redis in this sandbox.
