# Session 137 Checklist — Demo Preset
- [ ] GET /brokers/demo-preset/instructions → 200 with 6 steps + disclaimer
- [ ] POST /brokers/demo-preset → 201 with {account, risk, strategy, instructions}; second POST idempotent (same name, no duplicate)
- [ ] Dashboard /app/trading/brokers shows amber "BEFORE USING" card with 6 steps and 1-Click button
- [ ] Click 1-Click → notice shows account name + backtest %WR, risk panel updates to conservative limits
- [ ] Risk killSwitch still works, MT4 global readonly blocks
