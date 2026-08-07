# WINDELS AI OS — MetaTrader 5 Expert Advisor

This folder contains the MQL5 source for the WINDELS AI OS Expert Advisor
(Phase 2 of the MT5 integration). See `docs/MT5_PHASE2_EA.md` for the full
installation, pairing, security, and operations manual.

## Files

| File | Purpose |
|---|---|
| `WindelsAI_EA.mq5`      | Main EA: poll / parse / HMAC-verify / execute / ack / heartbeat / trailing |
| `WindelsAI_Http.mqh`    | WinINet HTTPS client (Bearer token, timeouts, status via `HttpQueryInfoW`) |
| `WindelsAI_Hmac.mqh`    | HMAC-SHA256 over advapi32.dll (fails closed when unavailable) |
| `WindelsAI_Json.mqh`    | Minimal JSON pull-parser (objects/arrays/strings/numbers/bools/null) |

## Build

Open `WindelsAI_EA.mq5` in MetaEditor (MetaTrader 5), press **F7** to compile.
Allow DLL imports for `wininet.dll` and `advapi32.dll` in the EA settings.

## Quick start (inputs)

| Input | Value |
|---|---|
| `InpApiBaseUrl`     | `https://<your-windels>/api/v1` |
| `InpApiToken`       | Token returned by `POST /api/v1/ea/register` |
| `InpBrokerAcctId`   | WINDELS `BrokerAccount.id` UUID |
| `InpUseTLS`         | `true` in production |
| `InpMagicOverride`  | `0` (use server-assigned magic) |
| `InpPollIntervalMs` | `1500` (default) |
| `InpMaxLotCap`      | Local fail-safe lot cap (0 = use server limit) |
