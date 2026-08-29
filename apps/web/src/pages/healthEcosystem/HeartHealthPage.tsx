/**
 * Session 200 / 203 — Heart Center (AI-Powered Heart Reports & Scans) — /app/heart
 *
 * The heart-health suite of the Health Ecosystem:
 *   Heart Scan (camera thumb PPG) · Your Heart Data · HRV Analysis ·
 *   Heart Rate Monitor · Quick Heart Measure · Track Blood Pressure ·
 *   Pulse Statistics · Heart / Kidney / Health Scan reports
 *
 * Same record-only honesty as the ecosystem console: every number on this page
 * is arithmetic over measurements the user or a connected device recorded.
 * The camera scan reads a thumb over the lens (light on) and shows only
 * progress while scanning — results and the heart report appear exclusively
 * after the scan completes. No readings, rhythms or scan findings are ever
 * fabricated, and all derived output is labeled wellness_estimate per the
 * Fifth Standing Rule.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Activity, AlertCircle, CheckCircle2, Droplet, FileText, Gauge, Heart,
  HeartPulse, Plus, ScanLine, Sparkles, Stethoscope,
} from "lucide-react";
import {
  hecApi,
  heartApi,
  type HeartDataSnapshot, type HrvAnalysis, type HeartMonitorFeed,
  type QuickHeartMeasureResult, type BloodPressureSummary,
  type PulseStats, type HeartReport, type HeartScanKind,
} from "@/lib/healthEcosystem";
import { ThumbScanCard, type ThumbScanOutcome } from "./ThumbScanCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function labelVariant(l: string): any {
  return l === "clinically_validated" ? "emerald" : l === "medical_decision_support" ? "crimson" : "slate";
}
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const nOr = (v: number | null | undefined, unit = "") =>
  v === null || v === undefined ? "—" : `${Math.round(v * 10) / 10}${unit ? ` ${unit}` : ""}`;

/** Session 204 — recordable whole-health inputs that feed the Health Scan. */
const HEALTH_INPUTS: Array<{ kind: string; label: string; unit: string }> = [
  { kind: "glucose", label: "Blood glucose", unit: "mg/dL" },
  { kind: "hba1c", label: "HbA1c", unit: "%" },
  { kind: "spo2", label: "Oxygen saturation (SpO2)", unit: "%" },
  { kind: "temperature", label: "Body temperature", unit: "°C" },
  { kind: "respiratory_rate", label: "Respiratory rate", unit: "breaths/min" },
  { kind: "sleep", label: "Sleep duration", unit: "min" },
  { kind: "stress", label: "Stress index", unit: "0-100" },
  { kind: "hydration", label: "Hydration", unit: "%" },
  { kind: "weight", label: "Weight", unit: "kg" },
  { kind: "vo2max", label: "VO2 max", unit: "mL/kg/min" },
  { kind: "egfr", label: "eGFR (kidney)", unit: "mL/min/1.73m²" },
  { kind: "creatinine", label: "Creatinine (kidney)", unit: "mg/dL" },
];
const unitFor = (k: string) => HEALTH_INPUTS.find((x) => x.kind === k)?.unit ?? "";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="border-slate-800 bg-slate-900/40">
      <CardHeader className="pb-2">
        <CardDescription className="text-xs text-slate-400">{label}</CardDescription>
        <CardTitle className="text-2xl text-slate-100">{value}</CardTitle>
      </CardHeader>
      {sub ? <CardContent className="text-xs text-slate-500">{sub}</CardContent> : null}
    </Card>
  );
}

