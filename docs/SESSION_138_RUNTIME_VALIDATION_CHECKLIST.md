# Session 138 Checklist — Trading Hardening
- [ ] GET /brokers/health/detailed returns state machine with CONFIGURATION_ERROR when bridge missing, CONNECTED when verified
- [ ] Dashboard shows MT5 CONNECTION OFFLINE banner when not connected, not simulated data
- [ ] POST /brokers/backtest/history returns candles + backtest with BACKTEST labels
- [ ] GET /brokers/pnl/sparkline returns LIVE DATA points when connected, empty with reason when offline
- [ ] Risk blocks still enforced, audit logged, mode gates work
- [ ] Tick stream SSE only when connected, otherwise offline message
