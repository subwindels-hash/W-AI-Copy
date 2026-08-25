/**
 * WINDELS AI — Translate workspace (Session 199).
 *
 * A production-grade translation surface: searchable source/target pickers with
 * auto-detect, swap, formality control, alternatives, TTS playback, copy,
 * upload-a-document text extraction, and honest error/DEMO handling. All
 * languages come from the backend registry; translation runs through the AI
 * fabric via `languageApi.translate`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Copy, Check, FileUp, Loader2, Sparkles, Volume2 } from "lucide-react";
import { languageApi } from "@/lib/languageLearning";
import type { LlDetectedLanguage, LlLanguage, LlTranslation, LlTranslationFormality } from "@/lib/languageLearning";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LanguagePicker, DETECT_CODE, pushRecentLanguage } from "@/components/languages/LanguagePicker";

const FORMALITIES: LlTranslationFormality[] = ["AUTO", "FORMAL", "INFORMAL"];
const MAX_CHARS = 20000;

function speak(text: string, bcp47: string) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = bcp47;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function TranslateView({ languages }: { languages: LlLanguage[] }) {
  const [source, setSource] = useState<string>(DETECT_CODE);
  const [target, setTarget] = useState<string>("es");
  const [formality, setFormality] = useState<LlTranslationFormality>("AUTO");
  const [includeAlternatives, setIncludeAlternatives] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<LlTranslation | null>(null);
  const [detected, setDetected] = useState<LlDetectedLanguage | null>(null);
  const [busy, setBusy] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const byCode = useMemo(() => {
    const m = new Map<string, LlLanguage>();
    for (const l of languages) m.set(l.code, l);
    return m;
  }, [languages]);

  const targetLang = byCode.get(target) ?? null;
  const sourceLang = source === DETECT_CODE ? null : byCode.get(source) ?? null;

  // Debounced auto-detection preview while typing when source = detect.
  useEffect(() => {
    if (source !== DETECT_CODE || text.trim().length < 3) { setDetected(null); return; }
    let cancelled = false;
    setDetecting(true);
    const t = window.setTimeout(async () => {
      try {
        const d = await languageApi.detect(text.slice(0, 4000));
        if (!cancelled) setDetected(d);
      } catch {
        if (!cancelled) setDetected(null);
      } finally {
        if (!cancelled) setDetecting(false);
      }
    }, 600);
    return () => { cancelled = true; window.clearTimeout(t); window.clearTimeout(t); };
  }, [text, source]);

  const detectedLabel = detected?.code
    ? `${detected.name}${detected.confidence ? ` (${Math.round(detected.confidence * 100)}%)` : ""}`
    : detecting ? "detecting…" : null;

  const doTranslate = useCallback(async () => {
    if (!text.trim() || !target) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const out = await languageApi.translate({
        text,
        targetLanguage: target,
        sourceLanguage: source,
        formality,
        preserveFormatting: true,
        includeAlternatives,
      });
      setResult(out);
      setDetected(out.sourceLanguage);
      pushRecentLanguage(target);
      if (source !== DETECT_CODE) pushRecentLanguage(source);
    } catch (e: any) {
      setErr(e?.message ?? "Translation failed.");
    } finally {
      setBusy(false);
    }
  }, [text, target, source, formality, includeAlternatives]);

  const swap = useCallback(() => {
    // Swap only makes sense with a concrete source. When detecting, adopt the
    // detected language as the new target and move the current target to source.
    const newSource = target;
    const newTarget = source === DETECT_CODE ? (detected?.code ?? "en") : source;
    setSource(newSource);
    setTarget(newTarget);
    if (result) { setText(result.translatedText); setResult(null); }
  }, [source, target, detected, result]);

  const onFile = useCallback(async (file: File) => {
    setErr(null);
    // Text-based documents are read client-side (txt, csv, md, json, srt, etc.).
    const okType = /text\/|application\/(json|xml|csv)/.test(file.type) || /\.(txt|md|csv|json|xml|srt|vtt|log)$/i.test(file.name);
    if (!okType) {
      setErr("Only text-based documents (.txt, .md, .csv, .json, .srt, …) can be read in the browser. Paste the text for other formats.");
      return;
    }
    try {
      const content = await file.text();
      setText(content.slice(0, MAX_CHARS));
    } catch {
      setErr("Could not read that file.");
    }
  }, []);

  const copy = useCallback(async () => {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.translatedText); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { /* clipboard permission optional */ }
  }, [result]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-azure" /> Translate</CardTitle>
          <CardDescription>
            Natural, context-aware translation across {languages.length} languages and regional variants. Auto-detect the source, choose formality, and hear the result. Powered by the WINDELS AI fabric — results are never a word-for-word swap.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 items-end gap-2 md:grid-cols-[1fr_auto_1fr]">
            <LanguagePicker
              label="From"
              languages={languages}
              value={source}
              onChange={(c) => { setSource(c); setResult(null); }}
              allowDetect
              detectedLabel={detectedLabel}
            />
            <div className="flex justify-center pb-1">
              <Button variant="ghost" size="sm" onClick={swap} aria-label="Swap languages" title="Swap languages">
                <ArrowLeftRight className="h-4 w-4" />
              </Button>
            </div>
            <LanguagePicker
              label="To"
              languages={languages}
              value={target}
              onChange={(c) => { setTarget(c); setResult(null); }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 text-xs text-text-muted">
              <span>Formality:</span>
              {FORMALITIES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormality(f)}
                  className={`rounded border px-2 py-0.5 ${formality === f ? "border-azure/40 bg-azure/20 text-azure" : "border-white/10 text-text-muted"}`}
                >
                  {f === "AUTO" ? "Auto" : f === "FORMAL" ? "Formal" : "Informal"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1 text-xs text-text-muted">
              <input type="checkbox" checked={includeAlternatives} onChange={(e) => setIncludeAlternatives(e.target.checked)} />
              Show alternatives
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* Source */}
            <div className="rounded-lg border border-white/10 bg-bg-deep/40">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                placeholder="Type or paste text…"
                dir={sourceLang?.textDirection === "RTL" ? "rtl" : "ltr"}
                rows={8}
                className="w-full resize-y bg-transparent p-3 text-sm text-text-bright outline-none placeholder:text-text-muted"
              />
              <div className="flex items-center justify-between border-t border-white/10 px-3 py-2 text-xs text-text-muted">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 hover:text-text-bright">
                    <FileUp className="h-3.5 w-3.5" /> Upload document
                  </button>
                  <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,.xml,.srt,.vtt,.log,text/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
                  {text ? (
                    <button type="button" onClick={() => { const l = detected?.code ? byCode.get(detected.code) : sourceLang; speak(text, l?.bcp47 ?? "en"); }} className="flex items-center gap-1 hover:text-text-bright">
                      <Volume2 className="h-3.5 w-3.5" /> Listen
                    </button>
                  ) : null}
                </div>
                <span>{text.length}/{MAX_CHARS}</span>
              </div>
            </div>

            {/* Target */}
            <div className="rounded-lg border border-white/10 bg-bg-deep/40">
              <div className="min-h-[11rem] p-3">
                {busy ? (
                  <div className="flex h-full items-center gap-2 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Translating…</div>
                ) : result ? (
                  <div className="space-y-2">
                    <p className="whitespace-pre-wrap text-sm text-text-bright" dir={targetLang?.textDirection === "RTL" ? "rtl" : "ltr"}>{result.translatedText}</p>
                    {result.note ? <p className="text-xs text-text-muted">Note: {result.note}</p> : null}
                    {result.alternatives.length ? (
                      <div className="border-t border-white/10 pt-2">
                        <div className="text-[10px] uppercase tracking-wide text-text-muted">Alternatives</div>
                        {result.alternatives.map((a, i) => (
                          <p key={i} className="whitespace-pre-wrap text-sm text-text-main" dir={targetLang?.textDirection === "RTL" ? "rtl" : "ltr"}>{a}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex h-full items-center text-sm text-text-muted">Translation appears here.</div>
                )}
              </div>
              {result ? (
                <div className="flex items-center justify-between border-t border-white/10 px-3 py-2 text-xs text-text-muted">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => speak(result.translatedText, result.targetLanguage.bcp47)} className="flex items-center gap-1 hover:text-text-bright"><Volume2 className="h-3.5 w-3.5" /> Listen</button>
                    <button type="button" onClick={() => void copy()} className="flex items-center gap-1 hover:text-text-bright">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</button>
                  </div>
                  {result.source === "DEMO" ? <Badge variant="amber">demo engine</Badge> : <Badge variant="emerald">AI</Badge>}
                </div>
              ) : null}
            </div>
          </div>

          {detected && source === DETECT_CODE ? (
            <div className="text-xs text-text-muted">
              Detected source: <span className="text-text-bright">{detected.name ?? "unknown"}</span>
              {detected.code ? ` (${detected.code})` : ""}{detected.confidence ? ` · ${Math.round(detected.confidence * 100)}% confidence` : ""}
              {!detected.reliable ? " · low confidence, please pick the source language" : ""}
            </div>
          ) : null}

          {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}

          <div className="flex items-center gap-2">
            <Button onClick={() => void doTranslate()} disabled={busy || !text.trim() || !target}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Translate
            </Button>
            {result ? <span className="text-xs text-text-muted">Model: {result.model}</span> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
