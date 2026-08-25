/**
 * WINDELS AI OS — Updates & Lifecycle Management console.
 *
 * Check for updates, validate, approve and deploy packages across channels,
 * with rollback. Current version/channel come from the update service.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ArrowDownToLine, CheckCircle2, RotateCcw, Search, X } from "lucide-react";
import type { UpdatePackage, UpdateDashboard, UpdateValidation, UpdateChannel } from "@windels/shared";
import { UPDATE_CHANNELS } from "@windels/shared";
import { updatesApi } from "@/lib/updates";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function statusTone(s?: string): any {
  return s === "deployed" || s === "approved" ? "emerald"
    : s === "deploying" || s === "downloading" || s === "staged" ? "azure"
    : s === "failed" ? "crimson"
    : s === "paused" || s === "rolled_back" ? "amber" : "slate";
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-sm text-text-muted">{label}</div>
    </CardContent></Card>
  );
}

export function UpdatesPage() {
  const [dash, setDash] = useState<UpdateDashboard | null>(null);
  const [packages, setPackages] = useState<UpdatePackage[]>([]);
  const [validation, setValidation] = useState<UpdateValidation | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, p] = await Promise.all([updatesApi.dashboard(), updatesApi.list()]);
      setDash(d); setPackages(p);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function check() {
    setErr(null);
    try {
      const found = await updatesApi.check();
      setPackages(found); await load();
    } catch (e: any) { setErr(e?.message ?? "Check failed"); }
  }

  async function act(id: string, kind: "validate" | "approve" | "deploy" | "rollback") {
    setErr(null); setValidation(null);
    try {
      if (kind === "validate") setValidation(await updatesApi.validate(id));
      else if (kind === "approve") await updatesApi.approve(id);
      else if (kind === "deploy") await updatesApi.deploy(id);
      else await updatesApi.rollback(id);
      await load();
    } catch (e: any) { setErr(e?.message ?? `Action failed (${kind})`); }
  }

  async function setChannel(ch: UpdateChannel) {
    setErr(null);
    try { await updatesApi.setChannel(ch); await load(); } catch (e: any) { setErr(e?.message ?? "Channel failed"); }
  }

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading updates…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><ArrowDownToLine className="h-6 w-6 text-azure" /> Updates &amp; Lifecycle</h1>
          <p className="text-sm text-text-muted">Current version <strong>{dash.currentVersion}</strong> · channel <strong>{dash.channel}</strong></p>
        </div>
        <Button variant="outline" onClick={() => void check()}><Search className="h-4 w-4 mr-1"/>Check for updates</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Available" value={dash.availableUpdates} />
        <Stat label="Pending approval" value={dash.pendingApproval} />
        <Stat label="Deploying" value={dash.deploying} />
        <Stat label="Deployed (7d)" value={dash.deployedLast7d} />
      </div>

      <Card>
        <CardHeader><CardTitle>Release channel</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          {UPDATE_CHANNELS.map((c) => (
            <Button key={c} variant={dash.channel === c ? "primary" : "outline"} onClick={() => void setChannel(c)}>{c}</Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Update packages ({packages.length})</CardTitle><CardDescription>{busy ? "Refreshing…" : ""}</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {packages.length === 0 ? (
            <div className="text-sm text-text-muted">No update packages.</div>
          ) : packages.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{p.name}</span>
                  <Badge variant="outline">v{p.version}{p.fromVersion ? ` ← ${p.fromVersion}` : ""}</Badge>
                  <Badge variant="outline">{p.category}</Badge>
                  <Badge variant="outline">{p.channel}</Badge>
                  <Badge variant={statusTone(p.status)}>{p.status ?? "available"}</Badge>
                  {p.signed && <Badge variant="emerald">signed</Badge>}
                </div>
                {p.changelog && <div className="text-xs text-text-muted truncate mt-0.5">{p.changelog}</div>}
              </div>
              <div className="flex gap-2 shrink-0">
                {p.status !== "deployed" && <Button size="sm" variant="outline" onClick={() => void act(p.id, "validate")}>Validate</Button>}
                {p.status !== "approved" && p.status !== "deployed" && <Button size="sm" variant="outline" onClick={() => void act(p.id, "approve")}>Approve</Button>}
                {p.status !== "deployed" && <Button size="sm" variant="outline" onClick={() => void act(p.id, "deploy")}><CheckCircle2 className="h-3 w-3 mr-1"/>Deploy</Button>}
                {p.status === "deployed" && <Button size="sm" variant="outline" onClick={() => void act(p.id, "rollback")}><RotateCcw className="h-3 w-3 mr-1"/>Rollback</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {validation && (
        <Card>
          <CardHeader><CardTitle>Validation result</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant={validation.passed ? "emerald" : "crimson"}>{validation.passed ? "PASSED" : "FAILED"}</Badge>
              <span className="text-text-muted text-xs">{validation.ranAt} · {validation.durationMs}ms</span>
            </div>
            {validation.checks.map((c, i) => (
              <div key={i} className="text-xs text-text-muted">
                {c.label}: {c.skipped ? "skipped" : c.passed ? "ok" : "failed"}{c.detail ? ` — ${c.detail}` : ""}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default UpdatesPage;
