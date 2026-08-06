/**
 * Session 100 — Enterprise FinOps depth.
 *
 * This page is intentionally separate from the legacy global Enterprise
 * Foundation FinOps tab. It renders org-scoped cost centers, budgets, actual
 * costs, allocation ledger rows and computed chargebacks. Amounts are shown in
 * currency from integer minor units; no dashboard value is invented client-side.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, BarChart3, CircleDollarSign, Database, Landmark, Plus, ReceiptText, RefreshCw, ShieldCheck, Trash2, WalletCards } from "lucide-react";
import { enterpriseFinOpsApi, type EfoAllocation, type EfoAllocationMethod, type EfoBudget, type EfoCostCenter, type EfoCostEntry, type EfoRollup } from "@/lib/enterpriseFinOps";
import type { EfoCostProvider, EfoCostCategory } from "@windels/shared/enterpriseFinOps";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";

const PROVIDERS: EfoCostProvider[] = ["aws", "gcp", "azure", "windels", "on-prem", "other"];
const CATEGORIES: EfoCostCategory[] = ["compute", "storage", "network", "database", "ml", "saas", "support", "other"];
const METHODS: EfoAllocationMethod[] = ["direct", "shared", "usage", "proportional"];

function monthWindow() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString().slice(0, 16), end: end.toISOString().slice(0, 16) };
}

function toIso(input: string) {
  return input ? new Date(input).toISOString() : new Date().toISOString();
}

function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

function Stat({ icon, label, value, detail, tone = "azure" }: { icon: ReactNode; label: string; value: string; detail?: string; tone?: "azure" | "emerald" | "amber" | "violet" }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={cn("rounded-lg border p-2", tone === "emerald" ? "border-emerald/20 bg-emerald/10 text-emerald" : tone === "amber" ? "border-amber/20 bg-amber/10 text-amber" : tone === "violet" ? "border-violet/20 bg-violet/10 text-violet" : "border-azure/20 bg-azure/10 text-azure")}>{icon}</div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
          <div className="truncate text-2xl font-black text-text-bright">{value}</div>
          {detail ? <div className="truncate text-xs text-text-muted">{detail}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function statusVariant(status: string): "slate" | "emerald" | "amber" | "danger" {
  if (status === "on_track" || status === "active") return "emerald";
  if (status === "warning" || status === "archived" || status === "closed" || status === "no_budget") return "amber";
  if (status === "over") return "danger";
  return "slate";
}

export function EnterpriseFinOpsPage() {
  const [rollup, setRollup] = useState<EfoRollup | null>(null);
  const [centers, setCenters] = useState<EfoCostCenter[]>([]);
  const [budgets, setBudgets] = useState<EfoBudget[]>([]);
  const [costs, setCosts] = useState<EfoCostEntry[]>([]);
  const [allocations, setAllocations] = useState<EfoAllocation[]>([]);
  const [selectedCenter, setSelectedCenter] = useState("");
  const [selectedCost, setSelectedCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [centerForm, setCenterForm] = useState({ name: "", code: "", owner: "", currency: "USD" });
  const windowDefaults = useMemo(monthWindow, []);
  const [budgetForm, setBudgetForm] = useState({ name: "", amountMinor: "", start: windowDefaults.start, end: windowDefaults.end });
  const [costForm, setCostForm] = useState({ provider: "aws" as EfoCostProvider, category: "compute" as EfoCostCategory, service: "", amountMinor: "", currency: "USD", occurredAt: windowDefaults.start, source: "manual" as "manual" | "provider_import" | "metered" | "adjustment", costCenterId: "" });
  const [allocationForm, setAllocationForm] = useState({ amountMinor: "", method: "proportional" as EfoAllocationMethod, driver: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, b, costsData, allocationData] = await Promise.all([
        enterpriseFinOpsApi.rollup(),
        enterpriseFinOpsApi.listCostCenters(),
        enterpriseFinOpsApi.listBudgets(),
        enterpriseFinOpsApi.listCosts(),
        enterpriseFinOpsApi.listAllocations(),
      ]);
      setRollup(r); setCenters(c); setBudgets(b); setCosts(costsData); setAllocations(allocationData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(null), 3500); };
  const selectedCenterRecord = centers.find((center) => center.id === selectedCenter) ?? null;
  const selectedCostRecord = costs.find((cost) => cost.id === selectedCost) ?? null;
  const centerChargeback = (id: string) => rollup?.chargebacks.find((row) => row.costCenterId === id);
  const totalCurrencies = useMemo(() => Object.entries(rollup?.totalsByCurrency ?? {}), [rollup]);
  const unallocatedCosts = useMemo(() => costs.filter((cost) => {
    const allocated = allocations.filter((allocation) => allocation.costId === cost.id).reduce((sum, allocation) => sum + allocation.amountMinor, 0);
    return allocated < cost.amountMinor;
  }), [costs, allocations]);

  async function createCenter() {
    if (!centerForm.name || !centerForm.code || !centerForm.owner) return;
    try {
      await enterpriseFinOpsApi.createCostCenter(centerForm);
      setCenterForm({ name: "", code: "", owner: "", currency: "USD" });
      flash("Cost center created."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function archiveCenter(center: EfoCostCenter) {
    try {
      await enterpriseFinOpsApi.updateCostCenter(center.id, { status: center.status === "archived" ? "active" : "archived" });
      flash(center.status === "archived" ? "Cost center reactivated." : "Cost center archived."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function createBudget() {
    if (!selectedCenter || !budgetForm.name || !budgetForm.amountMinor) return;
    try {
      await enterpriseFinOpsApi.createBudget({ costCenterId: selectedCenter, name: budgetForm.name, period: "monthly", periodStart: toIso(budgetForm.start), periodEnd: toIso(budgetForm.end), amountMinor: Number(budgetForm.amountMinor), currency: selectedCenterRecord?.currency ?? "USD", status: "active" });
      setBudgetForm({ name: "", amountMinor: "", start: windowDefaults.start, end: windowDefaults.end });
      flash("Budget recorded."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function createCost() {
    if (!costForm.service || !costForm.amountMinor) return;
    try {
      await enterpriseFinOpsApi.createCost({ ...costForm, amountMinor: Number(costForm.amountMinor), occurredAt: toIso(costForm.occurredAt), costCenterId: costForm.costCenterId || null, tags: {} });
      setCostForm({ ...costForm, service: "", amountMinor: "", costCenterId: "" });
      flash("Actual cost recorded."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function createAllocation() {
    if (!selectedCostRecord || !selectedCenter || !allocationForm.amountMinor) return;
    try {
      await enterpriseFinOpsApi.createAllocation({ costId: selectedCostRecord.id, costCenterId: selectedCenter, amountMinor: Number(allocationForm.amountMinor), currency: selectedCostRecord.currency, method: allocationForm.method, driver: allocationForm.driver || null });
      setAllocationForm({ amountMinor: "", method: "proportional", driver: "" });
      flash("Allocation ledger row added."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const selectedRemaining = selectedCostRecord ? selectedCostRecord.amountMinor - allocations.filter((a) => a.costId === selectedCostRecord.id).reduce((sum, a) => sum + a.amountMinor, 0) : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><WalletCards className="h-6 w-6 text-azure" /><h1 className="text-2xl font-black text-text-bright">Enterprise FinOps</h1><Badge variant="azure">Session 100</Badge></div>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">Org-scoped budgets, actual cloud costs, allocation ledger and chargeback statements. Every amount is an integer minor-unit record; utilization is computed from live ledger rows.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
      </div>

      {error ? <div className="flex items-center gap-2 rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson"><AlertTriangle className="h-4 w-4" />{error}<button className="ml-auto" onClick={() => setError(null)}>✕</button></div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Landmark className="h-5 w-5" />} label="Cost centers" value={String(rollup?.counts.costCenters ?? 0)} detail={`${rollup?.counts.activeCostCenters ?? 0} active`} />
        <Stat icon={<BarChart3 className="h-5 w-5" />} label="Active budgets" value={String(rollup?.counts.activeBudgets ?? 0)} detail={`${rollup?.counts.budgets ?? 0} total`} tone="violet" />
        <Stat icon={<ReceiptText className="h-5 w-5" />} label="Actual cost entries" value={String(rollup?.counts.costs ?? 0)} detail={`${rollup?.counts.allocations ?? 0} allocation rows`} tone="amber" />
        <Stat icon={<CircleDollarSign className="h-5 w-5" />} label="Currencies tracked" value={String(totalCurrencies.length)} detail={totalCurrencies.map(([code]) => code).join(", ") || "No costs yet"} tone="emerald" />
      </div>

      {totalCurrencies.length > 0 ? <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {totalCurrencies.map(([code, totals]) => <Card key={code}><CardContent className="p-4"><div className="flex items-center justify-between"><span className="font-mono text-sm text-text-muted">{code}</span><Badge variant={totals.unallocatedMinor > 0 ? "amber" : "emerald"}>{totals.unallocatedMinor > 0 ? "partially allocated" : "fully allocated"}</Badge></div><div className="mt-2 text-xl font-black text-text-bright">{money(totals.costMinor, code)}</div><div className="mt-1 text-xs text-text-muted">{money(totals.allocatedMinor, code)} allocated · {money(totals.budgetMinor, code)} active budgets</div></CardContent></Card>)}
      </div> : <Card><CardContent className="flex items-center gap-3 p-5 text-sm text-text-muted"><ShieldCheck className="h-5 w-5 text-emerald" />Fresh organizations start with no synthetic FinOps records. Record an actual cost or create a budget to begin.</CardContent></Card>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Landmark className="h-5 w-5 text-azure" />Cost centers</CardTitle><CardDescription>Named org-owned chargeback destinations. Currency is locked once accounting rows exist.</CardDescription></CardHeader>
          <CardContent><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {centers.map((center) => { const row = centerChargeback(center.id); return <div key={center.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-text-bright">{center.name}</div><div className="font-mono text-xs text-text-muted">{center.code} · {center.owner}</div></div><Badge variant={statusVariant(center.status)}>{center.status}</Badge></div>
              <div className="mt-3 flex items-end justify-between"><div><div className="text-xs text-text-muted">chargeback actual</div><div className="text-lg font-black text-text-bright">{money(row?.actualMinor ?? 0, center.currency)}</div></div><div className="text-right"><div className="text-xs text-text-muted">budget</div><div className="text-sm text-text-main">{money(row?.budgetMinor ?? 0, center.currency)}</div></div></div>
              <div className="mt-2 flex items-center justify-between text-xs"><span className={cn(row?.status === "over" ? "text-crimson" : row?.status === "warning" ? "text-amber" : "text-text-muted")}>{row ? `${row.utilizationPct.toFixed(2)}% utilized` : "no budget"}</span><Button size="sm" variant="ghost" onClick={() => archiveCenter(center)}>{center.status === "archived" ? "Reactivate" : "Archive"}</Button></div>
            </div>; })}
            {centers.length === 0 ? <p className="text-sm text-text-muted">No cost centers yet.</p> : null}
          </div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">New cost center</CardTitle><CardDescription>Create a ledger destination for this organization.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="Name" value={centerForm.name} onChange={(e) => setCenterForm({ ...centerForm, name: e.target.value })} />
            <Input placeholder="Code (e.g. ENG)" value={centerForm.code} onChange={(e) => setCenterForm({ ...centerForm, code: e.target.value })} />
            <Input placeholder="Owner" value={centerForm.owner} onChange={(e) => setCenterForm({ ...centerForm, owner: e.target.value })} />
            <Input placeholder="Currency (USD)" maxLength={3} value={centerForm.currency} onChange={(e) => setCenterForm({ ...centerForm, currency: e.target.value.toUpperCase() })} />
            <Button className="w-full" onClick={() => void createCenter()}><Plus className="h-4 w-4" />Create center</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-violet" />Budget register</CardTitle><CardDescription>Budgets are compared with allocated actuals; variance is a computed projection.</CardDescription></CardHeader>
          <CardContent><div className="space-y-2">
            {budgets.map((budget) => <div key={budget.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3"><div className="min-w-48 flex-1"><div className="font-medium text-text-bright">{budget.name}</div><div className="text-xs text-text-muted">{centers.find((c) => c.id === budget.costCenterId)?.code ?? budget.costCenterId} · {budget.period} · {new Date(budget.periodStart).toLocaleDateString()} – {new Date(budget.periodEnd).toLocaleDateString()}</div></div><div className="text-right"><div className="font-semibold text-text-bright">{money(budget.amountMinor, budget.currency)}</div><Badge variant={statusVariant(budget.status)}>{budget.status}</Badge></div><Button size="sm" variant="ghost" onClick={async () => { try { await enterpriseFinOpsApi.deleteBudget(budget.id); flash("Budget deleted."); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}><Trash2 className="h-4 w-4" /></Button></div>)}
            {budgets.length === 0 ? <p className="text-sm text-text-muted">No budgets yet.</p> : null}
          </div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">New budget</CardTitle><CardDescription>All values are minor units (for USD, cents) to preserve accounting precision.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <Select value={selectedCenter} onChange={(e) => setSelectedCenter(e.target.value)}><option value="">Select cost center</option>{centers.filter((c) => c.status === "active").map((center) => <option key={center.id} value={center.id}>{center.code} · {center.currency}</option>)}</Select>
            <Input placeholder="Budget name" value={budgetForm.name} onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })} />
            <Input type="number" min="0" step="1" placeholder="Amount in minor units" value={budgetForm.amountMinor} onChange={(e) => setBudgetForm({ ...budgetForm, amountMinor: e.target.value })} />
            <div className="grid grid-cols-2 gap-2"><Input type="datetime-local" value={budgetForm.start} onChange={(e) => setBudgetForm({ ...budgetForm, start: e.target.value })} /><Input type="datetime-local" value={budgetForm.end} onChange={(e) => setBudgetForm({ ...budgetForm, end: e.target.value })} /></div>
            <Button className="w-full" onClick={() => void createBudget()} disabled={!selectedCenter}><Plus className="h-4 w-4" />Record budget</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ReceiptText className="h-5 w-5 text-amber" />Actual cost ledger</CardTitle><CardDescription>Provider/meter observations are stored once. Allocation rows below determine chargeback ownership.</CardDescription></CardHeader>
          <CardContent><div className="space-y-2">
            {costs.map((cost) => { const allocated = allocations.filter((a) => a.costId === cost.id).reduce((sum, a) => sum + a.amountMinor, 0); return <div key={cost.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3"><div className="min-w-48 flex-1"><div className="flex items-center gap-2"><span className="font-medium text-text-bright">{cost.service}</span><Badge variant="slate">{cost.provider}</Badge><Badge variant="slate">{cost.category}</Badge></div><div className="text-xs text-text-muted">{new Date(cost.occurredAt).toLocaleString()} · {cost.source}</div></div><div className="text-right"><div className="font-semibold text-text-bright">{money(cost.amountMinor, cost.currency)}</div><div className={cn("text-xs", allocated < cost.amountMinor ? "text-amber" : "text-emerald")}>{money(allocated, cost.currency)} allocated</div></div><Button size="sm" variant="ghost" onClick={() => { setSelectedCost(cost.id); setSelectedCenter(centers[0]?.id ?? ""); }}><ArrowRight className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={async () => { try { await enterpriseFinOpsApi.deleteCost(cost.id); flash("Cost and its allocations deleted."); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}><Trash2 className="h-4 w-4" /></Button></div>; })}
            {costs.length === 0 ? <p className="text-sm text-text-muted">No actual costs yet.</p> : null}
          </div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Record actual cost</CardTitle><CardDescription>Attach a center for a direct allocation, or leave it unassigned for shared allocation later.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="Service name" value={costForm.service} onChange={(e) => setCostForm({ ...costForm, service: e.target.value })} />
            <div className="grid grid-cols-2 gap-2"><Select value={costForm.provider} onChange={(e) => setCostForm({ ...costForm, provider: e.target.value as EfoCostProvider })}>{PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</Select><Select value={costForm.category} onChange={(e) => setCostForm({ ...costForm, category: e.target.value as EfoCostCategory })}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</Select></div>
            <div className="grid grid-cols-2 gap-2"><Input type="number" min="1" step="1" placeholder="Minor units" value={costForm.amountMinor} onChange={(e) => setCostForm({ ...costForm, amountMinor: e.target.value })} /><Input maxLength={3} placeholder="USD" value={costForm.currency} onChange={(e) => setCostForm({ ...costForm, currency: e.target.value.toUpperCase() })} /></div>
            <Input type="datetime-local" value={costForm.occurredAt} onChange={(e) => setCostForm({ ...costForm, occurredAt: e.target.value })} />
            <Select value={costForm.costCenterId} onChange={(e) => setCostForm({ ...costForm, costCenterId: e.target.value })}><option value="">Unassigned / shared</option>{centers.filter((c) => c.status === "active").map((center) => <option key={center.id} value={center.id}>{center.code} · direct</option>)}</Select>
            <Button className="w-full" onClick={() => void createCost()}><Plus className="h-4 w-4" />Record cost</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Database className="h-5 w-5 text-teal" />Allocation ledger</CardTitle><CardDescription>Each row links a real cost to one cost center. The service rejects allocations above the source amount.</CardDescription></CardHeader>
          <CardContent><div className="space-y-2">{allocations.map((allocation) => <div key={allocation.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3"><div className="min-w-48 flex-1"><div className="font-medium text-text-bright">{centers.find((c) => c.id === allocation.costCenterId)?.code ?? allocation.costCenterId}</div><div className="text-xs text-text-muted">cost {allocation.costId.slice(0, 14)}… · {allocation.driver || "no driver"}</div></div><Badge variant="teal">{allocation.method}</Badge><span className="font-semibold text-text-bright">{money(allocation.amountMinor, allocation.currency)}</span><Button size="sm" variant="ghost" onClick={async () => { try { await enterpriseFinOpsApi.deleteAllocation(allocation.id); flash("Allocation removed."); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}><Trash2 className="h-4 w-4" /></Button></div>)}{allocations.length === 0 ? <p className="text-sm text-text-muted">No allocation rows yet.</p> : null}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Allocate unassigned cost</CardTitle><CardDescription>{selectedCostRecord ? `${selectedCostRecord.service} · ${money(selectedRemaining, selectedCostRecord.currency)} remaining` : "Select a cost with the arrow in the ledger."}</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <Select value={selectedCost} onChange={(e) => setSelectedCost(e.target.value)}><option value="">Select cost</option>{unallocatedCosts.map((cost) => <option key={cost.id} value={cost.id}>{cost.service} · {money(cost.amountMinor, cost.currency)}</option>)}</Select>
            <Select value={selectedCenter} onChange={(e) => setSelectedCenter(e.target.value)}><option value="">Select center</option>{centers.filter((c) => c.status === "active").map((center) => <option key={center.id} value={center.id}>{center.code}</option>)}</Select>
            <Input type="number" min="1" step="1" placeholder="Minor units" value={allocationForm.amountMinor} onChange={(e) => setAllocationForm({ ...allocationForm, amountMinor: e.target.value })} />
            <Select value={allocationForm.method} onChange={(e) => setAllocationForm({ ...allocationForm, method: e.target.value as EfoAllocationMethod })}>{METHODS.map((method) => <option key={method} value={method}>{method}</option>)}</Select>
            <Input placeholder="Driver (e.g. 50% request share)" value={allocationForm.driver} onChange={(e) => setAllocationForm({ ...allocationForm, driver: e.target.value })} />
            <Button className="w-full" onClick={() => void createAllocation()} disabled={!selectedCostRecord || !selectedCenter}><Plus className="h-4 w-4" />Add allocation</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><WalletCards className="h-5 w-5 text-emerald" />Computed chargeback statements</CardTitle><CardDescription>Live projection from actual costs, allocation rows and budgets. No statement is stored separately.</CardDescription></CardHeader>
        <CardContent><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{(rollup?.chargebacks ?? []).map((row) => <div key={row.costCenterId} className="rounded-lg border border-white/10 bg-white/5 p-4"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-text-bright">{row.name}</div><div className="font-mono text-xs text-text-muted">{row.code} · {row.currency}</div></div><Badge variant={statusVariant(row.status)}>{row.status.replace("_", " ")}</Badge></div><div className="mt-4 grid grid-cols-2 gap-3"><div><div className="text-xs text-text-muted">allocated actual</div><div className="text-lg font-black text-text-bright">{money(row.actualMinor, row.currency)}</div></div><div><div className="text-xs text-text-muted">budget</div><div className="text-lg font-black text-text-bright">{money(row.budgetMinor, row.currency)}</div></div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className={cn("h-full rounded-full", row.status === "over" ? "bg-crimson" : row.status === "warning" ? "bg-amber" : "bg-emerald")} style={{ width: `${Math.min(100, row.utilizationPct)}%` }} /></div><div className="mt-2 flex justify-between text-xs text-text-muted"><span>{row.utilizationPct.toFixed(2)}% utilized</span><span>variance {money(row.varianceMinor, row.currency)}</span></div><div className="mt-2 text-xs text-text-muted">{row.costCount} costs · {row.allocationCount} allocations · direct {money(row.byMethod.direct, row.currency)} · shared {money(row.byMethod.shared, row.currency)}</div></div>)}{(rollup?.chargebacks ?? []).length === 0 ? <p className="text-sm text-text-muted">No chargebacks can be computed until a cost center exists.</p> : null}</div></CardContent>
      </Card>
    </div>
  );
}
