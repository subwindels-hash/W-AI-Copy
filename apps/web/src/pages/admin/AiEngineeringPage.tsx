/**
 * Session 124 — AI Engineering Command Center.
 *
 * Central dashboard for the AI Software Engineering Workforce: connected
 * repositories, active engineers, tasks, builds, PRs, issues, security
 * alerts, performance flags, deployments, releases, production health and
 * engineering memory.
 *
 * Honesty rules:
 *   - a metric with no backing data prints "not recorded"/"unknown", never 0;
 *   - GitHub-backed counts show the connection note when no account is
 *     connected (0 repos connected is displayed as such, not as "all is
 *     well");
 *   - repository intelligence nodes carry their basis (observed/heuristic);
 *   - the task pipeline steps show their mode (advisory vs executed).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Bot, Brain, GitPullRequest, Github, Layers, Play,
  RefreshCw, Shield, Workflow,
} from "lucide-react";
import type {
  AiEngineeringCommandCenter,
  AiEngineeringConnection,
  AiEngineeringIntelNode,
  AiEngineeringRepo,
  AiEngineeringRole,
  AiEngineeringTask,
} from "@windels/shared/aiEngineering";
import { aiEngineeringApi } from "@/lib/aiEngineering";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useAuthStore } from "@/store/auth";

const STATUS_VARIANT: Record<string, "emerald" | "amber" | "crimson" | "azure" | "slate" | "default"> = {
  done: "emerald",
  queued: "slate",
  planning: "azure",
  implementing: "azure",
  testing: "amber",
  reviewing: "amber",
  fixing: "crimson",
  pr_ready: "violet" as any,
  pr_open: "violet" as any,
  failed: "crimson",
  blocked: "crimson",
};

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "not recorded" : String(n);
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-text-bright">{value}</div>
      {hint ? <div className="mt-1 text-xs text-text-muted">{hint}</div> : null}
    </Card>
  );
}

type Tab = "command" | "repos" | "tasks" | "memory" | "github";

export function AiEngineeringPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [tab, setTab] = useState<Tab>("command");

  const [cc, setCc] = useState<AiEngineeringCommandCenter | null>(null);
  const [roles, setRoles] = useState<AiEngineeringRole[]>([]);
  const [repos, setRepos] = useState<AiEngineeringRepo[]>([]);
  const [tasks, setTasks] = useState<AiEngineeringTask[]>([]);
  const [intel, setIntel] = useState<Record<string, AiEngineeringIntelNode[]>>({});
  const [connections, setConnections] = useState<AiEngineeringConnection[]>([]);
  const [memory, setMemory] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [repoModal, setRepoModal] = useState(false);
  const [taskModal, setTaskModal] = useState(false);
  const [connModal, setConnModal] = useState(false);
  const [memModal, setMemModal] = useState(false);

  const [newRepo, setNewRepo] = useState({ name: "", localPath: "", connectionId: "" });
  const [newTask, setNewTask] = useState({ repoId: "", title: "", description: "", leadRole: "orchestrator" });
  const [newConn, setNewConn] = useState({ accountLabel: "", token: "" });
  const [newMem, setNewMem] = useState({ kind: "decision", scope: "org", repoId: "", title: "", body: "", tags: "" });

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [ccData, roleData, repoData, taskData, connData, memData] = await Promise.all([
        aiEngineeringApi.commandCenter(),
        aiEngineeringApi.roles(),
        aiEngineeringApi.repos(),
        aiEngineeringApi.tasks(),
        aiEngineeringApi.connections(),
        aiEngineeringApi.memory(),
      ]);
      setCc(ccData);
      setRoles(roleData);
      setRepos(repoData);
      setTasks(taskData);
      setConnections(connData);
      setMemory(memData);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll, accessToken]);

  const loadIntel = useCallback(async (repoId: string) => {
    try {
      const nodes = await aiEngineeringApi.intel(repoId, { limit: 200 });
      setIntel((prev) => ({ ...prev, [repoId]: nodes }));
    } catch { /* per-repo intel is best-effort */ }
  }, []);

  const runTask = async (id: string) => {
    setBusy(true);
    try {
      await aiEngineeringApi.runTask(id);
      await loadAll();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const scanRepo = async (repo: AiEngineeringRepo) => {
    if (!repo.localPath) return;
    setBusy(true);
    try {
      await aiEngineeringApi.scan(repo.id, repo.localPath);
      await loadAll();
      await loadIntel(repo.id);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const addRepo = async () => {
    setBusy(true);
    try {
      await aiEngineeringApi.addRepo({
        name: newRepo.name,
        ...(newRepo.localPath ? { localPath: newRepo.localPath } : {}),
        ...(newRepo.connectionId ? { connectionId: newRepo.connectionId } : {}),
      });
      setRepoModal(false);
      setNewRepo({ name: "", localPath: "", connectionId: "" });
      await loadAll();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const createTask = async () => {
    setBusy(true);
    try {
      await aiEngineeringApi.createTask({
        repoId: newTask.repoId,
        title: newTask.title,
        description: newTask.description,
        leadRole: newTask.leadRole as any,
      });
      setTaskModal(false);
      setNewTask({ repoId: "", title: "", description: "", leadRole: "orchestrator" });
      await loadAll();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const connect = async () => {
    setBusy(true);
    try {
      await aiEngineeringApi.connect({ provider: "github", accountLabel: newConn.accountLabel, token: newConn.token });
      setConnModal(false);
      setNewConn({ accountLabel: "", token: "" });
      await loadAll();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const rotateConnection = async (id: string) => {
    const token = window.prompt("Enter the replacement GitHub token. It will be verified before the encrypted credential is replaced.");
    if (!token) return;
    setBusy(true);
    try { await aiEngineeringApi.rotateConnection(id, token); await loadAll(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const removeConnection = async (id: string) => {
    if (!window.confirm("Revoke and delete this GitHub connection?")) return;
    setBusy(true);
    try { await aiEngineeringApi.removeConnection(id); await loadAll(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const addMemory = async () => {
    setBusy(true);
    try {
      await aiEngineeringApi.addMemory({
        kind: newMem.kind as any,
        scope: newMem.scope as any,
        ...(newMem.repoId ? { repoId: newMem.repoId } : {}),
        title: newMem.title,
        body: newMem.body,
        tags: newMem.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setMemModal(false);
      setNewMem({ kind: "decision", scope: "org", repoId: "", title: "", body: "", tags: "" });
      await loadAll();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const repoById = (id: string) => repos.find((r) => r.id === id);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-bright">
            <Workflow className="h-6 w-6 text-violet" />AI Software Engineering
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            An autonomous engineering department: {roles.length} specialized AI engineers coordinated by an orchestrator across multi-repository workspaces.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={tab} onChange={(e) => setTab(e.target.value as Tab)} className="w-44">
            <option value="command">Command center</option>
            <option value="repos">Repositories</option>
            <option value="tasks">Tasks</option>
            <option value="memory">Memory</option>
            <option value="github">GitHub</option>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void loadAll()}><RefreshCw className="h-4 w-4" />Refresh</Button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-2 text-sm text-crimson">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      ) : null}

      {tab === "command" && cc ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Repositories" value={`${cc.repositories.connected}/${cc.repositories.total} connected`} hint={cc.repositories.scanning ? `${cc.repositories.scanning} scanning` : undefined} />
            <StatCard label="AI engineers" value={`${cc.engineers.active}/${cc.engineers.total} active`} hint={`${Object.keys(cc.engineers.byRole).length} role(s) staffed`} />
            <StatCard label="Open tasks" value={fmt(cc.tasks.queued ?? 0)} hint={`${cc.tasks.done ?? 0} done · ${cc.tasks.failed ?? 0} failed`} />
            <StatCard label="Security alerts" value={fmt(cc.securityAlerts)} hint="from repository intelligence scans" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Pull requests" value={cc.repositories.connected ? `${cc.pullRequests.open} open` : "not connected"} hint={cc.repositories.connected ? `${cc.pullRequests.merged} closed/merged` : "connect a GitHub account"} />
            <StatCard label="Open issues" value={cc.repositories.connected ? fmt(cc.issues.open) : "not connected"} hint="via connected repositories" />
            <StatCard label="CI builds" value={cc.repositories.connected ? fmt(cc.builds.runs) : "not connected"} hint={`${cc.builds.failed} failed`} />
            <StatCard label="Production health" value={cc.productionHealth} hint="unknown until monitoring feeds connect" />
          </div>
          <p className="mt-3 text-xs text-text-muted">{cc.note}</p>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-sm">Recent activity</CardTitle></CardHeader>
              <CardContent className="grid gap-1">
                {cc.recentActivity.length === 0 ? <p className="text-sm text-text-muted">No activity yet.</p> : cc.recentActivity.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="shrink-0 text-text-muted">{new Date(a.at).toLocaleString()}</span>
                    <Badge variant="slate">{a.kind}</Badge>
                    <span className="truncate">{a.label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Task pipeline</CardTitle></CardHeader>
              <CardContent className="grid gap-1">
                {Object.keys(cc.tasks).length === 0 ? <p className="text-sm text-text-muted">No tasks yet.</p> : Object.entries(cc.tasks).map(([s, n]) => (
                  <div key={s} className="flex items-center justify-between text-xs">
                    <Badge variant={STATUS_VARIANT[s] ?? "slate"}>{s}</Badge><span>{n}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Engineering memory</CardTitle></CardHeader>
              <CardContent className="grid gap-1">
                <div className="text-2xl font-semibold text-text-bright">{cc.memory.entries}</div>
                <div className="grid gap-0.5 text-xs text-text-muted">
                  {Object.entries(cc.memory.byKind).map(([k, n]) => <span key={k}>{k}: {n}</span>)}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      {tab === "repos" ? (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-text-muted">Multi-repository workspace — each repo has its own AI team and knowledge graph.</p>
            <Button size="sm" onClick={() => setRepoModal(true)}><Layers className="h-4 w-4" />Add repository</Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {repos.length === 0 ? (
              <Card className="p-6 text-sm text-text-muted">No repositories in the workspace yet.</Card>
            ) : repos.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-text-bright">{r.name}</div>
                    <div className="text-xs text-text-muted">{r.localPath ?? "remote"}</div>
                  </div>
                  <Badge variant={r.status === "ready" ? "emerald" : r.status === "connected" ? "azure" : "slate"}>{r.status}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(r.team).map(([role]) => <Badge key={role} variant="violet">{role}</Badge>)}
                </div>
                <div className="mt-2 text-xs text-text-muted">
                  {r.intelSummary ? `${Object.values(r.intelSummary).reduce((a, b) => a + b, 0)} knowledge nodes · last scan ${r.lastScanAt ? new Date(r.lastScanAt).toLocaleString() : "—"}` : "not scanned yet"}
                </div>
                <div className="mt-3 flex gap-2">
                  {r.localPath ? <Button size="sm" variant="secondary" onClick={() => void scanRepo(r)} disabled={busy}><Bot className="h-3.5 w-3.5" />Scan</Button> : null}
                  <Button size="sm" variant="outline" onClick={() => void loadIntel(r.id)}><Brain className="h-3.5 w-3.5" />Knowledge</Button>
                </div>
                {intel[r.id] ? (
                  <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-white/10 bg-bg-deep/50 p-2 text-[11px] text-text-muted">
                    {intel[r.id]!.length === 0 ? "No knowledge nodes yet." : intel[r.id]!.slice(0, 12).map((n) => (
                      <div key={n.id} className="flex items-center gap-1">
                        <Badge variant={n.basis === "observed" ? "emerald" : "amber"}>{n.basis}</Badge>
                        <span className="truncate">{n.kind}: {n.label}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </>
      ) : null}

      {tab === "tasks" ? (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-text-muted">Autonomous pipeline: plan → implement → test → review → PR. Steps are labelled advisory vs executed.</p>
            <Button size="sm" onClick={() => setTaskModal(true)}><Play className="h-4 w-4" />New task</Button>
          </div>
          <div className="mt-4 grid gap-3">
            {tasks.length === 0 ? <Card className="p-6 text-sm text-text-muted">No tasks yet — create one to start the workforce.</Card> : tasks.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-text-bright">{t.title}</div>
                    <div className="text-xs text-text-muted">{repoById(t.repoId)?.name ?? t.repoName} · lead: {t.leadRole} · {t.id}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[t.status] ?? "slate"}>{t.status}</Badge>
                    <Button size="sm" variant="secondary" onClick={() => void runTask(t.id)} disabled={busy}><Play className="h-3.5 w-3.5" />Run pipeline</Button>
                    {t.pr ? <Badge variant="violet">PR #{t.pr.number}</Badge> : null}
                  </div>
                </div>
                {t.plan ? <p className="mt-2 text-xs text-text-muted">{t.plan.summary}</p> : null}
                {t.testResult ? (
                  <p className="mt-1 text-xs text-text-muted">
                    Tests: {t.testResult.executed ? `${t.testResult.passed} passed / ${t.testResult.failed} failed` : "not executed (no localPath)"}
                  </p>
                ) : null}
                {t.error ? <p className="mt-1 text-xs text-crimson">{t.error}</p> : null}
                {t.steps.length ? (
                  <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-white/10 bg-bg-deep/50 p-2 text-[11px] text-text-muted">
                    {t.steps.map((s, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <Badge variant={s.mode === "executed" ? "emerald" : "slate"}>{s.mode}</Badge>
                        <span className="truncate">{s.role}: {s.action}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </>
      ) : null}

      {tab === "memory" ? (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-text-muted">Engineering memory — knowledge the workforce learns from, org-wide or per repo.</p>
            <Button size="sm" onClick={() => setMemModal(true)}><Brain className="h-4 w-4" />Add entry</Button>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {memory.length === 0 ? <Card className="p-6 text-sm text-text-muted">No memory entries yet.</Card> : memory.map((m) => (
              <Card key={m.id} className="p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="azure">{m.kind}</Badge>
                  <Badge variant="slate">{m.scope}{m.repoId ? `:${repoById(m.repoId)?.name ?? m.repoId}` : ""}</Badge>
                  <span className="truncate font-medium text-text-bright">{m.title}</span>
                </div>
                <p className="mt-1 line-clamp-3 text-xs text-text-muted">{m.body}</p>
                <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-text-muted">
                  {m.tags.map((tag: string) => <span key={tag} className="rounded bg-white/5 px-1">#{tag}</span>)}
                  <span className="ml-auto">source: {m.source}</span>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : null}

      {tab === "github" ? (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-text-muted">
              GitHub is one capability of the department: repositories, branches, commits, PRs, issues, milestones, releases, actions and checks.
            </p>
            <Button size="sm" onClick={() => setConnModal(true)}><Github className="h-4 w-4" />Connect account</Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {connections.length === 0 ? (
              <Card className="p-6 text-sm text-text-muted">No GitHub connections. Connect an account (fine-grained or classic token) to let the workforce manage repositories.</Card>
            ) : connections.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-text-bright">{c.accountLabel}</div>
                    <div className="text-xs text-text-muted">token {c.tokenMasked} · {c.organizations.length} org(s): {c.organizations.slice(0, 3).join(", ") || "—"}</div>
                  </div>
                  <Badge variant={c.status === "connected" ? "emerald" : c.status === "failed" ? "crimson" : "amber"}>{c.status}</Badge>
                </div>
                <div className="mt-2 text-xs text-text-muted">
                  AES-256-GCM encrypted · credential v{c.credentialVersion} · reads expose {c.tokenMasked} at most.
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void rotateConnection(c.id)} disabled={busy}>Rotate token</Button>
                  <Button size="sm" variant="outline" onClick={() => void removeConnection(c.id)} disabled={busy}>Revoke</Button>
                </div>
              </Card>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            <Shield className="h-3.5 w-3.5" />
            Repo-level GitHub operations (branches, PRs, issues, releases, actions) run through <code className="rounded bg-white/5 px-1">/ai-engineering/repos/:id/github/…</code> once a repository is connected.
          </p>
        </>
      ) : null}

      {/* Modals */}
      <Modal open={repoModal} onClose={() => setRepoModal(false)} title="Add repository"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRepoModal(false)}>Cancel</Button><Button onClick={() => void addRepo()} loading={busy} disabled={!newRepo.name.trim()}>Add</Button></div>}>
        <div className="grid gap-3">
          <label className="text-sm"><span className="text-text-muted">Name (owner/repo or local label)</span>
            <Input value={newRepo.name} onChange={(e) => setNewRepo({ ...newRepo, name: e.target.value })} /></label>
          <label className="text-sm"><span className="text-text-muted">Local path (optional — enables real scanning)</span>
            <Input value={newRepo.localPath} onChange={(e) => setNewRepo({ ...newRepo, localPath: e.target.value })} placeholder="/home/user/WIN" /></label>
          <label className="text-sm"><span className="text-text-muted">GitHub connection (optional)</span>
            <Select value={newRepo.connectionId} onChange={(e) => setNewRepo({ ...newRepo, connectionId: e.target.value })}>
              <option value="">— none —</option>
              {connections.map((c) => <option key={c.id} value={c.id}>{c.accountLabel}</option>)}
            </Select></label>
        </div>
      </Modal>

      <Modal open={taskModal} onClose={() => setTaskModal(false)} title="New autonomous task"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setTaskModal(false)}>Cancel</Button><Button onClick={() => void createTask()} loading={busy} disabled={!newTask.repoId || !newTask.title.trim()}>Create</Button></div>}>
        <div className="grid gap-3">
          <label className="text-sm"><span className="text-text-muted">Repository</span>
            <Select value={newTask.repoId} onChange={(e) => setNewTask({ ...newTask, repoId: e.target.value })}>
              <option value="">— select —</option>
              {repos.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select></label>
          <label className="text-sm"><span className="text-text-muted">Lead role</span>
            <Select value={newTask.leadRole} onChange={(e) => setNewTask({ ...newTask, leadRole: e.target.value })}>
              <option value="orchestrator">orchestrator</option>
              {roles.filter((r) => r.id !== "orchestrator").map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
            </Select></label>
          <label className="text-sm"><span className="text-text-muted">Title</span>
            <Input value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} /></label>
          <label className="text-sm"><span className="text-text-muted">Description (the specification the workforce executes)</span>
            <textarea rows={5} className="w-full rounded-lg border border-white/10 bg-bg-deep/60 px-3 py-2 text-sm text-text-bright focus:outline-none focus:ring-2 focus:ring-azure/60"
              value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} /></label>
        </div>
      </Modal>

      <Modal open={connModal} onClose={() => setConnModal(false)} title="Connect a GitHub account"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConnModal(false)}>Cancel</Button><Button onClick={() => void connect()} loading={busy} disabled={!newConn.accountLabel.trim() || newConn.token.length < 8}>Connect</Button></div>}>
        <div className="grid gap-3">
          <p className="text-xs text-text-muted">The token is verified before storage, encrypted with AES-256-GCM in the organization-scoped record, and returned only in masked form.</p>
          <label className="text-sm"><span className="text-text-muted">Account label</span>
            <Input value={newConn.accountLabel} onChange={(e) => setNewConn({ ...newConn, accountLabel: e.target.value })} /></label>
          <label className="text-sm"><span className="text-text-muted">Personal access token (classic or fine-grained)</span>
            <Input type="password" value={newConn.token} onChange={(e) => setNewConn({ ...newConn, token: e.target.value })} /></label>
        </div>
      </Modal>

      <Modal open={memModal} onClose={() => setMemModal(false)} title="Add memory entry"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setMemModal(false)}>Cancel</Button><Button onClick={() => void addMemory()} loading={busy} disabled={!newMem.title.trim() || !newMem.body.trim()}>Add</Button></div>}>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm"><span className="text-text-muted">Kind</span>
              <Select value={newMem.kind} onChange={(e) => setNewMem({ ...newMem, kind: e.target.value })}>
                {["decision", "standard", "pattern", "instruction", "lesson", "bugfix"].map((k) => <option key={k} value={k}>{k}</option>)}
              </Select></label>
            <label className="text-sm"><span className="text-text-muted">Scope</span>
              <Select value={newMem.scope} onChange={(e) => setNewMem({ ...newMem, scope: e.target.value })}>
                <option value="org">org (all repos)</option><option value="repo">repo</option>
              </Select></label>
          </div>
          {newMem.scope === "repo" ? (
            <label className="text-sm"><span className="text-text-muted">Repository</span>
              <Select value={newMem.repoId} onChange={(e) => setNewMem({ ...newMem, repoId: e.target.value })}>
                <option value="">— select —</option>
                {repos.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select></label>
          ) : null}
          <label className="text-sm"><span className="text-text-muted">Title</span>
            <Input value={newMem.title} onChange={(e) => setNewMem({ ...newMem, title: e.target.value })} /></label>
          <label className="text-sm"><span className="text-text-muted">Body</span>
            <textarea rows={4} className="w-full rounded-lg border border-white/10 bg-bg-deep/60 px-3 py-2 text-sm text-text-bright focus:outline-none focus:ring-2 focus:ring-azure/60"
              value={newMem.body} onChange={(e) => setNewMem({ ...newMem, body: e.target.value })} /></label>
          <label className="text-sm"><span className="text-text-muted">Tags (comma separated)</span>
            <Input value={newMem.tags} onChange={(e) => setNewMem({ ...newMem, tags: e.target.value })} /></label>
        </div>
      </Modal>
    </div>
  );
}

// Re-export so lazy imports can use `.then(m => m.AiEngineeringPage)` uniformly.
export default AiEngineeringPage;
