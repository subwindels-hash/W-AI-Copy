/**
 * Session 166 — AI Capability Composer console (/app/composer).
 *
 * Tabs: Workflows · Runs · Library
 *
 * Honesty:
 *   - nothing in this repository EXECUTES a composed workflow. Triggering a run
 *     enqueues it; an external executor must report the outcome back through
 *     POST /composer/runs/:id/outcome. Until one does, the run stays `queued`
 *     and moves no success rate. The page states this rather than letting a
 *     growing "Total Runs" imply work was done.
 *   - success rate renders "—" until at least one run has been resolved. It was
 *     `totalRuns ? succ/totalRuns : 1`, so an org that had never run anything
 *     reported 100%; the old console then applied `(successRate || 1)`, which
 *     also turned a real 0% into 100%.
 *   - estimated cost per run is not shown as a figure. It was
 *     `capabilityCount * 0.002` with no pricing table anywhere in the module.
 *   - workflows whose stored row cannot be parsed are surfaced, not hidden. A
 *     bootstrap used to DELETE them.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Workflow, Play, Rocket, Pause, PlayCircle, Loader2, AlertTriangle, CheckCircle2,
} from "lucide-react";
import {
  composerApi,
  type ComposedWorkflow, type ComposerDashboard,
  type ComposerRunLog, type ComposerValidationResult,
} from "@/lib/composer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

/** Render an unmeasured value as an em dash, never as 0 or 100%. */
const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`;
const ms = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v}ms`;

const STATUS_TONE: Record<string, "emerald" | "slate" | "amber"> = {
  deployed: "emerald",
  draft: "slate",
  paused: "amber",
};

const RUN_TONE: Record<string, "emerald" | "crimson" | "azure" | "slate"> = {
  succeeded: "emerald",
  failed: "crimson",
  running: "azure",
  queued: "slate",
};

function Stat(props: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] uppercase tracking-wide text-text-muted">{props.label}</div>
        <div className="text-xl font-semibold">{props.value}</div>
        {props.sub && <div className="text-[11px] text-text-muted mt-0.5">{props.sub}</div>}
      </CardContent>
    </Card>
  );
}

