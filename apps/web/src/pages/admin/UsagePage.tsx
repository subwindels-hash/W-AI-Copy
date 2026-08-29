/**
 * Session 123 — Usage Intelligence console.
 *
 * Session 55 shipped the API and a 9-LOC client but no console page. This
 * page is the module's first UI.
 *
 * Honesty rules the page is built around:
 *   - a percentage change without a prior-period baseline prints "no
 *     baseline", never 0 % (0 would read as "no change");
 *   - a rate with an empty denominator prints "not recorded" — no AI
 *     requests is not a 0 % error rate, and no members is not a 0 %
 *     adoption rate;
 *   - an unmeasured latency prints "not recorded", never 0 ms;
 *   - per-module p95/error columns show "—" where a module has no requests;
 *   - the structural-zero cards (cost, savings, ROI, carbon, resources) say
 *     "no feed" and the provenance card names them field by field;
 *   - the ledger card states that its counts cover the most recent 100
 *     events, not the whole ledger.
 */
import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, BarChart3, RefreshCw } from "lucide-react";
import type { UsageDashboard } from "@windels/shared/usage";
import { usageApi } from "@/lib/usage";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAuthStore } from "@/store/auth";

/** Null-aware rendering: a missing measure is "not recorded", never 0. */
function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "not recorded" : String(n);
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-text-bright">{value}</div>
      {hint ? <div className="mt-1 text-xs text-text-muted">{hint}</div> : null}
    </Card>
  );
}

