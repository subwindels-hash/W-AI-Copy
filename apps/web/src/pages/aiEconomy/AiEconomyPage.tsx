/**
 * Session 103 — AI Economy / GPU capacity ledger.
 *
 * All figures come from the org-scoped API. Revenue, marketplace volume and
 * credit earnings stay visibly zero until those real ledgers exist.
 */
import { useCallback, useEffect, useState } from "react";
import { Activity, BarChart3, Coins, Cpu, Database, DollarSign, Plus, RefreshCw, Server, ShieldCheck, Trash2, Users } from "lucide-react";
import { ecoApi, type AiEconomyResource, type AiUsageEntry, type ComputeOffer, type EconomyDashboard, type GpuAllocation } from "@/lib/aiEconomy";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const RESOURCES: AiEconomyResource[] = ["gpu", "cpu", "ram", "storage", "bandwidth", "tokens"];
const PROVIDERS = ["internal", "aws", "gcp", "azure", "lambda_labs", "peer"] as const;

function money(value: number) { return `$${value.toFixed(2)}`; }

function Stat({ icon, label, value, detail, tone = "azure" }: { icon: React.ReactNode; label: string; value: string; detail?: string; tone?: "azure" | "emerald" | "amber" | "violet" }) {
  const style = tone === "emerald" ? "border-emerald/20 bg-emerald/10 text-emerald" : tone === "amber" ? "border-amber/20 bg-amber/10 text-amber" : tone === "violet" ? "border-violet/20 bg-violet/10 text-violet" : "border-azure/20 bg-azure/10 text-azure";
  return <Card><CardContent className="flex items-start gap-3 p-4"><div className={`rounded-lg border p-2 ${style}`}>{icon}</div><div className="min-w-0"><div className="text-xs uppercase tracking-wide text-text-muted">{label}</div><div className="truncate text-2xl font-black text-text-bright">{value}</div>{detail ? <div className="truncate text-xs text-text-muted">{detail}</div> : null}</div></CardContent></Card>;
}

