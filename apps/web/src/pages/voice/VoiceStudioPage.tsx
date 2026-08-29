/**
 * Voice Studio Page — WINDELS AI OS
 *
 * Zero-config browser SpeechSynthesis plays all built-in voices without any API key.
 * Server-side voices (ElevenLabs, Play.ht) require credentials; if absent we show a
 * clear "VOICE MODEL NOT CONFIGURED" banner instead of pretending audio was generated.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { DataBanner } from "@/components/ui/DataBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { Mic, Play, Square, Volume2, Loader2, RefreshCw, Globe2, ShieldCheck } from "lucide-react";

interface VModel { id: string; name: string; gender: "male"|"female"|"neutral"; language: string; dialect?: string; provider: string; isRegional?: boolean; isNigerian?: boolean; emotions?: string[]; }
interface TtsJobResp { id: string; voiceId: string; status: "ready"|"queued"|"synthesizing"|"failed"|"demo"; audioUrl?: string; durationMs?: number; error?: string; provider?: string; clientSide?: boolean; language: string; }
interface RegistryResp {
  voices: VModel[];
  configuredProviders?: { elevenlabs: boolean; playht: boolean; espeak: boolean; openai?: boolean };
  providers?: { elevenlabs: boolean; playht: boolean; espeak: boolean; openai?: boolean };
}

const SAMPLE_TEXTS = [
  "Good afternoon. Markets are showing mixed signals today as traders weigh inflation data against earnings reports.",
  "Welcome to Windels AI. I can read market analysis in multiple languages and voices.",
  "Ndewo o! Ana m asụsụ Igbo, Yoruba, Hausa, na Naijiria Pidgin.",
];

export function VoiceStudioPage() {
  const [registry, setRegistry] = useState<RegistryResp | null>(null);
  const [regErr, setRegErr] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string>("en-us-female");
  const [text, setText] = useState<string>(SAMPLE_TEXTS[0]!);
  const [rate, setRate] = useState<number>(1);
  const [pitch, setPitch] = useState<number>(1);
  const [emotion, setEmotion] = useState<string>("neutral");
  const [job, setJob] = useState<TtsJobResp | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const uttRef = useRef<SpeechSynthesisUtterance | null>(null);

  const loadRegistry = useCallback(async () => {
    try {
      const r = await api.get<RegistryResp>("/voice-studio/voices/registry");
      setRegistry(r);
      setRegErr(null);
    } catch (e) {
      setRegErr(e instanceof ApiError ? e.message : String(e));
    }
  }, []);
  useEffect(() => { void loadRegistry(); }, [loadRegistry]);

  const providers = registry?.configuredProviders ?? registry?.providers;
  const anyServerConfigured = Boolean(providers?.elevenlabs || providers?.playht || providers?.espeak || providers?.openai);

  const voicesByGroup = useMemo(() => {
    if (!registry) return { nigerian: [] as VModel[], builtin: [] as VModel[], server: [] as VModel[] };
    const nigerian = registry.voices.filter(v => v.isNigerian || v.isRegional);
    const builtin = registry.voices.filter(v => !v.isNigerian && !v.isRegional && v.provider === "browser");
    const server = registry.voices.filter(v => v.provider !== "browser");
    return { nigerian, builtin, server };
  }, [registry]);

  const selectedVoice = useMemo(() => registry?.voices.find(v => v.id === voiceId) ?? null, [registry, voiceId]);

  // Browser voices may load async; enumerate them for matching
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const refresh = () => setBrowserVoices(window.speechSynthesis.getVoices());
    refresh();
    window.speechSynthesis.onvoiceschanged = refresh;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const pickBestBrowserVoice = useCallback((lang: string, gender?: string): SpeechSynthesisVoice | undefined => {
    if (!browserVoices.length) return undefined;
    // Try exact lang, then prefix, then default
    let v: SpeechSynthesisVoice | undefined = browserVoices.find(bv => bv.lang.toLowerCase() === lang.toLowerCase());
    if (!v) v = browserVoices.find(bv => bv.lang.toLowerCase().startsWith(lang.toLowerCase().slice(0,2)));
    if (!v) v = browserVoices.find(bv => bv.default) ?? browserVoices[0];
    return v;
  }, [browserVoices]);

  const stopPlayback = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    uttRef.current = null;
    setPlaying(false);
  }, []);

  const handleSpeak = useCallback(async () => {
    stopPlayback();
    setErr(null); setBusy(true); setJob(null);
    try {
      // Always request synthesize — server returns clientSide:true for browser voices.
      const j = await api.post<TtsJobResp>("/voice-studio/synthesize", {
        voiceId, text, settings: { rate, pitch }, emotion,
      });
      setJob(j);

      if (j.status === "failed") {
        setErr(j.error ?? "Synthesis failed");
        return;
      }

      if (j.clientSide || j.provider === "browser") {
        // Real SpeechSynthesis playback in the browser.
        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
          setErr("Browser SpeechSynthesis is not available in this environment.");
          return;
        }
        const u = new SpeechSynthesisUtterance(text);
        const bv = pickBestBrowserVoice(j.language, selectedVoice?.gender);
        if (bv) u.voice = bv;
        u.rate = rate; u.pitch = pitch;
        u.lang = j.language;
        u.onend = () => setPlaying(false);
        u.onerror = (e) => { setPlaying(false); setErr(String(e.error ?? "Speech error")); };
        uttRef.current = u;
        setPlaying(true);
        window.speechSynthesis.speak(u);
      } else if (j.audioUrl) {
        // Server-generated audio file.
        const token = (window as any).__WINDELS_TOKEN__ ?? null; // audio URLs are public-ish; rely on cookie/same-site
        const a = new Audio(j.audioUrl);
        a.onended = () => setPlaying(false);
        a.onerror = () => { setPlaying(false); setErr("Audio playback failed."); };
        audioRef.current = a;
        setPlaying(true);
        a.play().catch((e) => { setErr("Playback blocked: " + e.message); setPlaying(false); });
      } else if (j.status === "demo" || !anyServerConfigured) {
        setErr("VOICE MODEL NOT CONFIGURED");
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally { setBusy(false); }
  }, [voiceId, text, rate, pitch, emotion, pickBestBrowserVoice, selectedVoice, stopPlayback, anyServerConfigured]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  return (
    <div className="space-y-5 p-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2"><Mic className="h-6 w-6 text-azure"/> Voice Studio</h1>
          <p className="text-sm text-text-muted mt-1">Text-to-speech with multilingual, regional, and Nigerian voices. Browser voices work out of the box; premium server voices require API keys.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1"><Globe2 className="h-3 w-3"/>{browserVoices.length} browser voices</Badge>
          {anyServerConfigured
            ? <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 gap-1"><ShieldCheck className="h-3 w-3"/>Server TTS online</Badge>
            : <Badge variant="outline" className="text-amber-300 gap-1">Browser-only mode</Badge>}
        </div>
      </div>

      {regErr && <DataBanner variant="no-creds" title="FAILED TO LOAD VOICES" message={regErr}/>}
      {!anyServerConfigured && !regErr && (
        <DataBanner variant="no-model" message="No server TTS provider is configured. Browser SpeechSynthesis still works for built-in voices. Set OPENAI_API_KEY (optional WINDELS_SPEECH_MODEL), ELEVENLABS_API_KEY, or PLAYHT_API_KEY + PLAYHT_USER_ID — or install espeak-ng — for downloadable server audio. A missing provider never produces a fake audio file."/>
      )}
      {err?.includes("NOT CONFIGURED") && <DataBanner variant="no-model"/>}
      {err && !err.includes("NOT CONFIGURED") && (
        <DataBanner variant="no-model" title="SYNTHESIS ERROR" message={err}/>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Volume2 className="h-5 w-5 text-azure"/>Synthesize Speech</CardTitle>
            <CardDescription>Type or paste text. Browser voices are free and instant; server voices produce downloadable audio files.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea value={text} onChange={(e)=>setText(e.target.value)} rows={6}
              placeholder="Enter text to speak..." className="resize-none"/>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_TEXTS.map((s,i)=>(
                <button key={i} onClick={()=>setText(s)} className="text-[11px] px-2 py-1 rounded-md border border-white/10 text-text-muted hover:bg-white/5">Sample {i+1}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-text-muted">Voice</label>
                {!registry ? <Skeleton className="h-10 w-full rounded-lg"/> : (
                  <Select value={voiceId} onChange={(e)=>setVoiceId(e.target.value)}>
                    <optgroup label="Nigerian & Regional">
                      {voicesByGroup.nigerian.map(v => <option key={v.id} value={v.id}>{v.name} ({v.provider})</option>)}
                    </optgroup>
                    <optgroup label="Built-in (browser)">
                      {voicesByGroup.builtin.map(v => <option key={v.id} value={v.id}>{v.name} ({v.provider})</option>)}
                    </optgroup>
                    {voicesByGroup.server.length > 0 && (
                      <optgroup label="Server voices">
                        {voicesByGroup.server.map(v => <option key={v.id} value={v.id}>{v.name} ({v.provider})</option>)}
                      </optgroup>
                    )}
                  </Select>
                )}
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-text-muted">Speed ({rate.toFixed(2)}×)</label>
                <input type="range" min={0.5} max={2} step={0.05} value={rate} onChange={(e)=>setRate(Number(e.target.value))} className="w-full accent-azure"/>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-text-muted">Pitch ({pitch.toFixed(2)})</label>
                <input type="range" min={0.5} max={2} step={0.05} value={pitch} onChange={(e)=>setPitch(Number(e.target.value))} className="w-full accent-azure"/>
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-text-muted">Emotion</label>
              <Select value={emotion} onChange={(e)=>setEmotion(e.target.value)}>
                {["neutral","happy","sad","excited","calm","serious","friendly","authoritative"].map(e=><option key={e} value={e}>{e}</option>)}
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleSpeak} disabled={busy || !text.trim()} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Play className="h-4 w-4"/>} Speak
              </Button>
              {playing && <Button variant="outline" onClick={stopPlayback} className="gap-2"><Square className="h-4 w-4"/> Stop</Button>}
              <Button variant="ghost" onClick={loadRegistry} className="gap-2"><RefreshCw className="h-4 w-4"/> Refresh voices</Button>
            </div>

            {job && (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={job.clientSide?"border-azure/30 text-azure":"border-emerald-500/30 text-emerald-300"}>
                    {job.clientSide ? "🔊 Browser playback" : "💾 Server audio"}
                  </Badge>
                  <Badge variant="outline">Provider: {job.provider}</Badge>
                  <Badge variant="outline">Lang: {job.language}</Badge>
                  <Badge variant="outline">Job {job.status}</Badge>
                  {job.durationMs && <span className="text-xs text-text-muted">{Math.round(job.durationMs/1000)}s</span>}
                </div>
                {job.audioUrl && (
                  <audio controls src={job.audioUrl} className="w-full mt-2">
                    Your browser does not support audio.
                  </audio>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Voice Library</CardTitle><CardDescription>{registry?.voices.length ?? 0} voices available.</CardDescription></CardHeader>
          <CardContent>
            {!registry ? <Skeleton className="h-40"/> : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                <VoiceGroup title="Nigerian & Regional" voices={voicesByGroup.nigerian} current={voiceId} onPick={setVoiceId}/>
                <VoiceGroup title="Global Built-in" voices={voicesByGroup.builtin} current={voiceId} onPick={setVoiceId}/>
                {voicesByGroup.server.length > 0 && <VoiceGroup title="Premium Server Voices" voices={voicesByGroup.server} current={voiceId} onPick={setVoiceId}/>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Consent &amp; Safety</CardTitle></CardHeader>
        <CardContent className="text-sm text-text-bright/90 space-y-2">
          <p>• Voice cloning is gated by explicit consent and verified identity (server-side policy).</p>
          <p>• Only your own voice or voices you are legally authorized to clone may be used.</p>
          <p>• Every clone operation is audited with timestamp, user, and consent reference.</p>
          <p>• Cloned voices can be revoked at any time from the Ownership console.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function VoiceGroup({title, voices, current, onPick}:{title:string; voices:VModel[]; current:string; onPick:(id:string)=>void}) {
  if (!voices.length) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-text-muted mb-1.5">{title}</div>
      <div className="space-y-1">
        {voices.map(v => (
          <button key={v.id} onClick={()=>onPick(v.id)}
            className={`w-full text-left p-2 rounded-lg border transition-colors ${current===v.id?"border-azure/40 bg-azure/10":"border-transparent hover:bg-white/5"}`}>
            <div className="text-sm font-medium text-text-bright flex items-center gap-2">
              {v.name}
              {v.isNigerian && <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[9px]">NG</Badge>}
            </div>
            <div className="text-[11px] text-text-muted">{v.language} · {v.gender} · {v.provider}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default VoiceStudioPage;
