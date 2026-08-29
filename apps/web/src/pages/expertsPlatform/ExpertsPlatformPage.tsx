/**
 * WINDELS AI OS — Experts Platform console.
 *
 * Professional Intelligence Platform: domain expert agents, courses and expert
 * packages. Querying an expert returns a discriminated union — an available
 * answer or an explicit "no answer" with a reason; a refusal is never dressed
 * up as plausible prose, and every expert carries a consult-a-professional
 * disclaimer.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, UserCheck, GraduationCap, Package, Send, ShieldAlert, X } from "lucide-react";
import type {
  EpDashboard, EpExpertAgent, EpCourse, EpExpertPackage, EpExpertQueryResult,
} from "@windels/shared";
import { epApi } from "@/lib/expertsPlatform";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function statusTone(s: string): any {
  return s === "online" ? "emerald" : s === "training" ? "amber" : "slate";
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-sm text-text-muted">{label}</div>
    </CardContent></Card>
  );
}

export function ExpertsPlatformPage() {
  const [dash, setDash] = useState<EpDashboard | null>(null);
  const [agents, setAgents] = useState<EpExpertAgent[]>([]);
  const [courses, setCourses] = useState<EpCourse[]>([]);
  const [packages, setPackages] = useState<EpExpertPackage[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // query state
  const [qAgent, setQAgent] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<EpExpertQueryResult | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, a, c, p] = await Promise.all([epApi.dashboard(), epApi.agents(), epApi.courses(), epApi.packages()]);
      setDash(d); setAgents(a); setCourses(c); setPackages(p);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!qAgent && agents.length) setQAgent(agents[0]!.id);
  }, [agents, qAgent]);

  async function ask() {
    if (!qAgent || !question.trim()) { setErr("Choose an expert and enter a question."); return; }
    setErr(null);
    try { setResult(await epApi.query(qAgent, question.trim())); }
    catch (e: any) { setErr(e?.message ?? "Query failed"); }
  }

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading experts…"}</div>;
  }

  const selected = agents.find((a) => a.id === qAgent);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><UserCheck className="h-6 w-6 text-azure" /> Experts Platform</h1>
          <p className="text-sm text-text-muted">Professional Intelligence — domain expert agents, courses &amp; packages.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat label="Experts" value={dash.experts} />
        <Stat label="Online" value={dash.expertsOnline} />
        <Stat label="Courses" value={dash.courses} />
        <Stat label="Packages" value={dash.packages} />
        <Stat label="Queries (24h)" value={dash.queries24h} />
        <Card><CardContent className="pt-6">
          <div className="text-3xl font-semibold">{dash.disclaimerEnforced ? "Yes" : "No"}</div>
          <div className="text-sm text-text-muted">Disclaimer enforced</div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="experts">
        <TabsList>
          <TabsTrigger value="experts">Experts ({agents.length})</TabsTrigger>
          <TabsTrigger value="ask">Ask an expert</TabsTrigger>
          <TabsTrigger value="courses">Courses ({courses.length})</TabsTrigger>
          <TabsTrigger value="packages">Packages ({packages.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="experts">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {agents.length === 0 ? (
                <div className="text-sm text-text-muted">No expert agents yet.</div>
              ) : agents.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{a.name}</span>
                      <Badge variant="outline">{a.domain}</Badge>
                      <Badge variant={statusTone(a.status)}>{a.status}</Badge>
                    </div>
                    <div className="text-xs text-text-muted truncate mt-0.5">{a.specialization}</div>
                  </div>
                  <div className="text-xs text-text-muted text-right shrink-0">
                    <div>{a.queries24h} queries (24h)</div>
                    <div>accuracy {Math.round(a.accuracyScore * 100)}%</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ask">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-4 w-4 text-azure"/>Ask a domain expert</CardTitle>
            <CardDescription>Answers are real AI output or an explicit "no answer" — never fabricated prose.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <select
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={qAgent}
                onChange={(e) => setQAgent(e.target.value)}
              >
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.domain})</option>)}
              </select>
              <Textarea rows={3} placeholder="Your question…" value={question} onChange={(e) => setQuestion(e.target.value)} />
              <Button onClick={() => void ask()}>Ask expert</Button>

              {selected && (
                <div className="text-xs text-text-muted flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" />{selected.disclaimer}
                </div>
              )}

              {result && (
                <div className="rounded border border-border/40 bg-white/5 p-3 text-sm">
                  {result.available ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="emerald">answer</Badge>
                        <span className="text-xs text-text-muted">source: {result.modelSource}</span>
                      </div>
                      <div className="whitespace-pre-wrap">{result.answer}</div>
                      <div className="text-xs text-text-muted mt-2">{result.disclaimer}</div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="amber">no answer</Badge>
                        <span className="text-xs text-text-muted">{result.reason}</span>
                      </div>
                      <div>{result.message}</div>
                      <div className="text-xs text-text-muted mt-2">{result.disclaimer}</div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="courses">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {courses.length === 0 ? (
                <div className="text-sm text-text-muted">No courses yet.</div>
              ) : courses.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <GraduationCap className="h-4 w-4 text-azure shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm truncate">{c.title}</div>
                      <div className="text-xs text-text-muted">{c.author} · {c.language} · {c.lessons} lessons</div>
                    </div>
                  </div>
                  <div className="text-xs text-text-muted text-right shrink-0">
                    <Badge variant="outline">{c.level}</Badge> {c.enrolled} enrolled
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {packages.length === 0 ? (
                <div className="text-sm text-text-muted">No packages yet.</div>
              ) : packages.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="h-4 w-4 text-azure shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm truncate">{p.name}</div>
                      <div className="text-xs text-text-muted truncate">{p.description} · {p.sizeMb} MB</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.premium && <Badge variant="amber">premium</Badge>}
                    <Badge variant={p.installed ? "emerald" : "slate"}>{p.installed ? "installed" : "not installed"}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ExpertsPlatformPage;
