/**
 * OPEX Governance & Assurance Operations console.
 *
 * Surfaces the org-scoped opex subsystems that back the previously-structural
 * rollup fields — governance approval gates, the regulatory register,
 * operational playbooks, AI-decision explanations, and safety benchmarks — with
 * their real management actions. Every panel renders only what the store holds:
 * an empty org shows an honest empty state, never fabricated rows.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { RefreshCw, ShieldCheck, Scale, BookOpen, Lightbulb, Gauge } from "lucide-react";
import {
  opexGovernanceApi,
  opexRegulationsApi,
  opexPlaybooksApi,
  opexExplanationsApi,
  opexSafetyBenchmarksApi,
  OPEX_GATE_LEVELS,
  OPEX_REGULATION_CATEGORIES,
  OPEX_REGULATION_STATUSES,
  OPEX_PLAYBOOK_CATEGORIES,
  OPEX_PLAYBOOK_STATUSES,
  OPEX_PLAYBOOK_COMPLIANCE,
  SAFETY_CATEGORIES,
  type OpexGateRecord,
  type OpexGateRequestRecord,
  type Regulation,
  type Playbook,
  type Explanation,
  type OpexGateLevel,
  type OpexRegulationCategory,
  type OpexRegulationStatus,
  type OpexPlaybookCategory,
  type OpexPlaybookStatus,
  type OpexPlaybookCompliance,
  type SafetyCategory,
} from "@/lib/opex";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";

function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-text-muted">{children}</div>;
}

export function OpexGovernancePage() {
  const user = useAuthStore((s) => s.user);
  const canWrite = user?.role === "admin" || user?.role === "super_admin";

  const [gates, setGates] = useState<OpexGateRecord[]>([]);
  const [requestsByGate, setRequestsByGate] = useState<Record<string, OpexGateRequestRecord[]>>({});
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [explanations, setExplanations] = useState<Explanation[]>([]);
  const [benchmarks, setBenchmarks] = useState<Partial<Record<SafetyCategory, { pass: boolean; score: number }>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(null), 3000); };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, r, p, x, b] = await Promise.all([
        opexGovernanceApi.listGates(),
        opexRegulationsApi.list(),
        opexPlaybooksApi.list(),
        opexExplanationsApi.list(),
        opexSafetyBenchmarksApi.rollup(),
      ]);
      setGates(g); setRegulations(r); setPlaybooks(p); setExplanations(x); setBenchmarks(b);
      const reqs = await Promise.all(g.map((gate) => opexGovernanceApi.listRequests(gate.id)));
      setRequestsByGate(Object.fromEntries(g.map((gate, i) => [gate.id, reqs[i] ?? []])));
      setError(null);
    } catch (e) { fail(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // ── forms ──────────────────────────────────────────────────────────────
  const [gateForm, setGateForm] = useState({ name: "", level: "l2_manager" as OpexGateLevel });
  const [regForm, setRegForm] = useState({ name: "", jurisdiction: "", category: "privacy" as OpexRegulationCategory, status: "proposed" as OpexRegulationStatus, gapCount: "0", gapResolved: "0" });
  const [pbForm, setPbForm] = useState({ name: "", category: "ops" as OpexPlaybookCategory, status: "draft" as OpexPlaybookStatus, compliance: "unknown" as OpexPlaybookCompliance, steps: "0" });
  const [benchForm, setBenchForm] = useState({ category: "jailbreak" as SafetyCategory, score: "80", passThreshold: "80" });

  async function addGate() {
    if (!gateForm.name) return;
    try { await opexGovernanceApi.createGate({ name: gateForm.name, level: gateForm.level }); setGateForm({ name: "", level: gateForm.level }); flash("Gate created."); await load(); } catch (e) { fail(e); }
  }
  async function openRequest(gateId: string) {
    const subject = prompt("Request subject (what needs approval)?");
    if (!subject) return;
    try { await opexGovernanceApi.openRequest(gateId, { subject }); flash("Request opened."); await load(); } catch (e) { fail(e); }
  }
  async function decide(gateId: string, requestId: string, decision: "approved" | "rejected") {
    try { await opexGovernanceApi.decideRequest(gateId, requestId, { decision }); flash(`Request ${decision}.`); await load(); } catch (e) { fail(e); }
  }
  async function addRegulation() {
    if (!regForm.name || !regForm.jurisdiction) return;
    try {
      await opexRegulationsApi.create({ name: regForm.name, jurisdiction: regForm.jurisdiction, category: regForm.category, status: regForm.status, gapCount: Number(regForm.gapCount), gapResolved: Number(regForm.gapResolved) } as any);
      setRegForm({ ...regForm, name: "", jurisdiction: "" }); flash("Regulation tracked."); await load();
    } catch (e) { fail(e); }
  }
  async function addPlaybook() {
    if (!pbForm.name) return;
    try {
      await opexPlaybooksApi.create({ name: pbForm.name, category: pbForm.category, status: pbForm.status, compliance: pbForm.compliance, steps: Number(pbForm.steps) } as any);
      setPbForm({ ...pbForm, name: "" }); flash("Playbook added."); await load();
    } catch (e) { fail(e); }
  }
  async function simulate(id: string) {
    try { await opexPlaybooksApi.simulate(id); flash("Simulation recorded."); await load(); } catch (e) { fail(e); }
  }
  async function addBenchmark() {
    try {
      await opexSafetyBenchmarksApi.record({ category: benchForm.category, score: Number(benchForm.score), passThreshold: Number(benchForm.passThreshold) } as any);
      flash("Benchmark recorded."); await load();
    } catch (e) { fail(e); }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-text-bright"><ShieldCheck className="h-6 w-6 text-violet" /> Governance &amp; Assurance Operations</h1>
          <p className="text-sm text-text-muted">Org-scoped approval gates, regulatory register, playbooks, AI-decision explanations and safety benchmarks. Empty means nothing recorded yet — never fabricated.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
      </div>

      {error ? <div className="rounded-md border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald/30 bg-emerald/10 p-3 text-sm text-emerald">{notice}</div> : null}

      <Tabs defaultValue="gates">
        <TabsList>
          <TabsTrigger value="gates"><Scale className="mr-1 h-4 w-4" /> Gates</TabsTrigger>
          <TabsTrigger value="regulations"><BookOpen className="mr-1 h-4 w-4" /> Regulations</TabsTrigger>
          <TabsTrigger value="playbooks"><BookOpen className="mr-1 h-4 w-4" /> Playbooks</TabsTrigger>
          <TabsTrigger value="explanations"><Lightbulb className="mr-1 h-4 w-4" /> Explanations</TabsTrigger>
          <TabsTrigger value="benchmarks"><Gauge className="mr-1 h-4 w-4" /> Benchmarks</TabsTrigger>
        </TabsList>

        {/* ── Governance gates ── */}
        <TabsContent value="gates">
          {canWrite ? (
            <Card className="mb-4"><CardContent className="flex flex-wrap items-end gap-2 p-4">
              <div className="flex-1 min-w-[180px]"><label className="mb-1 block text-xs text-text-muted">Gate name</label><Input value={gateForm.name} onChange={(e) => setGateForm({ ...gateForm, name: e.target.value })} placeholder="e.g. Production deploy" /></div>
              <div><label className="mb-1 block text-xs text-text-muted">Authority level</label><Select value={gateForm.level} onChange={(e) => setGateForm({ ...gateForm, level: e.target.value as OpexGateLevel })}>{OPEX_GATE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}</Select></div>
              <Button onClick={() => void addGate()}>Add gate</Button>
            </CardContent></Card>
          ) : null}
          {gates.length === 0 ? <Empty>No approval gates configured.</Empty> : (
            <div className="space-y-3">
              {gates.map((gate) => {
                const reqs = requestsByGate[gate.id] ?? [];
                const pending = reqs.filter((r) => r.status === "pending");
                return (
                  <Card key={gate.id}>
                    <CardHeader className="flex-row items-center justify-between gap-2">
                      <div><CardTitle className="text-base">{gate.name}</CardTitle><CardDescription>{gate.level} · {pending.length} pending</CardDescription></div>
                      {canWrite ? <Button size="sm" variant="outline" onClick={() => void openRequest(gate.id)}>Open request</Button> : null}
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {reqs.length === 0 ? <Empty>No requests.</Empty> : reqs.map((r) => (
                        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 p-2 text-sm">
                          <div><span className="text-text-bright">{r.subject}</span> <Badge variant={r.status === "approved" ? "emerald" : r.status === "rejected" ? "crimson" : "amber"}>{r.status}</Badge></div>
                          {canWrite && r.status === "pending" ? (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => void decide(gate.id, r.id, "approved")}>Approve</Button>
                              <Button size="sm" variant="outline" onClick={() => void decide(gate.id, r.id, "rejected")}>Reject</Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Regulations ── */}
        <TabsContent value="regulations">
          {canWrite ? (
            <Card className="mb-4"><CardContent className="flex flex-wrap items-end gap-2 p-4">
              <div className="flex-1 min-w-[160px]"><label className="mb-1 block text-xs text-text-muted">Name</label><Input value={regForm.name} onChange={(e) => setRegForm({ ...regForm, name: e.target.value })} placeholder="e.g. GDPR" /></div>
              <div><label className="mb-1 block text-xs text-text-muted">Jurisdiction</label><Input value={regForm.jurisdiction} onChange={(e) => setRegForm({ ...regForm, jurisdiction: e.target.value })} placeholder="EU" /></div>
              <div><label className="mb-1 block text-xs text-text-muted">Category</label><Select value={regForm.category} onChange={(e) => setRegForm({ ...regForm, category: e.target.value as OpexRegulationCategory })}>{OPEX_REGULATION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
              <div><label className="mb-1 block text-xs text-text-muted">Status</label><Select value={regForm.status} onChange={(e) => setRegForm({ ...regForm, status: e.target.value as OpexRegulationStatus })}>{OPEX_REGULATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
              <div className="w-20"><label className="mb-1 block text-xs text-text-muted">Gaps</label><Input type="number" value={regForm.gapCount} onChange={(e) => setRegForm({ ...regForm, gapCount: e.target.value })} /></div>
              <Button onClick={() => void addRegulation()}>Track</Button>
            </CardContent></Card>
          ) : null}
          {regulations.length === 0 ? <Empty>No regulations tracked.</Empty> : (
            <div className="space-y-2">{regulations.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 p-3 text-sm">
                <div><span className="text-text-bright">{r.name}</span> <span className="text-text-muted">· {r.jurisdiction} · {r.category}</span></div>
                <div className="flex items-center gap-2"><Badge variant="slate">{r.status}</Badge><span className="text-xs text-text-muted">{Math.max(0, r.gapCount - r.gapResolved)} open gaps</span></div>
              </div>
            ))}</div>
          )}
        </TabsContent>

        {/* ── Playbooks ── */}
        <TabsContent value="playbooks">
          {canWrite ? (
            <Card className="mb-4"><CardContent className="flex flex-wrap items-end gap-2 p-4">
              <div className="flex-1 min-w-[160px]"><label className="mb-1 block text-xs text-text-muted">Name</label><Input value={pbForm.name} onChange={(e) => setPbForm({ ...pbForm, name: e.target.value })} placeholder="e.g. Incident response" /></div>
              <div><label className="mb-1 block text-xs text-text-muted">Category</label><Select value={pbForm.category} onChange={(e) => setPbForm({ ...pbForm, category: e.target.value as OpexPlaybookCategory })}>{OPEX_PLAYBOOK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
              <div><label className="mb-1 block text-xs text-text-muted">Status</label><Select value={pbForm.status} onChange={(e) => setPbForm({ ...pbForm, status: e.target.value as OpexPlaybookStatus })}>{OPEX_PLAYBOOK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
              <div><label className="mb-1 block text-xs text-text-muted">Compliance</label><Select value={pbForm.compliance} onChange={(e) => setPbForm({ ...pbForm, compliance: e.target.value as OpexPlaybookCompliance })}>{OPEX_PLAYBOOK_COMPLIANCE.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
              <Button onClick={() => void addPlaybook()}>Add</Button>
            </CardContent></Card>
          ) : null}
          {playbooks.length === 0 ? <Empty>No playbooks recorded.</Empty> : (
            <div className="space-y-2">{playbooks.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 p-3 text-sm">
                <div><span className="text-text-bright">{p.name}</span> <span className="text-text-muted">· {p.category} · {p.simulations} sim(s)</span></div>
                <div className="flex items-center gap-2">
                  <Badge variant={p.compliance === "verified" ? "emerald" : p.compliance === "gaps" ? "amber" : "slate"}>{p.compliance}</Badge>
                  <Badge variant="slate">{p.status}</Badge>
                  {canWrite ? <Button size="sm" variant="outline" onClick={() => void simulate(p.id)}>Simulate</Button> : null}
                </div>
              </div>
            ))}</div>
          )}
        </TabsContent>

        {/* ── Explanations ── */}
        <TabsContent value="explanations">
          {explanations.length === 0 ? <Empty>No AI-decision explanations recorded.</Empty> : (
            <div className="space-y-2">{explanations.map((x) => (
              <div key={x.id} className="rounded-md border border-white/10 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-text-bright">{x.decisionSummary}</span>
                  <Badge variant="azure">{Math.round(x.confidence * 100)}% confidence</Badge>
                </div>
                <div className="mt-1 text-xs text-text-muted">{x.evidenceCount} evidence · {x.policyChecks.length} policy checks · {x.risks.length} risks</div>
              </div>
            ))}</div>
          )}
        </TabsContent>

        {/* ── Safety benchmarks ── */}
        <TabsContent value="benchmarks">
          {canWrite ? (
            <Card className="mb-4"><CardContent className="flex flex-wrap items-end gap-2 p-4">
              <div><label className="mb-1 block text-xs text-text-muted">Category</label><Select value={benchForm.category} onChange={(e) => setBenchForm({ ...benchForm, category: e.target.value as SafetyCategory })}>{SAFETY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
              <div className="w-24"><label className="mb-1 block text-xs text-text-muted">Score</label><Input type="number" value={benchForm.score} onChange={(e) => setBenchForm({ ...benchForm, score: e.target.value })} /></div>
              <div className="w-28"><label className="mb-1 block text-xs text-text-muted">Pass ≥</label><Input type="number" value={benchForm.passThreshold} onChange={(e) => setBenchForm({ ...benchForm, passThreshold: e.target.value })} /></div>
              <Button onClick={() => void addBenchmark()}>Record</Button>
            </CardContent></Card>
          ) : null}
          {Object.keys(benchmarks).length === 0 ? <Empty>No safety benchmarks recorded.</Empty> : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.entries(benchmarks) as Array<[string, { pass: boolean; score: number }]>).map(([cat, res]) => (
                <div key={cat} className="flex items-center justify-between rounded-md border border-white/10 p-3 text-sm">
                  <span className="text-text-bright">{cat}</span>
                  <Badge variant={res.pass ? "emerald" : "crimson"}>{res.score} {res.pass ? "pass" : "fail"}</Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default OpexGovernancePage;
