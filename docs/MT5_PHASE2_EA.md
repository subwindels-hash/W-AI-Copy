# MT5 Phase 2 — MQL5 Expert Advisor (WINDELS AI OS)

Phase 2 ships a production-grade MetaTrader 5 Expert Advisor that acts as a
safe, server-governed executor for WINDELS AI trading signals. It pairs with
the WINDELS MT5 connector shipped in Phase 1 and supports two deployment
modes:

1. **Redundant executor** — a live ZMQ/HTTP/MetaApi connector is attached and
   the EA acts as a hot backup + honest position monitor.
2. **Pure-EA path** — the EA is the ONLY path to the broker (the user runs
   MT5 on a machine they control, no Python bridge required).

The EA is deliberately conservative: it never opens a position without a
signed server signal, it enforces HARD LOCAL risk limits even if the server
is compromised, and it fails closed on every error class.

---

## Files

| Path | Purpose |
|---|---|
| `scripts/mt5-ea/WindelsAI_EA.mq5` | Main EA: polling, signal execution, SL/TP/trailing, acks, heartbeat |
| `scripts/mt5-ea/WindelsAI_Http.mqh` | WinINet HTTPS client (Bearer auth, timeouts, status via `HttpQueryInfoW`) |
| `scripts/mt5-ea/WindelsAI_Hmac.mqh` | HMAC-SHA256 via advapi32.dll (fails closed when unavailable) |
| `scripts/mt5-ea/WindelsAI_Json.mqh` | Minimal JSON pull-parser (objects/arrays/strings/numbers/bools/null) |
| `apps/api/src/tradingIntel/ea.service.ts` | Node-side pairing, signal queue, HMAC signing, fill acks, heartbeat merge |
| `apps/api/src/http/routes/ea.ts` | `/api/v1/ea/*` endpoints (register/list/revoke/poll/fill/heartbeat/config) |
| `packages/shared/src/ea.ts` | Shared types + Zod schemas + `buildEaSignableString` canonical format |

---

## Installation (MT5 terminal)

1. Copy the four files in `scripts/mt5-ea/` into
   `%APPDATA%\MetaQuotes\Terminal\<INSTANCE>\MQL5\Experts\WindelsAI\`.
2. In MetaEditor, open `WindelsAI_EA.mq5` and press **Compile (F7)**.
   Allow DLL imports for `wininet.dll` and `advapi32.dll` in the EA's
   "Allow Algo Trading" / DLL settings panel.
3. Attach the EA to any chart (multi-symbol is supported; `InpStrictSymbol`
   restricts to the chart symbol when true).
4. Open the Inputs dialog and fill:
   - `InpApiBaseUrl` — `https://<your-windels>/api/v1` (must end in `/api/v1`)
   - `InpApiToken` — the bearer token returned by `POST /ea/register`
   - `InpBrokerAcctId` — the WINDELS `BrokerAccount.id` (UUID)
   - `InpUseTLS=true` for production.
5. Enable Algo Trading in the MT5 toolbar. The EA will start polling within
   `InpPollIntervalMs` milliseconds.

### Pairing flow (server)

The EA cannot self-register; a user/operator pairs it once:

```bash
curl -X POST https://<windels>/api/v1/ea/register \
  -H "Authorization: Bearer <user-session>" \
  -H "Content-Type: application/json" \
  -d '{
    "brokerAccountId":"<uuid>",
    "eaPublicKey":"local-hmac-seed",
    "mt5Login":"50001",
    "mt5Server":"ICMarkets-Demo",
    "terminalName":"DESKTOP-1",
    "terminalVersion":"4200",
    "eaVersion":"1.0.0"
  }'
```

The response contains `data.token` (64 hex chars), `data.magic`, and
`data.hardLimits`. Paste the token into the EA's `InpApiToken` input.

---

## API endpoints

All EA-facing `/api/v1/ea/*` endpoints authenticate via
`Authorization: Bearer <token>` (or `?token=...` for EventSource use cases).

| Method | Path | Purpose |
|---|---|---|
| POST | `/ea/register` | Pair (session auth) — issues Bearer token |
| GET  | `/ea` | List attached EAs (session auth) |
| DELETE | `/ea/:eaId` | Revoke an EA (session auth) |
| GET  | `/ea/poll?wm=<watermark>` | Pull signal bundle (long-poll returns immediately) |
| POST | `/ea/fill` | Ack a fill/reject/error from the EA |
| POST | `/ea/heartbeat` | Report positions, equity, diagnostics |
| GET  | `/ea/config` | Initial config/magic/limits (no signals) |

