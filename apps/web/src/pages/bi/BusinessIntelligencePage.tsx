/**
 * Session 97 — Enterprise Business Intelligence dashboard.
 *
 * Data sources, live KPI values computed from the real module stores (never
 * stored/fabricated), and a report builder with deterministic evaluation and
 * a real CSV export. Values update as the underlying modules change.
 */
import { useCallback, useEffect, useState } from "react";
import { biApi } from "@/lib/businessIntelligence";
import type { BiRollup, BiSource, BiKpi, BiReport, BiReportEvaluation, BiModule, BiKpiValue } from "@/lib/businessIntelligence";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { BarChart3, Database, Gauge, FileText, PlusCircle, Download, RefreshCw } from "lucide-react";

const MODULES: BiModule[] = ["crm", "erp", "email", "social", "helpdesk", "builder"];

const fmt = (value: number, format: string): string => {
  if (format === "currency") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  if (format === "percent") return `${Math.round(value)}%`;
  return new Intl.NumberFormat("en-US").format(value);
};

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-azure shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-text-muted uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-black text-text-bright truncate">{value}</div>
          {sub ? <div className="text-xs text-text-muted truncate">{sub}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function BusinessIntelligencePage() {
  const [rollup, setRollup] = useState<BiRollup | null>(null);
  const [sources, setSources] = useState<BiSource[]>([]);
  const [kpis, setKpis] = useState<BiKpi[]>([]);
  const [kpiValues, setKpiValues] = useState<Record<string, BiKpiValue>>({});
  const [reports, setReports] = useState<BiReport[]>([]);
  const [evaluation, setEvaluation] = useState<BiReportEvaluation | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showSource, setShowSource] = useState(false);
  const [sName, setSName] = useState("");
  const [sModule, setSModule] = useState<BiModule>("crm");
  const [showKpi, setShowKpi] = useState(false);
  const [kName, setKName] = useState("");
  const [kModule, setKModule] = useState<BiModule>("crm");
  const [kMetric, setKMetric] = useState("contacts");
  const [kPeriod, setKPeriod] = useState<"all" | "7d" | "30d">("all");
  const [kFormat, setKFormat] = useState<"number" | "currency" | "percent">("number");
  const [showReport, setShowReport] = useState(false);
  const [rName, setRName] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, s, k, rep] = await Promise.all([biApi.rollup(), biApi.listSources(), biApi.listKpis(), biApi.listReports()]);
      setRollup(r); setSources(s); setKpis(k); setReports(rep);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadValues = useCallback(async (list: BiKpi[]) => {
    const out: Record<string, BiKpiValue> = {};
    for (const kpi of list) {
      try { out[kpi.id] = await biApi.kpiValue(kpi.id); } catch { /* skip */ }
    }
    setKpiValues(out);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadValues(kpis); }, [kpis, loadValues]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 4000); };

  const addSource = useCallback(async () => {
    if (!sName.trim()) return;
    try {
      await biApi.createSource({ name: sName.trim(), module: sModule });
      setSName(""); setShowSource(false);
      flash("Source registered.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [sName, sModule, load]);

  const addKpi = useCallback(async () => {
    if (!kName.trim()) return;
    try {
      await biApi.createKpi({ name: kName.trim(), sourceModule: kModule, metric: kMetric, period: kPeriod, format: kFormat });
      setKName(""); setShowKpi(false);
      flash("KPI created.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [kName, kModule, kMetric, kPeriod, kFormat, load]);

  const addReport = useCallback(async () => {
    if (!rName.trim()) return;
    try {
      await biApi.createReport({
        name: rName.trim(),
        cards: kpis.slice(0, 4).map((k) => ({ title: k.name, sourceModule: k.sourceModule, metric: k.metric, period: k.period })),
      });
      setRName(""); setShowReport(false);
      flash("Report created from the first 4 KPIs.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [rName, kpis, load]);

  const evaluate = useCallback(async (id: string) => {
    try {
      setEvaluation(await biApi.evaluateReport(id));
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);

  const c = rollup?.counts;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Business Intelligence</h1>
          <p className="text-sm text-text-muted">
            Report builder — Session 97. Every KPI value is computed live from the real module stores; nothing is stored or fabricated.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setShowSource(true); setShowKpi(false); setShowReport(false); }}>
            <Database className="w-4 h-4 mr-1" /> Source
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowKpi(true); setShowSource(false); setShowReport(false); }}>
            <Gauge className="w-4 h-4 mr-1" /> KPI
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowReport(true); setShowSource(false); setShowKpi(false); }} disabled={kpis.length === 0}>
            <PlusCircle className="w-4 h-4 mr-1" /> Report
          </Button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      {showSource ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Source name" value={sName} onChange={(e) => setSName(e.target.value)} />
              <Select value={sModule} onChange={(e) => setSModule(e.target.value as BiModule)}>
                {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={addSource} disabled={!sName.trim()}>Register source</Button>
              <Button variant="ghost" onClick={() => setShowSource(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showKpi ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Input placeholder="KPI name" value={kName} onChange={(e) => setKName(e.target.value)} className="md:col-span-2" />
              <Select value={kModule} onChange={(e) => setKModule(e.target.value as BiModule)}>
                {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
              <Select value={kMetric} onChange={(e) => setKMetric(e.target.value)}>
                {({ crm: ["contacts", "companies", "open_deals", "won_deals", "forecast"], erp: ["products", "stock_value", "purchase_orders", "sales_orders"], email: ["mailboxes", "messages", "unread", "queued_outbox"], social: ["posts", "comments", "reactions"], helpdesk: ["tickets", "open", "resolved", "overdue"], builder: ["projects", "builds", "artifacts", "releases"] } as Record<BiModule, string[]>)[kModule].map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
              <Select value={kPeriod} onChange={(e) => setKPeriod(e.target.value as "all" | "7d" | "30d")}>
                <option value="all">All time</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={addKpi} disabled={!kName.trim()}>Create KPI</Button>
              <Button variant="ghost" onClick={() => setShowKpi(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showReport ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Input placeholder="Report name" value={rName} onChange={(e) => setRName(e.target.value)} />
            <div className="flex gap-2">
              <Button onClick={addReport} disabled={!rName.trim()}>Create report (first 4 KPIs as cards)</Button>
              <Button variant="ghost" onClick={() => setShowReport(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <Stat icon={<Database className="w-5 h-5" />} label="Sources" value={String(c?.sources ?? 0)} sub={`${c?.enabledSources ?? 0} enabled`} />
        <Stat icon={<Gauge className="w-5 h-5" />} label="KPIs" value={String(c?.kpis ?? 0)} />
        <Stat icon={<FileText className="w-5 h-5" />} label="Reports" value={String(c?.reports ?? 0)} />
        <Stat icon={<BarChart3 className="w-5 h-5" />} label="Cards" value={String(c?.cards ?? 0)} />
        <Stat icon={<Database className="w-5 h-5" />} label="Samples" value={String(rollup?.sourceHealth.reduce((s, h) => s + h.sampleCount, 0) ?? 0)} />
      </div>

      {/* Sources */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Data sources</CardTitle><CardDescription>Live sample counts read from the real module stores.</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {sources.map((s) => (
              <div key={s.id} className="rounded-lg border border-white/5 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-text-bright truncate">{s.name}</span>
                  <Badge variant={s.enabled ? "emerald" : "slate"}>{s.enabled ? "enabled" : "disabled"}</Badge>
                </div>
                <div className="text-xs text-text-muted">{s.module}</div>
              </div>
            ))}
            {sources.length === 0 ? <p className="text-sm text-text-muted">No sources yet.</p> : null}
          </div>
        </CardContent>
      </Card>

      {/* KPIs with live values */}
      <Card>
        <CardHeader><CardTitle className="text-lg">KPIs (live values)</CardTitle><CardDescription>Computed from the real module stores on every read.</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {kpis.map((k) => {
              const v = kpiValues[k.id];
              return (
                <div key={k.id} className="rounded-lg border border-white/5 bg-white/5 p-3">
                  <div className="text-sm font-semibold text-text-bright truncate">{k.name}</div>
                  <div className="text-xs text-text-muted">{k.sourceModule} · {k.metric} · {k.period}</div>
                  <div className="mt-1 text-2xl font-black text-azure">{v ? fmt(v.value, v.format) : "…"}</div>
                  <div className="text-xs text-text-muted">{v ? `sampled ${new Date(v.sampledAt).toLocaleTimeString()}` : "sampling…"}</div>
                </div>
              );
            })}
            {kpis.length === 0 ? <p className="text-sm text-text-muted">No KPIs yet.</p> : null}
          </div>
        </CardContent>
      </Card>

      {/* Reports */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Reports</CardTitle>
          <CardDescription>Evaluate a report to render live card values; export is a real CSV.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {reports.map((r) => (
              <Button key={r.id} size="sm" variant="outline" onClick={() => evaluate(r.id)}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> {r.name}
              </Button>
            ))}
            {reports.length === 0 ? <p className="text-sm text-text-muted">No reports yet.</p> : null}
          </div>
          {evaluation ? (
            <div className="rounded-lg border border-white/5 bg-white/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-text-bright">{evaluation.report.name}</span>
                <a href={biApi.exportCsv(evaluation.report.id)} target="_blank" rel="noreferrer" className="text-xs text-azure hover:underline flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </a>
              </div>
              <div className="text-xs text-text-muted">evaluated {new Date(evaluation.evaluatedAt).toLocaleString()}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {evaluation.cards.map((cv) => (
                  <div key={cv.card.id} className="rounded-lg border border-white/5 bg-white/10 p-3">
                    <div className="text-xs font-semibold text-text-muted uppercase">{cv.card.title}</div>
                    <div className="text-xl font-black text-text-bright">{fmt(cv.value, cv.format)}</div>
                    <div className="text-xs text-text-muted">{cv.card.sourceModule} · {cv.card.metric} · {cv.card.period}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
