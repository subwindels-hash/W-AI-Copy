/** Session 106 — approval-first Autonomous Organization page. */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, Crown, RefreshCw, ShieldAlert, Users, X } from "lucide-react";
import { autApi, type AutonomousDashboard, type BoardDecision } from "@/lib/autonomous";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";

function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return <Card><CardContent className="flex items-start gap-3 p-4"><div className="rounded-lg border border-amber/20 bg-amber/10 p-2 text-amber">{icon}</div><div><div className="text-2xl font-black text-text-bright">{value}</div><div className="text-xs text-text-muted">{label}</div>{detail ? <div className="text-[11px] text-text-muted">{detail}</div> : null}</div></CardContent></Card>;
}

const riskVariant: Record<BoardDecision["riskLevel"], "emerald" | "amber" | "crimson"> = { low: "emerald", med: "amber", high: "crimson", critical: "crimson" };

export function AutonomousPage() {
  const user = useAuthStore((state) => state.user);
  const canWrite = user?.role === "admin" || user?.role === "super_admin";
  const [data, setData] = useState<AutonomousDashboard | null>(null);
  const [decisions, setDecisions] = useState<BoardDecision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", department: "", recommendation: "", confidence: "0.5", riskLevel: "med" as BoardDecision["riskLevel"], estimatedImpactUsd: "0", reasoning: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const [dashboard, rows] = await Promise.all([autApi.dashboard(), autApi.decisions({ limit: 100 })]); setData(dashboard); setDecisions(rows); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(null), 3000); };

  async function propose() {
    if (!form.title || !form.department || !form.recommendation || !form.reasoning) return;
    try { await autApi.propose({ ...form, confidence: Number(form.confidence), estimatedImpactUsd: Number(form.estimatedImpactUsd) }); setForm({ ...form, title: "", recommendation: "", reasoning: "" }); flash("Proposal submitted to the human approval inbox."); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function resolve(decision: BoardDecision, approved: boolean) {
    try { await autApi.resolve(decision.id, { approved, note: approved ? "Approved from Autonomous Organization console." : "Rejected from Autonomous Organization console." }); flash(approved ? "Proposal approved." : "Proposal rejected."); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function deletePending(decision: BoardDecision) {
    try { await autApi.deleteDecision(decision.id); flash("Draft proposal removed."); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Crown className="h-6 w-6 text-amber" /><h1 className="text-2xl font-black text-text-bright">Autonomous Organization</h1><Badge variant="amber">approval-first</Badge></div><p className="mt-1 max-w-3xl text-sm text-text-muted">Proposal and human-decision register. This module never executes autonomously; every recommendation requires an authenticated human decision.</p></div><Button size="sm" variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button></div>
    {error ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{error}<button className="float-right" onClick={() => setError(null)}>✕</button></div> : null}{notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"><Stat icon={<Crown className="h-5 w-5" />} label="Human review rate" value={`${data?.autonomyIndex ?? 0}%`} detail="resolved proposals" /><Stat icon={<ShieldAlert className="h-5 w-5" />} label="Open approvals" value={String(data?.openApprovals ?? 0)} detail="blocked pending review" /><Stat icon={<Users className="h-5 w-5" />} label="Departments" value={String(data?.departmentsCount ?? 0)} detail="derived from proposals" /><Stat icon={<Check className="h-5 w-5" />} label="Approved impact" value={`$${(data?.autonomousSavings30dUsd ?? 0).toLocaleString()}`} detail={data?.impactKind === "approved_estimate" ? "approved estimate, not realized savings" : "no approved estimate"} /></div>
    <Card><CardContent className="flex items-start gap-3 p-4 text-xs text-text-muted"><ShieldAlert className="h-4 w-4 shrink-0 text-amber" /><span>Budgets, executive seats, strategic plans and realized savings are not invented. The dashboard shows zero until those backing ledgers exist. Approved impact is explicitly an estimate from a human-approved proposal.</span></CardContent></Card>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <Card><CardHeader><CardTitle>Decision register</CardTitle><CardDescription>Every proposal remains visible with its real status and human approver.</CardDescription></CardHeader><CardContent><div className="space-y-2">{decisions.map((decision) => <div key={decision.id} className="rounded-lg border border-white/10 bg-white/5 p-3"><div className="flex flex-wrap items-center gap-2"><span className="flex-1 font-medium text-text-bright">{decision.title}</span><Badge variant="slate">{decision.department}</Badge><Badge variant={riskVariant[decision.riskLevel]}>{decision.riskLevel}</Badge><Badge variant={decision.status === "approved" ? "emerald" : decision.status === "rejected" ? "crimson" : "amber"}>{decision.status}</Badge></div><div className="mt-2 text-sm text-text-muted">{decision.recommendation}</div><div className="mt-2 text-xs text-text-muted">confidence {(decision.confidence * 100).toFixed(0)}% · estimated impact ${decision.estimatedImpactUsd.toLocaleString()} · {new Date(decision.createdAt).toLocaleString()}</div>{decision.status === "awaiting_human" && canWrite ? <div className="mt-3 flex gap-2"><Button size="sm" variant="success" onClick={() => void resolve(decision, true)}><Check className="h-3.5 w-3.5" />Approve</Button><Button size="sm" variant="danger" onClick={() => void resolve(decision, false)}><X className="h-3.5 w-3.5" />Reject</Button><Button size="sm" variant="ghost" onClick={() => void deletePending(decision)}>Delete draft</Button></div> : null}{decision.humanApprover ? <div className="mt-2 text-xs text-text-muted">decided by {decision.humanApprover}{decision.decisionNote ? ` · ${decision.decisionNote}` : ""}</div> : null}</div>)}{decisions.length === 0 ? <p className="py-8 text-center text-sm text-text-muted">No proposals recorded for this organization.</p> : null}</div></CardContent></Card>
      {canWrite ? <Card><CardHeader><CardTitle className="text-base">Submit proposal</CardTitle><CardDescription>Creates an awaiting-human decision. It will not execute automatically.</CardDescription></CardHeader><CardContent className="space-y-2"><Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><Input placeholder="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /><Textarea rows={3} placeholder="Recommendation" value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value })} /><Textarea rows={3} placeholder="Reasoning / evidence" value={form.reasoning} onChange={(e) => setForm({ ...form, reasoning: e.target.value })} /><div className="grid grid-cols-2 gap-2"><Input type="number" min="0" max="1" step="0.05" placeholder="Confidence 0–1" value={form.confidence} onChange={(e) => setForm({ ...form, confidence: e.target.value })} /><Input type="number" step="0.01" placeholder="Estimated impact USD" value={form.estimatedImpactUsd} onChange={(e) => setForm({ ...form, estimatedImpactUsd: e.target.value })} /></div><Select value={form.riskLevel} onChange={(e) => setForm({ ...form, riskLevel: e.target.value as BoardDecision["riskLevel"] })}>{["low", "med", "high", "critical"].map((risk) => <option key={risk} value={risk}>{risk}</option>)}</Select><Button className="w-full" onClick={() => void propose()}><Crown className="h-4 w-4" />Submit for human approval</Button></CardContent></Card> : <Card><CardContent className="p-5 text-sm text-text-muted">Read-only view. Administrator access is required to submit or resolve proposals.</CardContent></Card>}
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Departments derived from register</CardTitle></CardHeader><CardContent className="space-y-2">{(data?.departments ?? []).map((department) => <div key={department.id} className="flex items-center gap-2 rounded border border-white/10 bg-white/5 p-2 text-sm"><span className="flex-1 text-text-bright">{department.name}</span><Badge variant="slate">{department.autonomyLevel}</Badge><span className="text-xs text-text-muted">{department.decisionsPending} pending · {department.health}% approved</span></div>)}{!(data?.departments.length) ? <p className="text-sm text-text-muted">No departments can be derived without proposals.</p> : null}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Guardrails</CardTitle></CardHeader><CardContent className="space-y-2">{(data?.guardrails ?? []).map((guardrail) => <div key={guardrail.id} className="flex items-start gap-2 rounded border border-white/10 bg-white/5 p-3 text-xs text-text-muted"><ShieldAlert className="h-4 w-4 shrink-0 text-amber" /><span className="flex-1">{guardrail.policy}</span><Badge variant="amber">{guardrail.blockedActions30d} blocked</Badge></div>)}</CardContent></Card></div>
  </div>;
}