---

## Signal protocol (wire format)

Signals are issued with a strictly monotonic `seq` per EA and signed with
HMAC-SHA256 over a **canonical pipe-delimited** payload. The format is
MANDATORY — any reordering breaks verification.

```
id|seq|brokerAccountId|typeCode|sideCode|symbol|volume:8|price:8|sl:8|tp:8|
slippagePts|comment|targetTicket|trailDist|trailStep|breakEven|expiresAt(YYYY.MM.DD HH:MM:SS)
```

* `typeCode`: `0=MARKET 1=LIMIT 2=STOP 3=CLOSE 4=MODIFY_SLTP 5=CANCEL`
* `sideCode`: `0=BUY 1=SELL -1=(n/a)`
* Numeric fields use `.` decimal separator, 8-digit precision (padded).
* Time is the ISO `expiresAt` converted to `YYYY.MM.DD HH:MM:SS` (no `T`, no
  millis, no `Z`; dashes replaced with dots to match MQL5 `TimeToString`).
* The canonical builder lives in `@windels/shared/ea` `buildEaSignableString`.
  The MQL5 side reimplements it byte-for-byte in `WindelsAI_EA.mq5::BuildSignableString`.

Replay protection: the EA tracks a `g_watermark`; signals with `seq <=
watermark` are silently discarded. The server also trims delivered signals
on the next poll.

### Signal types

| Type | EA action | Required fields |
|---|---|---|
| `MARKET` | Market buy/sell with SL/TP | `symbol, side, volume, sl` |
| `LIMIT`/`STOP` | Pending order at `price` | `symbol, side, volume, price, sl, tp` |
| `CLOSE` | Close position by `targetTicket` (or find by symbol) | `targetTicket` preferred |
| `MODIFY_SLTP` | Move SL/TP on an open position | `targetTicket, sl/tp` |
| `CANCEL` | Delete a pending order | `targetTicket` |

---

## Hard local risk gates

Before executing any signal the EA runs a defensive double-check. If any gate
fails the EA POSTs a `REJECTED` fill and never sends an order to the broker:

1. **Kill switch** (`g_killSwitch`) — no new opens.
2. **Close-only** (`g_closeOnly`) — only CLOSE / MODIFY allowed.
3. **Strict symbol** — must match the chart symbol when enabled.
4. **Allowed symbols** — enforced against the server-pushed `hardLimits.allowedSymbols` list.
5. **Volume sanity** — `> 0` and `<= g_maxLot` (min of server `maxLotPerTrade` and `InpMaxLotCap`).
6. **Max positions** — open count must be below `maxOpenPositions`.
7. **Daily loss %** — `(balance - equity) / balance < maxDailyLossPct` (fail-safe ceiling `LOCAL_MAX_DAILY_PCT = 5%`).
8. **Symbol selectable** — `SymbolSelect(sym, true)` succeeds.
9. **HMAC signature valid** — any signature mismatch ⇒ reject + ack.
10. **Signal not expired** — `expiresAt` compared to `TimeCurrent()`.
11. **Not replayed** — sequence number > watermark.

Slippage is clamped to `min(hardLimits.maxSlippagePts, InpMaxSlippagePts)`.

---

## Order execution (CTrade)

* `CTrade::SetExpertMagicNumber(g_magic)` — server-assigned magic number
  (0x57494E00 + 0..255 slot derived from EA id).
* `CTrade::SetDeviationInPoints(s.slippagePts)` per signal.
* `CTrade::SetTypeFillingBySymbol(_Symbol)` at startup.
* Market orders use the current inside market (ASK for BUY, BID for SELL).
* After every `OrderSend/PositionClose/PositionModify/OrderDelete` the EA
  inspects `ResultRetcode()`; `10009/10008` are considered FILLED,
  `10017/10018` are SLIPPAGE, anything else is ERROR.
* The EA emits a fill ack in all three outcomes (FILLED / SLIPPAGE / ERROR /
  REJECTED / EXPIRED).

---

## Trailing stop

Processed on every tick for positions carrying `g_magic`:

