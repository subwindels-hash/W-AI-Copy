/**
 * WINDELS AI OS — Financial Policy console.
 *
 * Exposes the provenance / decision-safety gates that payments, billing,
 * invoices, wallet, trading, risk and P&L all depend on, plus the audited
 * tenant decision ledger. Mirrors the honesty discipline of the rest of the
 * OS: a fresh org shows an EMPTY ledger and zero counters — nothing is
 * fabricated, and simulated records are always surfaced as not decision-safe.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck, ShieldAlert, Activity, Plus, X, RefreshCw, Database, Trash2,
} from "lucide-react";
import type {
  FinancialDashboard,
  FinancialLedgerEntry,
  FinancialProvenance,
  FinancialProvenanceInput,
  FinancialDecisionResponse,
} from "@windels/shared";
import { financialApi } from "@/lib/financial";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const STATUSES = ["REAL", "SIMULATED", "UNAVAILABLE", "UNVERIFIED", "STALE"] as const;

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "REAL": return <Badge variant="emerald"><ShieldCheck className="h-3 w-3 mr-1"/>REAL</Badge>;
    case "SIMULATED": return <Badge variant="amber"><ShieldAlert className="h-3 w-3 mr-1"/>SIMULATED</Badge>;
    case "UNAVAILABLE": return <Badge variant="slate">UNAVAILABLE</Badge>;
    case "UNVERIFIED": return <Badge variant="warning">UNVERIFIED</Badge>;
    case "STALE": return <Badge variant="danger">STALE</Badge>;
    default: return <Badge>{status}</Badge>;
  }
}

function fmtDate(s?: string) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className={`text-3xl font-semibold ${tone ?? ""}`}>{value}</div>
        <div className="text-sm text-text-muted">{label}</div>
      </CardContent>
    </Card>
  );
}

export function FinancialPage() {
  const [data, setData] = useState<FinancialDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // decision-safety tool
  const [source, setSource] = useState("");
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState<"REAL" | "SIMULATED">("REAL");
  const [allowSandbox, setAllowSandbox] = useState(false);
  const [verdict, setVerdict] = useState<FinancialDecisionResponse | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      setData(await financialApi.dashboard());
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function buildProvenance(): FinancialProvenance {
    return {
      source: source.trim() || "console/manual-check",
      provider: provider.trim() || "internal",
      organizationId: data?.recentLedger?.[0]?.organizationId ?? "current-org",
      observedAt: new Date().toISOString(),
      verifiedAt: status === "REAL" ? new Date().toISOString() : null,
      currency: "USD",
      status,
    };
  }

  async function runDecide() {
    setErr(null); setVerdict(null);
    try {
      setVerdict(await financialApi.decide({ provenance: buildProvenance(), allowSandbox }));
      await load();
    } catch (e: any) { setErr(e?.message ?? "Decision failed"); }
  }

  async function createProvenance(kind: "real" | "simulated" | "unavailable") {
    setErr(null);
    const input: FinancialProvenanceInput = {
      source: source.trim() || "console/manual",
      provider: provider.trim() || undefined,
      reason: `created from ${kind} console`,
    };
    try {
      if (kind === "real") await financialApi.createReal(input);
      else if (kind === "simulated") await financialApi.createSimulated(input);
      else await financialApi.createUnavailable(input);
      await load();
    } catch (e: any) { setErr(e?.message ?? "Create failed"); }
  }

  async function removeEntry(id: string) {
    setErr(null);
    try { await financialApi.remove(id); await load(); } catch (e: any) { setErr(e?.message ?? "Delete failed"); }
  }

  if (!data) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading financial policy…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Database className="h-6 w-6 text-azure" /> Financial Policy
          </h1>
          <p className="text-sm text-text-muted">
            Provenance classification &amp; decision-safety gates used by payments, billing, wallet, trading, risk and P&amp;L.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={data.demoData ? "amber" : "emerald"}>{data.demoData ? "DEMO DATA ON" : "DEMO DATA OFF"}</Badge>
          <Badge variant="outline">{data.runtimeMode}</Badge>
          <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
        </div>
      </div>

      {err && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2">
          <X className="h-4 w-4" />{err}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Ledger entries" value={data.ledgerCount} />
        <Stat label="Decision-safe" value={data.safeDecisions} tone="text-emerald-500" />
        <Stat label="Blocked" value={data.blockedDecisions} tone="text-amber-500" />
        <Stat label="Providers seen" value={data.providersSeen.length || 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Posture by classification</CardTitle>
          <CardDescription>Every ledger event bucketed by its financial provenance classification.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {STATUSES.map((s) => (
            <div key={s} className="flex items-center justify-between">
              <StatusBadge status={s} />
              <span className="text-sm text-text-muted">{data.countsByStatus[s]}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decision-safety gate</CardTitle>
          <CardDescription>
            Build a provenance record and ask the shared gate whether it may drive a real financial operation.
            "Decide" audits the attempt to the ledger; "Check" is read-only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="source (e.g. billing/invoice-123)" value={source} onChange={(e) => setSource(e.target.value)} />
            <Input placeholder="provider (e.g. stripe)" value={provider} onChange={(e) => setProvider(e.target.value)} />
            <Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="REAL">REAL</option>
              <option value="SIMULATED">SIMULATED</option>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input type="checkbox" checked={allowSandbox} onChange={(e) => setAllowSandbox(e.target.checked)} />
            Allow simulated data in sandbox
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void runDecide()}>Decide (audited)</Button>
            <Button variant="outline" onClick={() => void (async () => {
              setErr(null);
              try { setVerdict(await financialApi.check({ provenance: buildProvenance(), allowSandbox })); }
              catch (e: any) { setErr(e?.message ?? "Check failed"); }
            })()}>Check (read-only)</Button>
            <Button variant="outline" onClick={() => void createProvenance("real")}><Plus className="h-4 w-4 mr-1"/>Record REAL</Button>
            <Button variant="outline" onClick={() => void createProvenance("simulated")}><Plus className="h-4 w-4 mr-1"/>Record SIMULATED</Button>
            <Button variant="outline" onClick={() => void createProvenance("unavailable")}><Plus className="h-4 w-4 mr-1"/>Record UNAVAILABLE</Button>
          </div>
          {verdict && (
            <div className={`text-sm flex items-center gap-2 ${verdict.safe ? "text-emerald-400" : "text-amber-400"}`}>
              {verdict.safe ? <ShieldCheck className="h-4 w-4"/> : <ShieldAlert className="h-4 w-4"/>}
              {verdict.safe ? "Decision safe — may execute." : `Blocked: ${verdict.reason ?? "unsafe"}`}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audited decision ledger</CardTitle>
          <CardDescription>Real, tenant-scoped events. {busy ? "Refreshing…" : `${data.ledgerCount} entries`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.recentLedger.length === 0 ? (
            <div className="text-sm text-text-muted flex items-center gap-2">
              <Activity className="h-4 w-4" />
              No decision events yet — a fresh organization starts empty. Record one above.
            </div>
          ) : (
            data.recentLedger.map((e: FinancialLedgerEntry) => (
              <div key={e.id} className="flex items-start justify-between gap-3 border-b border-border/40 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={e.status} />
                    <span className={`text-xs font-medium ${e.safe ? "text-emerald-400" : "text-amber-400"}`}>
                      {e.safe ? "SAFE" : "BLOCKED"}
                    </span>
                    <span className="text-xs text-text-muted">{fmtDate(e.createdAt)}</span>
                  </div>
                  <div className="text-sm mt-1 truncate">{e.source}</div>
                  {e.reason && <div className="text-xs text-text-muted truncate">{e.reason}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-text-muted">{e.provider ?? "—"}</span>
                  <button
                    className="text-text-muted hover:text-red-400"
                    onClick={() => void removeEntry(e.id)}
                    aria-label="delete entry"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default FinancialPage;
