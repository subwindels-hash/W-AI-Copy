/**
 * Session 165 — Deployment console (/app/deployment).
 *
 * Tabs: Targets · Validation
 *
 * Honesty:
 *   - this is a REGISTRY of declared targets plus a local-dependency
 *     validator. Nothing here provisions, configures or tears down
 *     infrastructure, and the page says so rather than implying otherwise.
 *   - validation probes the API host's own Redis/Postgres/disk. Those checks
 *     are real but `local_host`-scoped; the two target-scoped checks (endpoint
 *     reachability, TLS) cannot run from here and are skipped. A run with no
 *     target-scoped check leaves the target `validated_locally`, not healthy.
 *   - avgHealthScore renders "—" until something has actually been validated.
 *     It used to average invented per-status constants, scoring an
 *     unvalidated target 50.
 *   - "outdated" counts only targets that REPORTED a version. Targets that
 *     have never reported are shown separately as unknown.
 *   - de-registering removes the record; it destroys no environment.
 */
import { useCallback, useEffect, useState } from "react";
import { Server, ShieldCheck, Loader2, AlertTriangle, Trash2 } from "lucide-react";
import {
  deploymentApi,
  type DeploymentDashboard, type DeploymentTarget,
  type DeploymentValidation, type TargetEnvironment,
} from "@/lib/deployment";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

const ENVS: TargetEnvironment[] = [
  "windows", "linux", "macos", "docker", "kubernetes", "aws", "azure", "gcp",
  "oracle", "alibaba", "private_cloud", "on_prem", "air_gapped", "edge",
];

