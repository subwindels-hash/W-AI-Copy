/**
 * Session 89 — Tenant Isolation & Cross-Tenant Data Governance dashboard.
 * Per-org isolation policy, live namespace audit, real cross-tenant self-tests
 * and the export gate. Every number shown is a real, measured result from the
 * API — no fabricated posture.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { tenantIsolationApi } from "@/lib/tenantIsolation";
import type { TiIsolationPolicy, TiComplianceRun, TiNamespaceAudit, TiFinding, TiProbeResult } from "@/lib/tenantIsolation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { ShieldCheck, ShieldAlert, Lock, PlayCircle, Save, History, SearchCheck, Share2 } from "lucide-react";

function statusBadge(status: TiComplianceRun["status"]) {
  if (status === "compliant") return { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", label: "Compliant" };
  if (status === "review_required") return { cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", label: "Review required" };
  return { cls: "bg-rose-500/15 text-rose-300 border-rose-500/30", label: "Failed" };
}

function severityCls(s: TiFinding["severity"]) {
  return s === "high" ? "text-rose-300" : s === "medium" ? "text-amber-300" : "text-text-muted";
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 90 ? "text-emerald-300" : score >= 70 ? "text-amber-300" : "text-rose-300";
  return (
    <div className="flex items-baseline gap-1">
      <span className={`text-4xl font-black ${color}`}>{score}</span>
      <span className="text-text-muted text-sm">/100</span>
    </div>
  );
}

export function TenantIsolationPage() {
  const [policy, setPolicy] = useState<TiIsolationPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<TiComplianceRun | null>(null);
  const [runs, setRuns] = useState<TiComplianceRun[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([tenantIsolationApi.getPolicy(), tenantIsolationApi.listRuns()]);
      setPolicy(p);
      setRuns(h);
      setRun(h[0] ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    if (!policy) return;
    setSaving(true); setErr(null); setNotice(null);
    try {
      const saved = await tenantIsolationApi.updatePolicy({
        allowCrossTenantExport: policy.allowCrossTenantExport,
        allowExternalSharing: policy.allowExternalSharing,
        piiRedactionLevel: policy.piiRedactionLevel,
        retentionDays: policy.retentionDays,
        regionPin: policy.regionPin,
      });
      setPolicy(saved);
      setNotice("Isolation policy saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  }, [policy]);

  const runCompliance = useCallback(async () => {
    setRunning(true); setErr(null); setNotice(null);
    try {
      const r = await tenantIsolationApi.runCompliance();
      setRun(r);
      setRuns((prev) => [r, ...prev]);
      setNotice(`Compliance run ${r.id} — ${r.status} (${r.score}/100).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setRunning(false); }
  }, []);

  const testExport = useCallback(async () => {
    if (!policy) return;
    setErr(null); setNotice(null);
    try {
      const res = await tenantIsolationApi.exportCheck("patient-records");
      setExportResult(`${res.dataset}: ${res.allowed ? "ALLOWED" : "BLOCKED"} — ${res.reason}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [policy]);

  const probeTone = (p: TiProbeResult) =>
    p.passed ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-rose-500/15 text-rose-300 border-rose-500/30";

  const namespaceTone = (n: TiNamespaceAudit) =>
    n.leakedKeys.length > 0 ? "border-rose-500/30 bg-rose-500/5" : "border-white/10 bg-white/[0.03]";

  const policySummary = useMemo(() => {
    if (!policy) return null;
    return {
      high: policy.piiRedactionLevel === "none" ? 1 : 0,
      medium: (policy.allowCrossTenantExport ? 1 : 0) + (policy.allowExternalSharing ? 1 : 0),
      low: policy.retentionDays < 30 ? 1 : 0,
    };
  }, [policy]);

  return (
    <div className="space-y-5 p-1">
      <div>
        <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-azure" /> Tenant Isolation &amp; Data Governance
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Cross-tenant data leakage is the #1 risk on a shared platform. Configure per-org isolation policy, run a live
          namespace audit and real cross-tenant self-tests, and gate data exports.
        </p>
      </div>

      {err && <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">{err}</div>}
      {notice && <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">{notice}</div>}

      {/* Policy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-azure" /> Organization isolation policy</CardTitle>
          <CardDescription>Stored per organization (Redis key on the Node runtime, MySQL row on the PHP runtime). Defaults are isolated-by-default (no cross-tenant export, basic PII redaction).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {policy ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Switch checked={policy.allowCrossTenantExport} onChange={(v) => setPolicy({ ...policy, allowCrossTenantExport: v })} label="Allow cross-tenant export" />
                <Switch checked={policy.allowExternalSharing} onChange={(v) => setPolicy({ ...policy, allowExternalSharing: v })} label="Allow external sharing" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">PII redaction</label>
                  <Select value={policy.piiRedactionLevel} onChange={(e) => setPolicy({ ...policy, piiRedactionLevel: e.target.value as any })} className="mt-1">
                    <option value="none">None</option>
                    <option value="basic">Basic</option>
                    <option value="strict">Strict</option>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Retention (days)</label>
                  <Input type="number" min={1} max={3650} value={policy.retentionDays} onChange={(e) => setPolicy({ ...policy, retentionDays: Number(e.target.value) })} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Region pin</label>
                  <Input placeholder="e.g. eu-central-1 (optional)" value={policy.regionPin ?? ""} onChange={(e) => setPolicy({ ...policy, regionPin: e.target.value || undefined })} className="mt-1" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={save} disabled={saving} className="gap-1"><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save policy"}</Button>
                <Button variant="outline" onClick={testExport} className="gap-1"><Share2 className="h-4 w-4" /> Test export gate</Button>
                {exportResult && <span className="text-xs text-text-muted">{exportResult}</span>}
              </div>
              {policySummary && (
                <div className="flex gap-2 text-xs">
                  <span className="text-text-muted">Policy posture:</span>
                  <span className={policySummary.high ? "text-rose-300" : "text-emerald-300"}>{policySummary.high} high</span>
                  <span className={policySummary.medium ? "text-amber-300" : "text-emerald-300"}>{policySummary.medium} medium</span>
                  <span className={policySummary.low ? "text-amber-300" : "text-text-muted"}>{policySummary.low} low</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-text-muted">Loading policy…</div>
          )}
        </CardContent>
      </Card>

      {/* Compliance */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><SearchCheck className="h-5 w-5 text-azure" /> Isolation compliance run</CardTitle>
          <Button size="sm" onClick={runCompliance} disabled={running} className="gap-1"><PlayCircle className="h-4 w-4" /> {running ? "Running…" : "Run compliance"}</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!run && <div className="text-sm text-text-muted">No run yet. Press "Run compliance" to audit namespaces and run the cross-tenant self-tests.</div>}
          {run && (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <ScoreRing score={run.score} />
                <Badge className={statusBadge(run.status).cls}>{statusBadge(run.status).label}</Badge>
                <span className="text-xs text-text-muted">ran {run.ranAt.slice(0, 19).replace("T", " ")} · {run.probes.filter((p) => p.passed).length}/{run.probes.length} self-tests passed</span>
              </div>

              <div className="space-y-1">
                {run.probes.map((p) => (
                  <div key={p.name} className="flex items-center justify-between gap-3 p-2 rounded-lg border border-white/10 bg-white/[0.03] text-xs">
                    <div className="min-w-0">
                      <div className="text-text-bright truncate">{p.name}</div>
                      {p.detail && <div className="text-text-muted truncate">{p.detail}</div>}
                    </div>
                    <Badge className={probeTone(p)}>{p.passed ? "PASS" : "FAIL"}</Badge>
                  </div>
                ))}
              </div>

              {run.findings.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-text-muted mb-1">Findings ({run.findings.length})</div>
                  <ul className="space-y-1">
                    {run.findings.map((f, i) => (
                      <li key={i} className="text-xs flex items-start gap-2">
                        <span className={`shrink-0 font-semibold ${severityCls(f.severity)}`}>{f.severity.toUpperCase()}</span>
                        <span className="text-text-muted min-w-0">{f.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="text-[11px] uppercase tracking-wider text-text-muted mb-1">Redis namespace audit</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {run.namespaces.map((n) => (
                    <div key={n.prefix} className={`p-2 rounded-lg border text-xs ${namespaceTone(n)}`}>
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-text-bright">{n.prefix}</code>
                        <Badge variant="outline">{n.scope}</Badge>
                      </div>
                      <div className="text-text-muted mt-1">
                        {n.keyCount} key(s) · {n.conformingKeys} conforming
                        {n.leakedKeys.length > 0 && <span className="text-rose-300"> · {n.leakedKeys.length} leaked</span>}
                      </div>
                      {n.leakedKeys.length > 0 && (
                        <div className="text-rose-300/80 mt-1 font-mono text-[10px] truncate">{n.leakedKeys.slice(0, 3).join(", ")}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><History className="h-4 w-4 text-azure" /> Compliance history</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 && <div className="text-xs text-text-muted">No compliance runs recorded.</div>}
          <ul className="space-y-1.5">
            {runs.slice(0, 20).map((r) => (
              <li key={r.id} className="text-xs flex items-center justify-between gap-3 py-1 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge className={statusBadge(r.status).cls}>{statusBadge(r.status).label}</Badge>
                  <span className="text-text-muted truncate">{r.id}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-text-muted">{r.ranAt.slice(0, 19).replace("T", " ")}</span>
                  <span className="text-text-bright">{r.score}</span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default TenantIsolationPage;
