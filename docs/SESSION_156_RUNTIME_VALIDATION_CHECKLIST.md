# Session 156 — Spatial runtime validation

- [ ] Fresh org with `WINDELS_DEMO_DATA=false`: `GET /spatial/dashboard/rollup` returns 0 sessions/maps/waypoints and does not write `spa:ss:<org>`.
- [ ] `WINDELS_DEMO_DATA=true` still seeds the campus once.
- [ ] `POST /sessions` then `GET /sessions` returns that row only for the caller's org.
- [ ] `POST /devices/heartbeat` increments `devicesOnline` for that org only.
- [ ] `/app/spatial` loads; empty copy does not claim a simulated campus.
- [ ] Session 89 audit lists `spa:s/ss/hd/hds/mp/mps/wp/wps/rx/rxs/dev/devhb/twin` with no leaked keys.
