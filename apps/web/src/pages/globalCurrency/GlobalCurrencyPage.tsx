/**
 * Session 167 — Global Currency console (/app/global-currency).
 *
 * Tabs: Rates · Convert · Localization
 *
 * Honesty:
 *   - this module produces the exchange rates other modules bill against
 *     (geoBilling prices customers with `getRate("USD", currency)`), so every
 *     figure here states its provenance and whether it may be charged against.
 *   - a rate compiled into the repository is labelled `offline-constant` and is
 *     never `usableForBilling`. It used to be stored as `cache` with a fresh
 *     timestamp, which made it indistinguishable from a real quote.
 *   - inverse rates are computed at read time and flagged `derived`. They were
 *     previously stored rounded to 4dp, putting NGN:USD 6.4% out.
 *   - "providers" means upstream FX sources (2), not cache layers (4).
 *   - an unsupported country reports unknown rather than defaulting to Nigeria.
 */
import { useCallback, useEffect, useState } from "react";
import { Globe, AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import {
  gcuApi,
  type GcuDashboard, type GcExchangeRate, type GcDetection,
  type GcLocalizedPrice, type GcRateStaleness,
} from "@/lib/globalCurrency";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

const STALENESS_TONE: Record<GcRateStaleness, "emerald" | "amber" | "crimson" | "slate"> = {
  fresh: "emerald", aging: "amber", stale: "crimson", unusable: "slate",
};

const SOURCE_LABEL: Record<string, string> = {
  live: "live provider",
  cache: "cached quote",
  "enterprise-override": "contractual override",
  "offline-constant": "hardcoded constant",
  synthetic: "provider synthetic fallback",
};

/** Never render an unmeasured value as a number. */
const fmtAge = (ms: number | null) => {
  if (ms === null) return "unknown vintage";
  const h = ms / 3600_000;
  if (h < 1) return `${Math.round(ms / 60_000)}m old`;
  if (h < 48) return `${Math.round(h)}h old`;
  return `${Math.round(h / 24)}d old`;
};

function Stat(props: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] uppercase tracking-wide text-text-muted">{props.label}</div>
        <div className="text-xl font-semibold">{props.value}</div>
        {props.sub && <div className="text-[11px] text-text-muted mt-0.5">{props.sub}</div>}
      </CardContent>
    </Card>
  );
}

function RateRow({ r }: { r: GcExchangeRate }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/5 py-2 text-xs">
      <span className="font-mono font-semibold w-24">{r.from}→{r.to}</span>
      <span className="font-mono w-32">{r.rate.toPrecision(8)}</span>
      <Badge variant={STALENESS_TONE[r.staleness]}>{r.staleness}</Badge>
      <span className="text-text-muted">{SOURCE_LABEL[r.source] ?? r.source}</span>
      {r.derived && <Badge variant="slate">derived</Badge>}
      <span className="text-text-muted">{fmtAge(r.ageMs)}</span>
      <span className="flex-1" />
      {r.usableForBilling
        ? <Badge variant="emerald">billable</Badge>
        : <Badge variant="crimson">not for billing</Badge>}
    </div>
  );
}

