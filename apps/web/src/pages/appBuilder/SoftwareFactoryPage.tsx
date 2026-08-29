/**
 * Session 96 — AI Software Factory (Application Builder) dashboard.
 *
 * Projects, AI-workforce tasks (6 clusters / 17 personas), build-farm runs
 * with an honest state machine, an immutable artifact registry (real
 * SHA-256 / SBOM / byte size) and the Human Decision Inbox approval gate.
 * No fabricated success: builds only reach SUCCEEDED by advancing through
 * the full state chain, and artifacts release only after an approved
 * decision.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { appBuilderApi } from "@/lib/appBuilder";
import type {
  AbRollup,
  AbProject,
  AbTask,
  AbBuildRun,
  AbArtifact,
  AbApproval,
  AbAgentGroup,
  AbBuildStatus,
} from "@/lib/appBuilder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Factory, FolderKanban, CheckSquare, Package, ShieldCheck, PlayCircle, PlusCircle, Rocket, Hash, TerminalSquare, Sparkles } from "lucide-react";

const BUILD_ORDER: AbBuildStatus[] = ["QUEUED", "GENERATING_CODE", "TESTING", "COMPILING", "SIGNING", "SUCCEEDED", "FAILED"];
const BUILD_BADGE: Record<AbBuildStatus, "slate" | "azure" | "violet" | "amber" | "emerald" | "danger"> = {
  QUEUED: "slate", GENERATING_CODE: "azure", TESTING: "violet", COMPILING: "amber", SIGNING: "azure",
  SUCCEEDED: "emerald", FAILED: "danger",
};
const APPROVAL_BADGE: Record<AbApproval["status"], "amber" | "emerald" | "danger"> = {
  pending: "amber", approved: "emerald", denied: "danger",
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

export function SoftwareFactoryPage() {
  const [rollup, setRollup] = useState<AbRollup | null>(null);
  const [projects, setProjects] = useState<AbProject[]>([]);
  const [agents, setAgents] = useState<AbAgentGroup[]>([]);
  const [selected, setSelected] = useState<AbProject | null>(null);
  const [tasks, setTasks] = useState<AbTask[]>([]);
  const [builds, setBuilds] = useState<AbBuildRun[]>([]);
  const [artifacts, setArtifacts] = useState<AbArtifact[]>([]);
  const [approvals, setApprovals] = useState<AbApproval[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [pName, setPName] = useState("");
  const [pTarget, setPTarget] = useState<AbProject["targetType"]>("WEB");
  const [pStack, setPStack] = useState("");
  const [pPrompt, setPPrompt] = useState("");

  const [taskAgent, setTaskAgent] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [runVersion, setRunVersion] = useState("v1.0.0");
  const [approverName, setApproverName] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, p, a] = await Promise.all([appBuilderApi.rollup(), appBuilderApi.listProjects(), appBuilderApi.agents()]);
      setRollup(r); setProjects(p); setAgents(a);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 4000); };

  const openProject = useCallback(async (id: string) => {
    try {
      const proj = projects.find((p) => p.id === id) ?? null;
      setSelected(proj);
      const [t, b, art] = await Promise.all([
        appBuilderApi.listTasks(id),
        appBuilderApi.listBuilds(id),
        appBuilderApi.listArtifacts({ projectId: id }),
      ]);
      setTasks(t); setBuilds(b); setArtifacts(art);
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [projects]);

  const refreshSelected = useCallback(async () => {
    if (!selected) return;
    await openProject(selected.id);
  }, [selected, openProject]);

  const createProject = useCallback(async () => {
    if (!pName.trim() || !pPrompt.trim()) return;
    try {
      const stack: Record<string, string> = {};
      for (const part of pStack.split(",")) {
        const [k, v] = part.split(":").map((s) => s.trim());
        if (k && v) stack[k] = v;
      }
      await appBuilderApi.createProject({ name: pName.trim(), targetType: pTarget, techStack: stack, systemPrompt: pPrompt.trim() });
      setPName(""); setPStack(""); setPPrompt("");
      setShowNew(false);
      flash("Project created.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [pName, pTarget, pStack, pPrompt, load]);

  const createTask = useCallback(async () => {
    if (!selected || !taskAgent || !taskTitle.trim()) return;
    try {
      await appBuilderApi.createTask(selected.id, { assignedAgent: taskAgent, title: taskTitle.trim() });
      setTaskTitle("");
      flash("Task assigned to the workforce.");
      await refreshSelected();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [selected, taskAgent, taskTitle, refreshSelected]);

  const toggleTask = useCallback(async (t: AbTask) => {
    try {
      await appBuilderApi.updateTask(t.id, { isCompleted: !t.isCompleted });
      await refreshSelected();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [refreshSelected]);

  const generateTask = useCallback(async (t: AbTask) => {
    try {
      const res = await appBuilderApi.generateTaskCode(t.id);
      flash(res.modelSource === "echo-demo" ? "Generated (demo provider — no real AI configured)." : "Code generated by real provider.");
      await refreshSelected();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [refreshSelected]);

  const startBuild = useCallback(async () => {
    if (!selected) return;
    try {
      await appBuilderApi.createBuild(selected.id, runVersion.trim() || "v1.0.0");
      setRunVersion("v1.0.0");
      flash("Build queued.");
      await refreshSelected();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [selected, runVersion, refreshSelected]);

  const advance = useCallback(async (run: AbBuildRun) => {
    try {
      const next = await appBuilderApi.advanceBuild(run.id);
      if (next.status === "SUCCEEDED") flash("Build succeeded — artifact created (immutable, unpublished).");
      else flash(`Build → ${next.status}.`);
      await refreshSelected();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [refreshSelected]);

  const requestRelease = useCallback(async (artifactId: string) => {
    try {
      await appBuilderApi.requestRelease(artifactId);
      flash("Release requested — pending Human Decision Inbox approval.");
      await Promise.all([refreshSelected(), loadApprovals()]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [refreshSelected]);

  const loadApprovals = useCallback(async () => {
    try { setApprovals(await appBuilderApi.listApprovals()); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);

  useEffect(() => { void loadApprovals(); }, [loadApprovals]);

  const decide = useCallback(async (a: AbApproval, approved: boolean) => {
    if (!approverName.trim()) { setErr("Enter your name to decide."); return; }
    try {
      await appBuilderApi.decideApproval(a.id, { approved, decidedBy: approverName.trim() });
      flash(approved ? "Approved — artifact can now be released." : "Denied.");
      await Promise.all([loadApprovals(), refreshSelected()]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [approverName, loadApprovals, refreshSelected]);

  const release = useCallback(async (artifactId: string) => {
    try {
      await appBuilderApi.releaseArtifact(artifactId);
      flash("Artifact released (approved).");
      await refreshSelected();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [refreshSelected]);

  const agentsFlat = useMemo(() => agents.flatMap((g) => g.agents), [agents]);
  const c = rollup?.counts;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">AI Software Factory</h1>
          <p className="text-sm text-text-muted">
            Application Builder — Session 96. Builds reach SUCCEEDED only through the real state chain; artifacts carry real SHA-256/SBOM and release only after Human Decision Inbox approval.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowNew((v) => !v)}>
          <PlusCircle className="w-4 h-4 mr-1" /> New project
        </Button>
      </div>

      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      {showNew ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Project name" value={pName} onChange={(e) => setPName(e.target.value)} />
              <Select value={pTarget} onChange={(e) => setPTarget(e.target.value as AbProject["targetType"])}>
                {["WEB", "DESKTOP", "MOBILE", "API", "MICROSERVICE", "BROWSER_EXTENSION", "CLI"].map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Input placeholder="Tech stack (frontend:react, backend:express)" value={pStack} onChange={(e) => setPStack(e.target.value)} className="col-span-2" />
            </div>
            <Textarea placeholder="System prompt — what should the factory build?" value={pPrompt} onChange={(e) => setPPrompt(e.target.value)} rows={3} />
            <div className="flex gap-2">
              <Button onClick={createProject} disabled={!pName.trim() || !pPrompt.trim()}>Create project</Button>
              <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Stat icon={<FolderKanban className="w-5 h-5" />} label="Projects" value={String(c?.projects ?? 0)} />
        <Stat icon={<CheckSquare className="w-5 h-5" />} label="Tasks" value={String(c?.tasks ?? 0)} sub={`${c?.tasksCompleted ?? 0} done`} />
        <Stat icon={<Factory className="w-5 h-5" />} label="Builds" value={String(c?.runs ?? 0)} sub={`${c?.runsByStatus?.SUCCEEDED ?? 0} succeeded`} />
        <Stat icon={<Package className="w-5 h-5" />} label="Artifacts" value={String(c?.artifacts ?? 0)} sub={`${c?.releasedArtifacts ?? 0} released`} />
        <Stat icon={<ShieldCheck className="w-5 h-5" />} label="Pending approvals" value={String(c?.pendingApprovals ?? 0)} />
        <Stat icon={<Hash className="w-5 h-5" />} label="Avg build" value={rollup?.avgBuildTimeMs === null ? "—" : `${Math.round((rollup?.avgBuildTimeMs ?? 0) / 1000)}s`} />
        <Stat icon={<TerminalSquare className="w-5 h-5" />} label="Agents" value={String(agentsFlat.length)} />
        <Stat icon={<Rocket className="w-5 h-5" />} label="Running" value={String((c?.runsByStatus?.GENERATING_CODE ?? 0) + (c?.runsByStatus?.COMPILING ?? 0) + (c?.runsByStatus?.TESTING ?? 0) + (c?.runsByStatus?.SIGNING ?? 0))} />
      </div>

      {/* Agent clusters */}
      <Card>
        <CardHeader><CardTitle className="text-lg">AI Workforce registry</CardTitle><CardDescription>The 6 functional clusters + 17 personas from the V3.0 spec.</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {agents.map((g) => (
              <div key={g.group} className="rounded-lg border border-white/5 bg-white/5 p-3">
                <div className="text-sm font-semibold text-text-bright">{g.group}</div>
                <div className="text-xs text-text-muted">{g.agents.join(" · ")}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Projects */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Projects</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {projects.map((p) => (
                <button key={p.id} onClick={() => openProject(p.id)} className={`w-full text-left rounded-lg border px-3 py-2 transition ${selected?.id === p.id ? "border-azure/40 bg-azure/10" : "border-white/5 bg-white/5 hover:bg-white/10"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text-bright truncate">{p.name}</span>
                    <Badge variant="outline">{p.targetType}</Badge>
                  </div>
                  <div className="text-xs text-text-muted truncate">{Object.entries(p.techStack).map(([k, v]) => `${k}: ${v}`).join(" · ") || "no stack"}</div>
                </button>
              ))}
              {projects.length === 0 ? <p className="text-sm text-text-muted">No projects yet.</p> : null}
            </div>
          </CardContent>
        </Card>

        {/* Project detail */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{selected ? selected.name : "Project detail"}</CardTitle>
            <CardDescription>{selected ? `${selected.description ?? ""} — ${Object.entries(selected.techStack).map(([k, v]) => `${k}:${v}`).join(", ")}` : "Select a project."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selected ? (
              <>
                <div className="flex gap-2">
                  <Select value={taskAgent} onChange={(e) => setTaskAgent(e.target.value)} className="flex-1">
                    <option value="">Assign a persona…</option>
                    {agents.map((g) => <optgroup key={g.group} label={g.group}>{g.agents.map((a) => <option key={a} value={a}>{a}</option>)}</optgroup>)}
                  </Select>
                  <Input placeholder="Task title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} className="flex-1" />
                  <Button onClick={createTask} disabled={!taskAgent || !taskTitle.trim()}><PlusCircle className="w-4 h-4 mr-1" /></Button>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {tasks.map((t) => (
                    <div key={t.id} className={`rounded-lg border px-3 py-2 ${t.isCompleted ? "border-emerald/20 bg-emerald/5" : "border-white/5 bg-white/5"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-text-bright truncate">{t.title}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline">{t.group}</Badge>
                          {t.generationSource !== "manual" ? <Badge variant={t.generationSource === "real" ? "emerald" : "amber"}>{t.generationSource}</Badge> : null}
                          <Button size="sm" variant="ghost" onClick={() => toggleTask(t)}>{t.isCompleted ? "Undo" : "Done"}</Button>
                        </div>
                      </div>
                      <div className="text-xs text-text-muted">{t.assignedAgent}{t.outputCode ? " · has output" : ""}</div>
                      {t.outputCode ? (
                        <pre className="mt-1 rounded bg-black/40 p-2 text-xs text-text-main overflow-x-auto max-h-24">{t.outputCode.slice(0, 400)}{t.outputCode.length > 400 ? "…" : ""}</pre>
                      ) : null}
                      <Button size="sm" variant="ghost" className="mt-1" onClick={() => generateTask(t)}><Sparkles className="w-3.5 h-3.5 mr-1" />Generate code</Button>
                    </div>
                  ))}
                  {tasks.length === 0 ? <p className="text-sm text-text-muted">No tasks yet.</p> : null}
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Version (v1.0.0)" value={runVersion} onChange={(e) => setRunVersion(e.target.value)} className="w-32" />
                  <Button onClick={startBuild}><PlayCircle className="w-4 h-4 mr-1" />Queue build</Button>
                </div>
              </>
            ) : <p className="text-sm text-text-muted">—</p>}
          </CardContent>
        </Card>

        {/* Builds + artifacts */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Build farm</CardTitle><CardDescription>Advance each step to move through the honest state chain.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {builds.map((b) => (
              <div key={b.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-text-bright">{b.version}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant={BUILD_BADGE[b.status]}>{b.status}</Badge>
                    {b.status === "FAILED" ? <Button size="sm" variant="outline" onClick={() => appBuilderApi.retryBuild(b.id).then(refreshSelected)}>Retry</Button> : null}
                    {!["SUCCEEDED", "FAILED"].includes(b.status) ? <Button size="sm" variant="outline" onClick={() => advance(b)}>Advance</Button> : null}
                  </div>
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {b.logs.map((l, i) => <div key={i}>[{new Date(l.at).toLocaleTimeString()}] <span className="text-azure">{l.step}</span> — {l.detail}</div>)}
                </div>
                {b.artifactId ? <div className="text-xs text-teal mt-1">artifact: {b.artifactId}</div> : null}
              </div>
            ))}
            {builds.length === 0 ? <p className="text-sm text-text-muted">No builds yet.</p> : null}
          </CardContent>
        </Card>
      </div>

      {/* Artifacts + approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Artifact registry</CardTitle>
            <CardDescription>Immutable, version-gated — real SHA-256, SBOM and byte size.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {artifacts.map((a) => (
                <div key={a.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text-bright truncate">{a.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant={a.published ? "emerald" : "slate"}>{a.published ? "released" : "staged"}</Badge>
                      {!a.published ? <Button size="sm" variant="outline" onClick={() => requestRelease(a.id)}>Request release</Button> : null}
                      {a.published ? <Button size="sm" variant="outline" onClick={() => release(a.id)}>Re-release</Button> : null}
                    </div>
                  </div>
                  <div className="text-xs text-text-muted mt-1 break-all">sha256 <span className="font-mono">{a.sha256.slice(0, 24)}…</span> · {a.sizeBytes} B</div>
                  <div className="text-xs text-text-muted">SBOM: {a.sbom.map((s) => `${s.name}@${s.version}`).join(", ")}</div>
                </div>
              ))}
              {artifacts.length === 0 ? <p className="text-sm text-text-muted">No artifacts yet — complete a build.</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Human Decision Inbox</CardTitle>
            <CardDescription>Releases require explicit, audited approval — never automatic.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="Your name (decider)" value={approverName} onChange={(e) => setApproverName(e.target.value)} />
            {approvals.map((a) => (
              <div key={a.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-text-bright truncate">Artifact {a.artifactId.slice(0, 12)}…</span>
                  <Badge variant={APPROVAL_BADGE[a.status]}>{a.status}</Badge>
                </div>
                <div className="text-xs text-text-muted">requested {new Date(a.createdAt).toLocaleString()}{a.decidedBy ? ` · decided by ${a.decidedBy}` : ""}</div>
                {a.status === "pending" ? (
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={() => decide(a, true)}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => decide(a, false)}>Deny</Button>
                  </div>
                ) : null}
              </div>
            ))}
            {approvals.length === 0 ? <p className="text-sm text-text-muted">No approvals.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
