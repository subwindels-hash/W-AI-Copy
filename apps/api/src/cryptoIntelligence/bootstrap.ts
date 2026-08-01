/**
 * Crypto Intelligence bootstrap (Slices 295-299) — 10500ms slot
 * Seeds DISABLED-by-default read-only demo data. No live trading enabled.
 */
import { redisCmd as redis } from "../db/redis.js";
import { CryptoIntelligenceService as CiSvc } from "./cryptoIntelligence.service.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";

const K = {
  chains: "ci:chains", tickers: "ci:tickers", defi: "ci:defi", yields: "ci:yields",
  wallets: "ci:wallets", positions: "ci:positions", alerts: "ci:alerts", trades: "ci:trades",
  strategies: "ci:strategies", exchanges: "ci:exchanges", config: "ci:config",
};

export async function bootstrapCryptoIntelligence(logger?: any): Promise<void> {
  // Synthetic demo records are opt-in; see config/demoData.ts.
  if (!demoDataEnabled()) return skipDemoSeed("crypto-intelligence", logger);

  const existing = await redis.zrange(K.chains, 0, -1);
  if (existing.length > 0) {
    logger?.info("[crypto-intel] bootstrap skipped", { chains: existing.length });
    return;
  }
  // Disabled by default
  await redis.hset(K.config, "enabled", "false", "status", "disabled");

  // Slice 295 — Chains & market
  const chains = [
    { chain: "Bitcoin", gasToken: "BTC", tps: 7, validators: 0, staked: 0 },
    { chain: "Ethereum", gasToken: "ETH", tps: 17, validators: 980000, staked: 27 },
    { chain: "Solana", gasToken: "SOL", tps: 2800, validators: 1650, staked: 72 },
    { chain: "Polygon", gasToken: "POL", tps: 60, validators: 100, staked: 35 },
    { chain: "Arbitrum", gasToken: "ETH", tps: 400, validators: 0, staked: 0 },
    { chain: "Base", gasToken: "ETH", tps: 200, validators: 0, staked: 0 },
  ] as const;
  for (const c of chains as any) {
    const cm = {
      id: "chain-" + c.chain.toLowerCase(), chain: c.chain, status: "online",
      blockHeight: 850000, tps: c.tps, gasToken: c.gasToken,
      gasPriceGwei: c.chain === "Ethereum" ? 28 : 1,
      validators: c.validators, stakedPct: c.staked,
      lastBlockAt: new Date().toISOString(),
    };
    await redis.zadd(K.chains, 0, JSON.stringify(cm));
  }
  const tickers = [
    { sym: "BTC", name: "Bitcoin", price: 67000, ch: 1.2, vol: 28e9, cap: 1320e9, vol30: 0.038 },
    { sym: "ETH", name: "Ethereum", price: 3550, ch: 2.8, vol: 14e9, cap: 426e9, vol30: 0.045 },
    { sym: "SOL", name: "Solana", price: 168, ch: -0.4, vol: 3e9, cap: 78e9, vol30: 0.068 },
    { sym: "WIN", name: "WINDELS", price: 4.22, ch: 5.2, vol: 24e6, cap: 420e6, vol30: 0.085 },
  ] as const;
  for (const t of tickers as any) {
    const tk = {
      id: "tk-" + t.sym.toLowerCase(), symbol: t.sym, name: t.name,
      priceUsd: t.price, change24hPct: t.ch, volume24hUsd: t.vol, marketCapUsd: t.cap,
      volatility30d: t.vol30, sentiment: t.ch > 1 ? "bullish" : t.ch < -1 ? "bearish" : "neutral",
      liquidityUsd: t.vol * 0.18,
    };
    await redis.zadd(K.tickers, 0, JSON.stringify(tk));
  }

  // Slice 296 — DeFi
  const protos = [
    { name: "Uniswap v3", chain: "Ethereum", cat: "dex", tvl: 4.2e9, apy: 4.2, risk: 22, audited: true, hacked: false },
    { name: "Aave v3", chain: "Ethereum", cat: "lending", tvl: 8.1e9, apy: 3.1, risk: 28, audited: true, hacked: false },
    { name: "Lido", chain: "Ethereum", cat: "staking", tvl: 18e9, apy: 3.4, risk: 18, audited: true, hacked: false },
    { name: "EigenLayer", chain: "Ethereum", cat: "restaking", tvl: 8.5e9, apy: 5.8, risk: 48, audited: true, hacked: false },
  ] as const;
  for (const p of protos as any) {
    await redis.zadd(K.defi, 0, JSON.stringify({
      id: "dp-" + p.name.toLowerCase().replace(/\s+/g, "-"),
      name: p.name, chain: p.chain, category: p.cat, tvlUsd: p.tvl, apy: p.apy,
      riskScore: p.risk, audited: p.audited, hacked24m: p.hacked,
    }));
  }
  const yields = [
    { proto: "Aave v3", asset: "USDC", apy: 5.1, tvl: 1.2e9, il: "low", lock: 0 },
    { proto: "Lido", asset: "ETH", apy: 3.4, tvl: 18e9, il: "low", lock: 0 },
    { proto: "EigenLayer", asset: "stETH", apy: 7.8, tvl: 3.2e9, il: "medium", lock: 7 },
  ] as const;
  for (const y of yields as any) {
    await redis.zadd(K.yields, 0, JSON.stringify({
      id: "yo-" + y.proto.toLowerCase().replace(/\s+/g,"-") + "-" + y.asset.toLowerCase(),
      protocolId: "dp-" + y.proto.toLowerCase().replace(/\s+/g,"-"), asset: y.asset,
      apy: y.apy, tvlUsd: y.tvl, impermanentLossRisk: y.il, lockupDays: y.lock,
    }));
  }

  // Slice 297 — Wallets & alerts
  const wallets = [
    { label: "Treasury (cold)", addr: "bc1q…cold-treasury", chain: "Bitcoin", bal: 4200000 },
    { label: "Treasury ops", addr: "0x…ops-treasury", chain: "Ethereum", bal: 1850000 },
    { label: "Trading desk hot", addr: "0x…trading-hot", chain: "Ethereum", bal: 420000 },
  ] as const;
  for (const w of wallets as any) {
    await redis.zadd(K.wallets, 0, JSON.stringify({
      id: "wa-" + w.label.toLowerCase().replace(/[()\s]/g, "-"), label: w.label, address: w.addr,
      chain: w.chain, balanceUsd: w.bal, tags: ["treasury"], riskScore: w.addr.includes("cold") ? 5 : 18,
      lastActivity: new Date().toISOString(),
    }));
  }
  // Demo security alert
  await redis.zadd(K.alerts, Date.now(), JSON.stringify({
    id: "sa-demo-1", severity: "medium",
    category: "wallet-risk", title: "Unusual outflow pattern from trading hot wallet (demo)",
    detail: "Demo alert; module disabled.", detectedAt: new Date().toISOString(),
  }));

  // Slice 298 — Strategies & sample proposals (NO filled trades)
  const strats = [
    { name: "Cross-EX Arb", kind: "arbitrage", maxPos: 50000, loss: 2000, wr: 62, pnl30: 8420 },
    { name: "BTC Mean Revert", kind: "mean-reversion", maxPos: 25000, loss: 1500, wr: 54, pnl30: -340 },
    { name: "Portfolio Rebalance", kind: "rebalance", maxPos: 100000, loss: 3000, wr: 78, pnl30: 12200 },
  ] as const;
  for (const s of strats as any) {
    await redis.zadd(K.strategies, 0, JSON.stringify({
      id: "st-" + s.name.toLowerCase().replace(/\s+/g,"-"), name: s.name, kind: s.kind,
      enabled: false, maxPositionUsd: s.maxPos, dailyLossLimitUsd: s.loss, winRate: s.wr, pnl30dUsd: s.pnl30,
    }));
  }

  // Slice 299 — Exchange connectors (disconnected)
  const exchs = [
    { name: "Binance", kind: "cex", auth: "api-key" },
    { name: "Coinbase", kind: "cex", auth: "oauth" },
    { name: "Kraken", kind: "cex", auth: "api-key" },
    { name: "Uniswap", kind: "dex", auth: "wallet-connect" },
    { name: "Chainlink", kind: "data-provider", auth: "api-key" },
  ] as const;
  for (const e of exchs as any) {
    await redis.zadd(K.exchanges, 0, JSON.stringify({
      id: "ex-" + e.name.toLowerCase(), name: e.name, kind: e.kind, status: "disconnected",
      authMethod: e.auth, requiresGovernance: true,
    }));
  }

  // Seed a few demo positions from a "read-only snapshot"
  const demoPositions = [
    { asset: "BTC", amount: 62.5, price: 67000, pnl: 24000, alloc: 38 },
    { asset: "ETH", amount: 520, price: 3550, pnl: 8200, alloc: 33 },
    { asset: "SOL", amount: 2400, price: 168, pnl: -1200, alloc: 7 },
    { asset: "USDC", amount: 1500000, price: 1, pnl: 0, alloc: 22 },
  ] as const;
  const walletId = "wa-treasury-ops";
  for (const p of demoPositions as any) {
    await redis.zadd(K.positions, 0, JSON.stringify({
      id: "po-" + p.asset.toLowerCase(), walletId, asset: p.asset, amount: p.amount,
      priceUsd: p.price, valueUsd: p.amount * p.price, pnl24hUsd: p.pnl, allocationPct: p.alloc,
    }));
  }

  logger?.info("[crypto-intel] bootstrap complete (module disabled by default)", { chains: chains.length, tickers: tickers.length });
}
