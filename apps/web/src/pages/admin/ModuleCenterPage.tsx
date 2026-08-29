import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Archive, Box, CheckCircle2, Clock3, FileArchive, HeartPulse, History,
  LockKeyhole, PackageCheck, Play, Power, RefreshCw, RotateCcw, ScrollText, ShieldCheck,
  TestTube2, Trash2, Upload, XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { moduleCenterApi, type ModuleDashboard, type ModuleOperationRow, type ModuleReleaseRow, type ModuleUploadRow, type PlatformModuleRow } from "@/lib/moduleCenter";

function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function badge(status: string): "emerald" | "azure" | "violet" | "amber" | "crimson" | "slate" {
  if (["ACTIVE", "HEALTHY", "SUCCEEDED", "PASSED", "APPROVED", "VALIDATED"].includes(status)) return "emerald";
  if (["SCANNING", "VALIDATING", "INSTALLING", "MIGRATING", "HEALTH_CHECK", "RUNNING"].includes(status)) return "azure";
  if (["UPLOADED", "SANDBOX_TEST", "DISABLED", "PENDING", "UNKNOWN"].includes(status)) return "amber";
  if (["FAILED", "QUARANTINED", "UNHEALTHY", "REMOVED"].includes(status)) return "crimson";
  return "slate";
}
function bytes(value: number) { return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }

