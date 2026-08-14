/**
 * Session 157 — Quantum Readiness console (/app/quantum).
 *
 * Inventory is operator-entered. Connectors report environment only.
 * Jobs stay queued — this is not a QPU.
 */
import { useCallback, useEffect, useState } from "react";
import { Atom, Shield, Radio, Play, Plus, Loader2 } from "lucide-react";
import {
  qApi, PQ_ALGORITHMS, QUANTUM_JOB_KINDS, QUANTUM_JOB_PROBLEMS, CRYPTO_MIGRATION_STATUS,
  type QuantumDashboard, type CryptoInventoryEntry, type QuantumOptimizationJob, type QuantumConnector,
} from "@/lib/quantum";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function fmtPct(n: number | null | undefined) {
  return n == null ? "—" : `${n}%`;
}

export function QuantumPage() {
  const [dash, setDash] = useState<QuantumDashboard | null>(null);
  const [inv, setInv] = useState<CryptoInventoryEntry[]>([]);
  const [jobs, setJobs] = useState<QuantumOptimizationJob[]>([]);
  const [cons, setCons] = useState<QuantumConnector[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [system, setSystem] = useState("");
  const [algo, setAlgo] = useState("RSA-2048");
  const [owner, setOwner] = useState("Security");
  const [kind, setKind] = useState<(typeof QUANTUM_JOB_KINDS)[number]>("hybrid_solver");
  const [problem, setProblem] = useState<(typeof QUANTUM_JOB_PROBLEMS)[number]>("portfolio");

  const load = useCallback(async () => {
    const [d, i, j, c] = await Promise.all([qApi.dashboard(), qApi.inventory(), qApi.jobs(), qApi.connectors()]);
    setDash(d); setInv(i); setJobs(j); setCons(c);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg(ok); await load(); }
    catch (e: any) { setMsg(e?.message ?? String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Quantum Readiness</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Post-quantum crypto inventory and hybrid-job register. Connectors report
          whether a vendor token is configured — they never claim a live QPU.
          Submitted jobs stay queued until a real backend is wired.
        </p>
      </div>
      {msg ? <p className="text-xs text-slate-400">{msg}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.readiness ?? "…"}</CardTitle><CardDescription>Readiness</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.cryptoInventory ?? "…"}</CardTitle><CardDescription>Inventory rows</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.vulnerableCount ?? "…"}</CardTitle><CardDescription>Quantum-vulnerable</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{fmtPct(dash?.migrationPct)}</CardTitle><CardDescription>Migrated</CardDescription></CardHeader></Card>
      </div>
      {dash?.provenance ? <p className="text-xs text-slate-500">{dash.provenance.readiness}</p> : null}

      <Tabs defaultValue="inventory">
        <TabsList>
          <TabsTrigger value="inventory"><Shield className="mr-1.5 h-4 w-4" />Inventory</TabsTrigger>
          <TabsTrigger value="jobs"><Play className="mr-1.5 h-4 w-4" />Jobs</TabsTrigger>
          <TabsTrigger value="connectors"><Radio className="mr-1.5 h-4 w-4" />Connectors</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Record a crypto system</CardTitle>
              <CardDescription>Operator-entered. RSA/ECDSA/ECDH are flagged vulnerable unless you override.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Input placeholder="System" value={system} onChange={(e) => setSystem(e.target.value)} className="w-48" />
              <Input placeholder="Algorithm" value={algo} onChange={(e) => setAlgo(e.target.value)} className="w-40" />
              <Input placeholder="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="w-36" />
              <Button size="sm" disabled={busy || !system || !algo} onClick={() => run(async () => {
                await qApi.createInventory({ system, algorithm: algo, owner });
                setSystem("");
              }, "recorded")}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}Add
              </Button>
            </CardContent>
          </Card>
          {inv.length === 0 ? <p className="text-sm text-slate-500">No systems recorded. Empty is unassessed, not 0% migrated.</p> : null}
          {inv.map((e) => (
            <Card key={e.id} className="border-slate-800 bg-slate-900/60">
              <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <span className="font-semibold text-slate-100">{e.system}</span>
                <Badge className="bg-slate-700/40 text-slate-300">{e.algorithm}</Badge>
                <Badge className={e.quantumVulnerable ? "bg-rose-500/20 text-rose-300 border-rose-500/40" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"}>
                  {e.quantumVulnerable ? "vulnerable" : "PQ / other"}
                </Badge>
                <Select value={e.migrationStatus} className="w-36" onChange={(ev) => run(() => qApi.updateInventory(e.id, { migrationStatus: ev.target.value as typeof e.migrationStatus }))}>
                  {CRYPTO_MIGRATION_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                <span className="text-slate-500">{e.owner}</span>
                <Badge className="bg-slate-700/40 text-slate-400">{e.source ?? "unknown"}</Badge>
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => run(() => qApi.removeInventory(e.id), "removed")}>Remove</Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="jobs" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader><CardTitle className="text-sm">Queue a hybrid job</CardTitle>
              <CardDescription>Stays queued. No objective value is invented.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="w-40">
                {QUANTUM_JOB_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
              <Select value={problem} onChange={(e) => setProblem(e.target.value as typeof problem)} className="w-40">
                {QUANTUM_JOB_PROBLEMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
              <Button size="sm" disabled={busy} onClick={() => run(() => qApi.submitJob({ kind, problem }), "queued")}>
                <Play className="mr-1 h-3.5 w-3.5" />Submit
              </Button>
            </CardContent>
          </Card>
          {jobs.length === 0 ? <p className="text-sm text-slate-500">No jobs queued.</p> : null}
          {jobs.map((j) => (
            <div key={j.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm">
              <Atom className="h-3.5 w-3.5 text-sky-400" />
              <span className="font-semibold">{j.problem}</span>
              <Badge className="bg-slate-700/40 text-slate-300">{j.kind}</Badge>
              <Badge className={j.status === "completed" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-amber-500/20 text-amber-300 border-amber-500/40"}>{j.status}</Badge>
              {j.qubits != null ? <span className="text-slate-500">{j.qubits} qubits (operator)</span> : null}
              {j.note ? <span className="w-full text-[11px] text-slate-500">{j.note}</span> : null}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="connectors" className="space-y-3">
          {cons.map((c) => (
            <Card key={c.id} className="border-slate-800 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Radio className="h-4 w-4 text-sky-400" />{c.vendor.replace(/_/g, " ")}
                  <Badge className={c.status === "ready" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-amber-500/20 text-amber-300 border-amber-500/40"}>
                    {c.status.replace(/_/g, " ")}
                  </Badge>
                </CardTitle>
                <CardDescription>{c.note}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">
                qubits available: {c.qubitsAvailable == null ? "not connected" : c.qubitsAvailable}
                {" · "}queue: {c.queueDepth == null ? "not connected" : c.queueDepth}
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-slate-500">{dash?.provenance?.connectors}</p>
          <p className="text-xs text-slate-600">PQ algorithms we track as replacements: {PQ_ALGORITHMS.join(", ")}</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