export function GlobalCurrencyPage() {
  const [dash, setDash] = useState<GcuDashboard | null>(null);
  const [rates, setRates] = useState<GcExchangeRate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("NGN");
  const [amount, setAmount] = useState(100);
  const [conv, setConv] = useState<GcLocalizedPrice | null>(null);
  const [convError, setConvError] = useState<string | null>(null);

  const [country, setCountry] = useState("NG");
  const [detection, setDetection] = useState<GcDetection | null>(null);

  const PAIRS: Array<[string, string]> = [
    ["USD", "EUR"], ["USD", "GBP"], ["USD", "NGN"], ["USD", "JPY"],
    ["NGN", "USD"], ["EUR", "USD"],
  ];

  const load = useCallback(async () => {
    try {
      const d = await gcuApi.dashboard();
      setDash(d);
      const rs = await Promise.all(
        PAIRS.map(([f, t]) => gcuApi.rate(f, t).catch(() => null)),
      );
      setRates(rs.filter(Boolean) as GcExchangeRate[]);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "failed to load");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    setConvError(null);
    void gcuApi.localizePrice(amount, from, to)
      .then((c) => { if (!cancelled) setConv(c); })
      .catch((e) => { if (!cancelled) { setConv(null); setConvError(e?.message ?? "conversion failed"); } });
    return () => { cancelled = true; };
  }, [amount, from, to]);

  useEffect(() => {
    let cancelled = false;
    void gcuApi.detect({ country })
      .then((d) => { if (!cancelled) setDetection(d); })
      .catch(() => { if (!cancelled) setDetection(null); });
    return () => { cancelled = true; };
  }, [country]);

  const constantsOnly = dash !== null && dash.ratesFromLiveProvider === 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Globe className="h-6 w-6 text-emerald" />
        <div>
          <h1 className="text-xl font-semibold">Global Currency &amp; Localization</h1>
          <p className="text-sm text-text-muted">
            FX rates, locale detection and regional pricing.
          </p>
        </div>
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="h-3 w-3 mr-1" />Refresh
        </Button>
      </div>

      {constantsOnly && (
        <div className="rounded-md border border-crimson/40 bg-crimson/10 p-3 text-xs flex gap-2">
          <AlertTriangle className="h-4 w-4 text-crimson shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">No live exchange rate has been fetched.</span>{" "}
            Every rate below is a constant compiled into this repository, of unknown vintage, and
            none of them may be used to charge a customer. They exist as a last-resort fallback
            only. Check that the FX refresh job can reach frankfurter.app or open.er-api.com.
          </div>
        </div>
      )}

      {error && <div className="rounded-md border border-crimson/40 bg-crimson/10 p-3 text-xs text-crimson">{error}</div>}

      {dash && (
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Upstream providers" value={dash.upstreamProviders}
            sub="frankfurter · open.er-api" />
          <Stat label="Reachable"
            value={dash.providersReachable === null ? "—" : dash.providersReachable}
            sub={dash.providersReachable === null ? "never fetched" : "served a rate"} />
          <Stat label="Live rates" value={dash.ratesFromLiveProvider} sub="from a provider" />
          <Stat label="Constant rates" value={dash.ratesFromConstants} sub="not billable" />
          <Stat label="Oldest live rate"
            value={dash.oldestRateAgeMs === null ? "—" : fmtAge(dash.oldestRateAgeMs)}
            sub={dash.oldestRateAgeMs === null ? "nothing fetched" : undefined} />
          <Stat label="Conversions 24h"
            value={dash.conversions24h === null ? "—" : dash.conversions24h}
            sub={dash.conversions24h === null ? "none recorded" : "rolling window"} />
        </div>
      )}

      <Tabs defaultValue="rates">
        <TabsList>
          <TabsTrigger value="rates">Rates</TabsTrigger>
          <TabsTrigger value="convert">Convert</TabsTrigger>
          <TabsTrigger value="localization">Localization</TabsTrigger>
        </TabsList>

        <TabsContent value="rates">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Current rates</CardTitle>
              <CardDescription className="text-xs">
                Each rate states where it came from and whether it may be billed against. A
                <span className="font-mono"> derived </span> rate was computed (an inverse or a
                cross via USD), not quoted — real FX has a spread, and 1/rate is neither side of it.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs">
              {rates.length === 0 && <div className="text-text-muted">No rates resolved.</div>}
              {rates.map((r) => <RateRow key={`${r.from}${r.to}`} r={r} />)}
            </CardContent>
          </Card>

          <Card className="mt-3">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />Rate integrity
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-text-muted space-y-1">
              <div>
                The manipulation guard compares an observed rate against the most recent
                <em> real </em> quote. When no such baseline exists it reports
                <span className="font-mono"> baselineAvailable: false </span> rather than declaring
                the rate safe — an unchecked rate is not a verified one.
              </div>
              <div>
                Staleness: fresh &lt; 1h · aging &lt; 24h · stale &lt; 7d · unusable beyond that.
                Only fresh, aging and contractual overrides are billable.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="convert">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <Input type="number" value={amount} className="w-28"
                  onChange={(e) => setAmount(Number(e.target.value))} />
                <Input value={from} className="w-20 uppercase"
                  onChange={(e) => setFrom(e.target.value.toUpperCase())} />
                <span>→</span>
                <Input value={to} className="w-20 uppercase"
                  onChange={(e) => setTo(e.target.value.toUpperCase())} />
                <div className="text-2xl font-semibold text-emerald flex-1 text-right">
                  {conv?.formatted ?? "—"}
                </div>
              </div>

              {convError && <div className="text-xs text-crimson">{convError}</div>}

              {conv && (
                <div className="text-xs space-y-1">
                  <div className="text-text-muted">
                    rate {conv.exchangeRate.toPrecision(8)} · {SOURCE_LABEL[conv.sourceRate] ?? conv.sourceRate}
                    {conv.rateDerived && " · derived, not quoted"}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STALENESS_TONE[conv.rateStaleness]}>{conv.rateStaleness}</Badge>
                    {conv.usableForBilling
                      ? <Badge variant="emerald">may be billed</Badge>
                      : <Badge variant="crimson">must not be billed</Badge>}
                  </div>
                  {!conv.usableForBilling && (
                    <div className="text-crimson">
                      This figure is for display only. The underlying rate is either a hardcoded
                      constant or too old to charge against.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="localization">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Country detection</CardTitle>
              <CardDescription className="text-xs">
                An unsupported country reports unknown. It used to fall back to Nigeria, so a user
                in Brazil was told their currency was NGN and their timezone Africa/Lagos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex gap-2 items-center">
                <span>Country code:</span>
                <Input value={country} className="w-20 uppercase"
                  onChange={(e) => setCountry(e.target.value.toUpperCase())} />
              </div>

              {detection && !detection.supported && (
                <div className="rounded border border-amber/40 bg-amber/10 p-2">
                  <span className="font-semibold">{detection.country} is not supported.</span>{" "}
                  No localization profile exists, so no currency, timezone or tax region is
                  reported. Pricing calls for this country are refused rather than defaulted.
                </div>
              )}

              {detection?.supported && (
                <div className="grid md:grid-cols-2 gap-2">
                  <div>Currency: <b>{detection.currency}</b></div>
                  <div>Language: <b>{detection.language}</b></div>
                  <div>Timezone: <b>{detection.timezone}</b></div>
                  <div>Date: <b>{detection.dateFormat}</b></div>
                  <div>Number: <b>{detection.numberFormat}</b></div>
                  <div>Tax region: <b>{detection.taxRegion ?? "none"}</b></div>
                  <div className="md:col-span-2 text-text-muted">
                    Payment methods: {detection.paymentMethods.join(", ") || "none"}
                  </div>
                  <div className="md:col-span-2 text-text-muted">
                    Detected by: {detection.detectedBy}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-3">
            <CardHeader><CardTitle className="text-sm">Regional pricing</CardTitle></CardHeader>
            <CardContent className="text-xs text-text-muted">
              Regional prices convert at the FX rate and report the local tax rate separately.
              They are <b>not</b> purchasing-power adjusted — the service reports
              <span className="font-mono"> pppAdjusted: false</span>, despite the original
              method being documented as a PPP engine. The converted amount is pre-tax; tax is
              reported alongside it rather than being claimed as included.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default GlobalCurrencyPage;
