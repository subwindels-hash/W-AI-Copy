/**
 * WINDELS AI OS — AI Revenue Guardian Dashboard.
 *
 * Executive-level AR / Revenue Recovery dashboard.
 * WINDELS is an Enterprise AI Platform — this module automates accounts
 * receivable and collections. WINDELS is not a broker or payment processor.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  revenueGuardianApi,
  type RgDashboardRollup, type RgCustomer, type RgInvoice,
  type RgCollectionCase, type RgAiEmployee, type RgTask,
  type RgCustomerProfile,
} from "@/lib/revenueGuardian";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Input } from "@/components/ui/Input";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, Shield, Bot, Users,
  FileText, Clock, CheckCircle2, XCircle, RefreshCw, Activity, Target,
  BarChart3, Zap, Search, ChevronRight, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

const usd = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toFixed(1)}%`;
const timeAgo = (iso?: string) => {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const riskColor: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  critical: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const statusColor: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300",
  watch: "bg-amber-500/15 text-amber-300",
  collections: "bg-orange-500/15 text-orange-300",
  legal: "bg-rose-500/15 text-rose-300",
  written_off: "bg-slate-500/15 text-slate-400",
  open: "bg-sky-500/15 text-sky-300",
  in_progress: "bg-violet-500/15 text-violet-300",
  resolved: "bg-emerald-500/15 text-emerald-300",
  closed: "bg-slate-500/15 text-slate-300",
  escalated: "bg-rose-500/15 text-rose-300",
  sent: "bg-sky-500/15 text-sky-300",
  overdue: "bg-rose-500/15 text-rose-300",
  paid: "bg-emerald-500/15 text-emerald-300",
  partial: "bg-amber-500/15 text-amber-300",
};

function Kpi({ label, value, sub, icon: Icon, tone = "default" }: {
  label: string; value: string; sub?: string; icon?: any; tone?: "default" | "pos" | "neg" | "warn";
}) {
  const toneCls = tone === "pos" ? "text-emerald-300" : tone === "neg" ? "text-rose-300" : tone === "warn" ? "text-amber-300" : "text-slate-100";
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        {Icon && <div className={`mt-0.5 rounded-md bg-slate-800/70 p-2 ${toneCls}`}><Icon className="h-4 w-4" /></div>}
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
          <p className={`text-xl font-semibold tabular-nums ${toneCls}`}>{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

type Tab = "overview" | "customers" | "invoices" | "cases" | "ai-employees" | "tasks";

export function RevenueGuardianPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [rollup, setRollup] = useState<RgDashboardRollup | null>(null);
  const [customers, setCustomers] = useState<RgCustomer[]>([]);
  const [invoices, setInvoices] = useState<RgInvoice[]>([]);
  const [cases, setCases] = useState<RgCollectionCase[]>([]);
  const [aiEmployees, setAiEmployees] = useState<RgAiEmployee[]>([]);
  const [tasks, setTasks] = useState<RgTask[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<RgCustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [r, c, inv, cs, ai, t] = await Promise.all([
        revenueGuardianApi.rollup(),
        revenueGuardianApi.listCustomers(),
        revenueGuardianApi.listInvoices(),
        revenueGuardianApi.listCases(),
        revenueGuardianApi.listAiEmployees(),
        revenueGuardianApi.listTasks({ status: "pending" }),
      ]);
      setRollup(r); setCustomers(c); setInvoices(inv); setCases(cs); setAiEmployees(ai); setTasks(t);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const viewCustomer = useCallback(async (id: string) => {
    try {
      const profile = await revenueGuardianApi.getCustomerProfile(id);
      setSelectedCustomer(profile);
    } catch { /* ignore */ }
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!search) return customers;
    const q = search.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (c.company ?? "").toLowerCase().includes(q));
  }, [customers, search]);

  const agingData = useMemo(() => {
    if (!rollup) return [];
    const a = rollup.aging;
    return [
      { label: "Current", value: a.current, color: "bg-emerald-500" },
      { label: "1-30d", value: a.d1_30, color: "bg-sky-500" },
      { label: "31-60d", value: a.d31_60, color: "bg-amber-500" },
      { label: "61-90d", value: a.d61_90, color: "bg-orange-500" },
      { label: "91-120d", value: a.d91_120, color: "bg-rose-500" },
      { label: "120d+", value: a.d120_plus, color: "bg-red-700" },
    ];
  }, [rollup]);

  const agingMax = useMemo(() => Math.max(1, ...agingData.map((d) => d.value)), [agingData]);

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "customers", label: "Customers", icon: Users },
    { id: "invoices", label: "Invoices", icon: FileText },
    { id: "cases", label: "Cases", icon: Shield },
    { id: "ai-employees", label: "AI Employees", icon: Bot },
    { id: "tasks", label: "Tasks", icon: Clock },
  ];

  if (loading && !rollup) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6 text-emerald-400" />
            AI Revenue Guardian
          </h1>
          <p className="text-sm text-slate-400">Enterprise Accounts Receivable & Revenue Recovery — AI-powered collections, risk scoring, and cash flow management.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={load}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
        </div>
      </div>

      {err && <div className="p-3 rounded-lg bg-rose-500/15 text-rose-300 text-sm">{err}</div>}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-px overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setSelectedCustomer(null); }}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === t.id ? "bg-slate-800 text-slate-100 border-b-2 border-emerald-400" : "text-slate-400 hover:text-slate-200"}`}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────── */}
      {tab === "overview" && rollup && (
        <>
          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Total Outstanding" value={usd(rollup.totalOutstandingCents)} sub={`${rollup.totalCustomerCount} customers`} icon={DollarSign} tone={rollup.totalOutstandingCents > 0 ? "neg" : "default"} />
            <Kpi label="Overdue Revenue" value={usd(rollup.overdueCents)} sub={`${rollup.overdueCustomerCount} overdue customers`} icon={AlertTriangle} tone="neg" />
            <Kpi label="Collected Today" value={usd(rollup.collectedTodayCents)} sub={`${usd(rollup.collectedThisWeekCents)} this week`} icon={TrendingUp} tone="pos" />
            <Kpi label="Recovery Rate" value={pct(rollup.recoveryRatePct)} sub={`${rollup.openCaseCount} open cases`} icon={Target} tone={rollup.recoveryRatePct >= 50 ? "pos" : "warn"} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Collection Success" value={pct(rollup.collectionSuccessRatePct)} icon={CheckCircle2} tone={rollup.collectionSuccessRatePct >= 70 ? "pos" : "warn"} />
            <Kpi label="Bad Debt Risk" value={pct(rollup.badDebtRiskPct)} icon={XCircle} tone={rollup.badDebtRiskPct > 20 ? "neg" : "default"} />
            <Kpi label="Month Collections" value={usd(rollup.collectedThisMonthCents)} icon={BarChart3} tone="pos" />
            <Kpi label="Open Tasks" value={String(rollup.openTaskCount)} sub={`${rollup.brokenPromiseCount} broken promises`} icon={Clock} tone={rollup.openTaskCount > 5 ? "warn" : "default"} />
          </div>

          {/* Aging + Risk Breakdown */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" />Aging Summary</CardTitle>
                <CardDescription>Outstanding revenue by aging bucket</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {agingData.map((d) => (
                    <div key={d.label} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-16 shrink-0">{d.label}</span>
                      <div className="flex-1 h-5 bg-slate-800 rounded overflow-hidden">
                        <div className={`h-full ${d.color} rounded transition-all`} style={{ width: `${(d.value / agingMax) * 100}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-300 w-24 text-right">{usd(d.value)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" />Risk Breakdown</CardTitle>
                <CardDescription>Outstanding by risk level</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {(["low", "medium", "high", "critical"] as const).map((level) => {
                    const val = rollup.riskBreakdown[level] ?? 0;
                    return (
                      <div key={level} className={`p-3 rounded-lg border ${riskColor[level]}`}>
                        <p className="text-xs uppercase">{level}</p>
                        <p className="text-lg font-semibold tabular-nums">{usd(val)}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-xs text-slate-400 mb-2">Revenue Forecast</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-slate-800/50 rounded"><p className="text-xs text-slate-400">30 days</p><p className="text-sm font-medium">{usd(rollup.forecast.days30)}</p></div>
                    <div className="p-2 bg-slate-800/50 rounded"><p className="text-xs text-slate-400">60 days</p><p className="text-sm font-medium">{usd(rollup.forecast.days60)}</p></div>
                    <div className="p-2 bg-slate-800/50 rounded"><p className="text-xs text-slate-400">90 days</p><p className="text-sm font-medium">{usd(rollup.forecast.days90)}</p></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Collection Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />Collection Trend (14 days)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-32">
                {rollup.collectionTrend.map((d) => {
                  const maxTrend = Math.max(1, ...rollup.collectionTrend.map((t) => t.collectedCents));
                  const h = (d.collectedCents / maxTrend) * 100;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${usd(d.collectedCents)}`}>
                      <div className="w-full bg-emerald-500/60 rounded-t" style={{ height: `${Math.max(h, 2)}%` }} />
                      <span className="text-[9px] text-slate-500 rotate-45 origin-left whitespace-nowrap">{d.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* AI Performance + Top Overdue */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bot className="h-4 w-4" />AI Recovery Performance</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-white/5">
                  {rollup.aiPerformance.length === 0 && <p className="p-4 text-sm text-slate-400">No AI Employees deployed yet.</p>}
                  {rollup.aiPerformance.map((ai) => (
                    <div key={ai.aiEmployeeId} className="flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-medium">{ai.name}</p>
                        <p className="text-xs text-slate-500">{ai.type} · {ai.messagesSent} msgs</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{pct(ai.recoveryRatePct)}</p>
                        <p className="text-xs text-slate-500">{ai.casesHandled} cases</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-rose-400" />Top Overdue Customers</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-white/5">
                  {customers
                    .filter((c) => c.outstandingBalanceCents > 0)
                    .sort((a, b) => b.outstandingBalanceCents - a.outstandingBalanceCents)
                    .slice(0, 5)
                    .map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5" onClick={() => viewCustomer(c.id)}>
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-slate-500">{c.company ?? c.email}</p>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <div>
                            <p className="text-sm font-medium text-rose-300">{usd(c.outstandingBalanceCents)}</p>
                            <Badge className={`text-[10px] ${riskColor[c.riskLevel]}`}>{c.riskLevel}</Badge>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-500" />
                        </div>
                      </div>
                    ))}
                  {customers.filter((c) => c.outstandingBalanceCents > 0).length === 0 && <p className="p-4 text-sm text-slate-400">No overdue customers. ✓</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ── CUSTOMERS TAB ────────────────────────────────────────────── */}
      {tab === "customers" && (
        <>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input placeholder="Search customers..." value={search} onChange={(e: any) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>

          {selectedCustomer ? (
            <CustomerDetail profile={selectedCustomer} onBack={() => setSelectedCustomer(null)} />
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-slate-500"><tr>
                    <th className="text-left p-3">Customer</th><th>Risk</th><th className="text-right">Outstanding</th>
                    <th className="text-right">Invoices</th><th>Score</th><th className="text-right p-3">Status</th>
                  </tr></thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredCustomers.map((c) => (
                      <tr key={c.id} className="cursor-pointer hover:bg-white/5" onClick={() => viewCustomer(c.id)}>
                        <td className="p-3">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-slate-500">{c.email}{c.company ? ` · ${c.company}` : ""}</p>
                        </td>
                        <td><Badge className={riskColor[c.riskLevel]}>{c.riskLevel}</Badge></td>
                        <td className="text-right tabular-nums">{usd(c.outstandingBalanceCents)}</td>
                        <td className="text-right tabular-nums">{c.totalInvoices} <span className="text-slate-500">({c.unpaidInvoices} unpaid)</span></td>
                        <td><span className={`tabular-nums ${c.creditScore >= 700 ? "text-emerald-300" : c.creditScore >= 500 ? "text-amber-300" : "text-rose-300"}`}>{c.creditScore}</span></td>
                        <td className="p-3 text-right"><Badge className={statusColor[c.status] ?? ""}>{c.status}</Badge></td>
                      </tr>
                    ))}
                    {filteredCustomers.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">No customers found.</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── INVOICES TAB ─────────────────────────────────────────────── */}
      {tab === "invoices" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />Invoices</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr>
                <th className="text-left p-3">Number</th><th>Status</th><th className="text-right">Amount</th>
                <th className="text-right">Paid</th><th className="text-right">Days Overdue</th><th className="text-left p-3">Due Date</th>
              </tr></thead>
              <tbody className="divide-y divide-white/5">
                {invoices.slice(0, 50).map((inv) => (
                  <tr key={inv.id} className={inv.status === "overdue" ? "bg-rose-500/5" : ""}>
                    <td className="p-3 font-medium font-mono">{inv.number}</td>
                    <td><Badge className={statusColor[inv.status] ?? ""}>{inv.status}</Badge></td>
                    <td className="text-right tabular-nums">{usd(inv.amountCents)}</td>
                    <td className="text-right tabular-nums">{usd(inv.paidCents)}</td>
                    <td className="text-right tabular-nums">{inv.daysOverdue > 0 ? <span className="text-rose-300">{inv.daysOverdue}d</span> : "—"}</td>
                    <td className="p-3 text-slate-400 text-xs">{new Date(inv.dueDate).toLocaleDateString()}</td>
                  </tr>
                ))}
                {invoices.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">No invoices.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── CASES TAB ────────────────────────────────────────────────── */}
      {tab === "cases" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="h-4 w-4" />Collection Cases</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr>
                <th className="text-left p-3">Status</th><th>Priority</th><th className="text-right">Outstanding</th>
                <th className="text-right">Recovered</th><th>Comms</th><th>Promises</th><th className="text-left p-3">Opened</th>
              </tr></thead>
              <tbody className="divide-y divide-white/5">
                {cases.map((cs) => (
                  <tr key={cs.id}>
                    <td className="p-3"><Badge className={statusColor[cs.status] ?? ""}>{cs.status}</Badge></td>
                    <td><Badge className={riskColor[cs.priority]}>{cs.priority}</Badge></td>
                    <td className="text-right tabular-nums">{usd(cs.totalOutstandingCents)}</td>
                    <td className="text-right tabular-nums text-emerald-300">{usd(cs.recoveredCents)}</td>
                    <td className="text-center tabular-nums">{cs.communicationsCount}</td>
                    <td className="text-center tabular-nums">{cs.promisesCount}{cs.brokenPromisesCount > 0 && <span className="text-rose-300 ml-1">({cs.brokenPromisesCount} broken)</span>}</td>
                    <td className="p-3 text-slate-400 text-xs">{timeAgo(cs.openedAt)}</td>
                  </tr>
                ))}
                {cases.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400">No collection cases.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── AI EMPLOYEES TAB ─────────────────────────────────────────── */}
      {tab === "ai-employees" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {aiEmployees.map((ai) => (
            <Card key={ai.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium flex items-center gap-2"><Bot className="h-4 w-4 text-emerald-400" />{ai.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{ai.type}</p>
                  </div>
                  <Badge className={ai.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-400"}>{ai.enabled ? "active" : "disabled"}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="p-2 bg-slate-800/50 rounded"><p className="text-xs text-slate-400">Cases</p><p className="text-sm font-medium">{ai.casesHandled}</p></div>
                  <div className="p-2 bg-slate-800/50 rounded"><p className="text-xs text-slate-400">Messages</p><p className="text-sm font-medium">{ai.messagesSent}</p></div>
                  <div className="p-2 bg-slate-800/50 rounded"><p className="text-xs text-slate-400">Recovery</p><p className="text-sm font-medium">{pct(ai.recoveryRatePct)}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
          {aiEmployees.length === 0 && (
            <Card className="md:col-span-2 lg:col-span-3">
              <CardContent className="p-8 text-center text-slate-400">
                <Bot className="h-8 w-8 mx-auto mb-2 text-slate-600" />
                <p>No AI Employees deployed. Create one to start automated collections.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── TASKS TAB ────────────────────────────────────────────────── */}
      {tab === "tasks" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" />Open Tasks</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-white/5">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-slate-500">{t.description || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={riskColor[t.priority]}>{t.priority}</Badge>
                    <span className="text-xs text-slate-400">{timeAgo(t.dueAt)}</span>
                  </div>
                </div>
              ))}
              {tasks.length === 0 && <p className="p-6 text-center text-slate-400">No open tasks. ✓</p>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CustomerDetail({ profile, onBack }: { profile: RgCustomerProfile; onBack: () => void }) {
  const { customer, invoices, cases, promises, communications, insights } = profile;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="text-sm">← Back to Customers</Button>

      {/* Customer header */}
      <Card>
        <CardContent className="p-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{customer.name}</h2>
            <p className="text-sm text-slate-400">{customer.email} {customer.company ? `· ${customer.company}` : ""}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge className={riskColor[customer.riskLevel]}>Risk: {customer.riskLevel}</Badge>
              <Badge className={statusColor[customer.status] ?? ""}>{customer.status}</Badge>
              <span className="text-xs text-slate-500">Credit Score: {customer.creditScore}/1000</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-rose-300 tabular-nums">{usd(customer.outstandingBalanceCents)}</p>
            <p className="text-xs text-slate-500">outstanding</p>
            <p className="text-xs text-slate-500 mt-1">LTV: {usd(customer.lifetimeValueCents)} · Avg delay: {customer.avgPaymentDelayDays}d</p>
          </div>
        </CardContent>
      </Card>

      {/* AI Insights */}
      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" />AI Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {insights.map((ins, i) => (
                <div key={i} className="p-3 bg-slate-800/50 rounded-lg flex items-start gap-2">
                  <Activity className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-slate-200">{ins.message}</p>
                    <p className="text-xs text-slate-500 mt-1">Confidence: {pct(ins.confidence * 100)} · {ins.type.replace(/_/g, " ")}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoices */}
      <Card>
        <CardHeader><CardTitle>Invoices ({invoices.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr>
              <th className="text-left p-3">Number</th><th>Status</th><th className="text-right">Amount</th><th className="text-right">Paid</th><th className="text-right p-3">Overdue</th>
            </tr></thead>
            <tbody className="divide-y divide-white/5">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="p-3 font-mono text-xs">{inv.number}</td>
                  <td><Badge className={statusColor[inv.status] ?? ""}>{inv.status}</Badge></td>
                  <td className="text-right tabular-nums">{usd(inv.amountCents)}</td>
                  <td className="text-right tabular-nums">{usd(inv.paidCents)}</td>
                  <td className="text-right tabular-nums">{inv.daysOverdue > 0 ? `${inv.daysOverdue}d` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Communication History */}
      <Card>
        <CardHeader><CardTitle>Communication History ({communications.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-white/5">
            {communications.slice(0, 20).map((c) => (
              <div key={c.id} className="p-3 flex items-start gap-3">
                <Badge className="bg-slate-700/50 text-slate-300 shrink-0">{c.channel}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{c.body}</p>
                  <p className="text-xs text-slate-500">{timeAgo(c.createdAt)} · {c.direction} {c.automated && "· AI automated"}</p>
                </div>
                <Badge className={`text-[10px] ${c.deliveryStatus === "delivered" || c.deliveryStatus === "read" ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-400"}`}>{c.deliveryStatus}</Badge>
              </div>
            ))}
            {communications.length === 0 && <p className="p-4 text-sm text-slate-400">No communications yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
