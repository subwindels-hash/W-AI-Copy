/**
 * Session 113 — Derivatives & Fixed-Income Desk.
 *
 * The Session 81 tab inside Trading Intelligence stays what it is: a
 * calculator. This page is the *book* — what this organization holds, what it
 * is worth under the operator's own marks, how it behaves under a shock, and
 * what the bond ladder pays out.
 *
 * The page is deliberately loud about provenance, because a risk screen is the
 * easiest place in a product to launder a guess into a number:
 *   - a banner states that no market data is fetched and every mark was typed
 *     in by an operator;
 *   - a position that cannot be priced is listed with the reason, never folded
 *     into a total as zero;
 *   - exposure that nothing supports renders "not measured", never `0`;
 *   - a mark older than a day is badged `stale`;
 *   - payoff maxima are labelled "in sampled range" and unbounded strategies
 *     say so.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity, AlertTriangle, BarChart3, Calculator, Grid3x3, Landmark,
  RefreshCw, Scale, Sigma, Trash2, TrendingUp,
} from "lucide-react";
import {
  deskApi,
  DERIV_MARK_STALE_AFTER_HOURS,
  type DerivBondHolding,
  type DerivBondLadder,
  type DerivDeskSummary,
  type DerivHedgeSuggestion,
  type DerivPayoffCurve,
  type DerivPortfolioGreeks,
  type DerivPosition,
  type DerivScenarioGrid,
} from "@/lib/derivatives";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Tab = "book" | "exposure" | "scenarios" | "fixed-income" | "tools";

const money = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** Renders a figure that may legitimately be unknown. Never invents a zero. */
function Measured({ value, format }: { value: number | null; format?: (n: number) => string }) {
  if (value === null) return <span className="italic text-text-muted">not measured</span>;
  return <span className="text-text-bright">{(format ?? ((n: number) => n.toLocaleString()))(value)}</span>;
}

