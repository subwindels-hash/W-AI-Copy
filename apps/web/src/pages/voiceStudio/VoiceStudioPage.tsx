/**
 * Session 162 — Voice Studio console (/app/voice-studio).
 *
 * Tabs: Voices · Clone · Presets · Jobs
 *
 * Honesty:
 *   - every list is scoped to the caller's organization. Before S162 cloned
 *     voices, presets and TTS history were global across all tenants.
 *   - avgSynthLatencyMs renders "—" until a real synthesis is measured; it
 *     used to fall back to a hardcoded 180 ms.
 *   - `languages` is a real distinct count, not `19 + n`.
 *   - cloning records consent and trains no model, so no epoch count is shown.
 *   - a `demo` job status means no provider was configured and no audio exists.
 */
import { useCallback, useEffect, useState } from "react";
import { Mic, Users, Sliders, ListMusic, Plus, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import {
  vsApi, VS_EMOTIONS,
  type BuiltInVoice, type CustomVoice, type VoicePreset,
  type TtsJob, type VoiceStudioDashboard,
} from "@/lib/voiceStudio";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

/** An unmeasured figure renders as an em dash, never as a plausible number. */
function fmt(n: number | null | undefined, suffix = "") {
  if (n == null) return "—";
  return `${n}${suffix}`;
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
        {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function VoiceStudioPage() {
  const [dash, setDash] = useState<VoiceStudioDashboard | null>(null);
  const [builtin, setBuiltin] = useState<BuiltInVoice[]>([]);
  const [custom, setCustom] = useState<CustomVoice[]>([]);
  const [presets, setPresets] = useState<VoicePreset[]>([]);
  const [jobs, setJobs] = useState<TtsJob[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // clone form
  const [cName, setCName] = useState("");
  const [cGender, setCGender] = useState<CustomVoice["gender"]>("feminine");
  const [cAge, setCAge] = useState<CustomVoice["age"]>("adult");
  const [cLang, setCLang] = useState("en");
  const [consent, setConsent] = useState(false);

  // synth form
  const [sVoice, setSVoice] = useState("");
  const [sText, setSText] = useState("Welcome to WINDELS Voice Studio.");

  const load = useCallback(async () => {
    const [d, b, c, p, j] = await Promise.all([
      vsApi.dashboard(), vsApi.builtinVoices(), vsApi.customVoices(),
      vsApi.presets(), vsApi.jobs(),
    ]);
    setDash(d); setBuiltin(b); setCustom(c); setPresets(p); setJobs(j);
    if (!sVoice && b[0]) setSVoice(b[0].id);
  }, [sVoice]);

  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg(ok); await load(); }
    catch (e: any) { setMsg(e?.message ?? "request failed"); }
    finally { setBusy(false); }
  };

  if (!dash) {
    return <div className="p-6 flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Mic className="h-6 w-6 text-violet-400 mt-0.5" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Voice Studio</h1>
          <p className="text-xs text-slate-400">
            Voices, presets and synthesis history are scoped to your organization. Cloning requires
            a recorded consent grant — a cloned voice is biometric data.
          </p>
        </div>
      </div>

      {msg && <div className="text-xs text-slate-300 border border-white/10 rounded px-3 py-2">{msg}</div>}

      <div className="grid md:grid-cols-4 gap-3">
        <Stat label="Built-in voices" value={dash.builtInVoices} hint="catalogue" />
        <Stat label="Custom voices" value={dash.customVoices} hint="this organization" />
        <Stat label="Cloned" value={dash.clonedVoices} />
        <Stat label="Languages" value={dash.languages} hint="distinct, measured" />
        <Stat label="Presets" value={dash.presets} />
        <Stat label="TTS jobs (24h)" value={dash.ttsJobs24h} hint={`${dash.ttsJobsTotal} lifetime`} />
        <Stat label="Avg latency" value={fmt(dash.avgSynthLatencyMs, "ms")} hint={dash.avgSynthLatencyMs == null ? "nothing measured yet" : undefined} />
        <Stat label="Consent violations" value={dash.consentViolations} />
      </div>

      <Tabs defaultValue="voices">
        <TabsList>
          <TabsTrigger value="voices"><Users className="h-3.5 w-3.5 mr-1" />Voices</TabsTrigger>
          <TabsTrigger value="clone"><ShieldCheck className="h-3.5 w-3.5 mr-1" />Clone</TabsTrigger>
          <TabsTrigger value="presets"><Sliders className="h-3.5 w-3.5 mr-1" />Presets</TabsTrigger>
          <TabsTrigger value="jobs"><ListMusic className="h-3.5 w-3.5 mr-1" />Jobs</TabsTrigger>
        </TabsList>

        {/* ------------------------------- Voices ----------------------------- */}
        <TabsContent value="voices">
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Your custom voices</CardTitle>
                <CardDescription className="text-xs">
                  Scoped to this organization. Each carries its consent record.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                {!custom.length && <div className="text-slate-500">No custom voices in this organization.</div>}
                {custom.map((v) => (
                  <div key={v.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
                    <span className="flex-1 font-medium">{v.name}</span>
                    <Badge>{v.language}</Badge>
                    <Badge>{v.consent}</Badge>
                    {v.migratedFrom === "global" && <Badge>migrated</Badge>}
                    <Badge>{v.visibility}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Built-in catalogue</CardTitle>
                <CardDescription className="text-xs">Static configuration, shared by all tenants.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-xs max-h-96 overflow-auto">
                {builtin.map((v) => (
                  <div key={v.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
                    <span className="flex-1">{v.name}</span>
                    <Badge>{v.language}{v.region ? `-${v.region}` : ""}</Badge>
                    <Badge>{v.gender}</Badge>
                    {v.premium && <Badge>premium</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* -------------------------------- Clone ----------------------------- */}
        <TabsContent value="clone">
          <div className="grid md:grid-cols-3 gap-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">Clone a voice</CardTitle>
                <CardDescription className="text-xs">
                  Consent is enforced server-side before anything is registered. Rejected attempts
                  are counted against this organization.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Input placeholder="voice name" value={cName} onChange={(e) => setCName(e.target.value)} />
                <div className="grid grid-cols-3 gap-2">
                  <Select value={cGender} onChange={(e) => setCGender(e.target.value as any)}>
                    {["feminine", "masculine", "neutral", "child-boy", "child-girl", "teen"].map((g) => <option key={g} value={g}>{g}</option>)}
                  </Select>
                  <Select value={cAge} onChange={(e) => setCAge(e.target.value as any)}>
                    {["child", "teen", "young-adult", "adult", "senior"].map((a) => <option key={a} value={a}>{a}</option>)}
                  </Select>
                  <Input placeholder="language" value={cLang} onChange={(e) => setCLang(e.target.value)} />
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  The voice owner has granted consent for this clone
                </label>
                <Button size="sm" disabled={busy || !cName}
                  onClick={() => run(() => vsApi.cloneVoice({
                    name: cName, gender: cGender, age: cAge, language: cLang, consentGranted: consent,
                  }), "voice registered")}>
                  <Plus className="h-3 w-3 mr-1" />Clone
                </Button>
                <p className="text-[10px] text-slate-500">
                  This registers a voice and its consent record. No model is trained by this
                  process, so no training progress is reported.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Synthesize</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Select value={sVoice} onChange={(e) => setSVoice(e.target.value)}>
                  {[...custom, ...builtin].map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
                <Input placeholder="text" value={sText} onChange={(e) => setSText(e.target.value)} />
                <Button size="sm" disabled={busy || !sText || !sVoice}
                  onClick={() => run(() => vsApi.synthesize({ voiceId: sVoice, text: sText }), "job submitted")}>
                  Synthesize
                </Button>
                <p className="text-[10px] text-slate-500">
                  Requires OPENAI_API_KEY, ELEVENLABS_API_KEY, PLAYHT_API_KEY, or a local
                  espeak-ng binary. Without one the job is returned as <code>failed</code> with
                  VOICE_MODEL_NOT_CONFIGURED and no audio file is written.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ------------------------------- Presets ---------------------------- */}
        <TabsContent value="presets">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Presets</CardTitle>
              <CardDescription className="text-xs">
                Scoped to this organization. {VS_EMOTIONS.length} emotions available.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              {!presets.length && <div className="text-slate-500">No presets in this organization.</div>}
              {presets.map((p) => (
                <div key={p.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
                  <span className="flex-1 font-medium">{p.name}</span>
                  {p.description && <span className="text-slate-500">{p.description}</span>}
                  {p.migratedFrom === "global" && <Badge>migrated</Badge>}
                  <Badge>{p.voiceId}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --------------------------------- Jobs ----------------------------- */}
        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Synthesis history</CardTitle>
              <CardDescription className="text-xs">{dash.provenance.jobs}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              {!jobs.length && <div className="text-slate-500">No synthesis jobs in this organization.</div>}
              {jobs.map((j) => (
                <div key={j.id} className="p-2 border border-white/5 rounded flex items-center gap-2">
                  {j.status === "failed" && <AlertTriangle className="h-3 w-3 text-rose-400" />}
                  <span className="flex-1">{j.voiceId}</span>
                  <Badge>{j.status}</Badge>
                  <span className="text-slate-500">{fmt(j.durationMs, "ms")}</span>
                  <span className="text-slate-500">{new Date(j.requestedAt).toLocaleString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
