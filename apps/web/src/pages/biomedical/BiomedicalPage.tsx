/**
 * Session 65 / Session 174 — Biomedical & Healthcare Intelligence Console (/app/biomedical)
 *
 * Registry-only honesty:
 * - Dashboard is a pure read; empty org shows 0 counts and `avgTurnaroundMin: null` as "— not measured".
 * - No synthetic findings are ever displayed — studies enter queued with no aiFindings.
 * - Compliance controls show "gap" until attested.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  FlaskConical,
  HeartPulse,
  ShieldCheck,
  Timer,
  FileSearch,
  AlertTriangle,
  Video,
  Plus,
  CheckCircle2,
  AlertCircle,
  Stethoscope,
} from "lucide-react";
import { bioApi, type BiomedicalDashboard, type ImagingStudy } from "@/lib/biomedical";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function metric(v: number | null | undefined, fmt: (n: number) => string = String) {
  return v === null || v === undefined ? <span className="text-slate-500">—</span> : fmt(v);
}

export function BiomedicalPage() {
  const [dash, setDash] = useState<BiomedicalDashboard | null>(null);
  const [studies, setStudies] = useState<ImagingStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [modality, setModality] = useState<ImagingStudy["modality"]>("xray");
  const [bodyPart, setBodyPart] = useState("chest");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [d, s] = await Promise.all([bioApi.dashboard(), bioApi.listStudies(50)]);
      setDash(d);
      setStudies(s);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed to load biomedical dashboard", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bodyPart.trim()) { setMsg({ text: "Body part is required", type: "error" }); return; }
    try {
      await bioApi.submitStudy({ modality, bodyPart: bodyPart.trim() });
      setMsg({ text: `Queued ${modality} study for ${bodyPart.trim()}`, type: "success" });
      setBodyPart("chest");
      await load();
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : "Failed to queue study", type: "error" }); }
  };

  const avg = dash?.imaging.avgTurnaroundMin;
  const provenance = dash?.provenance;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-100">Biomedical & Healthcare</h1>
            <Badge variant="outline" className="text-xs">Registry-only</Badge>
            <Badge variant="outline" className="text-xs border-amber-800 text-amber-300">No AI diagnosis</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Imaging intake and tracking registry — records studies and routes them for human reading. No automated interpretation is performed.
            Findings are attached only by a configured inference provider or a radiologist.
          </p>
        </div>
        {provenance && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>{provenance.note}</span>
          </div>
        )}
      </div>

      {msg && (
        <div className={`flex items-center justify-between rounded-lg p-3 text-sm ${msg.type === "success" ? "border border-emerald-900/50 bg-emerald-950/40 text-emerald-300" : "border border-rose-900/50 bg-rose-950/40 text-rose-300"}`}>
          <div className="flex items-center gap-2">
            {msg.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{msg.text}</span>
          </div>
          <button onClick={() => setMsg(null)} className="text-xs opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs text-slate-400">
              <span>Studies (24h)</span><FileSearch className="h-4 w-4 text-sky-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold text-slate-100">{loading ? "…" : dash?.imaging.studies24h ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">{dash ? `${dash.recentStudies.length} recent • ${dash.imaging.pendingReview} pending review` : "—"}</CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs text-slate-400">
              <span>AI-assisted (24h)</span><Activity className="h-4 w-4 text-indigo-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold text-slate-100">{loading ? "…" : dash?.imaging.aiAssisted ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">Studies with recorded findings</CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs text-slate-400">
              <span>Avg turnaround</span><Timer className="h-4 w-4 text-amber-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold text-slate-100">
              {loading ? "…" : metric(avg, (v) => `${v} min`)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {avg === null ? "Not measured — no completed study" : provenance?.avgTurnaroundMin === "measured" ? "Measured over completed studies" : "—"}
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs text-slate-400">
              <span>Alerts (24h) · Telemetry</span><AlertTriangle className="h-4 w-4 text-rose-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold text-slate-100">{loading ? "…" : `${dash?.alerts24h ?? 0} · ${dash?.telemetryActive ?? 0}`}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">Pharmacy critical + active telemed sessions</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="imaging" className="w-full">
        <TabsList className="border-b border-slate-800 bg-transparent">
          <TabsTrigger value="imaging" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">Imaging Registry ({studies.length})</TabsTrigger>
          <TabsTrigger value="dashboard" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">Dashboard</TabsTrigger>
          <TabsTrigger value="pharmacy" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">Pharmacy Alerts</TabsTrigger>
          <TabsTrigger value="telemed" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">Telemedicine</TabsTrigger>
          <TabsTrigger value="ops" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">Hospital Ops</TabsTrigger>
          <TabsTrigger value="compliance" className="data-[state=active]:border-b-2 data-[state=active]:border-sky-500">Compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="imaging" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-slate-100"><Stethoscope className="h-5 w-5" /> Queue a study</CardTitle>
              <CardDescription className="text-xs text-slate-400">Study enters `queued` with no findings. Findings are recorded only by a clinician or real model.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-wrap gap-3">
                <Select value={modality} onChange={(e) => setModality(e.target.value as any)} className="w-40">
                  <option value="xray">X-Ray</option>
                  <option value="ct">CT</option>
                  <option value="mri">MRI</option>
                  <option value="ultrasound">Ultrasound</option>
                  <option value="pet">PET</option>
                  <option value="mammo">Mammo</option>
                  <option value="pathology">Pathology</option>
                </Select>
                <Input value={bodyPart} onChange={(e) => setBodyPart(e.target.value)} placeholder="Body part (e.g. chest)" className="w-56" />
                <Button type="submit"><Plus className="mr-1 h-4 w-4" /> Queue study</Button>
              </form>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader>
              <CardTitle className="text-lg text-slate-100">Recent studies</CardTitle>
              <CardDescription className="text-xs text-slate-400">Most recent 50 — newest first. Pseudonymous `pt-*` hashes, no PHI.</CardDescription>
            </CardHeader>
            <CardContent>
              {studies.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-slate-500">
                  <FlaskConical className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  <p className="text-sm">No studies queued yet.</p>
                  <p className="text-xs text-slate-600">Queue your first study above — it will appear as `queued` with no findings.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                      <tr><th className="pb-2">ID</th><th className="pb-2">Modality</th><th className="pb-2">Body part</th><th className="pb-2">Status</th><th className="pb-2">Findings</th><th className="pb-2">Created</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {studies.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-800/30">
                          <td className="py-2 font-mono text-xs">{s.id} <span className="text-slate-500">· {s.patientHash}</span></td>
                          <td className="py-2 capitalize">{s.modality}</td>
                          <td className="py-2">{s.bodyPart}</td>
                          <td className="py-2"><Badge variant="outline" className="text-xs capitalize">{s.status}</Badge></td>
                          <td className="py-2">{s.aiFindings.length === 0 ? <span className="text-slate-500">— queued</span> : `${s.aiFindings.length} finding(s)`}</td>
                          <td className="py-2 text-xs text-slate-400">{new Date(s.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-4 pt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-slate-800 bg-slate-900/30">
              <CardHeader><CardTitle className="text-slate-100">Care areas</CardTitle><CardDescription className="text-xs text-slate-400">Enabled areas and reviewed/escalated counts (24h)</CardDescription></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dash ? Object.entries(dash.areas).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                      <span className="text-sm capitalize text-slate-200">{k.replace(/_/g," ")}</span>
                      <span className="text-xs text-slate-400">{v.reviewed24h} reviewed · {v.escalations24h} escalated · models {v.models}</span>
                    </div>
                  )) : <span className="text-sm text-slate-500">Loading…</span>}
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-800 bg-slate-900/30">
              <CardHeader><CardTitle className="text-slate-100">Ops metrics</CardTitle><CardDescription className="text-xs text-slate-400">From real hospital feed — empty until `POST /biomedical/ops-metrics`</CardDescription></CardHeader>
              <CardContent>
                {dash?.ops.length ? (
                  <div className="space-y-2">
                    {dash.ops.map((m) => (
                      <div key={m.label} className="flex justify-between rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                        <span className="text-sm text-slate-200">{m.label}</span>
                        <span className="text-xs text-slate-400">{m.value} {m.unit} / target {m.target} <Badge className="ml-2" variant={m.status==="ok"?"default": m.status==="warn"?"outline":"danger"}>{m.status}</Badge></span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-500">No ops metrics recorded. Push a feed to see values.</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pharmacy" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><HeartPulse className="h-5 w-5" /> Pharmacy alerts</CardTitle><CardDescription className="text-xs text-slate-400">Most recent 20 — admin-recorded via integrations or staff.</CardDescription></CardHeader>
            <CardContent>
              {dash?.pharmacyAlerts.length ? (
                <div className="space-y-2">
                  {dash.pharmacyAlerts.map((a) => (
                    <div key={a.id} className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                      <div className="flex justify-between"><span className="text-sm font-medium capitalize text-slate-200">{a.kind} · {a.severity}</span><span className="text-xs text-slate-500">{new Date(a.at).toLocaleString()}</span></div>
                      <p className="mt-1 text-sm text-slate-300">{a.message}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">No pharmacy alerts.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="telemed" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><Video className="h-5 w-5" /> Telemedicine</CardTitle><CardDescription className="text-xs text-slate-400">Active sessions: {dash?.telemetryActive ?? 0}</CardDescription></CardHeader>
            <CardContent><p className="text-sm text-slate-500">Create sessions via API: `POST /biomedical/telemedicine/sessions`.</p></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ops" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="text-slate-100">Recent studies (raw)</CardTitle></CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-300">{JSON.stringify(dash?.recentStudies, null, 2)}</pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-4 pt-4">
          <Card className="border-slate-800 bg-slate-900/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-slate-100"><ShieldCheck className="h-5 w-5" /> Compliance posture</CardTitle><CardDescription className="text-xs text-slate-400">Attested controls only. Unassessed → `gap`, never `compliant`.</CardDescription></CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {dash ? Object.entries(dash.complianceStatus).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
                    <span className="text-sm text-slate-200">{k}</span>
                    <Badge variant={v==="gap"?"outline": v==="compliant"?"default":"danger"} className="capitalize">{v}</Badge>
                  </div>
                )) : <span className="text-sm text-slate-500">Loading…</span>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
