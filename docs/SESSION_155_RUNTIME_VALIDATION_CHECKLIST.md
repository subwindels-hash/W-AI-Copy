# Session 155 — Robotics runtime validation checklist

Run in the target environment (PostgreSQL 17 + Redis 8 + `prisma generate`). This sandbox cannot close these gates.

## Compatibility

- [ ] `GET /api/v1/robotics/dashboard/rollup` still returns `{ ok, data }` with the original count fields.
- [ ] `GET /robots`, `GET /robots/:id`, `POST /robots`, `POST /robots/:id/command`, `POST /predictive/scan` keep their paths and envelopes.
- [ ] Empty-fleet `avgBatteryPct` and `avgCpuPct` are JSON `null` (not `0`).
- [ ] PlatformPage Robotics tab renders "—" for those nulls.

## Telemetry

- [ ] `POST /robots/:id/telemetry` with `{ batteryPct, cpuPct }` stamps `telemetrySource: "device_reported"` and `lastTelemetryAt`.
- [ ] Dashboard averages then equal the reported values for a one-robot fleet.
- [ ] `GET /robots/:id/telemetry` returns newest first.
- [ ] A robot in org B cannot ingest or read org A's id (404).

## Commands and connectors

- [ ] `POST /robots/:id/command { action: "start" }` returns `status: "active"` and `lastCommandDispatch: "local_state_only"`.
- [ ] `GET /connectors` lists HTTP `ready` and MQTT `not_configured` (or `configured_not_connected` if `WINDELS_ROBOTICS_MQTT_URL` is set).
- [ ] No connector object has `status: "connected"` unless a broker session is actually open.

## Alerts and maintenance

- [ ] Scan after a 80 °C device reading creates a `thermal` alert naming that temperature.
- [ ] Scan of an operator-entered robot with no ingest creates no alert.
- [ ] `POST /alerts/:id/ack` sets `status: "acknowledged"`; dashboard `predictiveAlerts` excludes it.
- [ ] `POST /maintenance` against a foreign robot id returns 404.

## Console

- [ ] `/app/robotics` loads for an authenticated member.
- [ ] Sidebar "Robotics" navigates there.
- [ ] Empty fleet copy does not claim a simulated shop floor is healthy.

## Isolation

- [ ] Session 89 namespace audit lists `rob:r`, `rob:rs`, `rob:mw`, `rob:mws`, `rob:pa`, `rob:pas`, `rob:tel` as org-scoped with zero leaked keys.
