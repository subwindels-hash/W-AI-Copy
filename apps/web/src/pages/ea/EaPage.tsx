/**
 * Session 196 — Tier 4 `ea` (MetaTrader 5 Expert Advisor) console.
 *
 * `ea` (Phase 2 of tradingIntel) had 7 routes and a partial client
 * (`eas()` and `revokeEa()` only, in `lib/brokerIntegration.ts`)
 * but no dedicated console. The Tier 4 page is the operator's
 * surface for pairing a new EA, monitoring the org's existing
 * EAs (connected state is derived from the heartbeat cache),
 * revoking an EA, and inspecting the per-EA fill history.
 *
 * The page mirrors the S195 honesty discipline: a fresh org sees
 * an amber "no EAs paired yet" banner; `connected: true` requires
 * a heartbeat in the last 15 s (the same threshold
 * `EaService.listEa()` already uses), and a stale EA is honestly
 * labelled "stale" not "connected".
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bot, Cpu, RefreshCw, Trash2, X } from "lucide-react";
import type { EaRegistration } from "@windels/shared/ea";
import { eaApi, type EaSummary, type EaFillRecord } from "@/lib/ea";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

function fmtTimestamp(s: string | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function StatusBadge({ connected }: { connected: boolean }) {
  if (connected) return <Badge variant="emerald">connected</Badge>;
  return <Badge variant="slate">stale</Badge>;
}

function MagicBadge({ magic }: { magic: number }) {
  return <Badge variant="azure">0x{magic.toString(16).toUpperCase()}</Badge>;
}

export function EaPage() {
  const [eas, setEas] = useState<EaSummary[]>([]);
  const [fills, setFills] = useState<EaFillRecord[]>([]);
  const [activeEa, setActiveEa] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // register form
  const [brokerAccountId, setBrokerAccountId] = useState("");
  const [eaPublicKey, setEaPublicKey] = useState("");
  const [mt5Login, setMt5Login] = useState("");
  const [mt5Server, setMt5Server] = useState("");
  const [terminalName, setTerminalName] = useState("");
  const [terminalVersion, setTerminalVersion] = useState("");
  const [eaVersion, setEaVersion] = useState("1.0.0");
  const [chartSymbol, setChartSymbol] = useState("");
  const [chartTimeframe, setChartTimeframe] = useState("");
  const [registering, setRegistering] = useState(false);
  const [lastIssued, setLastIssued] = useState<{ eaId: string; token: string; expiresAt: string; magic: number } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const list = await eaApi.list();
      setEas(list);
      if (activeEa && list.find((e) => e.eaId === activeEa)) {
        const f = await eaApi.recentFills(activeEa, 50);
        setFills(f);
      } else {
        setFills([]);
      }
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, [activeEa]);

  useEffect(() => { void load(); }, [load]);

  async function loadFills(eaId: string) {
    setActiveEa(eaId);
    try { setFills(await eaApi.recentFills(eaId, 50)); }
    catch (e: any) { setErr(e?.message ?? "Failed to load fills"); }
  }

  async function register() {
    if (!brokerAccountId || !eaPublicKey || !mt5Login || !mt5Server || !terminalName) return;
    setRegistering(true);
    setErr(null);
    try {
      const body: EaRegistration = {
        brokerAccountId, eaPublicKey,
        mt5Login, mt5Server,
        terminalName, terminalVersion: terminalVersion || "0",
        eaVersion, chartSymbol: chartSymbol || undefined, chartTimeframe: chartTimeframe || undefined,
      };
      const sess = await eaApi.register(body);
      setLastIssued({ eaId: sess.eaId, token: sess.token, expiresAt: sess.expiresAt, magic: sess.magic });
      setBrokerAccountId(""); setEaPublicKey(""); setMt5Login(""); setMt5Server("");
      setTerminalName(""); setTerminalVersion(""); setChartSymbol(""); setChartTimeframe("");
      await load();
    } catch (e: any) { setErr(e?.message ?? "Register failed"); } finally { setRegistering(false); }
  }

  async function revoke(eaId: string) {
    if (!confirm(`Revoke EA ${eaId}? This invalidates its bearer token immediately. Pending signals will be dropped.`)) return;
    try {
      await eaApi.revoke(eaId);
      if (activeEa === eaId) { setActiveEa(null); setFills([]); }
      await load();
    } catch (e: any) { setErr(e?.message ?? "Revoke failed"); }
  }

  const empty = eas.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Expert Advisors (MT5)</h1>
          <p className="text-sm text-text-muted">Pair MQL5 EAs running inside MetaTrader 5 terminals. Each registration returns a bearer token the EA embeds in its Inputs and a magic number it uses as the MT5 magic slot. The S196 fix gave the module a dedicated console and a per-org `/ea/:eaId/fills` read endpoint.</p>
        </div>
        <Button variant="ghost" onClick={load} loading={busy}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {empty && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-text-bright">No EAs paired yet</div>
            <div className="text-text-muted">This organization has not registered any MQL5 Expert Advisor. Use the form below to pair a new EA — the returned token is shown once and is required to be embedded in the EA's Inputs.</div>
          </div>
        </div>
      )}

      {lastIssued && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="text-sm font-semibold text-text-bright mb-2">EA registered — copy the token now</div>
          <div className="grid gap-2 text-xs font-mono">
            <div><span className="text-text-muted">eaId:</span> {lastIssued.eaId}</div>
            <div><span className="text-text-muted">magic:</span> 0x{lastIssued.magic.toString(16).toUpperCase()}</div>
            <div><span className="text-text-muted">expiresAt:</span> {fmtTimestamp(lastIssued.expiresAt)}</div>
            <div className="break-all"><span className="text-text-muted">token:</span> {lastIssued.token}</div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardDescription>Registered EAs</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{eas.length}</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Connected (heartbeat &lt; 15s)</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{eas.filter((e) => e.connected).length}</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Stale</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{eas.filter((e) => !e.connected).length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle><Cpu className="h-4 w-4 inline mr-1"/>Pair a new EA</CardTitle>
          <CardDescription>Submit the EA's MQL5 registration payload. The server returns a token + magic slot; the EA embeds them in its Inputs and polls /ea/poll. The token is the only secret — it is hashed at rest and never returned again.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Input placeholder="brokerAccountId" value={brokerAccountId} onChange={(e) => setBrokerAccountId(e.target.value)} />
            <Input placeholder="eaPublicKey (32+ chars)" value={eaPublicKey} onChange={(e) => setEaPublicKey(e.target.value)} />
            <Input placeholder="mt5Login" value={mt5Login} onChange={(e) => setMt5Login(e.target.value)} />
            <Input placeholder="mt5Server" value={mt5Server} onChange={(e) => setMt5Server(e.target.value)} />
            <Input placeholder="terminalName" value={terminalName} onChange={(e) => setTerminalName(e.target.value)} />
            <Input placeholder="terminalVersion" value={terminalVersion} onChange={(e) => setTerminalVersion(e.target.value)} />
            <Input placeholder="chartSymbol (optional)" value={chartSymbol} onChange={(e) => setChartSymbol(e.target.value)} />
            <Input placeholder="chartTimeframe (optional)" value={chartTimeframe} onChange={(e) => setChartTimeframe(e.target.value)} />
            <Input placeholder="eaVersion" value={eaVersion} onChange={(e) => setEaVersion(e.target.value)} />
          </div>
          <Button onClick={register} loading={registering} disabled={!brokerAccountId || !eaPublicKey || !mt5Login || !mt5Server || !terminalName}><Bot className="h-4 w-4 mr-1"/>Register EA</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registered EAs</CardTitle>
          <CardDescription>Per-org list. Connected state derives from the heartbeat cache (15-second threshold). Click a row to inspect its fill history.</CardDescription>
        </CardHeader>
        <CardContent>
          {eas.length === 0 ? (
            <div className="text-sm text-text-muted">No EAs registered for this org.</div>
          ) : (
            <div className="space-y-2">
              {eas.map((e) => (
                <div key={e.eaId} className={`border rounded-lg p-3 cursor-pointer transition-colors ${activeEa === e.eaId ? "border-azure/40 bg-azure/5" : "border-border/40 hover:border-border"}`} onClick={() => loadFills(e.eaId)}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs text-text-bright">{e.eaId}</div>
                      <div className="text-xs text-text-muted">terminal: {e.terminalName} (v{e.terminalVersion}) · ea v{e.eaVersion} · MT5 login {e.mt5Login} @ {e.mt5Server}</div>
                      <div className="text-xs text-text-muted">created: {fmtTimestamp(e.createdAt)}{e.lastPollAt ? ` · last poll: ${fmtTimestamp(e.lastPollAt)}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MagicBadge magic={e.magic} />
                      <StatusBadge connected={e.connected} />
                      <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); revoke(e.eaId); }}>
                        <Trash2 className="h-3 w-3 mr-1"/>Revoke
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {activeEa && (
        <Card>
          <CardHeader>
            <CardTitle>Recent fill acks</CardTitle>
            <CardDescription>Per-EA fill history from <code>ea:fills:&lt;eaId&gt;</code>. Newest first, capped at 50.</CardDescription>
          </CardHeader>
          <CardContent>
            {fills.length === 0 ? (
              <div className="text-sm text-text-muted">No fill acks yet for this EA.</div>
            ) : (
              <div className="space-y-2">
                {fills.map((f, idx) => (
                  <div key={idx} className="border-b border-border/40 pb-2 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-mono text-text-bright">{f.signalId ?? "(no signal id)"}</div>
                      <div className="text-xs text-text-muted">{fmtTimestamp(f.receivedAt)} · ticket {f.ticket ?? "—"}{f.dealId ? ` · deal ${f.dealId}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={f.status === "FILLED" ? "emerald" : f.status === "PARTIAL" ? "azure" : f.status === "REJECTED" || f.status === "ERROR" ? "crimson" : "slate"}>{f.status}</Badge>
                      {f.fillPrice !== undefined && <span className="text-xs font-mono">@ {f.fillPrice}</span>}
                      {f.filledVolume !== undefined && <span className="text-xs font-mono">× {f.filledVolume}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {err && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2">
          <X className="h-4 w-4" />{err}
        </div>
      )}
    </div>
  );
}

export default EaPage;
