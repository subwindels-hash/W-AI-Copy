# Session 139 — Crypto Trading Intelligence & Exchange Agent Integration

**Extends Session 138 trading hardening with crypto capability — NOT an exchange.**

- Exchange adapter layer already supports 12 exchanges (Binance…Hyperliquid) via BaseCryptoConnector → brokerIntegration — hardened to show LIVE vs OFFLINE honestly.
- New: GET /brokers/crypto/intelligence (per-exchange live flag, liquidations, funding/openInterest with offline reason), GET /brokers/crypto/market-data?symbol=BTC/USDT (live ticker when connected, else EXCHANGE_CONNECTION_OFFLINE), reused risk/approval SSE.
- Frontend: Crypto Intelligence card in Trading Command Center (live badge, ticker fetch, liquidations, security note — never requests withdrawal).
- Reuses existing indicator, risk, backtest, agents, audit — no duplicate engine.