/** Rendered heart/scan report — shared by the camera-scan tab and the reports list. */
function ReportCard({ r }: { r: HeartReport }) {
  return (
    <Card className="border-slate-800 bg-slate-900/30">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Stethoscope className="h-4 w-4 text-slate-500" />
          <CardTitle className="text-slate-100">{r.title}</CardTitle>
          <Badge variant={r.hasData ? "emerald" : "slate"} className="text-[10px]">{r.hasData ? "data-backed" : "no data"}</Badge>
          <Badge variant={labelVariant(r.label)} className="text-[10px]">{r.label.replace(/_/g, " ")}</Badge>
          <span className="ml-auto text-xs text-slate-500">{fmtDate(r.generatedAt)}</span>
        </div>
        <CardDescription className="text-xs text-slate-500">{r.disclaimer}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {r.sections.map((s, i) => (
          <div key={i} className={`rounded border px-3 py-2 ${s.status === "empty" ? "border-slate-800 bg-slate-900/40" : s.status === "observation" ? "border-amber-900/40 bg-amber-950/20" : "border-slate-700 bg-slate-900/60"}`}>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{s.title}</span>
              <Badge variant={s.status === "empty" ? "slate" : s.status === "observation" ? "amber" : "emerald"} className="text-[10px]">{s.status === "empty" ? "no data recorded" : s.status}</Badge>
              <span className="text-[10px] text-slate-500">{s.basisReadings} readings</span>
            </div>
            <p className="mt-1 text-sm text-slate-300">{s.text}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function HeartHealthPage() {
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // data
  const [data, setData] = useState<HeartDataSnapshot | null>(null);
  const [hrv, setHrv] = useState<HrvAnalysis | null>(null);
  const [hrvDays, setHrvDays] = useState("7");
  const [monitor, setMonitor] = useState<HeartMonitorFeed | null>(null);
  const [bp, setBp] = useState<BloodPressureSummary | null>(null);
  const [pulse, setPulse] = useState<PulseStats | null>(null);
  const [reports, setReports] = useState<HeartReport[]>([]);
  /** Report auto-generated right after a camera thumb scan completes. */
  const [scanReport, setScanReport] = useState<HeartReport | null>(null);

  // quick measure form
  const [qmHr, setQmHr] = useState("");
  const [qmSys, setQmSys] = useState("");
  const [qmDia, setQmDia] = useState("");
  const [qmRr, setQmRr] = useState("");
  const [qmSource, setQmSource] = useState("manual");
  const [qmResult, setQmResult] = useState<QuickHeartMeasureResult | null>(null);

  // monitor record form
  const [monBpm, setMonBpm] = useState("");

  // whole-health input form (Session 204)
  const [hKind, setHKind] = useState("glucose");
  const [hValue, setHValue] = useState("");
  const [hSource, setHSource] = useState("manual");

  // bp form
  const [bpSys, setBpSys] = useState("");
  const [bpDia, setBpDia] = useState("");
  const [bpPulse, setBpPulse] = useState("");
  const [bpSource, setBpSource] = useState("manual");

  const load = useCallback(async () => {
    try {
      const [d, h, m, b, p, r] = await Promise.all([
        heartApi.data(), heartApi.hrv(Number(hrvDays) || 7), heartApi.monitor(),
        heartApi.bloodPressure(), heartApi.pulseStats(), heartApi.reports(),
      ]);
      setData(d); setHrv(h); setMonitor(m); setBp(b); setPulse(p); setReports(r);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed to load heart data", type: "error" });
    }
  }, [hrvDays]);

  useEffect(() => { void load(); }, [load]);

  const reloadHrv = async (days: string) => {
    setHrvDays(days);
    try { setHrv(await heartApi.hrv(Number(days) || 7)); } catch { /* keep previous */ }
  };

  const quickMeasure = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const rr = qmRr.trim()
        ? qmRr.split(/[\s,;]+/).map(Number).filter((x) => Number.isFinite(x) && x > 0).slice(0, 600)
        : undefined;
      const res = await heartApi.quickMeasure({
        heartRateBpm: qmHr ? Number(qmHr) : undefined,
        systolic: qmSys ? Number(qmSys) : undefined,
        diastolic: qmDia ? Number(qmDia) : undefined,
        rrIntervalsMs: rr && rr.length ? rr : undefined,
        source: qmSource as any,
      });
      setQmResult(res);
      setMsg({ text: `Recorded ${res.recorded.length} measurement${res.recorded.length === 1 ? "" : "s"}${res.hrv ? ` · sample HRV: SDNN ${res.hrv.sdnnMs ?? "—"} ms, RMSSD ${res.hrv.rmssdMs ?? "—"} ms` : ""}`, type: "success" });
      await load();
    } catch (err) { setMsg({ text: err instanceof Error ? err.message : "Quick measure failed", type: "error" }); }
  };

  const recordMonitor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await heartApi.quickMeasure({ heartRateBpm: Number(monBpm), source: "manual" });
      setMonBpm("");
      setMsg({ text: "Heart-rate reading recorded", type: "success" });
      await load();
    } catch (err) { setMsg({ text: err instanceof Error ? err.message : "Failed to record reading", type: "error" }); }
  };

  const recordBp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await heartApi.addBloodPressure({
        systolic: Number(bpSys), diastolic: Number(bpDia),
        pulseBpm: bpPulse ? Number(bpPulse) : undefined, source: bpSource,
      });
      setBpSys(""); setBpDia(""); setBpPulse("");
      setMsg({ text: "Blood-pressure reading recorded", type: "success" });
      await load();
    } catch (err) { setMsg({ text: err instanceof Error ? err.message : "Failed to record reading", type: "error" }); }
  };

  const recordHealthInput = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await hecApi.addMetric({ kind: hKind as any, value: Number(hValue), unit: unitFor(hKind), source: hSource as any });
      setHValue("");
      setMsg({ text: `Recorded ${hKind} ${hValue} ${unitFor(hKind)}`, type: "success" });
      await load();
    } catch (err) { setMsg({ text: err instanceof Error ? err.message : "Failed to record measurement", type: "error" }); }
  };

  const runScan = async (kind: HeartScanKind) => {
    try {
      const r = await heartApi.generateReport(kind);
      setReports(await heartApi.reports());
      setMsg({ text: `${r.title} generated — ${r.sections.filter((s) => s.status !== "empty").length}/${r.sections.length} sections have data`, type: "success" });
    } catch (err) { setMsg({ text: err instanceof Error ? err.message : "Scan failed", type: "error" }); }
  };

  /**
   * Camera thumb scan finished and was recorded — results/report are shown only
   * at this point (never mid-scan). Refresh every tab and compile the heart
   * report from the fresh recording.
   */
  const handleScanComplete = async (o: ThumbScanOutcome) => {
    try {
      const r = await heartApi.generateReport("heart_scan");
      setScanReport(r);
      setReports(await heartApi.reports());
      await load();
      setMsg({
        text: `Thumb scan complete — ${o.analysis.bpm} bpm recorded${o.recorded ? "" : " (recording failed — see Heart Scan tab)"}. Heart report generated below.`,
        type: o.recorded ? "success" : "error",
      });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to compile the post-scan report", type: "error" });
    }
  };

  const t = (v: string) => `data-[state=active]:border-b-2 data-[state=active]:border-sky-500 ${v}`;
  const healthReport = reports.find((r) => r.kind === "health_scan") ?? null;
  const healthDomains = healthReport ? healthReport.sections.filter((s) => s.title !== "Scan Summary") : [];
  const healthWithData = healthDomains.filter((s) => s.status !== "empty").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-100">Heart Center</h1>
            <Badge variant="crimson" className="text-xs">AI-Powered Heart Reports</Badge>
            <Badge variant="outline" className="text-xs">Record-only</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Camera thumb scan (light on, thumb over the lens) for heart rate &amp; HRV, plus your heart data, blood-pressure
            tracking and pulse statistics — and AI-powered Heart, Kidney and Health scan reports compiled from your recorded
            measurements. Scan results and reports appear only after a scan <span className="text-slate-300">completes</span>;
            nothing here is invented.
          </p>
        </div>
        {data && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400">
            <HeartPulse className="h-4 w-4 text-crimson" />
            <span>{data.totalRecorded} heart-domain records · {reports.length} saved reports</span>
          </div>
        )}
      </div>

      {msg && (
        <div className={`flex items-center justify-between rounded-lg p-3 text-sm ${msg.type === "success" ? "border border-emerald-900/50 bg-emerald-950/40 text-emerald-300" : "border border-rose-900/50 bg-rose-950/40 text-rose-300"}`}>
          <div className="flex items-center gap-2">{msg.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}<span>{msg.text}</span></div>
          <button onClick={() => setMsg(null)} className="text-xs opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      <Tabs defaultValue="scan" className="w-full">
        <TabsList className="border-b border-slate-800 bg-transparent">
          <TabsTrigger value="scan" className={t("")}>Heart Scan (Camera)</TabsTrigger>
          <TabsTrigger value="data" className={t("")}>Heart Data</TabsTrigger>
          <TabsTrigger value="hrv" className={t("")}>HRV Analysis</TabsTrigger>
          <TabsTrigger value="monitor" className={t("")}>Heart Rate Monitor</TabsTrigger>
          <TabsTrigger value="quick" className={t("")}>Quick Measure</TabsTrigger>
          <TabsTrigger value="bp" className={t("")}>Blood Pressure</TabsTrigger>
          <TabsTrigger value="pulse" className={t("")}>Pulse Stats</TabsTrigger>
          <TabsTrigger value="healthscan" className={t("")}>Health Scan</TabsTrigger>
          <TabsTrigger value="reports" className={t("")}>Reports &amp; Scans</TabsTrigger>
        </TabsList>

        {/* ── Camera Heart Scan (thumb PPG) ───────────────────────────── */}
        <TabsContent value="scan" className="space-y-4 pt-4">
          <ThumbScanCard onComplete={handleScanComplete} />
          {scanReport ? (
            <>
              <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <Sparkles className="h-4 w-4 text-sky-400" />
                Heart Report — generated after your scan completed
              </div>
              <ReportCard r={scanReport} />
            </>
          ) : (
            <Card className="border-slate-800 bg-slate-900/30">
              <CardContent className="p-6 text-center text-sm text-slate-500">
                <ScanLine className="mx-auto mb-2 h-6 w-6 text-slate-600" />
                The Heart Report appears here once a thumb scan completes — results are never shown mid-scan.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Your Heart Data ─────────────────────────────────────────── */}
        <TabsContent value="data" className="space-y-4 pt-4">
          {!data ? <p className="text-sm text-slate-500">Loading…</p> : !data.hasData ? (
            <Card className="border-slate-800 bg-slate-900/30">
              <CardContent className="p-6 text-center text-sm text-slate-500">
                <HeartPulse className="mx-auto mb-2 h-6 w-6 text-slate-600" />
                No heart data recorded yet. Run a <span className="text-slate-300">Heart Scan (Camera)</span> with your thumb over
                the lens, use Quick Measure, or connect a device — this page only ever shows measurements that were actually recorded.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(["heart_rate", "resting_hr", "hrv_rmssd", "bp_systolic"] as const).map((k) => (
                  <Stat
                    key={k}
                    label={k === "heart_rate" ? "Latest Heart Rate" : k === "resting_hr" ? "Latest Resting HR" : k === "hrv_rmssd" ? "Latest RMSSD" : "Latest Systolic"}
                    value={data.latest[k] ? `${data.latest[k]!.value} ${data.latest[k]!.unit}` : "—"}
                    sub={data.latest[k] ? `${fmtDate(data.latest[k]!.at)} · ${data.counts[k]} recorded` : "not recorded yet"}
                  />
                ))}
              </div>
              <Card className="border-slate-800 bg-slate-900/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-100"><Heart className="h-4 w-4 text-crimson" />Your Heart Data — recent records</CardTitle>
                  <CardDescription className="text-xs text-slate-400">Heart-domain metrics only, newest first. Labels reflect the source (manual/phone entries are always wellness estimates).</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="max-h-96 space-y-1 overflow-y-auto">
                    {data.recent.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                        <span className="flex-1 text-sm text-slate-200">{m.kind.replace(/_/g, " ")} <span className="font-mono text-xs text-slate-400">{m.value} {m.unit}</span></span>
                        <span className="text-[10px] text-slate-500">{m.source}</span>
                        <Badge variant={labelVariant(m.label)} className="text-[10px]">{m.label.replace(/_/g, " ")}</Badge>
                        <span className="text-xs text-slate-500">{new Date(m.at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── Heart Rate Variability Analysis ─────────────────────────── */}
        <TabsContent value="hrv" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-slate-100"><Activity className="h-4 w-4 text-sky-400" />Heart Rate Variability Analysis</CardTitle>
                <CardDescription className="text-xs text-slate-400">Time-domain math (SDNN · RMSSD · pNN50) over your recorded beat-to-beat intervals — always a wellness estimate.</CardDescription>
              </div>
              <Select value={hrvDays} onChange={(e) => void reloadHrv(e.target.value)} className="w-32">
                <option value="1">24 hours</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </Select>
            </CardHeader>
          </Card>
          {!hrv ? <p className="text-sm text-slate-500">Loading…</p> : !hrv.hasData ? (
            <Card className="border-slate-800 bg-slate-900/30">
              <CardContent className="p-6 text-center text-sm text-slate-500">
                No RR intervals or device HRV values recorded in the last {hrv.windowDays} day{hrv.windowDays === 1 ? "" : "s"}.
                Record a sample via <span className="text-slate-300">Quick Measure</span> (paste an ECG/PPG interval strip) to compute SDNN and RMSSD.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Stat label="SDNN" value={nOr(hrv.sdnnMs, "ms")} sub={`${hrv.sampleCount} intervals in window`} />
              <Stat label="RMSSD" value={nOr(hrv.rmssdMs, "ms")} sub="root mean square of successive differences" />
              <Stat label="pNN50" value={nOr(hrv.pnn50Pct, "%")} sub="successive diffs &gt; 50 ms" />
              <Stat label="Mean RR" value={nOr(hrv.meanRrMs, "ms")} sub={`implied mean HR ${nOr(hrv.meanHeartRateBpm, "bpm")}`} />
              <Stat label="Device SDNN avg" value={nOr(hrv.deviceAvgSdnnMs, "ms")} sub="from recorded hrv_sdnn metrics" />
              <Stat label="Device RMSSD avg" value={nOr(hrv.deviceAvgRmssdMs, "ms")} sub="from recorded hrv_rmssd metrics" />
            </div>
          )}
        </TabsContent>

        {/* ── Heart Rate Monitor ──────────────────────────────────────── */}
        <TabsContent value="monitor" className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Latest" value={nOr(monitor?.latestBpm, "bpm")} sub={fmtDate(monitor?.latestAt)} />
            <Stat label="24h Min" value={nOr(monitor?.min24hBpm)} />
            <Stat label="24h Avg" value={nOr(monitor?.avg24hBpm)} />
            <Stat label="24h Max" value={nOr(monitor?.max24hBpm)} />
            <Stat label="Resting (30d avg)" value={nOr(monitor?.restingAvgBpm)} />
          </div>
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-100"><HeartPulse className="h-4 w-4 text-crimson" />Heart Rate Monitor</CardTitle>
              <CardDescription className="text-xs text-slate-400">Your recorded heart-rate stream. This module records real readings — it does not simulate a live waveform.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <form onSubmit={recordMonitor} className="flex flex-wrap items-center gap-3">
                <Input value={monBpm} onChange={(e) => setMonBpm(e.target.value)} placeholder="heart rate (bpm)" className="w-44" inputMode="numeric" />
                <Button type="submit" disabled={!monBpm}><Plus className="mr-1 h-4 w-4" />Record reading</Button>
              </form>
              {monitor?.readings.length ? (
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {monitor.readings.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                      <span className="font-mono text-sm text-slate-200">{m.value} bpm</span>
                      <span className="flex-1 text-[10px] text-slate-500">{m.source}</span>
                      <Badge variant={labelVariant(m.label)} className="text-[10px]">{m.label.replace(/_/g, " ")}</Badge>
                      <span className="text-xs text-slate-500">{fmtDate(m.at)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">No heart-rate readings recorded yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Quick Heart Measure ─────────────────────────────────────── */}
        <TabsContent value="quick" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-100"><Gauge className="h-4 w-4 text-amber-400" />Quick Heart Measure</CardTitle>
              <CardDescription className="text-xs text-slate-400">Record one measurement now: a heart rate, a blood-pressure pair, and/or a beat-to-beat interval sample. Manual entries are stored as wellness estimates; only device/clinical sources can carry a clinical label.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={quickMeasure} className="space-y-3">
                <div className="flex flex-wrap gap-3">
                  <Input value={qmHr} onChange={(e) => setQmHr(e.target.value)} placeholder="heart rate (bpm)" className="w-40" inputMode="numeric" />
                  <Input value={qmSys} onChange={(e) => setQmSys(e.target.value)} placeholder="systolic (mmHg)" className="w-40" inputMode="numeric" />
                  <Input value={qmDia} onChange={(e) => setQmDia(e.target.value)} placeholder="diastolic (mmHg)" className="w-40" inputMode="numeric" />
                  <Select value={qmSource} onChange={(e) => setQmSource(e.target.value)} className="w-44">
                    <option value="manual">manual</option>
                    <option value="phone_ppg">phone PPG</option>
                    <option value="wearable">wearable</option>
                    <option value="bp_monitor">BP monitor</option>
                    <option value="ecg_monitor">ECG monitor</option>
                  </Select>
                </div>
                <Input value={qmRr} onChange={(e) => setQmRr(e.target.value)} placeholder="RR intervals in ms, space/comma separated (e.g. 800 812 795 830 …) — optional" />
                <Button type="submit" disabled={!qmHr && !qmSys && !qmRr && !qmDia}>Measure &amp; record</Button>
              </form>
              {qmResult && (
                <div className="mt-4 rounded border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-1 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /><span className="text-sm font-medium text-slate-200">Recorded</span></div>
                  <div className="space-y-1">
                    {qmResult.recorded.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 text-slate-300">{m.kind.replace(/_/g, " ")}: <span className="font-mono">{m.value} {m.unit}</span></span>
                        <Badge variant={labelVariant(m.label)} className="text-[10px]">{m.label.replace(/_/g, " ")}</Badge>
                      </div>
                    ))}
                  </div>
                  {qmResult.hrv && (
                    <div className="mt-2 text-xs text-slate-400">
                      Sample HRV ({qmResult.hrv.sampleCount} intervals): SDNN <span className="font-mono text-slate-200">{nOr(qmResult.hrv.sdnnMs, "ms")}</span> · RMSSD <span className="font-mono text-slate-200">{nOr(qmResult.hrv.rmssdMs, "ms")}</span> · pNN50 <span className="font-mono text-slate-200">{nOr(qmResult.hrv.pnn50Pct, "%")}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Track Blood Pressure ────────────────────────────────────── */}
        <TabsContent value="bp" className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Latest" value={bp?.latest ? `${bp.latest.systolic}/${bp.latest.diastolic}` : "—"} sub={bp?.latest ? `MAP ${bp.latest.map} · PP ${bp.latest.pulsePressure} mmHg · ${fmtDate(bp.latest.at)}` : "no readings yet"} />
            <Stat label="Average (all)" value={bp?.avgSystolic ? `${bp.avgSystolic}/${bp.avgDiastolic}` : "—"} sub={`${bp?.totalReadings ?? 0} readings`} />
            <Stat label="7-day average" value={bp?.avgSystolic7d ? `${bp.avgSystolic7d}/${bp.avgDiastolic7d}` : "—"} />
            <Stat label="Avg MAP / Pulse Pressure" value={bp?.avgMap ? `${bp.avgMap} / ${bp.avgPulsePressure} mmHg` : "—"} />
          </div>
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-100"><Activity className="h-4 w-4 text-rose-400" />Track Blood Pressure</CardTitle>
              <CardDescription className="text-xs text-slate-400">MAP ≈ diastolic + (systolic − diastolic)/3. Band labels describe where a recorded pair sits (AHA reference bands) — they are not diagnoses.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <form onSubmit={recordBp} className="flex flex-wrap items-center gap-3">
                <Input value={bpSys} onChange={(e) => setBpSys(e.target.value)} placeholder="systolic" className="w-32" inputMode="numeric" />
                <Input value={bpDia} onChange={(e) => setBpDia(e.target.value)} placeholder="diastolic" className="w-32" inputMode="numeric" />
                <Input value={bpPulse} onChange={(e) => setBpPulse(e.target.value)} placeholder="pulse (optional)" className="w-36" inputMode="numeric" />
                <Select value={bpSource} onChange={(e) => setBpSource(e.target.value)} className="w-40">
                  <option value="manual">manual</option>
                  <option value="bp_monitor">BP monitor</option>
                  <option value="ehr">EHR</option>
                </Select>
                <Button type="submit" disabled={!bpSys || !bpDia}><Plus className="mr-1 h-4 w-4" />Record</Button>
              </form>
              {bp?.latestBand && (
                <div className="rounded border border-amber-900/40 bg-amber-950/20 p-2 text-xs text-amber-200/90">Latest band: {bp.latestBand}</div>
              )}
              {bp?.observations.map((o, i) => (
                <div key={i} className="rounded border border-slate-800 bg-slate-900/50 p-2 text-xs text-slate-400">{o}</div>
              ))}
              {bp?.readings.length ? (
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {bp.readings.map((r, i) => (
                    <div key={`${r.at}-${i}`} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                      <span className="font-mono text-sm text-slate-200">{r.systolic}/{r.diastolic} mmHg</span>
                      {r.pulseBpm !== undefined && <span className="text-xs text-slate-500">· {r.pulseBpm} bpm</span>}
                      <span className="flex-1 text-[10px] text-slate-500">MAP {r.map} · PP {r.pulsePressure} · {r.source}</span>
                      <Badge variant={labelVariant(r.label)} className="text-[10px]">{r.label.replace(/_/g, " ")}</Badge>
                      <span className="text-xs text-slate-500">{new Date(r.at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">No blood-pressure readings recorded yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Pulse Statistics ────────────────────────────────────────── */}
        <TabsContent value="pulse" className="space-y-4 pt-4">
          {!pulse?.hasData ? (
            <Card className="border-slate-800 bg-slate-900/30">
              <CardContent className="p-6 text-center text-sm text-slate-500">No pulse readings recorded yet — statistics appear once measurements exist.</CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Latest" value={nOr(pulse.latestBpm, "bpm")} sub={fmtDate(pulse.latestAt)} />
                <Stat label="Average (all)" value={nOr(pulse.avgBpm, "bpm")} sub={`${pulse.count} readings`} />
                <Stat label="Range" value={pulse.minBpm !== null ? `${pulse.minBpm}–${pulse.maxBpm} bpm` : "—"} />
                <Stat label="Resting (30d avg)" value={nOr(pulse.restingAvgBpm, "bpm")} />
                <Stat label="7-day avg" value={nOr(pulse.avgBpm7d, "bpm")} />
                <Stat label="30-day avg" value={nOr(pulse.avgBpm30d, "bpm")} />
                <Stat label="Trend (7d vs 30d)" value={pulse.trendBpm === null ? "—" : `${pulse.trendBpm > 0 ? "+" : ""}${pulse.trendBpm} bpm`} />
                <Stat label="Readings" value={String(pulse.count)} />
              </div>
              {pulse.series.length > 1 && (
                <Card className="border-slate-800 bg-slate-900/30">
                  <CardHeader><CardTitle className="text-slate-100">Recent pulse (last {pulse.series.length} readings)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex h-28 items-end gap-1">
                      {pulse.series.map((s) => (
                        <div key={s.at} title={`${s.bpm} bpm · ${fmtDate(s.at)}`}
                          className="flex-1 rounded-t bg-crimson/60"
                          style={{ height: `${Math.max(4, ((s.bpm - 30) / 190) * 100)}%` }} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Health Scan (whole-body, Session 204) ───────────────────── */}
        <TabsContent value="healthscan" className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Domains with data"
              value={healthReport ? `${healthWithData} / ${healthDomains.length}` : "—"}
              sub={healthReport ? `from your latest Health Scan` : "run a Health Scan to see coverage"}
            />
            <Stat
              label="Readings analyzed"
              value={healthReport ? String(healthDomains.reduce((a, s) => a + s.basisReadings, 0)) : "—"}
              sub={healthReport ? `latest ${fmtDate(healthReport.generatedAt)}` : undefined}
            />
            <Stat label="Saved Health Scans" value={String(reports.filter((r) => r.kind === "health_scan").length)} sub="newest first in Reports &amp; Scans" />
          </div>

          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-100"><ScanLine className="h-4 w-4 text-sky-400" />Record whole-health measurements</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                These feed the Health Scan. Manual entries are stored as wellness estimates — pick <code>ehr</code> only for values transcribed from clinical lab reports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={recordHealthInput} className="flex flex-wrap items-center gap-3">
                <Select value={hKind} onChange={(e) => setHKind(e.target.value)} className="w-56">
                  {HEALTH_INPUTS.map((x) => (
                    <option key={x.kind} value={x.kind}>{x.label}</option>
                  ))}
                </Select>
                <Input value={hValue} onChange={(e) => setHValue(e.target.value)} placeholder={`value (${unitFor(hKind)})`} className="w-40" inputMode="decimal" />
                <Select value={hSource} onChange={(e) => setHSource(e.target.value)} className="w-40">
                  <option value="manual">manual</option>
                  <option value="ehr">EHR / lab report</option>
                  <option value="wearable">wearable</option>
                </Select>
                <Button type="submit" disabled={!hValue}><Plus className="mr-1 h-4 w-4" />Record</Button>
              </form>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void runScan("health_scan")}><ScanLine className="mr-1 h-4 w-4" />Generate Health Scan</Button>
            {healthReport && <span className="text-xs text-slate-500">latest: {fmtDate(healthReport.generatedAt)}</span>}
          </div>

          {healthDomains.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {healthDomains.map((s) => (
                <Badge key={s.title} variant={s.status === "empty" ? "slate" : "emerald"} className="text-[10px]">
                  {s.title}{s.status === "empty" ? "" : ` · ${s.basisReadings}`}
                </Badge>
              ))}
            </div>
          )}

          {healthReport ? (
            <ReportCard r={healthReport} />
          ) : (
            <Card className="border-slate-800 bg-slate-900/30">
              <CardContent className="p-6 text-center text-sm text-slate-500">
                <ScanLine className="mx-auto mb-2 h-6 w-6 text-slate-600" />
                No Health Scan yet — record measurements above (or run the camera thumb scan) and generate one.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── AI-Powered Heart Reports & Scans ────────────────────────── */}
        <TabsContent value="reports" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-100"><Sparkles className="h-4 w-4 text-sky-400" />AI-Powered Reports &amp; Scans</CardTitle>
              <CardDescription className="text-xs text-slate-400">Each report compiles from your recorded measurements — deterministically, with every section citing what it was computed from. Use the <span className="text-slate-300">Heart Scan (Camera)</span> tab for the live thumb scan; the buttons below re-compile reports from all recorded data. Domains with no recorded data yield honest "no data recorded" sections; findings are never invented.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Button variant="outline" onClick={() => void runScan("heart_scan")} className="h-auto flex-col gap-1 py-3">
                <HeartPulse className="h-5 w-5 text-crimson" />
                <span className="text-sm">Heart Scan</span>
                <span className="text-[10px] font-normal text-slate-500">AI-Powered Heart Report</span>
              </Button>
              <Button variant="outline" onClick={() => void runScan("kidney_scan")} className="h-auto flex-col gap-1 py-3">
                <Droplet className="h-5 w-5 text-teal-400" />
                <span className="text-sm">Kidney Scan</span>
                <span className="text-[10px] font-normal text-slate-500">eGFR · creatinine · BP context</span>
              </Button>
              <Button variant="outline" onClick={() => void runScan("health_scan")} className="h-auto flex-col gap-1 py-3">
                <ScanLine className="h-5 w-5 text-sky-400" />
                <span className="text-sm">Health Scan</span>
                <span className="text-[10px] font-normal text-slate-500">whole-health report</span>
              </Button>
            </CardContent>
          </Card>
          {reports.length === 0 ? (
            <Card className="border-slate-800 bg-slate-900/30">
              <CardContent className="p-6 text-center text-sm text-slate-500">
                <FileText className="mx-auto mb-2 h-6 w-6 text-slate-600" />
                No reports generated yet — run a scan above.
              </CardContent>
            </Card>
          ) : reports.map((r) => (
            <ReportCard key={r.id} r={r} />
          ))}
        </TabsContent>
      </Tabs>

      <div className="p-3 rounded-md border border-crimson/40 bg-crimson/10 text-crimson-100 text-xs flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 text-crimson shrink-0" />
        <div className="flex-1">
          For informational wellness use only — not medical advice. Scans and statistics are computed from your own
          recorded measurements; clinically-validated labels only come from approved device or clinician sources, and
          nothing on this page diagnoses a condition.
        </div>
      </div>
    </div>
  );
}
