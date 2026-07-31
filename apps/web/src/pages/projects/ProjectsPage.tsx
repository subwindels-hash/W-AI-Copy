/**
 * Session 84 — Project Continuity Engine dashboard (S84.13).
 * Upload an existing project archive → safe intake → extract → inventory →
 * verify → sandboxed build/typecheck/test gate → snapshots/diff/rollback.
 * Every stage surfaces real results; sandbox shows "not configured" honestly
 * until PC_SANDBOX_MODE is set on the server.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { projectsApi } from "@/lib/projectContinuity";
import type { PcProject, PcSnapshot, PcDiffResult, PcChangeLogEntry, PcHealthReport, PcArchitectureMap, PcSandboxResult, PcVerification, PcInventory } from "@/lib/projectContinuity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { DataBanner } from "@/components/ui/DataBanner";
import {
  FolderKanban, Upload, Loader2, CheckCircle2, AlertTriangle, Boxes, FileSearch,
  ShieldAlert, History, GitCompareArrows, RotateCcw, Trash2, Network, FlaskConical, Activity,
} from "lucide-react";

const STATUS_BADGE: Record<PcProject["status"], { cls: string; label: string }> = {
  accepted: { cls: "bg-azure/15 text-azure border-azure/30", label: "Accepted" },
  quarantined: { cls: "bg-rose-500/15 text-rose-300 border-rose-500/30", label: "Quarantined" },
  rejected: { cls: "bg-white/10 text-text-muted border-white/20", label: "Rejected" },
  extracted: { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", label: "Extracted" },
};

function fmtBytes(n: number): string {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

const VERDICT: Record<string, { cls: string; label: string }> = {
  ok: { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", label: "Safe" },
  bomb: { cls: "bg-rose-500/15 text-rose-300 border-rose-500/30", label: "Bomb" },
  unsafe: { cls: "bg-rose-500/15 text-rose-300 border-rose-500/30", label: "Unsafe paths" },
  invalid: { cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", label: "Invalid" },
  tool_missing: { cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", label: "Tool missing" },
};

export function ProjectsPage() {
  const [projects, setProjects] = useState<PcProject[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Detail state
  const [inventory, setInventory] = useState<PcInventory | null>(null);
  const [verification, setVerification] = useState<PcVerification | null>(null);
  const [health, setHealth] = useState<PcHealthReport | null>(null);
  const [arch, setArch] = useState<PcArchitectureMap | null>(null);
  const [sandbox, setSandbox] = useState<PcSandboxResult | null>(null);
  const [snapshots, setSnapshots] = useState<PcSnapshot[]>([]);
  const [diff, setDiff] = useState<PcDiffResult | null>(null);
  const [diffFrom, setDiffFrom] = useState("");
  const [diffTo, setDiffTo] = useState("");
  const [changelog, setChangelog] = useState<PcChangeLogEntry[]>([]);
  const [tab, setTab] = useState<"overview" | "architecture" | "verify" | "snapshots" | "log">("overview");

  const refresh = useCallback(async () => {
    try {
      const list = await projectsApi.list();
      setProjects(list);
      if (list.length === 0) setSelectedId(null);
      else setSelectedId((cur) => cur ?? list[0]!.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const [p, snaps, log] = await Promise.all([
        projectsApi.get(id),
        projectsApi.snapshots(id).catch(() => [] as PcSnapshot[]),
        projectsApi.changelog(id).catch(() => [] as PcChangeLogEntry[]),
      ]);
      setSnapshots(snaps);
      setChangelog(log);
      if (p.inventory) setInventory(p.inventory);
      if (p.verification) setVerification(p.verification);
      if (p.sandboxValidation) setSandbox(p.sandboxValidation);
      if (p.architecture) setArch(p.architecture);
      if (p.health) setHealth(p.health);
      if (snaps.length >= 2) { setDiffFrom(snaps[snaps.length - 2]!.id); setDiffTo(snaps[snaps.length - 1]!.id); }
      setSelectedId(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selected = useMemo(() => projects?.find((p) => p.id === selectedId) ?? null, [projects, selectedId]);

  const run = useCallback(async (action: string, fn: () => Promise<unknown>, refreshDetail = true) => {
    setBusy(action); setErr(null); setNotice(null);
    try {
      const res = await fn();
      setNotice(typeof res === "string" ? res : `${action} completed.`);
      if (refreshDetail && selectedId) await loadDetail(selectedId);
      else await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }, [selectedId, loadDetail, refresh]);

  const upload = useCallback(async () => {
    if (!file) return;
    setUploading(true); setErr(null); setNotice(null);
    try {
      const created = await projectsApi.intake(file);
      setNotice(created.status === "quarantined"
        ? "Archive quarantined — review the findings before release."
        : `Archive accepted (${fmtBytes(created.sizeBytes)}). Next: extract.`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
      setSelectedId(created.id);
      await loadDetail(created.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setUploading(false); }
  }, [file, refresh, loadDetail]);

  const pipeline = useCallback(async (id: string, stages: Array<"extract" | "inventory" | "verify" | "sandbox">) => {
    setBusy("pipeline"); setErr(null); setNotice(null);
    try {
      for (const s of stages) {
        if (s === "extract") await projectsApi.extract(id);
        if (s === "inventory") await projectsApi.inventory(id);
        if (s === "verify") await projectsApi.verify(id);
        if (s === "sandbox") await projectsApi.sandbox(id);
      }
      setNotice("Pipeline stages completed.");
      await loadDetail(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }, [loadDetail]);

  const makeSnapshot = useCallback(async () => {
    if (!selectedId) return;
    await run("snapshot", async () => {
      const s = await projectsApi.snapshot(selectedId);
      return `Snapshot ${s.id} — ${s.files} files, ${fmtBytes(s.totalBytes)}.`;
    });
  }, [selectedId, run]);

  const doDiff = useCallback(async () => {
    if (!selectedId || !diffFrom || !diffTo) return;
    await run("diff", () => projectsApi.diff(selectedId, diffFrom, diffTo).then((d) => {
      setDiff(d);
      return `Diff: +${d.added} −${d.removed} ~${d.changed}`;
    }), false);
  }, [selectedId, diffFrom, diffTo, run]);

  const doRollback = useCallback(async (snapshotId: string) => {
    if (!selectedId || !window.confirm(`Roll back to snapshot ${snapshotId}? The workspace is reset and you must re-extract.`)) return;
    await run("rollback", async () => {
      await projectsApi.rollback(selectedId, snapshotId);
      setArch(null); setInventory(null); setVerification(null); setSandbox(null); setHealth(null); setDiff(null);
      return `Rolled back to ${snapshotId}.`;
    });
  }, [selectedId, run]);

  const doDelete = useCallback(async () => {
    if (!selectedId || !window.confirm("Delete this project permanently?")) return;
    await run("delete", async () => { await projectsApi.remove(selectedId!); setSelectedId(null); return "Project deleted."; });
  }, [selectedId, run]);

  const quarantineAction = useCallback(async (id: string, action: "release" | "delete") => {
    await run(action === "release" ? "release" : "delete", async () => {
      if (action === "release") { await projectsApi.quarantineRelease(id); return "Quarantine released — project accepted."; }
      await projectsApi.quarantineDelete(id);
      setSelectedId(null);
      return "Quarantined project deleted.";
    });
  }, [run]);

  const selectProject = useCallback((id: string) => {
    setTab("overview");
    setDiff(null);
    void loadDetail(id);
  }, [loadDetail]);

  const runStatus = (s?: { status: string }): { cls: string; label: string } => {
    const st = s?.status ?? "not_configured";
    if (st === "passed") return { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", label: "Passed" };
    if (st === "failed" || st === "timeout") return { cls: "bg-rose-500/15 text-rose-300 border-rose-500/30", label: st };
    return { cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", label: "Not configured" };
  };

  return (
    <div className="space-y-5 p-1">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2"><FolderKanban className="h-6 w-6 text-azure"/> Project Continuity</h1>
          <p className="text-sm text-text-muted mt-1">Import an existing codebase → inspect → extract → verify → build on it. No assumptions about empty projects.</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-azure"/> Upload existing project</CardTitle><CardDescription>ZIP / TAR / TAR.GZ / 7Z (25 MB cap). Inspected before extraction: entry-count and uncompressed-size limits, traversal/symlink rejection, secret + optional ClamAV scan.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".zip,.tar,.tgz,.gz,.7z,application/zip,application/x-tar,application/gzip" className="text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-white/5 file:px-3 file:py-1.5 file:text-sm file:text-text-bright hover:file:bg-white/10" onChange={(e) => setFile(e.target.files?.[0] ?? null)}/>
          <Button onClick={upload} disabled={!file || uploading} className="gap-2">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Upload className="h-4 w-4"/>} {file ? `Upload ${file.name}` : "Upload"}
          </Button>
          {file && <span className="text-xs text-text-muted">{fmtBytes(file.size)}</span>}
        </CardContent>
      </Card>

      {err && <DataBanner variant="no-creds" title="PROJECT CONTINUITY" message={err}/>}
      {notice && !err && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0"/> {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Projects</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto">
            {!projects && <div className="text-sm text-text-muted">Loading…</div>}
            {projects?.length === 0 && <div className="text-sm text-text-muted">No projects yet. Upload an archive to begin.</div>}
            {projects?.map((p) => (
              <div key={p.id} className={`p-2.5 rounded-lg border cursor-pointer transition-colors ${p.id === selectedId ? "border-azure/50 bg-azure/10" : "border-white/10 bg-white/[0.03] hover:border-white/30"}`} onClick={() => selectProject(p.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate">{p.filename}</span>
                  <Badge className={STATUS_BADGE[p.status].cls}>{STATUS_BADGE[p.status].label}</Badge>
                </div>
                <div className="text-[11px] text-text-muted mt-1">
                  {p.archiveKind} · {fmtBytes(p.sizeBytes)} · {p.createdAt.slice(0, 10)}
                  {p.inspection?.verdict && p.inspection.verdict !== "ok" && (
                    <span className="block mt-0.5 text-rose-300">⚠ {VERDICT[p.inspection.verdict]?.label ?? p.inspection.verdict}</span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {selected && (
          <div className="lg:col-span-3 space-y-4">
            <Card>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">{selected.filename}
                    <Badge className={STATUS_BADGE[selected.status].cls}>{STATUS_BADGE[selected.status].label}</Badge>
                    {selected.inspection && <Badge variant="outline" className={VERDICT[selected.inspection.verdict]?.cls}>{VERDICT[selected.inspection.verdict]?.label}</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {selected.archiveKind} · {fmtBytes(selected.sizeBytes)} · sha256 {selected.sha256.slice(0, 16)}… · next: {selected.nextStep}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.status === "quarantined" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => quarantineAction(selected.id, "release")} disabled={busy === "release"} className="gap-1 h-8 text-xs"><ShieldAlert className="h-3 w-3"/> Release</Button>
                      <Button size="sm" variant="outline" onClick={() => quarantineAction(selected.id, "delete")} disabled={busy === "delete"} className="gap-1 h-8 text-xs text-rose-300"><Trash2 className="h-3 w-3"/> Delete</Button>
                    </>
                  )}
                  {selected.status === "accepted" && (
                    <Button size="sm" onClick={() => pipeline(selected.id, ["extract"])} disabled={busy === "pipeline"} className="gap-1 h-8 text-xs"><Boxes className="h-3 w-3"/> Extract</Button>
                  )}
                  {selected.status === "extracted" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => pipeline(selected.id, ["inventory", "verify"])} disabled={busy === "pipeline"} className="gap-1 h-8 text-xs"><FileSearch className="h-3 w-3"/> Inventory + Verify</Button>
                      <Button size="sm" variant="outline" onClick={() => pipeline(selected.id, ["sandbox"])} disabled={busy === "pipeline"} className="gap-1 h-8 text-xs"><FlaskConical className="h-3 w-3"/> Run sandbox gate</Button>
                      <Button size="sm" variant="outline" onClick={makeSnapshot} disabled={busy === "snapshot"} className="gap-1 h-8 text-xs"><Activity className="h-3 w-3"/> Snapshot</Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" onClick={doDelete} disabled={busy === "delete"} className="gap-1 h-8 text-xs text-rose-300"><Trash2 className="h-3 w-3"/> Delete</Button>
                </div>
              </CardHeader>
              <CardContent>
                {selected.quarantine && (
                  <DataBanner variant="no-creds" title="QUARANTINED — ENCRYPTED AT REST" message={`${selected.quarantine.reason ?? "High-severity findings"} · expires ${selected.quarantine.expiresAt?.slice(0, 10) ?? "—"}. Review and release, or delete.`}/>
                )}
                <div className="flex gap-1 flex-wrap mt-1">
                  {(["overview", "architecture", "verify", "snapshots", "log"] as const).map((t) => (
                    <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${tab === t ? "bg-azure/20 text-azure" : "text-text-muted hover:bg-white/5"}`}>{t}</button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {tab === "overview" && <OverviewTab selected={selected} health={health} sandbox={sandbox} onLoadHealth={() => run("health", async () => { setHealth(await projectsApi.health(selected.id)); return "Health report generated."; }, false)} runStatus={runStatus} fmtBytes={fmtBytes} />}
            {tab === "architecture" && <ArchitectureTab arch={arch} inventory={inventory} onMap={() => run("map", async () => { setArch(await projectsApi.architecture(selected.id)); return "Architecture map inferred from the inventory."; }, false)} />}
            {tab === "verify" && <VerifyTab verification={verification} sandbox={sandbox} inventory={inventory} onRefresh={() => void loadDetail(selected.id)} />}
            {tab === "snapshots" && <SnapshotsTab snapshots={snapshots} diff={diff} diffFrom={diffFrom} diffTo={diffTo} setDiffFrom={setDiffFrom} setDiffTo={setDiffTo} onSnapshot={makeSnapshot} onDiff={doDiff} onRollback={doRollback} busy={busy} fmtBytes={fmtBytes} />}
            {tab === "log" && <LogTab log={changelog} />}
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewTab({ selected, health, sandbox, onLoadHealth, runStatus, fmtBytes }: {
  selected: PcProject; health: PcHealthReport | null; sandbox: PcSandboxResult | null;
  onLoadHealth: () => void; runStatus: (s?: { status: string }) => { cls: string; label: string }; fmtBytes: (n: number) => string;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm">Health report</CardTitle><Button size="sm" variant="outline" onClick={onLoadHealth} className="h-7 text-xs">Generate</Button></CardHeader>
        <CardContent>
          {!health && <div className="text-xs text-text-muted">Generate the aggregate health report (completion status, technical debt, build/test/typecheck, DB, security, recommended build order).</div>}
          {health && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Stat label="Project" value={health.projectStatus.type || "—"} sub={health.projectStatus.framework} />
              <Stat label="Completion" value={health.completion.status} sub={health.completion.verified ? "verified" : "not verified"} />
              <Stat label="Tech debt" value={health.technicalDebt} tone={health.technicalDebt === "high" ? "rose" : health.technicalDebt === "medium" ? "amber" : "emerald"} />
              <Stat label="Architecture" value={health.projectStatus.architecture || "—"} sub={health.projectStatus.languages.join(", ")} />
            </div>
          )}
          {health && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Gate name="Typecheck" badge={runStatus({ status: health.typecheck })} />
              <Gate name="Build" badge={runStatus({ status: health.build })} />
              <Gate name="Tests" badge={runStatus({ status: health.tests })} />
              <div className="p-2 rounded-lg border border-white/10 bg-white/5">
                <div className="text-text-muted uppercase tracking-wider text-[10px]">DB · security · deploy</div>
                <div className="mt-1 text-text-bright">{health.database.present ? `DB: ${health.database.kind}` : "No DB"}</div>
                <div className="text-text-muted">{health.security.highSeverityFindings} high findings{health.security.quarantined ? " · quarantined" : ""} · clamav {health.security.clamav}</div>
                <div className="text-text-muted">{health.deployment.present ? `deploy: ${health.deployment.kinds.join(", ")}` : "no deploy config"}</div>
              </div>
            </div>
          )}
          {health && health.recommendedBuildOrder.length > 0 && (
            <ol className="mt-3 space-y-1 text-xs text-text-muted">
              {health.recommendedBuildOrder.map((s, i) => <li key={i} className="flex gap-2"><span className="text-azure">{i + 1}.</span>{s}</li>)}
            </ol>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Inspection (pre-extraction)</CardTitle></CardHeader>
        <CardContent className="text-xs text-text-muted space-y-1">
          {selected.inspection ? (
            <>
              <div>{selected.inspection.entries} entries · {fmtBytes(selected.inspection.totalUncompressedBytes)} uncompressed · largest {fmtBytes(selected.inspection.maxEntryBytes)}</div>
              <div>limits: {selected.inspection.limits.maxEntries} entries · {selected.inspection.limits.maxUncompressedMb} MB total · {selected.inspection.limits.maxEntryMb} MB per entry</div>
              {selected.inspection.unsafeEntries.length > 0 && <div className="text-rose-300">{selected.inspection.unsafeEntries.length} unsafe entr{(selected.inspection.unsafeEntries.length === 1 ? "y" : "ies")}: {selected.inspection.unsafeEntries.slice(0, 3).map((u) => u.name).join(", ")}</div>}
              {selected.inspection.note && <div className="text-amber-300">{selected.inspection.note}</div>}
            </>
          ) : <div>Not inspected.</div>}
          {selected.findings.length > 0 && (
            <div className="pt-2 border-t border-white/5">
              {selected.findings.map((f, i) => (
                <div key={i} className={`flex gap-2 ${f.severity === "high" ? "text-rose-300" : f.severity === "medium" ? "text-amber-300" : "text-text-muted"}`}>
                  <span className="shrink-0">{f.kind}</span><span>{f.message}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ArchitectureTab({ arch, inventory, onMap }: { arch: PcArchitectureMap | null; inventory: PcInventory | null; onMap: () => void }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2"><Network className="h-4 w-4 text-azure"/> Architecture map</CardTitle>
        <Button size="sm" variant="outline" onClick={onMap} className="h-7 text-xs">Infer from inventory</Button>
      </CardHeader>
      <CardContent>
        {!arch && <div className="text-xs text-text-muted">{inventory ? "Inventory loaded — infer the map." : "Run Inventory + Verify first."}</div>}
        {arch && (
          <div className="space-y-4">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">method: {arch.method} · inferred {arch.inferredAt.slice(0, 16).replace("T", " ")}</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {arch.nodes.map((n) => (
                <div key={n.id} className="p-3 rounded-lg border border-white/10 bg-white/[0.03]">
                  <div className="font-semibold text-sm flex items-center gap-2"><Badge variant="outline" className="capitalize">{n.kind}</Badge> {n.label}</div>
                  <div className="text-[11px] text-text-muted mt-1">{n.evidence.join(" · ")}</div>
                </div>
              ))}
            </div>
            {arch.edges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {arch.edges.map((e, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-md border border-azure/25 bg-azure/5 text-azure font-mono">{e.from} → {e.to} <span className="text-text-muted">({e.label})</span></span>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VerifyTab({ verification, sandbox, inventory, onRefresh }: { verification: PcVerification | null; sandbox: PcSandboxResult | null; inventory: PcInventory | null; onRefresh: () => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2"><FileSearch className="h-4 w-4 text-azure"/> Static verification</CardTitle>
          <Button size="sm" variant="outline" onClick={onRefresh} className="h-7 text-xs">Refresh</Button>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          {!verification && <div className="text-text-muted">Not verified yet — run Inventory + Verify above.</div>}
          {verification && (
            <>
              <div className="flex gap-2">
                <Badge variant="outline">{verification.status}</Badge>
                <Badge variant="outline">{verification.summary.high} high</Badge>
                <Badge variant="outline">{verification.summary.medium} medium</Badge>
                <Badge variant="outline">{verification.summary.low} low</Badge>
              </div>
              <ul className="space-y-1">
                {verification.findings.slice(0, 30).map((f, i) => (
                  <li key={i} className={`flex gap-2 ${f.severity === "high" ? "text-rose-300" : f.severity === "medium" ? "text-amber-300" : "text-text-muted"}`}>
                    <span className="shrink-0 font-mono">{f.kind}</span>
                    <span className="truncate">{f.message}</span>
                    {f.file && <span className="text-text-muted shrink-0">{f.file}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FlaskConical className="h-4 w-4 text-azure"/> Sandboxed gate (build / typecheck / tests)</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-2">
          {!sandbox && <div className="text-text-muted">Not run — press "Run sandbox gate". Requires PC_SANDBOX_MODE=docker|local on the server; otherwise stages report not_configured honestly.</div>}
          {sandbox && (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="outline">mode: {sandbox.mode}</Badge>
                <Badge className={sandbox.overall === "passed" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : sandbox.overall === "failed" ? "bg-rose-500/15 text-rose-300 border-rose-500/30" : "bg-amber-500/15 text-amber-300 border-amber-500/30"}>{sandbox.overall}</Badge>
              </div>
              {sandbox.stages.map((s, i) => (
                <div key={i} className="p-2 rounded-lg border border-white/10 bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-text-bright">{s.command}</code>
                    <Badge className={s.status === "passed" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : s.status === "failed" || s.status === "timeout" ? "bg-rose-500/15 text-rose-300 border-rose-500/30" : "bg-amber-500/15 text-amber-300 border-amber-500/30"}>{s.status}</Badge>
                  </div>
                  {s.note && <div className="text-text-muted mt-1">{s.note}</div>}
                  {s.outputTail && s.status !== "passed" && <pre className="mt-1 text-[10px] text-rose-300/80 whitespace-pre-wrap max-h-24 overflow-y-auto">{s.outputTail.slice(-1200)}</pre>}
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>
      {inventory && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Inventory</CardTitle></CardHeader>
          <CardContent className="text-xs text-text-muted space-y-1">
            <div>{inventory.totalFiles} files · {Object.entries(inventory.languages).map(([l, n]) => `${l} (${n})`).join(" · ")}</div>
            <div>manifests: {inventory.manifests.join(", ") || "none"} · tests: {inventory.testFiles.length} file(s)</div>
            {inventory.packages.map((p) => (
              <div key={p.file} className="pt-1">
                <code className="text-text-bright">{p.file}</code>
                <div className="text-text-muted">scripts: {p.scripts.join(", ") || "—"} · deps: {p.dependencies.slice(0, 8).join(", ")}{p.dependencies.length > 8 ? "…" : ""}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SnapshotsTab({ snapshots, diff, diffFrom, diffTo, setDiffFrom, setDiffTo, onSnapshot, onDiff, onRollback, busy, fmtBytes }: {
  snapshots: PcSnapshot[]; diff: PcDiffResult | null; diffFrom: string; diffTo: string;
  setDiffFrom: (s: string) => void; setDiffTo: (s: string) => void;
  onSnapshot: () => void; onDiff: () => void; onRollback: (id: string) => void; busy: string | null; fmtBytes: (n: number) => string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4 text-azure"/> Snapshots &amp; rollback</CardTitle>
        <Button size="sm" variant="outline" onClick={onSnapshot} disabled={busy === "snapshot"} className="gap-1 h-7 text-xs"><Activity className="h-3 w-3"/> Snapshot current state</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {snapshots.length === 0 && <div className="text-xs text-text-muted">No snapshots yet. Snapshot after a successful extract to create a rollback point.</div>}
        <ul className="space-y-2">
          {snapshots.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-white/10 bg-white/[0.03] text-xs">
              <div>
                <div className="text-text-bright font-mono">{s.id}</div>
                <div className="text-text-muted">{s.createdAt.slice(0, 19).replace("T", " ")} · {s.files} files · {fmtBytes(s.totalBytes)}{s.note ? ` · ${s.note}` : ""}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => onRollback(s.id)} disabled={busy === "rollback"} className="gap-1 h-7 text-xs text-amber-300"><RotateCcw className="h-3 w-3"/> Roll back</Button>
            </li>
          ))}
        </ul>
        {snapshots.length >= 2 && (
          <div className="pt-2 border-t border-white/5 space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-text-muted flex items-center gap-1"><GitCompareArrows className="h-3 w-3"/> Diff snapshots</div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={diffFrom} onChange={(e) => setDiffFrom(e.target.value)} className="w-56">
                {snapshots.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
              </Select>
              <span className="text-text-muted">→</span>
              <Select value={diffTo} onChange={(e) => setDiffTo(e.target.value)} className="w-56">
                {snapshots.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
              </Select>
              <Button size="sm" variant="outline" onClick={onDiff} disabled={busy === "diff"} className="h-7 text-xs">Diff</Button>
            </div>
            {diff && (
              <div className="text-xs space-y-1">
                <div className="flex gap-2">
                  <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">+{diff.added} added</Badge>
                  <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/30">−{diff.removed} removed</Badge>
                  <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30">~{diff.changed} changed</Badge>
                </div>
                <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                  {diff.entries.map((e, i) => (
                    <li key={i} className={`flex gap-2 ${e.kind === "added" ? "text-emerald-300" : e.kind === "removed" ? "text-rose-300" : "text-amber-300"}`}>
                      <span className="shrink-0 font-mono">{e.kind === "added" ? "+" : e.kind === "removed" ? "−" : "~"}</span>
                      <span className="truncate">{e.path}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogTab({ log }: { log: PcChangeLogEntry[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Change log</CardTitle></CardHeader>
      <CardContent>
        {log.length === 0 && <div className="text-xs text-text-muted">No activity recorded.</div>}
        <ul className="space-y-1.5">
          {log.map((e) => (
            <li key={e.id} className="text-xs flex items-start justify-between gap-3 py-1 border-b border-white/5 last:border-0">
              <div className="flex items-start gap-2 min-w-0">
                <Badge variant="outline" className="capitalize shrink-0">{e.action}</Badge>
                <span className="text-text-muted truncate">{e.summary}</span>
              </div>
              <span className="text-text-muted shrink-0">{e.at.slice(0, 19).replace("T", " ")}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "rose" | "amber" | "emerald" }) {
  const color = tone === "rose" ? "text-rose-300" : tone === "amber" ? "text-amber-300" : tone === "emerald" ? "text-emerald-300" : "text-text-bright";
  return (
    <div className="p-2 rounded-lg border border-white/10 bg-white/[0.03]">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className={`text-sm font-semibold truncate ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-text-muted truncate">{sub}</div>}
    </div>
  );
}

function Gate({ name, badge }: { name: string; badge: { cls: string; label: string } }) {
  return (
    <div className="p-2 rounded-lg border border-white/10 bg-white/5">
      <div className="text-text-muted uppercase tracking-wider text-[10px]">{name}</div>
      <div className="mt-1"><Badge className={badge.cls}>{badge.label}</Badge></div>
    </div>
  );
}

export default ProjectsPage;