export function AiEconomyPage() {
  const user = useAuthStore((state) => state.user);
  const canWrite = user?.role === "admin" || user?.role === "super_admin";
  const [data, setData] = useState<EconomyDashboard | null>(null);
  const [offers, setOffers] = useState<ComputeOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [usageForm, setUsageForm] = useState({ resource: "gpu" as AiEconomyResource, quantity: "", unit: "hours", costCents: "", department: "" });
  const [offerForm, setOfferForm] = useState({ provider: "internal" as (typeof PROVIDERS)[number], gpuType: "", vramGb: "", pricePerHour: "", region: "", available: "true", utilizationPct: "0" });
  const [allocationForm, setAllocationForm] = useState({ cluster: "", gpuType: "", assignedTo: "", job: "", utilizationPct: "0", vramUsedGb: "", costPerHour: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboard, offerRows] = await Promise.all([ecoApi.dashboard(), ecoApi.offers()]);
      setData(dashboard); setOffers(offerRows); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(null), 3500); };

  async function recordUsage() {
    if (!usageForm.quantity || !usageForm.costCents || !usageForm.department) return;
    try {
      await ecoApi.recordUsage({ resource: usageForm.resource, quantity: Number(usageForm.quantity), unit: usageForm.unit, costCents: Number(usageForm.costCents), department: usageForm.department });
      setUsageForm({ ...usageForm, quantity: "", costCents: "" }); flash("Usage observation recorded."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function createOffer() {
    if (!offerForm.gpuType || !offerForm.vramGb || !offerForm.region) return;
    try {
      const offer = await ecoApi.createOffer({ provider: offerForm.provider, gpuType: offerForm.gpuType, vramGb: Number(offerForm.vramGb), pricePerHour: Number(offerForm.pricePerHour || 0), region: offerForm.region, available: offerForm.available === "true", utilizationPct: Number(offerForm.utilizationPct || 0) });
      setOffers((rows) => [...rows, offer]); setOfferForm({ ...offerForm, gpuType: "", vramGb: "", pricePerHour: "", region: "" }); flash("Compute offer recorded."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function createAllocation() {
    if (!allocationForm.cluster || !allocationForm.gpuType || !allocationForm.assignedTo || !allocationForm.job) return;
    try {
      await ecoApi.createAllocation({ cluster: allocationForm.cluster, gpuType: allocationForm.gpuType, assignedTo: allocationForm.assignedTo, job: allocationForm.job, utilizationPct: Number(allocationForm.utilizationPct), vramUsedGb: Number(allocationForm.vramUsedGb || 0), costPerHour: Number(allocationForm.costPerHour || 0) });
      setAllocationForm({ ...allocationForm, cluster: "", gpuType: "", assignedTo: "", job: "" }); flash("GPU allocation recorded."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function deleteOffer(id: string) {
    try { await ecoApi.deleteOffer(id); flash("Offer removed."); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Coins className="h-6 w-6 text-emerald" /><h1 className="text-2xl font-black text-text-bright">AI Economy & GPU Cloud</h1><Badge variant="emerald">Session 103</Badge></div><p className="mt-1 max-w-3xl text-sm text-text-muted">Org-scoped usage observations, GPU capacity offers and allocation ledger. Revenue and marketplace volume are shown as zero until real billing ledgers are connected.</p></div><Button size="sm" variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button></div>
    {error ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{error}<button className="float-right" onClick={() => setError(null)}>✕</button></div> : null}
    {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"><Stat icon={<Coins className="h-5 w-5" />} label="Resource credits observed" value={(data?.creditsInCirculation ?? 0).toLocaleString()} detail="quantity across 30 days" tone="violet" /><Stat icon={<DollarSign className="h-5 w-5" />} label="Observed cost (30d)" value={money(data?.computeCost30d ?? 0)} detail="real usage ledger" tone="amber" /><Stat icon={<Cpu className="h-5 w-5" />} label="GPU capacity" value={`${data?.gpusAvailable ?? 0}/${data?.gpusTotal ?? 0}`} detail="available offers" tone="emerald" /><Stat icon={<Activity className="h-5 w-5" />} label="Active allocations" value={String(data?.activeAllocations ?? 0)} detail={`${data?.gpuUtilizationPct ?? 0}% observed utilization`} /></div>

    <div className="grid grid-cols-1 gap-3 md:grid-cols-3"><Card><CardContent className="p-4"><div className="text-xs text-text-muted">Revenue (30d)</div><div className="mt-1 text-xl font-black text-text-bright">{money(data?.computeRevenue30d ?? 0)}</div><div className="text-xs text-text-muted">No billing ledger connected</div></CardContent></Card><Card><CardContent className="p-4"><div className="text-xs text-text-muted">Margin</div><div className="mt-1 text-xl font-black text-text-bright">{data?.marginPct ?? 0}%</div><div className="text-xs text-text-muted">Not calculated without revenue</div></CardContent></Card><Card><CardContent className="p-4"><div className="text-xs text-text-muted">Forecast</div><div className="mt-1 text-xl font-black text-text-bright">{data?.forecasts[0] ? money(data.forecasts[0].costUsd) : "—"}</div><div className="text-xs text-text-muted">{data?.forecastKind === "observed_run_rate" ? "Observed 30-day run-rate projection" : "No observations yet"}</div></CardContent></Card></div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Server className="h-5 w-5 text-azure" />Compute offers</CardTitle><CardDescription>Real capacity observations recorded by an administrator; no provider capacity is fabricated.</CardDescription></CardHeader><CardContent><div className="space-y-2">{offers.map((offer) => <div key={offer.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3"><Cpu className="h-4 w-4 text-azure" /><div className="min-w-32 flex-1"><div className="font-medium text-text-bright">{offer.gpuType}</div><div className="text-xs text-text-muted">{offer.provider} · {offer.region} · {offer.vramGb} GB VRAM</div></div><span className="text-sm text-text-bright">{money(offer.pricePerHour)}/h</span><Badge variant={offer.available ? "emerald" : "crimson"}>{offer.available ? "available" : "full"}</Badge><div className="w-20 text-xs text-text-muted">{offer.utilizationPct}%</div>{canWrite ? <Button size="sm" variant="ghost" onClick={() => void deleteOffer(offer.id)}><Trash2 className="h-4 w-4" /></Button> : null}</div>)}{offers.length === 0 ? <p className="text-sm text-text-muted">No capacity offers recorded yet.</p> : null}</div></CardContent></Card>
      {canWrite ? <Card><CardHeader><CardTitle className="text-base">Record compute offer</CardTitle><CardDescription>Enter a real provider or internal capacity observation.</CardDescription></CardHeader><CardContent className="space-y-2"><div className="grid grid-cols-2 gap-2"><Select value={offerForm.provider} onChange={(e) => setOfferForm({ ...offerForm, provider: e.target.value as (typeof PROVIDERS)[number] })}>{PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</Select><Input placeholder="GPU type" value={offerForm.gpuType} onChange={(e) => setOfferForm({ ...offerForm, gpuType: e.target.value })} /></div><div className="grid grid-cols-2 gap-2"><Input type="number" min="1" placeholder="VRAM GB" value={offerForm.vramGb} onChange={(e) => setOfferForm({ ...offerForm, vramGb: e.target.value })} /><Input type="number" min="0" step="0.01" placeholder="Price / hour" value={offerForm.pricePerHour} onChange={(e) => setOfferForm({ ...offerForm, pricePerHour: e.target.value })} /></div><div className="grid grid-cols-2 gap-2"><Input placeholder="Region" value={offerForm.region} onChange={(e) => setOfferForm({ ...offerForm, region: e.target.value })} /><Input type="number" min="0" max="100" placeholder="Utilization %" value={offerForm.utilizationPct} onChange={(e) => setOfferForm({ ...offerForm, utilizationPct: e.target.value })} /></div><Select value={offerForm.available} onChange={(e) => setOfferForm({ ...offerForm, available: e.target.value })}><option value="true">Available</option><option value="false">Full / unavailable</option></Select><Button className="w-full" onClick={() => void createOffer()}><Plus className="h-4 w-4" />Record offer</Button></CardContent></Card> : <ReadOnlyNotice />}
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-violet" />Department usage</CardTitle><CardDescription>Actual usage ledger entries aggregated by department over the last 30 days.</CardDescription></CardHeader><CardContent><div className="space-y-2">{(data?.topDepartments ?? []).map((row) => <div key={row.department} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3"><Users className="h-4 w-4 text-violet" /><span className="flex-1 text-text-bright">{row.department}</span><span className="text-sm text-text-muted">{row.credits.toLocaleString()} units</span><span className="font-mono text-sm text-text-bright">{money(row.spend)}</span></div>)}{!(data?.topDepartments.length) ? <p className="text-sm text-text-muted">No usage observations yet.</p> : null}</div></CardContent></Card>
      {canWrite ? <Card><CardHeader><CardTitle className="text-base">Record usage</CardTitle><CardDescription>Amounts are integer cents; quantity remains in the stated resource unit.</CardDescription></CardHeader><CardContent className="space-y-2"><div className="grid grid-cols-2 gap-2"><Select value={usageForm.resource} onChange={(e) => setUsageForm({ ...usageForm, resource: e.target.value as AiEconomyResource })}>{RESOURCES.map((resource) => <option key={resource} value={resource}>{resource}</option>)}</Select><Input placeholder="Unit (hours, tokens…)" value={usageForm.unit} onChange={(e) => setUsageForm({ ...usageForm, unit: e.target.value })} /></div><div className="grid grid-cols-2 gap-2"><Input type="number" min="0" step="any" placeholder="Quantity" value={usageForm.quantity} onChange={(e) => setUsageForm({ ...usageForm, quantity: e.target.value })} /><Input type="number" min="0" step="1" placeholder="Cost cents" value={usageForm.costCents} onChange={(e) => setUsageForm({ ...usageForm, costCents: e.target.value })} /></div><Input placeholder="Department" value={usageForm.department} onChange={(e) => setUsageForm({ ...usageForm, department: e.target.value })} /><Button className="w-full" onClick={() => void recordUsage()}><Plus className="h-4 w-4" />Record usage</Button></CardContent></Card> : <ReadOnlyNotice />}
    </div>

    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Database className="h-5 w-5 text-teal" />GPU allocation ledger</CardTitle><CardDescription>Allocation rows are real observations; active count is based on utilization above zero.</CardDescription></CardHeader><CardContent><div className="space-y-2">{(data?.allocations ?? []).map((allocation: GpuAllocation) => <div key={allocation.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3"><Cpu className="h-4 w-4 text-teal" /><span className="flex-1 font-medium text-text-bright">{allocation.gpuType} · {allocation.cluster}</span><Badge variant="slate">{allocation.job}</Badge><span className="text-xs text-text-muted">{allocation.assignedTo} · {allocation.utilizationPct}% · {allocation.vramUsedGb} GB</span><span className="font-mono text-sm">{money(allocation.costPerHour)}/h</span></div>)}{!(data?.allocations.length) ? <p className="text-sm text-text-muted">No allocation observations yet.</p> : null}</div></CardContent></Card>
    {canWrite ? <Card><CardHeader><CardTitle className="text-base">Record GPU allocation</CardTitle></CardHeader><CardContent className="grid grid-cols-1 gap-2 md:grid-cols-3"><Input placeholder="Cluster" value={allocationForm.cluster} onChange={(e) => setAllocationForm({ ...allocationForm, cluster: e.target.value })} /><Input placeholder="GPU type" value={allocationForm.gpuType} onChange={(e) => setAllocationForm({ ...allocationForm, gpuType: e.target.value })} /><Input placeholder="Assigned to" value={allocationForm.assignedTo} onChange={(e) => setAllocationForm({ ...allocationForm, assignedTo: e.target.value })} /><Input placeholder="Job" value={allocationForm.job} onChange={(e) => setAllocationForm({ ...allocationForm, job: e.target.value })} /><Input type="number" min="0" max="100" placeholder="Utilization %" value={allocationForm.utilizationPct} onChange={(e) => setAllocationForm({ ...allocationForm, utilizationPct: e.target.value })} /><Input type="number" min="0" placeholder="VRAM used GB" value={allocationForm.vramUsedGb} onChange={(e) => setAllocationForm({ ...allocationForm, vramUsedGb: e.target.value })} /><Input type="number" min="0" step="0.01" placeholder="Cost / hour" value={allocationForm.costPerHour} onChange={(e) => setAllocationForm({ ...allocationForm, costPerHour: e.target.value })} /><Button className="md:col-span-3" onClick={() => void createAllocation()}><Plus className="h-4 w-4" />Record allocation</Button></CardContent></Card> : null}
  </div>;
}

function ReadOnlyNotice() { return <Card><CardContent className="flex items-start gap-2 p-4 text-xs text-text-muted"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald" />Read-only view. Administrator access is required to write capacity, usage or allocation observations.</CardContent></Card>; }
