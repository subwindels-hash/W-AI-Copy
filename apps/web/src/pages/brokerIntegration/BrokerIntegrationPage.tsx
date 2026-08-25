/**
 * WINDELS AI OS — Broker Integration console.
 *
 * Trading-account connections, live positions, executions and risk posture.
 * Balances/PnL and health come from the broker connector — nothing is invented.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, LineChart, X } from "lucide-react";
import type { DashboardSummary, BrokerAccount, BrokerPosition } from "@/lib/brokerIntegration";
import { brokerApi } from "@/lib/brokerIntegration";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function fmtMoney(n: number) { return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function connTone(s?: string): any {
  return s === "connected" ? "emerald" : s === "disconnected" ? "slate" : s === "error" ? "crimson" : "amber";
}

export function BrokerIntegrationPage() {
  const [dash, setDash] = useState<DashboardSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try { setDash(await brokerApi.dashboard()); }
    catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function connect(id: string) {
    setErr(null); try { await brokerApi.connect(id); await load(); } catch (e: any) { setErr(e?.message ?? "Connect failed"); }
  }
  async function disconnect(id: string) {
    setErr(null); try { await brokerApi.disconnect(id); await load(); } catch (e: any) { setErr(e?.message ?? "Disconnect failed"); }
  }

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading broker integration…"}</div>;
  }

  const accounts: BrokerAccount[] = dash.accounts ?? [];

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><LineChart className="h-6 w-6 text-azure" /> Broker Integration</h1>
          <p className="text-sm text-text-muted">Trading account connections, positions &amp; risk.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{dash.health?.connectedAccounts ?? 0}/{dash.health?.totalAccounts ?? 0}</div><div className="text-sm text-text-muted">Connected accounts</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className={`text-3xl font-semibold ${dash.pnl.today >= 0 ? "text-emerald-500" : "text-crimson"}`}>{fmtMoney(dash.pnl.today)}</div><div className="text-sm text-text-muted">PnL today</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{(dash.positions ?? []).length}</div><div className="text-sm text-text-muted">Open positions</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold text-azure">{fmtMoney(dash.portfolio?.totalEquity ?? 0)}</div><div className="text-sm text-text-muted">Portfolio equity</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Accounts ({accounts.length})</CardTitle><CardDescription>{busy ? "Refreshing…" : ""}</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {accounts.length === 0 ? (
            <div className="text-sm text-text-muted">No broker accounts connected.</div>
          ) : accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{a.name}</span>
                  <Badge variant="outline">{a.brokerLabel ?? a.broker}</Badge>
                  <Badge variant="outline">{a.mode}</Badge>
                  <Badge variant={connTone(a.status)}>{a.status}</Badge>
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  {a.loginMasked ?? a.login} · {a.server} · bal {fmtMoney(a.account?.balance ?? 0)}
                  {a.latencyMs !== undefined && <> · {a.latencyMs}ms</>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {a.status === "disconnected" && <Button size="sm" variant="outline" onClick={() => void connect(a.id)}>Connect</Button>}
                {a.status === "connected" && <Button size="sm" variant="outline" onClick={() => void disconnect(a.id)}>Disconnect</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Open positions ({(dash.positions ?? []).length})</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {(dash.positions ?? []).length === 0 ? (
            <div className="text-sm text-text-muted">No open positions.</div>
          ) : (dash.positions as BrokerPosition[]).map((p, i) => (
            <div key={i} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
              <span className="font-medium">{p.symbol}</span>
              <span className="flex items-center gap-3">
                <span>{(p as any).volume ?? (p as any).lots ?? "—"} @ {fmtMoney((p as any).price ?? 0)}</span>
                <Badge variant="outline">{(p as any).side ?? "open"}</Badge>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default BrokerIntegrationPage;
