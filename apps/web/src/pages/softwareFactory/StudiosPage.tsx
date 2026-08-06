/**
 * Session 99 — Software Factory: Five Studios & Build Farm.
 *
 * The five enterprise studios (spec §3) with per-project studio plans and
 * honest lifecycle, project studio coverage (computed), and per-run build
 * farm compilation targets (spec §4) derived from the run's real state —
 * binaryEmitted is always honestly false (external build farm required).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { softwareFactoryApi } from "@/lib/softwareFactory";
import { appBuilderApi } from "@/lib/appBuilder";
import type { SfStudio, SfStudioPlan, SfStudioCoverage, SfCompileTarget, SfStudioKey } from "@/lib/softwareFactory";
import type { AbProject, AbBuildRun } from "@/lib/appBuilder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Layers, CheckSquare, Boxes, AlertTriangle, PlusCircle, Factory } from "lucide-react";

const STUDIO_BADGE: Record<SfStudioKey, "slate" | "azure" | "violet" | "amber" | "emerald"> = {
  product: "azure", engineering: "violet", quality: "emerald", devops: "amber", operations: "slate",
};
const PLAN_BADGE: Record<SfStudioPlan["status"], "slate" | "azure" | "emerald"> = {
  planned: "slate", in_progress: "azure", completed: "emerald",
};
const TARGET_BADGE: Record<SfCompileTarget["status"], "slate" | "azure" | "emerald" | "danger"> = {
  pending: "slate", compiling: "azure", built: "emerald", failed: "danger",
};

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-azure shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-text-muted uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-black text-text-bright truncate">{value}</div>
          {sub ? <div className="text-xs text-text-muted truncate">{sub}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function StudiosPage() {
  const [studios, setStudios] = useState<SfStudio[]>([]);
  const [projects, setProjects] = useState<AbProject[]>([]);
  const [plans, setPlans] = useState<SfStudioPlan[]>([]);
  const [runs, setRuns] = useState<AbBuildRun[]>([]);
  const [selectedProject, setSelectedProject] = useState<AbProject | null>(null);
  const [coverage, setCoverage] = useState<SfStudioCoverage | null>(null);
  const [selectedRun, setSelectedRun] = useState<AbBuildRun | null>(null);
  const [targets, setTargets] = useState<SfCompileTarget[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showPlan, setShowPlan] = useState(false);
  const [planStudio, setPlanStudio] = useState<SfStudioKey>("product");
  const [planDeliverables, setPlanDeliverables] = useState("");
  const [planStatus, setPlanStatus] = useState<SfStudioPlan["status"]>("planned");

  const load = useCallback(async () => {
    try {
      const [st, p, pl] = await Promise.all([
        softwareFactoryApi.studios(),
        appBuilderApi.listProjects(),
        softwareFactoryApi.listPlans(),
      ]);
      setStudios(st); setProjects(p); setPlans(pl);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 3500); };

  const openProject = useCallback(async (projectId: string) => {
    try {
      const proj = projects.find((p) => p.id === projectId) ?? null;
      setSelectedProject(proj);
      const [cov, r] = await Promise.all([
        softwareFactoryApi.studioCoverage(projectId),
        appBuilderApi.listBuilds(projectId),
      ]);
      setCoverage(cov); setRuns(r); setTargets(null); setSelectedRun(null);
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [projects]);

  const showTargets = useCallback(async (run: AbBuildRun) => {
    try {
      setSelectedRun(run);
      setTargets(await softwareFactoryApi.compileTargets(run.id));
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);

  const createPlan = useCallback(async () => {
    if (!selectedProject || !planDeliverables.trim()) return;
    const deliverables = planDeliverables.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      await softwareFactoryApi.createPlan({
        projectId: selectedProject.id, studio: planStudio, deliverables, status: planStatus,
      });
      setPlanDeliverables("");
      setShowPlan(false);
      flash("Studio plan created.");
      await Promise.all([load(), openProject(selectedProject.id)]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [selectedProject, planStudio, planDeliverables, planStatus, load, openProject]);

  const setStatus = useCallback(async (plan: SfStudioPlan, status: SfStudioPlan["status"]) => {
    try {
      await softwareFactoryApi.updatePlan(plan.id, { status });
      flash(`Plan → ${status}.`);
      await Promise.all([load(), selectedProject ? openProject(selectedProject.id) : null]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [load, selectedProject, openProject]);

  const studioDeliverables = useMemo(() => {
    const map = new Map(studios.map((s) => [s.key, s.deliverables]));
    return map.get(planStudio) ?? [];
  }, [studios, planStudio]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-text-bright">Software Factory — Studios & Build Farm</h1>
        <p className="text-sm text-text-muted">
          The five enterprise studios (V3.0 §3) + per-run build farm compilation targets (§4) — Session 99. Targets are derived from run state; binaries are never fabricated.
        </p>
      </div>

      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      {/* Five studios */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {studios.map((s) => (
          <Card key={s.key}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Badge variant={STUDIO_BADGE[s.key]}>{s.key}</Badge>
              </div>
              <div className="mt-1 text-sm font-semibold text-text-bright">{s.name}</div>
              <div className="text-xs text-text-muted mt-1">{s.purpose}</div>
              <div className="text-xs text-text-muted mt-2">{s.deliverables.length} deliverables</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Projects */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Projects</CardTitle><CardDescription>Select a project to see its studio coverage and build farm targets.</CardDescription></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <Button key={p.id} size="sm" variant={selectedProject?.id === p.id ? "primary" : "outline"} onClick={() => openProject(p.id)}>
                {p.name}
              </Button>
            ))}
            {projects.length === 0 ? <p className="text-sm text-text-muted">No projects yet — create one in Software Factory.</p> : null}
          </div>
        </CardContent>
      </Card>

      {selectedProject ? (
        <>
          {/* Coverage */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Studio coverage — {selectedProject.name}</CardTitle>
              <CardDescription>
                {coverage?.completedPlans ?? 0}/{coverage?.plans ?? 0} plans completed ·{" "}
                {coverage?.completedDeliverables ?? 0}/{coverage?.totalDeliverables ?? 0} deliverables ·{" "}
                <span className={coverage?.allStudiosCovered ? "text-emerald" : "text-amber"}>
                  {coverage?.allStudiosCovered ? "all 5 studios covered ✓" : "not all studios covered"}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {(coverage?.coverage ?? []).map((c) => (
                  <div key={c.studio} className="rounded-lg border border-white/5 bg-white/5 p-3">
                    <Badge variant={STUDIO_BADGE[c.studio]}>{c.studio}</Badge>
                    <div className="mt-1 text-xl font-black text-text-bright">{c.completed}/{c.plans}</div>
                    <div className="text-xs text-text-muted">plans completed</div>
                    <div className="text-xs text-text-muted mt-1 truncate" title={c.deliverables.join(", ")}>
                      {c.deliverables.length ? c.deliverables.join(", ") : "no deliverables yet"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setShowPlan(true); }}>
                  <PlusCircle className="w-4 h-4 mr-1" /> New studio plan
                </Button>
                {showPlan ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={planStudio} onChange={(e) => setPlanStudio(e.target.value as SfStudioKey)} className="w-36">
                      {studios.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                    </Select>
                    <Input
                      placeholder={`Deliverables: ${studioDeliverables.slice(0, 3).join(", ")}…`}
                      value={planDeliverables}
                      onChange={(e) => setPlanDeliverables(e.target.value)}
                      className="min-w-52 flex-1"
                    />
                    <Select value={planStatus} onChange={(e) => setPlanStatus(e.target.value as SfStudioPlan["status"])} className="w-32">
                      <option value="planned">Planned</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                    </Select>
                    <Button size="sm" onClick={createPlan} disabled={!planDeliverables.trim()}>Create</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowPlan(false)}>Cancel</Button>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Plans */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Studio plans</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {plans.filter((p) => p.projectId === selectedProject.id).map((p) => (
                  <div key={p.id} className="rounded-lg border border-white/5 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={STUDIO_BADGE[p.studio]}>{p.studio}</Badge>
                      <div className="flex items-center gap-1">
                        <Badge variant={PLAN_BADGE[p.status]}>{p.status}</Badge>
                        <button onClick={() => softwareFactoryApi.deletePlan(p.id).then(() => { flash("Plan deleted."); Promise.all([load(), openProject(selectedProject.id)]); })} className="text-text-muted hover:text-crimson">✕</button>
                      </div>
                    </div>
                    <div className="text-xs text-text-muted mt-1">{p.deliverables.join(" · ")}</div>
                    {p.completedAt ? <div className="text-xs text-text-muted mt-1">completed {new Date(p.completedAt).toLocaleString()}</div> : null}
                    <div className="mt-2 flex gap-1">
                      {p.status === "planned" ? <Button size="sm" variant="ghost" onClick={() => setStatus(p, "in_progress")}>Start</Button> : null}
                      {p.status === "in_progress" ? <Button size="sm" variant="outline" onClick={() => setStatus(p, "completed")}><CheckSquare className="w-3.5 h-3.5 mr-1" />Complete</Button> : null}
                      {p.status === "completed" ? <Button size="sm" variant="ghost" onClick={() => setStatus(p, "in_progress")}>Reopen</Button> : null}
                    </div>
                  </div>
                ))}
                {plans.filter((p) => p.projectId === selectedProject.id).length === 0 ? <p className="text-sm text-text-muted">No studio plans yet.</p> : null}
              </div>
            </CardContent>
          </Card>

          {/* Build farm targets */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Build farm compilation targets</CardTitle>
              <CardDescription>Per-run targets derived from the run's real state — binaries require the external build farm host (never fabricated).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {runs.map((r) => (
                  <Button key={r.id} size="sm" variant={selectedRun?.id === r.id ? "primary" : "outline"} onClick={() => showTargets(r)}>
                    {r.version} · {r.status}
                  </Button>
                ))}
                {runs.length === 0 ? <p className="text-sm text-text-muted">No builds yet.</p> : null}
              </div>
              {targets ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {targets.map((t) => (
                    <div key={t.id} className="rounded-lg border border-white/5 bg-white/5 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-mono text-text-bright truncate">{t.fileName}</span>
                        <Badge variant={TARGET_BADGE[t.status]}>{t.status}</Badge>
                      </div>
                      <div className="text-xs text-text-muted">{t.platform} · {t.format}</div>
                      <div className="text-xs text-text-muted mt-1 break-all">sha256 <span className="font-mono">{t.sha256.slice(0, 20)}…</span></div>
                      <div className="text-xs text-amber mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {t.binaryEmitted ? "binary emitted" : "binary not emitted — "}{t.requiresToolchain}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* All plans (across projects) */}
      <Card>
        <CardHeader><CardTitle className="text-lg">All studio plans</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {plans.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm text-text-bright truncate">{p.deliverables.join(", ")}</div>
                  <div className="text-xs text-text-muted">project {p.projectId.slice(0, 8)}… · {p.studio} · {p.status}</div>
                </div>
                <Badge variant={PLAN_BADGE[p.status]}>{p.status}</Badge>
              </div>
            ))}
            {plans.length === 0 ? <p className="text-sm text-text-muted">No plans yet.</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
