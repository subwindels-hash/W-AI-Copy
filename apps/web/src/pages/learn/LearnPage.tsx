/**
 * Lecturer AI learning page — real adaptive tutoring UI.
 * Pipes topics and answers through /api/v1/education/lecturer/* and shows
 * AI PROVIDER CONFIGURATION REQUIRED when no real model is available.
 */
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { DataBanner } from "@/components/ui/DataBanner";
import { BookOpen, CheckCircle2, XCircle, Sparkles, Brain, Target, Loader2, ChevronRight } from "lucide-react";

type Stage = "assess"|"lesson"|"question"|"explanation"|"examples"|"practice"|"feedback"|"complete";
interface Mcq { id: string; stem: string; choices: string[]; correctIndex: number; explanation: string }
interface Turn {
  type: "lesson"|"question"|"feedback"|"explanation"|"system";
  text: string;
  question?: Mcq;
  modelSource?: string;
  at: string;
}
interface Session {
  sessionId: string;
  stage: Stage;
  masteryPct: number;
  level: "beginner"|"intermediate"|"advanced";
  question?: Mcq;
  warnings?: string[];
  modelSource?: string;
  text?: string;
}

const TOPIC_SUGGESTIONS = [
  "Compound interest", "Photosynthesis", "Supply and demand",
  "Newton's laws", "Prompt engineering", "Risk management in trading",
  "The water cycle", "DNA replication", "Network protocols",
];

