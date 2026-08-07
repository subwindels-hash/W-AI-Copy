# Crypto Phase 9 — Extended Curated Market Universe

WINDELS is an **Enterprise AI Trading Agent / Trading Intelligence Platform** —
NOT a broker, exchange, or custodian. The market universe is simply the set of
symbols WINDELS will pre-subscribe to at cold start; every order is still
dispatched to the user's external broker/exchange via official APIs, and
WINDELS never maintains its own order book.

## What changed

Before Phase 9, each connector bootstrapped with a small hard-coded list of
pairs (10–15 majors). Phase 9 expands that curated list to ~42 high-volume
assets (80+ markets spot+perp across most exchanges) so traders can operate
on the major L1s, L2s, memecoins, AI/RWA narratives and DeFi blue chips
without waiting for a live `/exchangeInfo` fetch.

| Connector | Markets shipped |
|---|---|
| Binance | 84 (42 spot + 42 perp) |
| Bybit | 84 (42 spot + 42 perp) |
| OKX | 84 (via `majorPairs("-USDT")`) |
| Bitget | 84 (via `majorPairs("USDT")`) |
| Gate.io | 84 (via `majorPairs("USDT")`) |
| MEXC | 84 (via `majorPairs("USDT")`) |
| HTX | 84 (via `majorPairs("USDT")`) |
| Crypto.com | 84 (via `majorPairs("_USDT")`) |
| Hyperliquid | 36 perp (USDC) |
| Coinbase | 42 spot (USD) |
| Kraken | 60 spot (30 USD + 30 USDT) |
| KuCoin | 40 spot (USDT) |

The expanded base list is defined in one place (`majorPairs` in
`exchanges/common.ts`) so future additions stay consistent across connectors
that use the helper. Binance and Bybit previously had their own smaller
hard-coded lists — they now delegate to `majorPairs` and apply
exchange-specific precision/leverage/step overrides.

### Asset categories covered

- **L1 majors:** BTC, ETH, BNB, SOL, XRP, ADA, AVAX, DOGE, DOT, LTC, BCH, ETC, FIL, ATOM, NEAR, TON, TRX
- **L2 / scaling:** ARB, OP, MATIC, STX, IMX
- **DeFi blue chips:** LINK, UNI, AAVE, MKR, LDO, GRT
- **High-beta / new launches:** APT, SUI, SEI, INJ, TIA, PYTH, JUP, WLD, RNDR, FET
- **Memecoins:** PEPE, WIF, SHIB
- **ENS / infra:** ENS

All are pre-wired with tick-size = 0.01, step-size = 0.001 (perp) / 0.00001
(spot), and sensible min-notional defaults. Connector-specific overrides
(price precision, qty precision, leverage caps) are applied per connector.

### Files changed

- `apps/api/src/tradingIntel/crypto/exchanges/common.ts` — `majorPairs(suffix)`
  expanded from 12 to 42 bases; comment documents the curated-list decision.
- `apps/api/src/tradingIntel/crypto/exchanges/binance.ts` — imports
  `majorPairs`, `fetchMarkets` now builds spot + perp from the curated list
  with Binance-specific precision/leverage defaults.
- `apps/api/src/tradingIntel/crypto/exchanges/bybit.ts` — imports
  `majorPairs`, `fetchMarkets` built from the curated list with Bybit-specific
  defaults.
- `apps/api/src/tradingIntel/crypto/exchanges/kraken.ts` — 30 bases × 2 quote
  currencies (USD + USDT); fixed a latent bug where the USDT leg used an
  invalid raw-symbol pattern (`X${b}ZUSD` which is a USD-naming convention,
  not USDT).
- `apps/api/src/tradingIntel/crypto/exchanges/kucoin.ts` — expanded from 12
  to 40 spot pairs.
- `apps/api/src/tradingIntel/crypto/exchanges/hyperliquid.ts` — expanded
  perp list to 36 assets.
- `apps/api/src/tradingIntel/crypto/crypto-phase9-markets.test.ts` — 12 tests,
  one per connector, asserting minimum market counts, BTC+ETH presence, and
  required-field validity for every returned market.

## Design notes

- **Why curated and not live /exchangeInfo?** Boot time. Pulling and
  filtering hundreds of symbols on every cold start adds 1–3s per connector
  and dramatically expands the number of WS ticker subscriptions. A curated
  list keeps startup under a second and WS fan-out predictable. Live fetch
  remains on the roadmap.
- **Long-tail assets** can still be traded once live market discovery is
  added — traders will be able to add arbitrary symbols manually in a later
  phase.
- **Tick-size aware rounding** from Phase 2 (`roundQty`/`roundPrice` in
  `order-utils.ts`) means any new market with 0.01 tick / 0.001 step will
  have its prices and quantities rounded correctly out of the box.
- **WINDELS is not an exchange.** Expanding the market list does not create
  any new trading venue; it just expands the set of symbols the connector
  knows how to relay to the user's external broker/exchange.

## Verification

- 1875 API tests (+12 Phase 9 tests). Pre-existing 8 Prisma-WASM + 1
  geoBilling failures unchanged.
- All 12 connectors return ≥30 markets and include BTC and ETH bases.
- Web production build green.
- tsc clean across trading/crypto paths.
- No random data; no broker/custody/matching logic introduced.