function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: ReactNode; detail?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg border border-azure/20 bg-azure/10 p-2 text-azure">{icon}</div>
        <div className="min-w-0">
          <div className="truncate text-xl font-black text-text-bright">{value}</div>
          <div className="text-xs text-text-muted">{label}</div>
          {detail ? <div className="text-[11px] text-text-muted">{detail}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function FreshnessBadge({ freshness }: { freshness: string }) {
  if (freshness === "stale") return <Badge variant="amber">stale mark</Badge>;
  if (freshness === "unmarked") return <Badge variant="slate">unmarked</Badge>;
  return <Badge variant="emerald">fresh</Badge>;
}

const emptyPosition = {
  label: "", underlying: "", type: "call", side: "long",
  strike: "", yearsToExpiry: "", contracts: "1",
  premiumPerShare: "", markSpot: "", impliedVol: "", riskFreeRate: "",
};
const emptyBond = {
  label: "", issuer: "", faceValue: "1000", couponRate: "", couponFreq: "2",
  yearsToMaturity: "", ytm: "", marketPrice: "", quantity: "1",
};

const numberOrNull = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed.length) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export function DerivativesPage() {
  const user = useAuthStore((state) => state.user);
  const canWrite = user?.role === "admin" || user?.role === "super_admin";

  const [tab, setTab] = useState<Tab>("book");
  const [summary, setSummary] = useState<DerivDeskSummary | null>(null);
  const [positions, setPositions] = useState<DerivPosition[]>([]);
  const [portfolio, setPortfolio] = useState<DerivPortfolioGreeks | null>(null);
  const [bonds, setBonds] = useState<DerivBondHolding[]>([]);
  const [ladder, setLadder] = useState<DerivBondLadder | null>(null);
  const [grid, setGrid] = useState<DerivScenarioGrid | null>(null);
  const [hedge, setHedge] = useState<DerivHedgeSuggestion | null>(null);
  const [curve, setCurve] = useState<DerivPayoffCurve | null>(null);

  const [positionForm, setPositionForm] = useState({ ...emptyPosition });
  const [bondForm, setBondForm] = useState({ ...emptyBond });
  const [hedgeSymbol, setHedgeSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(null), 3000); };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [desk, book, exposure, holdings, rungs] = await Promise.all([
        deskApi.summary(),
        deskApi.positions(),
        deskApi.portfolio(),
        deskApi.bonds(),
        deskApi.ladder(),
      ]);
      setSummary(desk);
      setPositions(book);
      setPortfolio(exposure);
      setBonds(holdings);
      setLadder(rungs);
      setError(null);
    } catch (e) { fail(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const underlyings = useMemo(
    () => [...new Set(positions.map((p) => p.underlying))].sort(),
    [positions],
  );

  const createPosition = async () => {
    try {
      await deskApi.createPosition({
        label: positionForm.label.trim(),
        underlying: positionForm.underlying.trim(),
        type: positionForm.type as "call" | "put",
        side: positionForm.side as "long" | "short",
        strike: Number(positionForm.strike),
        yearsToExpiry: Number(positionForm.yearsToExpiry),
        contracts: Number(positionForm.contracts),
        premiumPerShare: numberOrNull(positionForm.premiumPerShare),
        markSpot: numberOrNull(positionForm.markSpot),
        impliedVol: numberOrNull(positionForm.impliedVol),
        riskFreeRate: numberOrNull(positionForm.riskFreeRate),
      });
      setPositionForm({ ...emptyPosition });
      flash("Position added to the book.");
      await load();
    } catch (e) { fail(e); }
  };

  const createBond = async () => {
    try {
      await deskApi.createBond({
        label: bondForm.label.trim(),
        issuer: bondForm.issuer.trim() || null,
        faceValue: Number(bondForm.faceValue),
        couponRate: Number(bondForm.couponRate),
        couponFreq: Number(bondForm.couponFreq),
        yearsToMaturity: Number(bondForm.yearsToMaturity),
        ytm: numberOrNull(bondForm.ytm),
        marketPrice: numberOrNull(bondForm.marketPrice),
        quantity: Number(bondForm.quantity),
      });
      setBondForm({ ...emptyBond });
      flash("Holding added to the ladder.");
      await load();
    } catch (e) { fail(e); }
  };

  const runScenarios = async () => {
    try {
      setGrid(await deskApi.scenarios({
        spotShocks: [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2],
        volShocks: [-0.05, 0, 0.05],
      }));
      setError(null);
    } catch (e) { fail(e); }
  };

  const runHedge = async () => {
    try {
      setHedge(await deskApi.hedge(hedgeSymbol.trim().toUpperCase()));
      setError(null);
    } catch (e) { fail(e); }
  };

  const runCurve = async () => {
    try {
      setCurve(await deskApi.payoffCurve({
        legs: [{ type: "call", side: "long", K: 100, premium: 5 }],
        spotMin: 70, spotMax: 140, steps: 71,
      }));
      setError(null);
    } catch (e) { fail(e); }
  };

  const tabs: Array<[Tab, string, typeof Sigma]> = [
    ["book", "Position book", Sigma],
    ["exposure", "Exposure", Activity],
    ["scenarios", "Scenarios", Grid3x3],
    ["fixed-income", "Fixed income", Landmark],
    ["tools", "Tools", Calculator],
  ];

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-text-bright">
            <TrendingUp className="h-6 w-6 text-azure" /> Derivatives &amp; Fixed-Income Desk
          </h1>
          <p className="max-w-3xl text-sm text-text-muted">
            The organization's option book and bond ladder, valued with Black-Scholes and
            discounted cashflows over marks an operator entered by hand.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh
        </Button>
      </header>

      {/* Provenance banner — the single most important sentence on the page. */}
      <div className="flex items-start gap-3 rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm text-text-main">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
        <p>{summary?.disclaimer ?? "Model output, not a market quote. This platform fetches no market data; every spot, volatility and yield below was typed in by an operator."}</p>
      </div>

      {error ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 p-3 text-sm text-emerald">{notice}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Sigma className="h-4 w-4" />}
          label="Option positions"
          value={summary ? String(summary.positions.total) : "—"}
          detail={summary ? `${summary.positions.priced} priced · ${summary.positions.unpriceable} unpriceable · ${summary.positions.staleMarks} stale` : undefined}
        />
        <Stat
          icon={<Activity className="h-4 w-4" />}
          label="Delta notional"
          value={<Measured value={summary?.positions.deltaNotional ?? null} format={money} />}
          detail="Delta × spot × contracts × multiplier"
        />
        <Stat
          icon={<BarChart3 className="h-4 w-4" />}
          label="Theta per day"
          value={summary ? money(summary.positions.thetaPerDay) : "—"}
          detail="Sum across priced positions"
        />
        <Stat
          icon={<Landmark className="h-4 w-4" />}
          label="Bond market value"
          value={summary ? money(summary.bonds.marketValue) : "—"}
          detail={summary ? `${summary.bonds.valued} of ${summary.bonds.total} valued · weighted mod. duration ${summary.bonds.weightedModifiedDuration ?? "n/a"}` : undefined}
        />
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
              tab === id ? "bg-azure/15 text-azure" : "text-text-muted hover:text-text-bright"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </nav>

      {tab === "book" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Option positions</CardTitle>
              <CardDescription>
                Marks older than {DERIV_MARK_STALE_AFTER_HOURS}h are badged stale. They are never refreshed automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {positions.length === 0 ? (
                <p className="text-sm text-text-muted">No positions recorded. The desk holds nothing until somebody enters something.</p>
              ) : positions.map((position) => {
                const valuation = portfolio?.valuations.find((v) => v.positionId === position.id) ?? null;
                const unpriceable = portfolio?.unpriceable.find((u) => u.positionId === position.id) ?? null;
                return (
                  <div key={position.id} className="rounded-lg border border-white/10 bg-bg-deep/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-text-bright">{position.label}</span>
                        <Badge variant="azure">{position.underlying}</Badge>
                        <Badge variant={position.side === "long" ? "emerald" : "crimson"}>{position.side} {position.type}</Badge>
                        <span className="text-xs text-text-muted">
                          {position.contracts} × {position.contractMultiplier} @ K {position.strike} · {position.yearsToExpiry}y
                        </span>
                        {valuation ? <FreshnessBadge freshness={valuation.markFreshness} /> : null}
                      </div>
                      {canWrite ? (
                        <Button
                          variant="ghost"
                          onClick={async () => { try { await deskApi.deletePosition(position.id); flash("Position removed."); await load(); } catch (e) { fail(e); } }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    {valuation ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-text-muted sm:grid-cols-4">
                        <div>Value <span className="block text-text-bright">{money(valuation.positionValue)}</span></div>
                        <div>Delta (shares) <span className="block text-text-bright">{valuation.deltaShares.toLocaleString()}</span></div>
                        <div>Theta/day <span className="block text-text-bright">{money(valuation.thetaPerDay)}</span></div>
                        <div>Unrealized P&amp;L <span className="block"><Measured value={valuation.unrealizedPnl} format={money} /></span></div>
                        <div className="col-span-2 sm:col-span-4">
                          Rate {valuation.rateUsed} ({valuation.rateSource === "desk_default" ? "desk default — no rate on the position" : "from the position"})
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-amber">{unpriceable?.reason ?? "Not priced in the current portfolio read."}</p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add a position</CardTitle>
              <CardDescription>
                {canWrite ? "Leave spot or volatility empty to record an unmarked position — it will be listed as unpriceable rather than valued at zero."
                  : "Administrators only. You can read the book but not change it."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Label" value={positionForm.label} onChange={(e) => setPositionForm({ ...positionForm, label: e.target.value })} disabled={!canWrite} />
              <Input placeholder="Underlying (e.g. ACME)" value={positionForm.underlying} onChange={(e) => setPositionForm({ ...positionForm, underlying: e.target.value })} disabled={!canWrite} />
              <div className="grid grid-cols-2 gap-2">
                <Select value={positionForm.type} onChange={(e) => setPositionForm({ ...positionForm, type: e.target.value })} disabled={!canWrite}>
                  <option value="call">call</option>
                  <option value="put">put</option>
                </Select>
                <Select value={positionForm.side} onChange={(e) => setPositionForm({ ...positionForm, side: e.target.value })} disabled={!canWrite}>
                  <option value="long">long</option>
                  <option value="short">short</option>
                </Select>
                <Input placeholder="Strike" value={positionForm.strike} onChange={(e) => setPositionForm({ ...positionForm, strike: e.target.value })} disabled={!canWrite} />
                <Input placeholder="Years to expiry" value={positionForm.yearsToExpiry} onChange={(e) => setPositionForm({ ...positionForm, yearsToExpiry: e.target.value })} disabled={!canWrite} />
                <Input placeholder="Contracts" value={positionForm.contracts} onChange={(e) => setPositionForm({ ...positionForm, contracts: e.target.value })} disabled={!canWrite} />
                <Input placeholder="Premium / share" value={positionForm.premiumPerShare} onChange={(e) => setPositionForm({ ...positionForm, premiumPerShare: e.target.value })} disabled={!canWrite} />
                <Input placeholder="Mark spot" value={positionForm.markSpot} onChange={(e) => setPositionForm({ ...positionForm, markSpot: e.target.value })} disabled={!canWrite} />
                <Input placeholder="Implied vol (0.25)" value={positionForm.impliedVol} onChange={(e) => setPositionForm({ ...positionForm, impliedVol: e.target.value })} disabled={!canWrite} />
              </div>
              <Button onClick={() => void createPosition()} disabled={!canWrite || !positionForm.label.trim() || !positionForm.underlying.trim()}>
                Add position
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "exposure" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Exposure by underlying</CardTitle>
              <CardDescription>{portfolio?.aggregationNote}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!portfolio || portfolio.byUnderlying.length === 0 ? (
                <p className="text-sm text-text-muted">Nothing priced. That is an unmeasured book, not a flat one.</p>
              ) : portfolio.byUnderlying.map((group) => (
                <div key={group.underlying} className="rounded-lg border border-white/10 bg-bg-deep/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="azure">{group.underlying}</Badge>
                    <span className="text-xs text-text-muted">{group.positions} position(s)</span>
                    {group.markSpotConflict
                      ? <Badge variant="amber">marks disagree</Badge>
                      : <span className="text-xs text-text-muted">marked at {group.markSpot}</span>}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-text-muted sm:grid-cols-6">
                    <div>Value <span className="block text-text-bright">{money(group.netValue)}</span></div>
                    <div>Delta <span className="block text-text-bright">{group.deltaShares.toLocaleString()}</span></div>
                    <div>Delta notional <span className="block"><Measured value={group.deltaNotional} format={money} /></span></div>
                    <div>Gamma <span className="block text-text-bright">{group.gammaShares.toLocaleString()}</span></div>
                    <div>Vega <span className="block text-text-bright">{money(group.vegaPerVolPoint)}</span></div>
                    <div>Theta/day <span className="block text-text-bright">{money(group.thetaPerDay)}</span></div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {portfolio && portfolio.unpriceable.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Excluded from every total above</CardTitle>
                <CardDescription>{portfolio.unpriceableCount} position(s) carry exposure this desk cannot measure.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {portfolio.unpriceable.map((item) => (
                  <div key={item.positionId} className="rounded-lg border border-amber/20 bg-amber/5 p-3 text-sm">
                    <span className="font-semibold text-text-bright">{item.label}</span>
                    <p className="text-xs text-text-muted">{item.reason}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Delta hedge</CardTitle>
              <CardDescription>Static, gamma-blind, and only as good as the marks behind it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Select value={hedgeSymbol} onChange={(e) => setHedgeSymbol(e.target.value)} className="max-w-xs">
                  <option value="">Select an underlying…</option>
                  {underlyings.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
                </Select>
                <Button onClick={() => void runHedge()} disabled={!hedgeSymbol}><Scale className="h-4 w-4" /> Suggest hedge</Button>
              </div>
              {hedge ? (
                <div className="rounded-lg border border-white/10 bg-bg-deep/40 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={hedge.direction === "none" ? "slate" : "azure"}>{hedge.direction}</Badge>
                    <span className="text-text-bright">{Math.abs(hedge.hedgeShares).toLocaleString()} shares of {hedge.underlying}</span>
                    <span className="text-xs text-text-muted">net delta {hedge.netDeltaShares.toLocaleString()} shares · {hedge.pricedPositions} priced, {hedge.excludedPositions} excluded</span>
                  </div>
                  <p className="mt-2 text-xs text-text-muted">{hedge.note}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "scenarios" ? (
        <Card>
          <CardHeader>
            <CardTitle>Spot × volatility grid</CardTitle>
            <CardDescription>
              Every cell is a full reprice through the same pricer, not a delta/gamma approximation.
              A cell reports how many positions it managed to price.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => void runScenarios()}><Grid3x3 className="h-4 w-4" /> Run grid</Button>
            {grid ? (
              <>
                <p className="text-xs text-text-muted">
                  Base value {money(grid.baseNetValue)} from {grid.pricedPositions} priced position(s).
                  {grid.excluded.length ? ` ${grid.excluded.length} excluded.` : ""}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-text-muted">
                        <th className="p-2 text-left">Spot shock</th>
                        {grid.rows[0]?.cells.map((cell) => (
                          <th key={cell.volShock} className="p-2 text-right">vol {cell.volShock >= 0 ? "+" : ""}{(cell.volShock * 100).toFixed(0)}pts</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grid.rows.map((row) => (
                        <tr key={row.spotShock} className="border-t border-white/5">
                          <td className="p-2 text-text-bright">{row.spotShock >= 0 ? "+" : ""}{(row.spotShock * 100).toFixed(0)}%</td>
                          {row.cells.map((cell) => (
                            <td key={cell.volShock} className={`p-2 text-right ${cell.pnlVsBase >= 0 ? "text-emerald" : "text-crimson"}`}>
                              {money(cell.pnlVsBase)}
                              <span className="block text-[10px] text-text-muted">{cell.pricedPositions} priced</span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-text-muted">{grid.disclaimer}</p>
              </>
            ) : <p className="text-sm text-text-muted">No grid has been run yet.</p>}
          </CardContent>
        </Card>
      ) : null}

      {tab === "fixed-income" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Bond ladder</CardTitle>
              <CardDescription>{ladder?.note}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!ladder || ladder.holdingCount === 0 ? (
                <p className="text-sm text-text-muted">No holdings recorded.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs text-text-muted sm:grid-cols-4">
                    <div>Market value <span className="block text-text-bright">{money(ladder.totalMarketValue)}</span></div>
                    <div>Weighted YTM <span className="block"><Measured value={ladder.weightedYtm} format={(n) => `${(n * 100).toFixed(2)}%`} /></span></div>
                    <div>Macaulay <span className="block"><Measured value={ladder.weightedMacaulayDuration} format={(n) => `${n}y`} /></span></div>
                    <div>Modified <span className="block"><Measured value={ladder.weightedModifiedDuration} /></span></div>
                  </div>
                  <div className="space-y-1">
                    {ladder.buckets.map((bucket) => (
                      <div key={bucket.label} className="flex items-center gap-2 text-xs">
                        <span className="w-14 text-text-muted">{bucket.label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded bg-white/5">
                          <div className="h-full bg-azure/60" style={{ width: `${Math.round(bucket.shareOfPortfolio * 100)}%` }} />
                        </div>
                        <span className="w-24 text-right text-text-bright">{money(bucket.marketValue)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4">
                    {ladder.shiftedYields.map((shift) => (
                      <div key={shift.shiftBps} className="rounded-lg border border-white/10 bg-bg-deep/40 p-2 text-xs">
                        <div className="text-text-muted">{shift.shiftBps > 0 ? "+" : ""}{shift.shiftBps}bps</div>
                        <div className={shift.changeFromBase >= 0 ? "text-emerald" : "text-crimson"}>{money(shift.changeFromBase)}</div>
                        <div className="text-[10px] text-text-muted">{(shift.changePct * 100).toFixed(2)}%</div>
                      </div>
                    ))}
                  </div>
                  {ladder.excluded.length ? (
                    <div className="rounded-lg border border-amber/20 bg-amber/5 p-3 text-xs">
                      {ladder.excluded.map((item) => (
                        <div key={item.holdingId}><span className="text-text-bright">{item.label}</span> — {item.reason}</div>
                      ))}
                    </div>
                  ) : null}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-text-muted"><th className="p-1 text-left">Year</th><th className="p-1 text-right">Coupon</th><th className="p-1 text-right">Principal</th><th className="p-1 text-right">Total</th></tr></thead>
                      <tbody>
                        {ladder.cashflows.map((flow) => (
                          <tr key={flow.year} className="border-t border-white/5">
                            <td className="p-1 text-text-bright">{flow.year}</td>
                            <td className="p-1 text-right">{money(flow.coupon)}</td>
                            <td className="p-1 text-right">{money(flow.principal)}</td>
                            <td className="p-1 text-right text-text-bright">{money(flow.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add a holding</CardTitle>
              <CardDescription>A holding needs a yield or a price — the desk will not assume one.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Label" value={bondForm.label} onChange={(e) => setBondForm({ ...bondForm, label: e.target.value })} disabled={!canWrite} />
              <Input placeholder="Issuer (optional)" value={bondForm.issuer} onChange={(e) => setBondForm({ ...bondForm, issuer: e.target.value })} disabled={!canWrite} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Face value" value={bondForm.faceValue} onChange={(e) => setBondForm({ ...bondForm, faceValue: e.target.value })} disabled={!canWrite} />
                <Input placeholder="Coupon (0.05)" value={bondForm.couponRate} onChange={(e) => setBondForm({ ...bondForm, couponRate: e.target.value })} disabled={!canWrite} />
                <Input placeholder="Coupons / yr" value={bondForm.couponFreq} onChange={(e) => setBondForm({ ...bondForm, couponFreq: e.target.value })} disabled={!canWrite} />
                <Input placeholder="Years to maturity" value={bondForm.yearsToMaturity} onChange={(e) => setBondForm({ ...bondForm, yearsToMaturity: e.target.value })} disabled={!canWrite} />
                <Input placeholder="YTM (0.05)" value={bondForm.ytm} onChange={(e) => setBondForm({ ...bondForm, ytm: e.target.value })} disabled={!canWrite} />
                <Input placeholder="Market price" value={bondForm.marketPrice} onChange={(e) => setBondForm({ ...bondForm, marketPrice: e.target.value })} disabled={!canWrite} />
                <Input placeholder="Quantity" value={bondForm.quantity} onChange={(e) => setBondForm({ ...bondForm, quantity: e.target.value })} disabled={!canWrite} />
              </div>
              <Button onClick={() => void createBond()} disabled={!canWrite || !bondForm.label.trim()}>Add holding</Button>
              {bonds.length ? (
                <div className="space-y-1 pt-2">
                  {bonds.map((holding) => (
                    <div key={holding.id} className="flex items-center justify-between rounded border border-white/10 p-2 text-xs">
                      <span className="text-text-bright">{holding.label} × {holding.quantity}</span>
                      {canWrite ? (
                        <Button variant="ghost" onClick={async () => { try { await deskApi.deleteBond(holding.id); flash("Holding removed."); await load(); } catch (e) { fail(e); } }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "tools" ? (
        <Card>
          <CardHeader>
            <CardTitle>Payoff curve</CardTitle>
            <CardDescription>Expiry payoff of a long 100 call at $5, sampled from 70 to 140.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => void runCurve()}><Calculator className="h-4 w-4" /> Sample curve</Button>
            {curve ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs text-text-muted sm:grid-cols-4">
                  <div>Breakeven(s) <span className="block text-text-bright">{curve.breakevens.map((b) => b.toFixed(2)).join(", ") || "none in range"}</span></div>
                  <div>Max profit in range <span className="block text-text-bright">{money(curve.maxProfitInRange)}</span></div>
                  <div>Max loss in range <span className="block text-text-bright">{money(curve.maxLossInRange)}</span></div>
                  <div>Net premium <span className="block text-text-bright">{money(curve.netPremium)}</span></div>
                </div>
                <div className="flex gap-2">
                  {curve.unboundedAbove ? <Badge variant="amber">payoff keeps rising past the sampled top</Badge> : null}
                  {curve.unboundedBelow ? <Badge variant="amber">payoff keeps moving past the sampled bottom</Badge> : null}
                </div>
                <p className="text-xs text-text-muted">{curve.rangeNote}</p>
              </>
            ) : <p className="text-sm text-text-muted">No curve sampled yet.</p>}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