* If `profitPts >= breakEvenPts` and SL is not already at break-even, move SL to `openPrice`.
* If `profitPts >= trailDistPts`, propose SL at `currentPrice ± trailDist` (direction per side); only moves SL when the new level is at least `stepPts` away from the current SL (avoids thrash).
* TP is left untouched by the trailer; modify via explicit `MODIFY_SLTP` signals.

Defaults come from inputs (`InpTrailDistPts`, `InpTrailStepPts`, `InpBreakEvenPts`) and can be overridden per signal via `signal.trailingStop`.

---

## Heartbeat

Every 5s the EA POSTs `/ea/heartbeat` with:

* Account snapshot (`balance, equity, freeMargin, marginLevel`).
* Every open position carrying `g_magic` (ticket, symbol, side, volume,
  openPrice, currentPrice, sl, tp, profit, swap, openTime).
* Diagnostic errors since the last heartbeat.

When **no live MT5 connector** is attached, the server merges the heartbeat
into Redis-backed position storage (`BrokerIntegrationService.applyEaHeartbeat`)
and flips the account's `transport = "ea"` / `status = "connected"` so the
dashboard shows real state.

---

## Security model

| Layer | What it does |
|---|---|
| TLS | All traffic over HTTPS (`InpUseTLS=true`); WinINet validates certificates via Windows trust store. |
| Bearer token | 256-bit random, stored SHA-256 hashed on server, bound to a single broker account + terminal name; 30-day TTL, auto-renewed on poll. |
| HMAC-SHA256 | Every signal signed with per-EA secret over canonical pipe-delimited bytes; EA rejects mismatches. |
| Replay protection | Monotonic `seq` + server-side watermark trimming; EA drops duplicates. |
| Kill switch | Server-pushed; locally enforced. EA can also soft-close its own positions when `InpCloseOnKillSwitch=true`. |
| Fail-closed | If HMAC cannot be computed (advapi32 unavailable), the EA returns 64 `'0'` hex chars, which never matches a real signature ⇒ no trades. |
| Comment prefix | `WINDELS:<source>` truncated to 31 chars; orders are identifiable in MT5 history. |
| Magic number | All EA orders stamped with server-assigned magic so closes/modifies target only EA-managed positions. |

---

## Failure modes

| Symptom | EA behaviour |
|---|---|
| Poll returns HTTP 401/403 | Log warning, retry on next tick (token may have been revoked). |
| Network unreachable | `InternetOpenW`/`HttpSendRequestW` fails; EA retries at next poll; no trades. |
| Server returns invalid JSON | `CJsonParser::Parse` returns NULL; warning logged, no trades. |
| HMAC mismatch | REJECTED ack sent, signal skipped (possible MITM or secret mismatch). |
| Broker retcode not 10009 | ERROR / SLIPPAGE ack sent, no local state changed. |
| advapi32 unavailable | HMAC returns all zeros ⇒ every signal rejected ⇒ trades. |
| Weekend / no ticks | `EventSetTimer(1)` fires `OnTimer()` so polling/heartbeats continue even without ticks. |

---

## Operational checklist before going live

1. Compile the EA in MetaEditor with zero warnings.
2. Run on a **demo** account for 24h and confirm:
   - fills acks arrive within 1s
   - positions match the WINDELS dashboard
   - kill switch flips stop opening new orders
   - EA reconnects after terminal restart.
3. Verify the server returns a non-zero `magic` number and the EA logs
   `magic=0x57494E..` on poll.
4. Confirm `InpMaxLotCap` is set to a fail-safe value (e.g. 0.10 lots for
   conservative accounts).
5. Enable "Allow DLL imports" for `wininet.dll` and `advapi32.dll` only.
6. Take a backup of the MT5 terminal's MQL5/Experts/WindelsAI folder.

---

## Tests

Unit coverage for the Node-side service: `apps/api/src/tradingIntel/ea.test.ts`
(8 tests) plus updated broker integration and MT5 connector suites
(13 + 19 tests). Total trading-intel tests: 128 passing.

The MQL5 EA cannot be compiled in the CI sandbox (MetaEditor is Windows-
only); it ships with `WindelsAI_Json.mqh` (single-pass parser) and manually
audited WinINet/HMAC bindings, and every wire format is pinned by the
`buildEaSignableString` test on the Node side so format drift between Node
and MQL5 is caught by CI.
