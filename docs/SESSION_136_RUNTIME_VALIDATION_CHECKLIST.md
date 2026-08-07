# Session 136 Runtime Validation Checklist — MT4 Connector

- [ ] `GET /brokers/connectors` lists `mt4` with `requiresConfig:false` and `protocol` contains "parity with MT5".
- [ ] `POST /brokers/accounts {broker:"mt4", name:"MT4 Demo", login, server, password, mode:"paper"}` → 201.
- [ ] `POST /brokers/accounts/:id/connect` without bridge env → honest error, `health.connected=false`, no fake snapshot.
- [ ] With `WINDELS_MT4_BRIDGE_ZMQ` or `WINDELS_MT4_METAAPI_TOKEN`, `connect` → `ok:true`, `health.connected=true`, `sync` returns account/positions/orders.
- [ ] `WINDELS_MT4_GLOBAL_READONLY=true` → `POST /brokers/accounts/:id/orders` + `POST /brokers/trade` → 403 `Global MT read-only`.
- [ ] Broker Connectivity Agent shows MT4 account health alongside MT5.
- [ ] `GET /brokers/audit` shows MT4 connect/sync/order audit events.