export function LearnPage() {
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<"beginner"|"intermediate"|"advanced">("beginner");
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [explanation, setExplanation] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [followUp, setFollowUp] = useState("");

  const scrollRef = (el: HTMLDivElement|null) => { if (el) el.scrollTop = el.scrollHeight; };

  const start = useCallback(async () => {
    if (!topic.trim()) return;
    setBusy(true); setErr(null); setTurns([]); setShowResult(false); setSelectedAnswer(null);
    try {
      const s = await api.post<Session>("/education/lecturer/start", { topic, level });
      setSession(s);
      setTurns([{
        type: s.question ? "question" : "lesson",
        text: s.text ?? "", question: s.question, modelSource: s.modelSource,
        at: new Date().toISOString(),
      }]);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally { setBusy(false); }
  }, [topic, level]);

  const submitAnswer = useCallback(async () => {
    if (!session || selectedAnswer === null) return;
    setBusy(true);
    try {
      const r = await api.post<Session>(`/education/lecturer/${session.sessionId}/answer`, {
        answerIndex: selectedAnswer, explanation: explanation || undefined,
      });
      setSession(r);
      setTurns(t => [...t, {
        type: "feedback",
        text: r.text ?? "", question: r.question, modelSource: r.modelSource,
        at: new Date().toISOString(),
      }]);
      setShowResult(false);
      setSelectedAnswer(null);
      setExplanation("");
    } catch (e) { setErr(e instanceof ApiError ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [session, selectedAnswer, explanation]);

  const askFollowUp = useCallback(async (mode: "simplify"|"more_detail"|"examples"|"why"|"how" = "why") => {
    if (!session || !followUp.trim()) return;
    setBusy(true);
    try {
      const r = await api.post<Session>(`/education/lecturer/${session.sessionId}/ask`, { question: followUp, mode });
      setTurns(t => [...t, { type:"explanation", text: r.text ?? "", modelSource: r.modelSource, at: new Date().toISOString() }]);
      setFollowUp("");
    } catch (e) { setErr(e instanceof ApiError ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [session, followUp]);

  const reset = () => { setSession(null); setTurns([]); setShowResult(false); setSelectedAnswer(null); setExplanation(""); };

  const demo = session?.modelSource && session.modelSource !== "real";

  return (
    <div className="space-y-5 p-1">
      <div>
        <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2"><BookOpen className="h-6 w-6 text-azure"/> Lecturer AI</h1>
        <p className="text-sm text-text-muted mt-1">Adaptive tutoring: assess → lesson → question → explanation → examples → practice → feedback → tracking.</p>
      </div>

      {err && <DataBanner variant="no-data" title="ERROR" message={err}/>}
      {session?.warnings?.length ? <DataBanner variant="demo-ai" message={session.warnings[0]}/> : null}
      {demo && !session?.warnings?.length && <DataBanner variant="demo-ai"/>}

      {!session ? (
        <Card>
          <CardHeader><CardTitle>Start a lesson</CardTitle><CardDescription>Pick a topic or enter your own.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-text-muted">Topic</label>
              <Input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="e.g. Black-Scholes option pricing"/>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {TOPIC_SUGGESTIONS.map(t=>(
                  <button key={t} onClick={()=>setTopic(t)} className="text-xs px-2 py-1 rounded-md border border-white/10 hover:bg-white/5 text-text-muted">{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-text-muted">Starting level</label>
              <div className="flex gap-2 mt-1">
                {(["beginner","intermediate","advanced"] as const).map(l=>(
                  <button key={l} onClick={()=>setLevel(l)}
                    className={`px-3 py-1.5 rounded-lg border text-sm capitalize ${level===l?"border-azure bg-azure/15 text-white":"border-white/10 text-text-muted hover:bg-white/5"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={start} disabled={busy || !topic.trim()} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>} Start lesson
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card className="lg:col-span-3">
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5 text-azure"/>{topic}</CardTitle>
                <CardDescription>Session {session.sessionId.slice(0,12)}… · {session.level} · stage: {session.stage}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>New topic</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div ref={scrollRef} className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {turns.map((t,i)=>(
                  <div key={i} className={`p-3 rounded-xl ${t.type==="feedback"?"bg-azure/5 border border-azure/20":"bg-white/[0.03] border border-white/5"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{t.type}</Badge>
                      {t.modelSource === "real" ? <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px]">real ai</Badge>
                       : t.modelSource ? <Badge variant="outline" className="text-amber-300 text-[10px]">demo ai</Badge> : null}
                    </div>
                    <p className="text-sm text-text-bright/90 whitespace-pre-wrap leading-relaxed">{t.text}</p>
                    {t.type === "question" && t.question && i === turns.length - 1 && (
                      <div className="mt-3 space-y-2">
                        <div className="font-medium text-sm text-text-bright">{t.question.stem}</div>
                        {t.question.choices.map((c,j)=>(
                          <button key={j} disabled={showResult||busy} onClick={()=>setSelectedAnswer(j)}
                            className={`w-full text-left p-2.5 rounded-lg border text-sm transition ${selectedAnswer===j?"border-azure bg-azure/10 text-white":"border-white/10 hover:bg-white/5 text-text-bright/90"}`}>
                            <span className="font-mono mr-2 text-text-muted">{String.fromCharCode(65+j)}.</span>{c}
                          </button>
                        ))}
                        {showResult && (
                          <div className={`p-2.5 rounded-lg border text-sm ${selectedAnswer===t.question.correctIndex?"border-emerald-500/30 bg-emerald-500/10 text-emerald-200":"border-rose-500/30 bg-rose-500/10 text-rose-200"}`}>
                            {selectedAnswer===t.question.correctIndex
                              ? <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4"/> Correct! </span>
                              : <span className="flex items-center gap-1"><XCircle className="h-4 w-4"/> Incorrect. </span>}
                            {t.question.explanation}
                          </div>
                        )}
                        {selectedAnswer !== null && !showResult && (
                          <div className="space-y-2">
                            <Textarea rows={2} value={explanation} onChange={e=>setExplanation(e.target.value)}
                              placeholder="Why did you choose that answer? (optional)"/>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={()=>setShowResult(true)} disabled={busy}>Check</Button>
                              <Button size="sm" onClick={submitAnswer} disabled={busy} className="gap-1">
                                {busy?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<ChevronRight className="h-3.5 w-3.5"/>} Submit & continue
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {session.stage !== "complete" && !session.question && (
                <div className="flex gap-2 pt-2 border-t border-white/5">
                  <Input value={followUp} onChange={e=>setFollowUp(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();askFollowUp("examples");}}}
                    placeholder="Ask a follow-up (e.g. 'Give me an example')" />
                  <select value="" onChange={e=>{if(e.target.value){askFollowUp(e.target.value as any); e.target.value="";}}}
                    className="rounded-lg border border-white/10 bg-bg-deep/60 px-2 text-sm text-text-bright">
                    <option value="">Ask…</option>
                    <option value="simplify">Explain simply</option>
                    <option value="more_detail">More detail</option>
                    <option value="examples">Examples</option>
                    <option value="why">Why?</option>
                    <option value="how">How?</option>
                  </select>
                  <Button onClick={()=>askFollowUp("why")} disabled={busy||!followUp.trim()}>Send</Button>
                </div>
              )}

              {session.stage === "complete" && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                  <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-400 mb-2"/>
                  <div className="font-semibold text-emerald-200">Lesson complete</div>
                  <div className="text-sm text-emerald-200/80">Final mastery: {Math.round(session.masteryPct)}% · level: {session.level}</div>
                  <Button variant="outline" size="sm" className="mt-3" onClick={reset}>Start a new topic</Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-azure"/>Progress</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-text-muted mb-1">
                  <span>Mastery</span><span>{Math.round(session.masteryPct)}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-azure to-emerald-400 transition-all" style={{width:`${session.masteryPct}%`}}/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Level" value={session.level} />
                <Stat label="Stage" value={session.stage} />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-text-muted mb-1">Adaptive loop</div>
                <ol className="space-y-1 text-xs">
                  {["assess","lesson","question","explanation","examples","practice","feedback"].map(s=>(
                    <li key={s} className={`flex items-center gap-1.5 ${session.stage===s?"text-white":"text-text-muted"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${session.stage===s?"bg-azure":"bg-white/20"}`}/>{s}
                    </li>
                  ))}
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({label,value}:{label:string;value:string|number}){
  return <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
    <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
    <div className="text-sm font-medium text-text-bright capitalize">{value}</div>
  </div>;
}

export default LearnPage;