const label = (s: string) => s.replace(/_/g, " ");
/** An unmeasured figure renders as an em dash, never as a plausible number. */
const fmt = (n: number | null | undefined, suffix = "") => (n == null ? "—" : `${n}${suffix}`);

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
        {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function statusTone(s: DeploymentTarget["status"]) {
  if (s === "healthy") return "bg-emerald-900 text-emerald-200";
  if (s === "validated_locally") return "bg-sky-900 text-sky-200";
  if (s === "degraded" || s === "failed") return "bg-rose-900 text-rose-200";
  return "bg-slate-800 text-slate-300";
}

export function DeploymentPage() {
  const [dash, setDash] = useState<DeploymentDashboard | null>(null);
  const [targets, setTargets] = useState<DeploymentTarget[]>([]);
  const [validation, setValidation] = useState<DeploymentValidation | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [env, setEnv] = useState<TargetEnvironment>("docker");
  const [region, setRegion] = useState("");
  const [reportVer, setReportVer] = useState("");

  const load = useCallback(async () => {
    const [d, t] = await Promise.all([deploymentApi.dashboard(), deploymentApi.list()]);
    setDash(d); setTargets(t);
  }, []);

  useEffect(() => { load().catch((e) => setMsg(String(e))); }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); await load(); setMsg(ok); }
    catch (e) { setMsg(String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Server className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Deployment</h1>
      </div>

      {/* This module registers and checks; it does not provision. */}
      <div className="flex items-start gap-2 rounded-md border border-amber-800 bg-amber-950/40 p-3 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-400 shrink-0" />
        <div>
          <div className="font-medium text-amber-300">Registry and validator — not a provisioner</div>
          <div className="text-slate-400 text-xs">
            Registering a target records a declaration. Nothing here creates, configures or tears
            down infrastructure, and de-registering removes the record only. Validation probes this
            API host's own dependencies; reaching a remote endpoint and checking its TLS cannot be
            done from here, so those checks are reported as skipped rather than passed.
          </div>
        </div>
      </div>

      {msg && <div className="text-xs rounded border border-slate-700 bg-slate-900 p-2">{msg}</div>}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Stat label="Targets" value={dash?.totalTargets ?? "—"} />
        <Stat label="Validated" value={dash?.validatedTargets ?? "—"} hint="have a real run" />
        <Stat label="Health" value={fmt(dash?.avgHealthScore, "%")} hint={dash?.avgHealthScore == null ? "nothing validated" : "of validated targets"} />
        <Stat label="Outdated" value={dash?.outdatedTargets ?? "—"} hint="reported an old version" />
        <Stat label="Version unknown" value={dash?.unknownVersionTargets ?? "—"} hint="never reported" />
        <Stat label="Latest" value={dash?.latestVersion ?? "—"} />
      </div>

      <Tabs defaultValue="targets">
        <TabsList>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
        </TabsList>

        <TabsContent value="targets" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Register a target</CardTitle>
              <CardDescription className="text-xs">
                Records an environment you intend to run. It starts unvalidated.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-4">
              <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Select value={env} onChange={(e) => setEnv(e.target.value as TargetEnvironment)}>
                {ENVS.map((x) => <option key={x} value={x}>{label(x)}</option>)}
              </Select>
              <Input placeholder="Region (optional)" value={region} onChange={(e) => setRegion(e.target.value)} />
              <div>
                <Button
                  disabled={busy || name.length < 2}
                  onClick={() => run(() => deploymentApi.create({
                    name, environment: env, ...(region.trim() ? { region } : {}),
                  }), "Target registered.")}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {targets.length === 0 && (
            <div className="text-sm text-slate-400 border border-slate-800 rounded p-4">
              No targets registered. This organization starts empty — no production environments
              are declared on your behalf.
            </div>
          )}
          {targets.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t.name}</span>
                      <Badge>{label(t.environment)}</Badge>
                      {t.region && <Badge>{t.region}</Badge>}
                      <Badge className={statusTone(t.status)}>{label(t.status)}</Badge>
                      {t.source === "demo_seed" && (
                        <Badge className="bg-amber-900 text-amber-200">demo seed</Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      intended v{t.version} ·{" "}
                      {t.reportedVersion
                        ? `reported v${t.reportedVersion}`
                        : "no version reported"}
                      {t.lastHealthCheckAt && ` · checked ${t.lastHealthCheckAt.slice(0, 19).replace("T", " ")}`}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      disabled={busy}
                      onClick={() => run(async () => {
                        const v = await deploymentApi.validate(t.id);
                        setValidation(v); setSelected(t.id);
                      }, "Validation run complete.")}
                    >Validate</Button>
                    <Button
                      disabled={busy}
                      onClick={() => run(async () => {
                        const r = await deploymentApi.deregister(t.id);
                        setMsg(`De-registered. Infrastructure modified: ${r.infrastructureModified}.`);
                      }, "De-registered (no infrastructure changed).")}
                    ><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    className="text-xs"
                    placeholder="Report running version, e.g. 0.83.1"
                    value={selected === t.id ? reportVer : ""}
                    onChange={(e) => { setSelected(t.id); setReportVer(e.target.value); }}
                  />
                  <Button
                    disabled={busy || selected !== t.id || !reportVer.trim()}
                    onClick={() => run(async () => {
                      await deploymentApi.reportVersion(t.id, reportVer.trim());
                      setReportVer("");
                    }, "Version recorded.")}
                  >Report</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="validation" className="space-y-3">
          {!validation && (
            <div className="text-sm text-slate-400 border border-slate-800 rounded p-4">
              Run a validation from the Targets tab to see its checks here.
            </div>
          )}
          {validation && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Last run
                </CardTitle>
                <CardDescription className="text-xs">
                  {validation.targetScopedChecks === 0
                    ? "Every executed check probed this API host. Nothing in this run exercised the remote target, so it cannot establish that the target is healthy."
                    : `${validation.targetScopedChecks} check(s) exercised the target itself.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={validation.passed ? "bg-emerald-900 text-emerald-200" : "bg-rose-900 text-rose-200"}>
                    {validation.passed ? "passed" : "not passed"}
                  </Badge>
                  <Badge>{validation.durationMs} ms</Badge>
                  <Badge>{validation.skippedCount ?? 0} skipped</Badge>
                </div>
                {validation.checks.map((c) => (
                  <div key={c.id} className="text-xs border-l-2 pl-2 border-slate-700">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.label}</span>
                      <Badge>{c.scope === "target" ? "target" : "local host"}</Badge>
                      <Badge className={
                        c.skipped ? "bg-slate-800 text-slate-300"
                        : c.passed ? "bg-emerald-900 text-emerald-200"
                        : "bg-rose-900 text-rose-200"
                      }>
                        {c.skipped ? "skipped" : c.passed ? "passed" : "failed"}
                      </Badge>
                      <span className="text-[10px] text-slate-500">{c.durationMs} ms</span>
                    </div>
                    {c.detail && <div className="text-slate-400 mt-0.5">{c.detail}</div>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default DeploymentPage;
