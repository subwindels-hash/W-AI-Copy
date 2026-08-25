/**
 * WINDELS AI OS — Program Management console.
 *
 * Roadmaps, sprints, backlog stories and risk register.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, CalendarRange, ListTodo, AlertTriangle, ClipboardList, X } from "lucide-react";
import type { Sprint, Story, Risk, Roadmap } from "@windels/shared";
import { programApi } from "@/lib/program";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function fmtDate(s?: string) { if (!s) return "—"; try { return new Date(s).toLocaleDateString(); } catch { return s; } }

function sprintTone(s?: string): any {
  return s === "active" ? "emerald" : s === "completed" ? "azure" : s === "planned" ? "slate" : "amber";
}
function riskLevel(l: number, i: number): string {
  const s = l * i;
  if (s >= 16) return "critical";
  if (s >= 10) return "high";
  if (s >= 5) return "medium";
  return "low";
}
function riskTone(l: string): any {
  return l === "high" || l === "critical" ? "crimson" : l === "medium" ? "amber" : "slate";
}

export function ProgramPage() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [backlog, setBacklog] = useState<Story[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [s, b, r, rm] = await Promise.all([
        programApi.listSprints(), programApi.listBacklog(), programApi.listRisks(), programApi.listRoadmaps(),
      ]);
      setSprints(s); setBacklog(b); setRisks(r); setRoadmaps(rm);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function setStatus(id: string, status: Story["status"]) {
    setErr(null); try { await programApi.setStoryStatus(id, status); await load(); } catch (e: any) { setErr(e?.message ?? "Update failed"); }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><ClipboardList className="h-6 w-6 text-azure" /> Program Management</h1>
          <p className="text-sm text-text-muted">Roadmaps, sprints, backlog &amp; risk register.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <Tabs defaultValue="sprints">
        <TabsList>
          <TabsTrigger value="sprints">Sprints ({sprints.length})</TabsTrigger>
          <TabsTrigger value="backlog">Backlog ({backlog.length})</TabsTrigger>
          <TabsTrigger value="risks">Risks ({risks.length})</TabsTrigger>
          <TabsTrigger value="roadmaps">Roadmaps ({roadmaps.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="sprints">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {sprints.length === 0 ? (
                <div className="text-sm text-text-muted">No sprints yet.</div>
              ) : sprints.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CalendarRange className="h-4 w-4 text-azure shrink-0"/>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="text-xs text-text-muted">{fmtDate(s.startAt)} → {fmtDate(s.endAt)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={sprintTone(s.status)}>{s.status}</Badge>
                    <span className="text-xs text-text-muted">{s.capacityPoints} pts</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backlog">
          <Card>
            <CardContent className="space-y-1 pt-4">
              {backlog.length === 0 ? (
                <div className="text-sm text-text-muted">No backlog items.</div>
              ) : backlog.map((st) => (
                <div key={st.id} className="flex items-center justify-between gap-3 border-b border-border/30 py-1.5 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <ListTodo className="h-4 w-4 text-azure shrink-0"/>
                    <span className="truncate">{st.key} — {st.title}</span>
                    <Badge variant="outline">{st.points}pts</Badge>
                  </div>
                  <select
                    className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs shrink-0"
                    value={st.status}
                    onChange={(e) => void setStatus(st.id, e.target.value as Story["status"])}
                  >
                    {["backlog", "ready", "in_progress", "in_review", "done", "blocked"].map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}
                  </select>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risks">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {risks.length === 0 ? (
                <div className="text-sm text-text-muted">No risks registered.</div>
              ) : risks.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className={`h-4 w-4 shrink-0 ${riskLevel(r.likelihood, r.impact) === "high" || riskLevel(r.likelihood, r.impact) === "critical" ? "text-crimson" : "text-amber-400"}`}/>
                    <div className="min-w-0">
                      <div className="text-sm truncate">{r.title}</div>
                      <div className="text-xs text-text-muted">{r.category} · {r.mitigations.length} mitigations</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={riskTone(riskLevel(r.likelihood, r.impact))}>{riskLevel(r.likelihood, r.impact)}</Badge>
                    <Badge variant="outline">{r.status}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roadmaps">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {roadmaps.length === 0 ? (
                <div className="text-sm text-text-muted">No roadmaps yet.</div>
              ) : roadmaps.map((r) => (
                <div key={r.id} className="border-b border-border/30 py-2">
                  <div className="flex items-center gap-2 text-sm"><span className="font-medium">{r.title}</span><Badge variant="outline">{r.year}</Badge><Badge variant={r.status === "in_progress" ? "emerald" : r.status === "at_risk" || r.status === "blocked" ? "crimson" : "slate"}>{r.status}</Badge></div>
                  <div className="text-xs text-text-muted mt-0.5">{r.vision}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ProgramPage;
