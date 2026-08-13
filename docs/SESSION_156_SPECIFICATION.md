# Session 156 — Spatial completion (unfinished-module track, 2/N)

**Module:** `spatial` (Session 58)
**Status:** 🟡 VERIFIED (partial)

## What was unfinished

`dashboard()`, `listMaps()`, `listWaypoints()`, `listHoloDashboards()` and `listRemoteExpertSessions()` all called `ensureBootstrapped()` on first read — and that bootstrap was **not** gated behind `WINDELS_DEMO_DATA`. A fresh organization was given a fake HQ, Factory-A, Warehouse-NE, holographic dashboards and a remote-expert call.

`devicesOnline` counted every fingerprint ever seen (including seeds), not devices that had reported recently.

## What this session adds

- Seed gated; **reads never seed**.
- `POST /spatial/devices/heartbeat` — live connector.
- `devicesOnline` = heartbeats in the last 120s. `devicesSeen` = ever recorded.
- Provenance on the dashboard.
- `/app/spatial` console + sidebar.
- `spa:*` namespaces catalogued org-scoped.
- Existing session/list endpoints kept.

## Not claimed

A live WebXR / VisionOS / HoloLens runtime. Heartbeat is presence, not a pose stream.