export function ComposerPage() {
  const [dash, setDash] = useState<ComposerDashboard | null>(null);
  const [workflows, setWorkflows] = useState<ComposedWorkflow[]>([]);
  const [runs, setRuns] = useState<ComposerRunLog[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [validation, setValidation] = useState<ComposerValidationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, w, r] = await Promise.all([
        composerApi.dashboard(), composerApi.list(), composerApi.runs(),
      ]);
      setDash(d); setWorkflows(w); setRuns(r);
      setSelected((prev) => prev ?? (w.length ? w[0]!.id : null));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "failed to load composer");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) { setValidation(null); return; }
    let cancelled = false;
    void composerApi.validate(selected)
      .then((v) => { if (!cancelled) setValidation(v); })
      .catch(() => { if (!cancelled) setValidation(null); });
    return () => { cancelled = true; };
  }, [selected, workflows]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); setNotice(ok); await load(); }
    catch (e: any) { setError(e?.message ?? "action failed"); }
    finally { setBusy(false); }
  };

  const current = workflows.find((w) => w.id === selected) ?? null;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Workflow className="h-6 w-6 text-fuchsia" />
        <div>
          <h1 className="text-xl font-semibold">AI Capability Composer</h1>
          <p className="text-sm text-text-muted">
            Compose workflows from 11 AI primitives.
          </p>
        </div>
      </div>

      {/* The single most important thing an operator needs to know here. */}
      <div className="rounded-md border border-amber/40 bg-amber/10 p-3 text-xs flex gap-2">
        <AlertTriangle className="h-4 w-4 text-amber shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Composer builds and queues; it does not execute.</span>{" "}
          No workflow executor ships with this platform. Triggering a run records it as{" "}
          <span className="font-mono">queued</span> — an external executor must report the outcome
          to <span className="font-mono">POST /composer/runs/:id/outcome</span> before a run counts
          as succeeded or failed, or moves any success rate. A rising run count does not mean work
          was performed.
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-crimson/40 bg-crimson/10 p-3 text-xs text-crimson">{error}</div>
      )}
      {notice && (
        <div className="rounded-md border border-emerald/40 bg-emerald/10 p-3 text-xs text-emerald">{notice}</div>
      )}

      {dash && (
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Workflows" value={dash.totalWorkflows}
            sub={`${dash.deployedWorkflows} deployed · ${dash.draftWorkflows} draft`} />
          <Stat label="Paused" value={dash.pausedWorkflows} />
          <Stat label="Runs triggered" value={dash.totalRuns} sub="includes queued" />
          <Stat label="Awaiting executor" value={dash.queuedRuns}
            sub={dash.queuedRuns > 0 ? "no outcome reported" : "none pending"} />
          <Stat label="Resolved" value={dash.resolvedRuns}
            sub={`${dash.failedRuns} failed`} />
          <Stat label="Success" value={pct(dash.successRate)}
            sub={dash.successRate === null ? "nothing resolved" : `of ${dash.resolvedRuns} resolved`} />
        </div>
      )}

      {dash && dash.unreadableWorkflows > 0 && (
        <div className="rounded-md border border-crimson/40 bg-crimson/10 p-3 text-xs">
          <span className="font-semibold">{dash.unreadableWorkflows} workflow record(s) could not be read.</span>{" "}
          They have been left untouched for inspection. An earlier version of the bootstrap deleted
          unreadable rows and reseeded a demo example in their place.
        </div>
      )}

      <Tabs defaultValue="workflows">
        <TabsList>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
        </TabsList>

        {/* ─── Workflows ─────────────────────────────────────────────── */}
        <TabsContent value="workflows">
          {workflows.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-text-muted">
                No workflows yet. A new organization starts empty — the example workflow is demo
                data and only appears when <span className="font-mono">WINDELS_DEMO_DATA=true</span>.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <Card className="md:col-span-1">
                <CardHeader><CardTitle className="text-sm">Workflows</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-xs max-h-96 overflow-y-auto">
                  {workflows.map((w) => (
                    <button key={w.id} onClick={() => setSelected(w.id)}
                      className={`w-full text-left rounded p-2 border ${
                        selected === w.id ? "bg-fuchsia/10 border-fuchsia/40" : "border-transparent hover:bg-white/5"
                      }`}>
                      <div className="flex items-center gap-2">
                        <span className="flex-1 font-medium truncate">{w.name}</span>
                        <Badge variant={STATUS_TONE[w.status] ?? "slate"}>{w.status}</Badge>
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5">
                        v{w.version} · {w.runs} resolved
                        {w.queuedRuns > 0 && <span className="text-amber"> · {w.queuedRuns} queued</span>}
                        {w.source === "demo_seed" && <span className="ml-1 text-violet">demo seed</span>}
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">{current?.name ?? "Select a workflow"}</CardTitle>
                  {current && (
                    <CardDescription className="text-xs">
                      {current.description || "No description."} · v{current.version} ·{" "}
                      avg {ms(current.avgDurationMs)} · success {pct(current.successRate)}
                      {current.successRate === null && " (nothing resolved)"}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {current && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="success" disabled={busy || !validation?.valid || current.status === "deployed"}
                          onClick={() => act(() => composerApi.deploy(current.id), "workflow deployed")}>
                          <Rocket className="h-3 w-3 mr-1" />Deploy
                        </Button>
                        <Button size="sm" variant="primary" disabled={busy || current.status !== "deployed"}
                          onClick={() => act(() => composerApi.run(current.id), "run queued — awaiting an executor")}>
                          <Play className="h-3 w-3 mr-1" />Queue run
                        </Button>
                        {current.status === "deployed" && (
                          <Button size="sm" variant="outline" disabled={busy}
                            onClick={() => act(() => composerApi.pause(current.id), "workflow paused")}>
                            <Pause className="h-3 w-3 mr-1" />Pause
                          </Button>
                        )}
                        {current.status === "paused" && (
                          <Button size="sm" variant="outline" disabled={busy}
                            onClick={() => act(() => composerApi.resume(current.id), "workflow resumed")}>
                            <PlayCircle className="h-3 w-3 mr-1" />Resume
                          </Button>
                        )}
                        {busy && <Loader2 className="h-4 w-4 animate-spin text-text-muted" />}
                      </div>

                      {current.status !== "deployed" && (
                        <div className="text-[11px] text-text-muted">
                          Only a deployed workflow can be run. Editing a deployed workflow returns it
                          to draft, because the deployed shape is no longer the stored shape.
                        </div>
                      )}

                      {validation && (
                        <div className={`p-2 rounded border ${
                          validation.valid ? "bg-emerald/10 border-emerald/30" : "bg-crimson/10 border-crimson/30"
                        }`}>
                          <div className="font-semibold flex items-center gap-1">
                            {validation.valid
                              ? <><CheckCircle2 className="h-3 w-3" />valid</>
                              : <><AlertTriangle className="h-3 w-3" />invalid</>}
                            <span className="font-normal text-text-muted">
                              · {validation.capabilityCount} capabilities
                            </span>
                          </div>
                          {validation.errors.map((e, i) => (
                            <div key={i} className="text-crimson">• {e.message}</div>
                          ))}
                          {validation.warnings.map((w, i) => (
                            <div key={i} className="text-amber">! {w}</div>
                          ))}
                          {!validation.costModelConfigured && (
                            <div className="text-[11px] text-text-muted mt-1">
                              Cost per run: not available. No per-capability pricing is configured.
                              This field previously showed a figure derived from the node count
                              alone, which priced a video generation the same as an analytics event.
                            </div>
                          )}
                        </div>
                      )}

                      <div>
                        <div className="text-[11px] uppercase text-text-muted mb-1">
                          Canvas · {current.nodes.length} nodes · {current.edges.length} edges
                        </div>
                        <div className="relative bg-black/20 rounded h-56 border border-white/5 overflow-hidden">
                          {current.nodes.map((n) => (
                            <div key={n.id}
                              className="absolute rounded px-2 py-1 text-[10px] border"
                              style={{
                                left: `${Math.min(92, (n.x / 1000) * 100)}%`,
                                top: `${Math.min(85, (n.y / 300) * 100)}%`,
                                background: n.kind === "trigger" ? "rgba(59,130,246,.15)"
                                  : n.kind === "output" ? "rgba(16,185,129,.15)" : "rgba(217,70,239,.15)",
                                borderColor: n.kind === "trigger" ? "#3B82F6"
                                  : n.kind === "output" ? "#10B981" : "#D946EF",
                              }}>
                              {n.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ─── Runs ──────────────────────────────────────────────────── */}
        <TabsContent value="runs">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent runs</CardTitle>
              <CardDescription className="text-xs">
                Newest first. A <span className="font-mono">queued</span> run has been recorded but
                not executed — nothing in this platform executes composer workflows, so queued is
                the expected steady state until an external executor is wired up.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              {runs.length === 0 && <div className="text-text-muted">No runs recorded.</div>}
              {runs.map((r) => (
                <div key={r.id} className="flex items-center gap-2 border-b border-white/5 py-1">
                  <Badge variant={RUN_TONE[r.status] ?? "slate"}>{r.status}</Badge>
                  <span className="font-mono text-[11px]">{r.id.slice(0, 12)}</span>
                  <span className="text-text-muted flex-1 truncate">
                    {r.stepCount} steps · triggered by {r.triggeredBy}
                  </span>
                  {r.status === "queued"
                    ? <span className="text-text-muted">awaiting executor</span>
                    : <span className="text-text-muted">{r.durationMs}ms · reported by {r.reportedBy ?? "—"}</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Library ───────────────────────────────────────────────── */}
        <TabsContent value="library">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Capability library</CardTitle>
              <CardDescription className="text-xs">
                A static catalogue of composable primitives, identical for every organization. It
                describes what can be wired, not what this organization has used.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
              {(dash?.library ?? []).map((c) => (
                <div key={c.type} className="border border-white/5 rounded p-2">
                  <div className="font-semibold">{c.label}</div>
                  <div className="text-text-muted text-[11px]">{c.description}</div>
                  <div className="text-[11px] mt-1">
                    <span className="text-violet">{c.sourceSession}</span>
                    <span className="text-text-muted"> · in: {c.inputs.join(", ")} · out: {c.outputs.join(", ")}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {dash && dash.popularCapabilities.length > 0 && (
            <Card className="mt-3">
              <CardHeader>
                <CardTitle className="text-sm">Most wired capabilities</CardTitle>
                <CardDescription className="text-xs">
                  Counted from the nodes actually present in this organization's workflows — not
                  from execution, which does not happen here.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                {dash.popularCapabilities.map((c) => (
                  <div key={c.type} className="flex justify-between border-b border-white/5 py-1">
                    <span>{c.type.replace(/_/g, " ")}</span>
                    <span className="text-text-muted">{c.uses} node{c.uses === 1 ? "" : "s"}</span>
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

export default ComposerPage;