export function ModuleCenterPage() {
  const [dashboard, setDashboard] = useState<ModuleDashboard | null>(null);
  const [modules, setModules] = useState<PlatformModuleRow[]>([]);
  const [uploads, setUploads] = useState<ModuleUploadRow[]>([]);
  const [operations, setOperations] = useState<ModuleOperationRow[]>([]);
  const [selected, setSelected] = useState<PlatformModuleRow | null>(null);
  const [selectedOperation, setSelectedOperation] = useState<ModuleOperationRow | null>(null);
  const [tab, setTab] = useState("registry");
  const [file, setFile] = useState<File | null>(null);
  const [checksum, setChecksum] = useState("");
  const [signatureKeyId, setSignatureKeyId] = useState("");
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "rollback" | "remove"; module: PlatformModuleRow } | null>(null);

  const load = useCallback(async () => {
    try {
      const [summary, registry, uploadRows, operationRows] = await Promise.all([moduleCenterApi.dashboard(), moduleCenterApi.modules(), moduleCenterApi.uploads(), moduleCenterApi.operations()]);
      setDashboard(summary); setModules(registry); setUploads(uploadRows); setOperations(operationRows);
      if (selected) setSelected(registry.find((item) => item.id === selected.id) ?? null);
      setError(null);
    } catch (err) { setError(message(err)); }
  }, [selected]);
  useEffect(() => { void load(); }, []);

  async function chooseFile(next: File | null) {
    setFile(next); setChecksum("");
    if (!next) return;
    const digest = await crypto.subtle.digest("SHA-256", await next.arrayBuffer());
    setChecksum([...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join(""));
  }
  async function uploadPackage() {
    if (!file || !signatureKeyId.trim() || !signature.trim()) return;
    setBusy("upload"); setError(null);
    try {
      const result = await moduleCenterApi.upload(file, signatureKeyId.trim(), signature.trim());
      setNotice(`${result.module.name} ${result.release.version} uploaded into quarantine. No package code executed. Run verification next.`);
      setFile(null); setSignature(""); setChecksum(""); setTab("uploads"); await load();
    } catch (err) { setError(message(err)); }
    finally { setBusy(null); }
  }
  async function releaseAction(release: ModuleReleaseRow, action: "verify" | "sandbox-test" | "approve" | "install") {
    setBusy(`${release.id}:${action}`); setError(null);
    try {
      await moduleCenterApi.releaseAction(release.id, action);
      setNotice(`${action.replace("-", " ")} completed. Review the recorded status and evidence before continuing.`);
      await load();
      if (selected) setSelected(await moduleCenterApi.module(selected.id));
    } catch (err) { setError(message(err)); }
    finally { setBusy(null); }
  }
  async function moduleAction(module: PlatformModuleRow, action: "enable" | "disable" | "restart" | "health-check" | "rollback" | "remove") {
    setBusy(`${module.id}:${action}`); setError(null);
    try {
      const updated = await moduleCenterApi.moduleAction(module.id, action);
      setSelected(updated); setNotice(`${module.name}: ${action.replace("-", " ")} operation recorded as ${updated.status}.`);
      setConfirm(null); await load();
    } catch (err) { setError(message(err)); }
    finally { setBusy(null); }
  }
  const latestRelease = selected?.releases?.[0];
  const availableUpdate = useMemo(() => selected?.releases.find((release) => release.status === "APPROVED" && release.version !== selected.currentVersion), [selected]);

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Box className="h-7 w-7 text-violet" /><h1 className="text-2xl font-black text-text-bright">Module & Plugin Center</h1><Badge variant="crimson"><LockKeyhole className="h-3 w-3" />Super Admin only</Badge></div><p className="mt-1 max-w-4xl text-sm text-text-muted">Signed package intake, fail-closed security verification, isolated runner testing, approval, installation, health, versioning, rollback, and safe removal for permanent WINDELS platform extensions.</p></div><Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Refresh</Button></header>

    <div className="rounded-xl border border-azure/30 bg-azure/10 p-4 text-sm text-azure"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Upload never means execute.</strong> Packages remain quarantined until checksum, trusted Ed25519 signature, ClamAV, manifest, permissions, dependencies, migrations, resources, conflicts, isolated tests, explicit approval, installation evidence, and health checks pass.</div></div></div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-crimson/30 bg-crimson/10 p-4 text-sm text-crimson"><XCircle className="h-4 w-4" /><span className="flex-1">{error}</span><button onClick={() => setError(null)}>✕</button></div>}
    {notice && <div className="flex items-start gap-2 rounded-xl border border-emerald/30 bg-emerald/10 p-4 text-sm text-emerald"><CheckCircle2 className="h-4 w-4" /><span className="flex-1">{notice}</span><button onClick={() => setNotice(null)}>✕</button></div>}

    {dashboard && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"><Metric label="Installed" value={dashboard.total} icon={<Archive />} /><Metric label="Active" value={dashboard.active} tone="emerald" icon={<Power />} /><Metric label="Updates" value={dashboard.updatesAvailable} tone="azure" icon={<RefreshCw />} /><Metric label="Approval" value={dashboard.awaitingApproval} tone="amber" icon={<Clock3 />} /><Metric label="Disabled" value={dashboard.disabled} icon={<Power />} /><Metric label="Failed" value={dashboard.failed} tone="crimson" icon={<XCircle />} /><Metric label="Quarantined" value={dashboard.quarantined} tone="crimson" icon={<ShieldCheck />} /></div>}

    {dashboard && (!dashboard.runnerConfigured || !dashboard.scannerConfigured || dashboard.signatureKeysConfigured === 0) && <div className="grid gap-2 md:grid-cols-3">
      <Gate label="Isolated Module Runner" ok={dashboard.runnerConfigured} detail={dashboard.runnerConfigured ? "Configured" : "Install/test/health/rollback actions fail closed"} />
      <Gate label="ClamAV package scanner" ok={dashboard.scannerConfigured} detail={dashboard.scannerConfigured ? "Configured" : "Verification cannot pass"} />
      <Gate label="Trusted publisher keys" ok={dashboard.signatureKeysConfigured > 0} detail={dashboard.signatureKeysConfigured ? `${dashboard.signatureKeysConfigured} key(s)` : "Signatures cannot be trusted"} />
    </div>}

    <Tabs value={tab} onValueChange={setTab}><TabsList className="w-full flex-wrap justify-start"><TabsTrigger value="registry">Module Registry</TabsTrigger><TabsTrigger value="upload">Upload Package</TabsTrigger><TabsTrigger value="uploads">Verification Queue</TabsTrigger><TabsTrigger value="history">Operations & Logs</TabsTrigger></TabsList>
      <TabsContent value="registry" className="space-y-4"><div className="grid gap-4 xl:grid-cols-[1fr_430px]"><Card><CardHeader><CardTitle>Installed and staged modules</CardTitle><CardDescription>Central registry backed by PostgreSQL; no demo modules are generated.</CardDescription></CardHeader><CardContent className="space-y-2">{modules.map((module) => <button key={module.id} onClick={() => setSelected(module)} className={`w-full rounded-xl border p-4 text-left transition ${selected?.id === module.id ? "border-violet/40 bg-violet/10" : "border-white/10 bg-white/5 hover:border-white/20"}`}><div className="flex flex-wrap items-center gap-2"><PackageCheck className="h-5 w-5 text-violet" /><span className="font-semibold text-text-bright">{module.name}</span><Badge variant="secondary">{module.packageType}</Badge><Badge variant={badge(module.status)}>{module.status}</Badge><Badge variant={badge(module.health)}>{module.health}</Badge><span className="ml-auto text-xs text-text-muted">{module.currentVersion ? `v${module.currentVersion}` : "not installed"}</span></div><div className="mt-2 line-clamp-2 text-xs text-text-muted">{module.description}</div><div className="mt-2 flex flex-wrap gap-1">{module.permissions.slice(0, 5).map((permission) => <Badge key={permission} variant="outline">{permission}</Badge>)}</div></button>)}{modules.length === 0 && <div className="py-12 text-center text-sm text-text-muted">No modules uploaded. The registry starts empty rather than fabricating installed software.</div>}</CardContent></Card>
        <Card><CardHeader><CardTitle>{selected?.name ?? "Module details"}</CardTitle><CardDescription>{selected ? `${selected.moduleKey} · ${selected.vendor}` : "Select a module to inspect versions, dependencies, health, and controls."}</CardDescription></CardHeader><CardContent>{selected ? <div className="space-y-4"><div className="grid grid-cols-2 gap-2"><Info label="Status" value={selected.status} /><Info label="Health" value={selected.health} /><Info label="Installed" value={selected.currentVersion ?? "No"} /><Info label="Latest upload" value={latestRelease?.version ?? "—"} /></div>{selected.lastError && <div className="rounded border border-crimson/30 bg-crimson/10 p-3 text-xs text-crimson">{selected.lastError}</div>}{availableUpdate && <div className="rounded border border-azure/30 bg-azure/10 p-3 text-xs text-azure">Approved update v{availableUpdate.version} is ready for controlled installation.</div>}<div><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Dependencies</div>{selected.dependencies.length ? selected.dependencies.map((dependency) => <div key={dependency.id} className="flex justify-between border-b border-white/5 py-1.5 text-xs"><span className="text-text-main">{dependency.id}</span><span className="text-text-muted">{dependency.version}{dependency.optional ? " · optional" : ""}</span></div>) : <div className="text-xs text-text-muted">No module dependencies.</div>}</div><div className="flex flex-wrap gap-2">{selected.status === "ACTIVE" && <><Button size="sm" variant="outline" onClick={() => void moduleAction(selected, "health-check")} loading={busy === `${selected.id}:health-check`}><HeartPulse className="h-3.5 w-3.5" />Health</Button><Button size="sm" variant="outline" disabled={!((selected.manifest as any).lifecycle?.reloadSupported)} onClick={() => void moduleAction(selected, "restart")}><RefreshCw className="h-3.5 w-3.5" />Restart</Button><Button size="sm" variant="warning" onClick={() => void moduleAction(selected, "disable")}><Power className="h-3.5 w-3.5" />Disable</Button><Button size="sm" variant="danger" onClick={() => setConfirm({ kind: "rollback", module: selected })} disabled={!selected.releases.find((release) => release.id === selected.activeReleaseId)?.previousReleaseId}><RotateCcw className="h-3.5 w-3.5" />Rollback</Button></>}{selected.status === "DISABLED" && <><Button size="sm" variant="success" onClick={() => void moduleAction(selected, "enable")}><Play className="h-3.5 w-3.5" />Enable</Button><Button size="sm" variant="danger" onClick={() => setConfirm({ kind: "remove", module: selected })} disabled={(selected.manifest as any).lifecycle?.removable === false}><Trash2 className="h-3.5 w-3.5" />Remove safely</Button></>}</div><div><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Releases</div><div className="space-y-2">{selected.releases.map((release) => <Release key={release.id} release={release} busy={busy} onAction={releaseAction} />)}</div></div></div> : <div className="py-16 text-center text-sm text-text-muted"><Box className="mx-auto mb-2 h-9 w-9 opacity-40" />No module selected.</div>}</CardContent></Card></div></TabsContent>

      <TabsContent value="upload"><div className="grid gap-4 lg:grid-cols-[1fr_390px]"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4 text-violet" />Upload signed .wmod package</CardTitle><CardDescription>Streaming intake is bounded and written with private filesystem permissions directly into quarantine.</CardDescription></CardHeader><CardContent className="space-y-4"><label className="grid cursor-pointer place-items-center rounded-xl border border-dashed border-white/20 bg-white/5 p-10 text-center hover:border-violet/40"><FileArchive className="mb-3 h-10 w-10 text-violet" /><span className="font-medium text-text-bright">{file?.name ?? "Choose .wmod or .zip"}</span><span className="mt-1 text-xs text-text-muted">Maximum package size follows server policy. ZIP paths, links, entry sizes and compression ratios are validated.</span><input className="sr-only" type="file" accept=".wmod,.zip,application/zip" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} /></label>{checksum && <div className="rounded border border-white/10 bg-bg-deep p-3"><div className="text-[11px] uppercase tracking-wide text-text-muted">SHA-256 · publisher signs this exact message</div><code className="mt-1 block break-all text-xs text-azure">windels-module:{checksum}</code></div>}<div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-1 block text-xs text-text-muted">Trusted publisher key ID</label><Input value={signatureKeyId} onChange={(event) => setSignatureKeyId(event.target.value)} placeholder="publisher-key-2026" /></div><div><label className="mb-1 block text-xs text-text-muted">Detached Ed25519 signature (base64)</label><Input value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Base64 signature" /></div></div><Button onClick={() => void uploadPackage()} loading={busy === "upload"} disabled={!file || !signatureKeyId.trim() || !signature.trim()}><Upload className="h-4 w-4" />Upload to quarantine</Button></CardContent></Card><Card><CardHeader><CardTitle>Required package structure</CardTitle></CardHeader><CardContent><pre className="overflow-x-auto rounded-lg bg-bg-deep p-3 text-xs text-slate-300">{`windels-module.wmod
├── manifest.json
├── backend/
├── frontend/
├── agents/
├── workflows/
├── database/
├── config/
├── tests/
└── docs/`}</pre><div className="mt-4 space-y-2 text-xs text-text-muted"><p>Frontend pages are declarative and rendered by the existing WINDELS design system—uploaded JavaScript is never imported into the main web process.</p><p>Backend services run out-of-process through the isolated Module Runner and the permission-checked module gateway.</p><p>Database changes require runner-proven backup, migration, integrity, health, and rollback evidence.</p></div></CardContent></Card></div></TabsContent>

      <TabsContent value="uploads"><Card><CardHeader><CardTitle>Package and verification queue</CardTitle><CardDescription>Upload → Verify → Sandbox Test → Approve → Install. Each gate is explicit and audited.</CardDescription></CardHeader><CardContent className="space-y-3">{uploads.map((upload) => <div key={upload.id} className="rounded-xl border border-white/10 bg-white/5 p-4"><div className="flex flex-wrap items-center gap-2"><FileArchive className="h-4 w-4 text-violet" /><span className="font-medium text-text-bright">{upload.originalName}</span><Badge variant={badge(upload.status)}>{upload.status}</Badge><span className="ml-auto text-xs text-text-muted">{bytes(upload.sizeBytes)} · {new Date(upload.createdAt).toLocaleString()}</span></div><div className="mt-1 font-mono text-[11px] text-text-muted">{upload.manifestId ?? "manifest rejected"} {upload.manifestVersion ? `v${upload.manifestVersion}` : ""} · {upload.checksum.slice(0, 20)}…</div>{upload.release && <div className="mt-3"><Release release={upload.release} busy={busy} onAction={releaseAction} /></div>}{upload.report?.error && <div className="mt-2 text-xs text-crimson">{upload.report.error}</div>}</div>)}{uploads.length === 0 && <div className="py-12 text-center text-sm text-text-muted">No uploaded packages.</div>}</CardContent></Card></TabsContent>

      <TabsContent value="history"><Card><CardHeader><CardTitle className="flex items-center gap-2"><History className="h-4 w-4" />Installation, update and governance history</CardTitle><CardDescription>Every actor, version transition, runner result, error, and sanitized log is retained.</CardDescription></CardHeader><CardContent className="space-y-2">{operations.map((operation) => <button key={operation.id} onClick={() => setSelectedOperation(operation)} className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-left hover:border-white/20"><Badge variant={badge(operation.status)}>{operation.status}</Badge><div className="min-w-0 flex-1"><div className="text-sm font-medium text-text-bright">{operation.operationType} · {operation.moduleRegistry?.name ?? operation.moduleRegistryId}</div><div className="text-xs text-text-muted">{new Date(operation.createdAt).toLocaleString()} · {operation.fromVersion ?? "none"} → {operation.toVersion ?? "none"} · {operation.requestedBy?.profile?.displayName ?? operation.requestedBy?.email ?? "Super Admin"}</div>{operation.errorMessage && <div className="mt-1 text-xs text-crimson">{operation.errorCode}: {operation.errorMessage}</div>}</div><ScrollText className="h-4 w-4 text-text-muted" /></button>)}</CardContent></Card></TabsContent>
    </Tabs>

    <Modal open={!!selectedOperation} onClose={() => setSelectedOperation(null)} title={selectedOperation ? `${selectedOperation.operationType} logs` : "Operation logs"} size="lg">{selectedOperation && <div className="space-y-3"><div className="grid gap-2 sm:grid-cols-3"><Info label="Status" value={selectedOperation.status} /><Info label="Correlation" value={selectedOperation.correlationId} /><Info label="Completed" value={selectedOperation.completedAt ? new Date(selectedOperation.completedAt).toLocaleString() : "No"} /></div><div className="max-h-96 space-y-1 overflow-auto rounded-lg bg-bg-deep p-3 font-mono text-xs text-slate-300">{selectedOperation.logs.length ? selectedOperation.logs.map((line, index) => <div key={index}>{line}</div>) : <div className="text-text-muted">No runner logs recorded.</div>}</div></div>}</Modal>
    <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.kind === "rollback" ? "Confirm rollback" : "Confirm safe removal"}>{confirm && <div className="space-y-4"><div className="rounded border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson"><AlertTriangle className="mr-2 inline h-4 w-4" />{confirm.kind === "rollback" ? "The runner must restore the previous immutable release, roll back migrations where required, and pass health checks. Failure leaves the module inactive or on the known-good release." : "Removal is allowed only while disabled, with no active dependents, a removable manifest, and runner-verified migration cleanup."}</div><div className="text-sm text-text-main">Module: <strong>{confirm.module.name}</strong> · current version {confirm.module.currentVersion}</div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" onClick={() => void moduleAction(confirm.module, confirm.kind)} loading={busy === `${confirm.module.id}:${confirm.kind}`}>{confirm.kind === "rollback" ? "Rollback & verify" : "Remove safely"}</Button></div></div>}</Modal>
  </div>;
}

function Metric({ label, value, icon, tone = "slate" }: { label: string; value: number; icon: React.ReactElement; tone?: "slate" | "azure" | "emerald" | "amber" | "crimson" }) { const color = { slate: "text-slate-300 bg-slate-500/10", azure: "text-azure bg-azure/10", emerald: "text-emerald bg-emerald/10", amber: "text-amber bg-amber/10", crimson: "text-crimson bg-crimson/10" }[tone]; return <Card><CardContent className="flex items-center gap-2 p-3"><span className={`grid h-8 w-8 place-items-center rounded-lg ${color}`}>{icon}</span><div><div className="text-xl font-bold text-text-bright">{value}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div></div></CardContent></Card>; }
function Gate({ label, ok, detail }: { label: string; ok: boolean; detail: string }) { return <div className={`rounded-lg border p-3 ${ok ? "border-emerald/20 bg-emerald/5" : "border-crimson/30 bg-crimson/10"}`}><div className="flex items-center gap-2 text-sm font-medium text-text-bright">{ok ? <CheckCircle2 className="h-4 w-4 text-emerald" /> : <XCircle className="h-4 w-4 text-crimson" />}{label}</div><div className="mt-1 text-xs text-text-muted">{detail}</div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/10 bg-white/5 p-2"><div className="text-[10px] uppercase text-text-muted">{label}</div><div className="mt-1 break-all text-xs font-medium text-text-bright">{value}</div></div>; }
function Release({ release, busy, onAction }: { release: ModuleReleaseRow; busy: string | null; onAction: (release: ModuleReleaseRow, action: "verify" | "sandbox-test" | "approve" | "install") => void }) {
  const checks = (release.verificationReport as any)?.checks as Array<{ code: string; status: string; severity: string; message: string }> | undefined;
  const sandboxChecks = (release.sandboxReport as any)?.checks as Array<{ code: string; status: string; message: string }> | undefined;
  const failed = checks?.filter((item) => item.status === "FAILED" || item.status === "NOT_CONFIGURED").length ?? 0;
  return <div className="rounded-lg border border-white/10 bg-bg-deep/50 p-3">
    <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-text-bright">v{release.version}</span><Badge variant={badge(release.status)}>{release.status}</Badge><span className="text-xs text-text-muted">{bytes(release.packageSizeBytes)}</span>{failed > 0 && <Badge variant="crimson">{failed} blocking checks</Badge>}<div className="ml-auto flex flex-wrap gap-1">{["UPLOADED", "QUARANTINED", "FAILED"].includes(release.status) && <Button size="sm" variant="outline" onClick={() => onAction(release, "verify")} loading={busy === `${release.id}:verify`}><ShieldCheck className="h-3 w-3" />Verify</Button>}{release.status === "SANDBOX_TEST" && <Button size="sm" variant="outline" onClick={() => onAction(release, "sandbox-test")} loading={busy === `${release.id}:sandbox-test`}><TestTube2 className="h-3 w-3" />Sandbox test</Button>}{release.status === "VALIDATED" && <Button size="sm" variant="success" onClick={() => onAction(release, "approve")} loading={busy === `${release.id}:approve`}><CheckCircle2 className="h-3 w-3" />Approve</Button>}{release.status === "APPROVED" && <Button size="sm" onClick={() => onAction(release, "install")} loading={busy === `${release.id}:install`}><Play className="h-3 w-3" />Install / update</Button>}</div></div>
    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-text-muted"><span>Signature: {release.signatureVerified ? "verified" : "not verified"}</span><span>Scan: {release.scanStatus}</span><span>Compatibility: {release.compatibilityStatus}</span><span>Sandbox: {release.sandboxStatus}</span><span>Migrations: {release.migrationStatus}</span></div>
    {(checks?.length || sandboxChecks?.length) ? <details className="mt-2 rounded border border-white/10 bg-white/[0.02] p-2"><summary className="cursor-pointer text-xs font-medium text-text-main">View verification and sandbox evidence</summary><div className="mt-2 max-h-64 space-y-1 overflow-auto">{checks?.map((item) => <div key={item.code} className="grid gap-1 border-b border-white/5 py-1 text-[11px] sm:grid-cols-[115px_170px_1fr]"><Badge variant={badge(item.status)}>{item.status}</Badge><code className={item.severity === "critical" ? "text-crimson" : "text-amber"}>{item.code}</code><span className="text-text-muted">{item.message}</span></div>)}{sandboxChecks?.map((item) => <div key={`sandbox-${item.code}`} className="grid gap-1 border-b border-white/5 py-1 text-[11px] sm:grid-cols-[115px_170px_1fr]"><Badge variant={badge(item.status)}>{item.status}</Badge><code className="text-violet">{item.code}</code><span className="text-text-muted">{item.message}</span></div>)}</div></details> : null}
  </div>;
}