export function UsagePage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [dash, setDash] = useState<UsageDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await usageApi.dashboard();
      setDash(data);
    } catch (e) {
      setError((e as Error).message);
      setDash(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, accessToken]);

  const metric = (label: string) => dash?.metrics.find((m) => m.label === label) ?? null;

  const maxRequests = Math.max(1, ...(dash?.series.map((p) => p.requests) ?? [1]));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-bright">
            <BarChart3 className="h-6 w-6 text-azure" />Usage Intelligence
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Every figure is counted from records this organization actually holds.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />Refresh
        </Button>
      </div>

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-2 text-sm text-crimson">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      ) : null}

      {dash ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="AI requests (30d)" value={fmt(metric("AI requests (30d)")?.value ?? null)} hint={deltaHint(metric("AI requests (30d)")?.deltaPct ?? null)} />
            <StatCard label="AI tokens (30d)" value={fmt(metric("AI tokens (30d)")?.value ?? null)} hint={deltaHint(metric("AI tokens (30d)")?.deltaPct ?? null)} />
            <StatCard label="Avg AI latency" value={`${fmt(metric("Avg AI latency")?.value ?? null)} ms`} hint={deltaHint(metric("Avg AI latency")?.deltaPct ?? null)} />
            <StatCard label="AI error rate" value={`${fmt(metric("AI error rate")?.value ?? null)} %`} hint="failed ÷ requests; null with no requests" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Messages (30d)" value={fmt(metric("Messages (30d)")?.value ?? null)} hint={deltaHint(metric("Messages (30d)")?.deltaPct ?? null)} />
            <StatCard label="Workflow runs (30d)" value={fmt(metric("Workflow runs (30d)")?.value ?? null)} hint={deltaHint(metric("Workflow runs (30d)")?.deltaPct ?? null)} />
            <StatCard label="Tasks (30d)" value={fmt(metric("Tasks (30d)")?.value ?? null)} hint={deltaHint(metric("Tasks (30d)")?.deltaPct ?? null)} />
            <StatCard
              label="Adoption"
              value={dash.adoptionPct === null ? "not recorded" : `${Math.round((dash.adoptionPct ?? 0) * 100)} %`}
              hint={`${dash.activeMembers30d} member(s) with AI traffic`}
            />
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm">AI requests — last 30 days</CardTitle>
              <CardDescription>request volume per day; a day with none is absent from the bars, not a zero</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1.5">
              {dash.series.every((p) => p.requests === 0) ? (
                <p className="text-sm text-text-muted">No AI requests recorded in the window.</p>
              ) : (
                dash.series.map((p) => (
                  <div key={p.ts} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-text-muted">{p.ts}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-white/5">
                      <div className="h-full rounded bg-azure/60" style={{ width: `${Math.max(2, (p.requests / maxRequests) * 100)}%` }} />
                    </div>
                    <span className="w-16 shrink-0 text-right text-text-muted">{p.requests} req</span>
                    <span className="w-20 shrink-0 text-right text-text-muted">
                      {p.latencyMs === null ? "no latency" : `${p.latencyMs} ms`}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">By module</CardTitle>
                <CardDescription>p95 latency, error rate and users measured from the window's request rows</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1.5">
                {dash.modules.length === 0 ? (
                  <p className="text-sm text-text-muted">No AI requests recorded in the window.</p>
                ) : (
                  dash.modules.map((m) => (
                    <div key={m.module} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-text-bright">{m.module}</span>
                      <span className="shrink-0 text-xs text-text-muted">
                        {m.requests} req · {m.users} user{m.users === 1 ? "" : "s"} ·{" "}
                        {m.p95LatencyMs === null ? "—" : `${m.p95LatencyMs} ms p95`} ·{" "}
                        {m.errorRate === null ? "—" : `${m.errorRate} % err`}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Top models</CardTitle>
                <CardDescription>requests and tokens per model in the window</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1.5">
                {dash.topModels.length === 0 ? (
                  <p className="text-sm text-text-muted">No model traffic recorded in the window.</p>
                ) : (
                  dash.topModels.map((m, i) => (
                    <div key={m.modelId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="text-text-muted">#{i + 1}</span>{" "}
                        <span className="font-medium text-text-bright">{m.modelId}</span>
                      </span>
                      <span className="shrink-0 text-xs text-text-muted">{m.requests} req · {m.tokens} tokens</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4" />Automation
                </CardTitle>
                <CardDescription>workflow runs that completed without a human, in the window</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-text-bright">
                  {dash.automationRate === null ? "not recorded" : `${Math.round((dash.automationRate ?? 0) * 100)} %`}
                </div>
                <p className="mt-1 text-xs text-text-muted">null when no workflow runs were recorded — no runs is not 0 % automation.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Structural zeros</CardTitle>
                <CardDescription>no backing feed — reported as 0, named by provenance</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1 text-xs text-text-muted">
                <span>Cost (30d): no billing feed</span>
                <span>Savings (30d): no billing feed</span>
                <span>ROI: no cost basis</span>
                <span>Carbon (30d): no carbon feed</span>
                <span>Host resources: no telemetry feed</span>
              </CardContent>
            </Card>
          </div>

          {dash.provenance ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Provenance</CardTitle>
                <CardDescription>{dash.provenance.note}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1">
                {dash.provenance.entries.map((e) => (
                  <div key={e.field} className="flex items-start gap-2 text-xs">
                    <Badge variant={e.basis === "measured" ? "emerald" : e.basis === "structural_zero" ? "slate" : "amber"}>
                      {e.basis}
                    </Badge>
                    <code className="rounded bg-white/5 px-1.5 py-0.5">{e.field}</code>
                    <span className="text-text-muted">{e.detail}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {(dash as any).ledger ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Event ledger</CardTitle>
                <CardDescription>{(dash as any).ledger.note}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1.5">
                {Object.keys((dash as any).ledger.byFeature).length === 0 ? (
                  <p className="text-sm text-text-muted">No usage events recorded yet.</p>
                ) : (
                  Object.entries((dash as any).ledger.byFeature as Record<string, { quantity: number; count: number }>).map(([feature, g]) => (
                    <div key={feature} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-text-bright">{feature}</span>
                      <span className="text-xs text-text-muted">{g.count} event(s) · {g.quantity}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : !error ? (
        <Card className="mt-4 p-6 text-center text-sm text-text-muted">Loading…</Card>
      ) : null}
    </div>
  );
}

function deltaHint(d: number | null): string {
  if (d === null) return "no prior-period baseline";
  return `${d > 0 ? "+" : ""}${d} % vs prior 30 days`;
}

// Re-export so lazy imports can use `.then(m => m.UsagePage)` uniformly.
export default UsagePage;
