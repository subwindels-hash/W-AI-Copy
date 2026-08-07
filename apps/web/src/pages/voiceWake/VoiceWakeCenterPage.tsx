/**
 * WINDELS AI OS — Voice & Wake Center.
 *
 * Enterprise voice activation management: wake phrases, voice profiles,
 * continuous conversation mode, privacy controls, activation testing.
 * WINDELS is an AI Operating System — voice is a core platform capability.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import {
  Mic, MicOff, Volume2, Plus, X, RefreshCw, Shield, Settings, Radio,
  CheckCircle2, AlertTriangle, Loader2, Activity, Zap, Clock, Trash2,
} from "lucide-react";

interface VoiceConfig {
  id: string; enabled: boolean; primaryWakePhrase: string;
  wakePhrases: string[]; customWakePhrases: string[];
  deactivationPhrases: string[]; responseStyle: string;
  activationResponse: string; continuousConversation: boolean;
  continuousTimeoutSec: number; maxConversationDurationSec: number;
  minConfidence: number; localProcessingOnly: boolean;
  microphoneDisabled: boolean; requireVisualIndicator: boolean;
  voiceDataRetentionDays: number; auditVoiceActivations: boolean;
  requireConfirmationForHighRisk: boolean;
}

interface VoiceCenterDashboard {
  voiceActivationEnabled: boolean; primaryWakePhrase: string;
  totalWakePhrases: number; customWakePhrases: number;
  continuousConversationEnabled: boolean; voiceProfiles: number;
  activeSessions: number; activationsToday: number; activationsThisWeek: number;
  avgConfidence: number; falsePositiveRate: number;
  microphoneStatus: string; localProcessingOnly: boolean;
  recentActivations: Array<{ wakePhrase: string; confidence: number; outcome: string; timestamp: string; commandText?: string }>;
}

interface BuiltinPhrases { wakePhrases: string[]; activationResponses: string[]; deactivationPhrases: string[]; }

const ACTIVATION_RESPONSES = ["I'm listening.", "Yes?", "How can I help?", "Ready.", "Go ahead.", "At your service.", "Listening."];

const BUILTIN_PHRASES = [
  "Hey Windels", "Hello Windels", "Hi Windels", "Okay Windels", "Alright Windels",
  "Wake up Windels", "Windels", "Windels, are you there?", "Windels, listen",
  "Windels, I need you", "Windels, help me", "Windels, get ready",
  "Windels, let's go", "Windels, start", "Windels, activate", "Windels, come online",
];

type Tab = "phrases" | "responses" | "conversation" | "privacy" | "profiles" | "test";

export function VoiceWakeCenterPage() {
  const [tab, setTab] = useState<Tab>("phrases");
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [dash, setDash] = useState<VoiceCenterDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newPhrase, setNewPhrase] = useState("");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [detectionResult, setDetectionResult] = useState<{ detected: boolean; phrase?: string; confidence?: number; commandAfterWake?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [cfg, d] = await Promise.all([
        api.get<VoiceConfig>("/wake-intel/voice/config"),
        api.get<VoiceCenterDashboard>("/wake-intel/voice/dashboard"),
      ]);
      setConfig(cfg); setDash(d);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveConfig = useCallback(async (patch: Partial<VoiceConfig>) => {
    setSaving(true); setErr(null); setNotice(null);
    try {
      const updated = await api.patch<VoiceConfig>("/wake-intel/voice/config", patch);
      setConfig(updated);
      setNotice("Settings saved.");
      void load();
    } catch (e: any) { setErr(e?.message ?? "Failed to save"); }
    finally { setSaving(false); }
  }, [load]);

  const addPhrase = useCallback(async () => {
    if (!newPhrase.trim()) return;
    try {
      const updated = await api.post<VoiceConfig>("/wake-intel/voice/phrases", { phrase: newPhrase.trim() });
      setConfig(updated); setNewPhrase(""); setNotice(`Added "${newPhrase.trim()}"`);
    } catch (e: any) { setErr(e?.message ?? "Failed to add phrase"); }
  }, [newPhrase]);

  const removePhrase = useCallback(async (phrase: string) => {
    try {
      const updated = await api<VoiceConfig>("/wake-intel/voice/phrases", { method: "DELETE", json: { phrase } });
      setConfig(updated);
      setNotice(`Removed "${phrase}"`);
    } catch (e: any) { setErr(e?.message ?? "Failed to remove phrase"); }
  }, []);

  const testWakeDetection = useCallback(async () => {
    if (!transcript.trim()) return;
    try {
      const result = await api.post<{ detected: boolean; phrase?: string; confidence?: number; commandAfterWake?: string }>("/wake-intel/voice/detect", { transcript });
      setDetectionResult(result);
    } catch (e: any) { setErr(e?.message ?? "Detection failed"); }
  }, [transcript]);

  // Browser Speech Recognition for live testing
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setErr("Speech Recognition not supported in this browser. Try Chrome or Edge."); return; }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      const result = event.results[0][0].transcript;
      setTranscript(result);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
    setListening(true);
    setTranscript(""); setDetectionResult(null);
  }, []);

  const customPhrases = useMemo(() => config?.customWakePhrases ?? [], [config]);
  const allPhrases = useMemo(() => config?.wakePhrases ?? [], [config]);
  const builtinPhrases = useMemo(() => allPhrases.filter((p) => !customPhrases.includes(p)), [allPhrases, customPhrases]);

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "phrases", label: "Wake Phrases", icon: Radio },
    { id: "responses", label: "Responses", icon: Volume2 },
    { id: "conversation", label: "Conversation", icon: Activity },
    { id: "privacy", label: "Privacy", icon: Shield },
    { id: "profiles", label: "Voice Profiles", icon: Mic },
    { id: "test", label: "Test", icon: Zap },
  ];

  if (loading) {
    return <div className="p-6 space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-slate-800 rounded animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Mic className="h-6 w-6 text-violet-400" />
            Voice & Wake Center
          </h1>
          <p className="text-sm text-slate-400">Multi-wake-word voice activation, conversation mode, and privacy controls for WINDELS AI OS.</p>
        </div>
        <Button variant="ghost" onClick={load}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
      </div>

      {err && <div className="p-3 rounded-lg bg-rose-500/15 text-rose-300 text-sm">{err}</div>}
      {notice && <div className="p-3 rounded-lg bg-emerald-500/15 text-emerald-300 text-sm">{notice}</div>}

      {/* Dashboard KPIs */}
      {dash && (
        <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
          <Card><CardContent className="p-3">
            <p className="text-xs text-slate-400">Status</p>
            <p className={`text-lg font-semibold ${dash.voiceActivationEnabled ? "text-emerald-300" : "text-slate-400"}`}>{dash.voiceActivationEnabled ? "Active" : "Off"}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-xs text-slate-400">Wake Phrases</p>
            <p className="text-lg font-semibold">{dash.totalWakePhrases} <span className="text-xs text-slate-500">({dash.customWakePhrases} custom)</span></p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-xs text-slate-400">Primary</p>
            <p className="text-sm font-semibold text-violet-300">"{dash.primaryWakePhrase}"</p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-xs text-slate-400">Today</p>
            <p className="text-lg font-semibold">{dash.activationsToday} <span className="text-xs text-slate-500">activations</span></p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-xs text-slate-400">Avg Confidence</p>
            <p className="text-lg font-semibold">{(dash.avgConfidence * 100).toFixed(0)}%</p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-xs text-slate-400">Mic</p>
            <p className={`text-sm font-semibold flex items-center gap-1 ${dash.microphoneStatus === "enabled" ? "text-emerald-300" : "text-rose-300"}`}>
              {dash.microphoneStatus === "enabled" ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}{dash.microphoneStatus}
            </p>
          </CardContent></Card>
        </div>
      )}

      {/* Master enable toggle */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="font-medium">Voice Activation</p>
            <p className="text-xs text-slate-400">Enable or disable wake-word detection across all devices.</p>
          </div>
          <Switch checked={config?.enabled ?? false} onChange={(v: boolean) => saveConfig({ enabled: v })} />
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-px overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === t.id ? "bg-slate-800 text-slate-100 border-b-2 border-violet-400" : "text-slate-400 hover:text-slate-200"}`}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* ── PHRASES TAB ──────────────────────────────────────────────── */}
      {tab === "phrases" && config && (
        <div className="space-y-6">
          {/* Built-in phrases */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Radio className="h-4 w-4 text-emerald-400" />Built-in Wake Phrases</CardTitle>
              <CardDescription>These phrases ship with WINDELS AI OS. "Windels" remains the primary brand identity.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {builtinPhrases.map((p) => (
                  <Badge key={p} className={`py-1 px-2 ${p === config.primaryWakePhrase ? "bg-violet-500/25 text-violet-200 border-violet-500/40" : "bg-slate-700/50 text-slate-300"}`}>
                    {p === config.primaryWakePhrase && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {p}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Custom phrases */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" />Custom Wake Phrases</CardTitle>
              <CardDescription>Add your own activation phrases. Organization-specific phrases supported.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Input placeholder="e.g. Hey Assistant, My Windels, Windels AI..." value={newPhrase} onChange={(e: any) => setNewPhrase(e.target.value)} onKeyDown={(e: any) => e.key === "Enter" && addPhrase()} className="flex-1" />
                <Button onClick={addPhrase} disabled={!newPhrase.trim() || saving}><Plus className="h-4 w-4 mr-1" />Add</Button>
              </div>
              {customPhrases.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customPhrases.map((p) => (
                    <Badge key={p} className="py-1 px-2 bg-amber-500/15 text-amber-300 border-amber-500/30">
                      {p}
                      <button onClick={() => removePhrase(p)} className="ml-1.5 hover:text-rose-300"><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
              {customPhrases.length === 0 && <p className="text-sm text-slate-500">No custom phrases yet. Add one above.</p>}
            </CardContent>
          </Card>

          {/* Primary phrase selector */}
          <Card>
            <CardHeader>
              <CardTitle>Primary Wake Phrase</CardTitle>
              <CardDescription>Displayed in UI and used for confidence boosting during detection.</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={config.primaryWakePhrase} onChange={(e) => saveConfig({ primaryWakePhrase: e.target.value })}>
                {allPhrases.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── RESPONSES TAB ────────────────────────────────────────────── */}
      {tab === "responses" && config && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Volume2 className="h-4 w-4" />Activation Response</CardTitle>
              <CardDescription>What WINDELS says/shows when woken up.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider">Response Style</label>
                <Select value={config.responseStyle} onChange={(e) => saveConfig({ responseStyle: e.target.value as any })}>
                  <option value="voice">Voice (speak a phrase)</option>
                  <option value="tone">Tone (short activation sound)</option>
                  <option value="visual">Visual (animation/indicator only)</option>
                  <option value="silent">Silent (no feedback)</option>
                </Select>
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider">Activation Phrase</label>
                <Select value={config.activationResponse} onChange={(e) => saveConfig({ activationResponse: e.target.value })}>
                  {ACTIVATION_RESPONSES.map((r) => <option key={r} value={r}>"{r}"</option>)}
                </Select>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <p className="text-xs text-slate-400 mb-1">Preview</p>
                <p className="text-sm text-violet-300">
                  User: <span className="text-slate-200">"{config.primaryWakePhrase}"</span><br />
                  WINDELS: <span className="text-emerald-300">"{config.activationResponse}"</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── CONVERSATION TAB ─────────────────────────────────────────── */}
      {tab === "conversation" && config && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" />Continuous Conversation</CardTitle>
              <CardDescription>After activation, WINDELS stays active for follow-up commands without requiring another wake phrase.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">Enable Continuous Mode</p><p className="text-xs text-slate-400">Stay active for follow-up commands.</p></div>
                <Switch checked={config.continuousConversation} onChange={(v: boolean) => saveConfig({ continuousConversation: v })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider">Idle Timeout (seconds)</label>
                <Input type="number" min={5} max={120} value={String(config.continuousTimeoutSec)} onChange={(e: any) => saveConfig({ continuousTimeoutSec: Number(e.target.value) })} />
                <p className="text-xs text-slate-500 mt-1">After this many seconds of silence, WINDELS goes back to passive listening.</p>
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider">Max Conversation Duration (seconds)</label>
                <Input type="number" min={30} max={600} value={String(config.maxConversationDurationSec)} onChange={(e: any) => saveConfig({ maxConversationDurationSec: Number(e.target.value) })} />
                <p className="text-xs text-slate-500 mt-1">Auto-sleep after this duration regardless of activity.</p>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <p className="text-xs text-slate-400 mb-2">Deactivation Phrases</p>
                <div className="flex flex-wrap gap-1">
                  {config.deactivationPhrases.map((p) => <Badge key={p} className="bg-slate-600/50 text-slate-300 text-xs">{p}</Badge>)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── PRIVACY TAB ──────────────────────────────────────────────── */}
      {tab === "privacy" && config && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="h-4 w-4 text-emerald-400" />Privacy Controls</CardTitle>
              <CardDescription>WINDELS processes wake-word detection locally by default. Cloud processing activates only after wake detection.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">Local Processing Only</p><p className="text-xs text-slate-400">Wake detection happens on-device. No audio sent to cloud until after activation.</p></div>
                <Switch checked={config.localProcessingOnly} onChange={(v: boolean) => saveConfig({ localProcessingOnly: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">Microphone Disabled</p><p className="text-xs text-slate-400">Completely disable microphone access. Voice activation will not work.</p></div>
                <Switch checked={config.microphoneDisabled} onChange={(v: boolean) => saveConfig({ microphoneDisabled: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">Require Visual Indicator</p><p className="text-xs text-slate-400">Always show a visual indicator when WINDELS is actively listening.</p></div>
                <Switch checked={config.requireVisualIndicator} onChange={(v: boolean) => saveConfig({ requireVisualIndicator: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">Audit Voice Activations</p><p className="text-xs text-slate-400">Log all voice activations for security and compliance.</p></div>
                <Switch checked={config.auditVoiceActivations} onChange={(v: boolean) => saveConfig({ auditVoiceActivations: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">Require Confirmation for High-Risk Commands</p><p className="text-xs text-slate-400">Sensitive operations (payments, deletions) require explicit voice or button confirmation.</p></div>
                <Switch checked={config.requireConfirmationForHighRisk} onChange={(v: boolean) => saveConfig({ requireConfirmationForHighRisk: v })} />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider">Voice Data Retention (days)</label>
                <Input type="number" min={0} max={365} value={String(config.voiceDataRetentionDays)} onChange={(e: any) => saveConfig({ voiceDataRetentionDays: Number(e.target.value) })} />
                <p className="text-xs text-slate-500 mt-1">0 = delete immediately after processing. Higher values retain logs for auditing.</p>
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider">Minimum Wake Confidence</label>
                <Input type="number" min={0.1} max={1.0} step={0.05} value={String(config.minConfidence)} onChange={(e: any) => saveConfig({ minConfidence: Number(e.target.value) })} />
                <p className="text-xs text-slate-500 mt-1">Higher values reduce false activations but may miss quieter speech.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── VOICE PROFILES TAB ───────────────────────────────────────── */}
      {tab === "profiles" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Mic className="h-4 w-4" />Voice Profiles</CardTitle>
            <CardDescription>Associate voice patterns with authorized users. Voice is never the sole authentication factor for sensitive operations.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-4">
              <p className="text-sm text-amber-300 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Voice recognition supplements but never replaces authentication for sensitive operations.</p>
            </div>
            <div className="p-6 text-center text-slate-400">
              <Mic className="h-8 w-8 mx-auto mb-2 text-slate-600" />
              <p>Voice enrollment requires the desktop or mobile application with microphone access.</p>
              <p className="text-xs mt-1">Voice profiles enable speaker-identified activation and personalized responses.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── TEST TAB ─────────────────────────────────────────────────── */}
      {tab === "test" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Zap className="h-4 w-4" />Test Wake Detection</CardTitle>
              <CardDescription>Speak a wake phrase or type one to test detection against your configured phrases.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Button onClick={startListening} disabled={listening} variant={listening ? "danger" : "secondary"}>
                  {listening ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Listening...</> : <><Mic className="h-4 w-4 mr-2" />Speak</>}
                </Button>
                <Input placeholder="Or type a phrase: 'Hey Windels, show me revenue'" value={transcript} onChange={(e: any) => setTranscript(e.target.value)} className="flex-1" />
                <Button onClick={testWakeDetection} disabled={!transcript.trim()}>Test</Button>
              </div>

              {listening && (
                <div className="p-4 bg-violet-500/15 border border-violet-500/30 rounded-lg text-center">
                  <Radio className="h-6 w-6 mx-auto text-violet-400 animate-pulse mb-2" />
                  <p className="text-sm text-violet-300">Listening for wake phrase...</p>
                </div>
              )}

              {detectionResult && (
                <div className={`p-4 rounded-lg border ${detectionResult.detected ? "bg-emerald-500/15 border-emerald-500/30" : "bg-rose-500/15 border-rose-500/30"}`}>
                  <p className="font-medium flex items-center gap-2">
                    {detectionResult.detected ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <X className="h-4 w-4 text-rose-400" />}
                    {detectionResult.detected ? "Wake phrase detected!" : "No wake phrase detected"}
                  </p>
                  {detectionResult.detected && (
                    <div className="mt-2 text-sm text-slate-300">
                      <p>Matched: <span className="text-emerald-300">"{detectionResult.phrase}"</span></p>
                      <p>Confidence: <span className="text-slate-200">{((detectionResult.confidence ?? 0) * 100).toFixed(0)}%</span></p>
                      {detectionResult.commandAfterWake && <p>Command: <span className="text-violet-300">"{detectionResult.commandAfterWake}"</span></p>}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent activations */}
          {dash && dash.recentActivations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" />Recent Activations</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-white/5">
                  {dash.recentActivations.map((a, i) => (
                    <div key={i} className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">"{a.wakePhrase}"</p>
                        {a.commandText && <p className="text-xs text-slate-400">→ {a.commandText}</p>}
                      </div>
                      <div className="text-right">
                        <Badge className={a.outcome === "accepted" ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-400"}>{a.outcome}</Badge>
                        <p className="text-xs text-slate-500 mt-1">{(a.confidence * 100).toFixed(0)}% · {new Date(a.timestamp).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
