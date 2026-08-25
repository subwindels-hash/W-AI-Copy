/**
 * WINDELS AI Language Teacher — desktop workspace.
 * All numbers come from stored activity. Pronunciation is never invented.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { languageApi } from "@/lib/languageLearning";
import type {
  LlAssessment, LlConversationMode, LlConversationSession, LlCorrectionMode,
  LlDailyPlan, LlDashboard, LlGrammarRule, LlLanguage, LlLearningPath,
  LlLesson, LlLessonAttempt, LlProgress, LlUserLanguageProfile, LlUserVocab,
  LlVocabItem, LlWritingAttempt,
} from "@/lib/languageLearning";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TranslateView } from "./TranslateView";

const VIEWS = [
  { id: "home", label: "My Languages" },
  { id: "translate", label: "Translate" },
  { id: "catalog", label: "Catalog" },
  { id: "teacher", label: "AI Teacher" },
  { id: "assess", label: "Assessment" },
  { id: "lesson", label: "Lessons" },
  { id: "conversation", label: "Conversation" },
  { id: "vocab", label: "Vocabulary" },
  { id: "grammar", label: "Grammar" },
  { id: "writing", label: "Writing" },
  { id: "listening", label: "Listening" },
  { id: "speaking", label: "Speaking" },
  { id: "plan", label: "Daily Plan" },
  { id: "progress", label: "Progress" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

const MODES: LlConversationMode[] = [
  "BEGINNER", "INTERMEDIATE", "ADVANCED", "CASUAL", "TRAVEL", "RESTAURANT",
  "SHOPPING", "HOTEL", "BUSINESS", "JOB_INTERVIEW", "SOCIAL", "EMERGENCY",
];
const CORRECTIONS: LlCorrectionMode[] = ["IMMEDIATE", "AFTER_TURN", "IMPORTANT_ONLY", "CONVERSATION_ONLY"];

function speak(text: string, lang: string, rate = 1) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function pct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export function LanguageLearningPage() {
  const loc = useLocation();
  const nav = useNavigate();
  const seg = loc.pathname.split("/").filter(Boolean).pop() || "home";
  const active: ViewId = VIEWS.some((v) => v.id === seg) ? (seg as ViewId) : "home";
  const go = (id: ViewId) => nav(id === "home" ? "/app/languages" : `/app/languages/${id}`);

  const [dash, setDash] = useState<LlDashboard | null>(null);
  const [code, setCode] = useState<string>("nl");
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [teacherMsg, setTeacherMsg] = useState("Teach me Dutch from the beginning.");
  const [teacherOut, setTeacherOut] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<LlAssessment | null>(null);
  const [answer, setAnswer] = useState("");
  const [lessons, setLessons] = useState<LlLesson[]>([]);
  const [path, setPath] = useState<LlLearningPath | null>(null);
  const [attempt, setAttempt] = useState<LlLessonAttempt | null>(null);
  const [intro, setIntro] = useState<any>(null);
  const [conv, setConv] = useState<LlConversationSession | null>(null);
  const [convMode, setConvMode] = useState<LlConversationMode>("BEGINNER");
  const [corr, setCorr] = useState<LlCorrectionMode>("IMPORTANT_ONLY");
  const [convText, setConvText] = useState("");
  const [catalog, setCatalog] = useState<LlVocabItem[]>([]);
  const [cards, setCards] = useState<LlUserVocab[]>([]);
  const [rules, setRules] = useState<LlGrammarRule[]>([]);
  const [grammarText, setGrammarText] = useState<string>("");
  const [writeText, setWriteText] = useState("");
  const [writing, setWriting] = useState<LlWritingAttempt | null>(null);
  const [listenItems, setListenItems] = useState<any[]>([]);
  const [listenAns, setListenAns] = useState("");
  const [speakPrompts, setSpeakPrompts] = useState<any[]>([]);
  const [speakText, setSpeakText] = useState("");
  const [plan, setPlan] = useState<LlDailyPlan | null>(null);
  const [progress, setProgress] = useState<LlProgress | null>(null);
  const [recs, setRecs] = useState<any[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 4000); };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : String(e));

  const load = useCallback(async () => {
    try {
      const d = await languageApi.dashboard();
      setDash(d);
      if (d.profiles[0] && !d.profiles.some((p) => p.languageCode === code)) setCode(d.profiles[0].languageCode);
      setErr(null);
    } catch (e) { fail(e); }
  }, [code]);
  useEffect(() => { void load(); }, [load]);

  const profile: (LlUserLanguageProfile & { progress?: LlProgress }) | undefined = dash?.profiles.find((p) => p.languageCode === code);
  const language: LlLanguage | undefined = dash?.languages.find((l) => l.code === code);

  const enroll = async (lang: string) => {
    try {
      await languageApi.enroll({ languageCode: lang, nativeLanguageCode: "en", explanationLanguageCode: "en", goal: "GENERAL", dailyMinutes: 25 });
      setCode(lang);
      flash(`Started ${lang}.`);
      await load();
    } catch (e) { fail(e); }
  };

  const ask = async () => {
    try {
      const r = await languageApi.askTeacher(teacherMsg, code);
      setTeacherOut(r.message);
    } catch (e) { fail(e); }
  };

  const startAssess = async () => {
    try { setAssessment(await languageApi.startAssessment(code)); setAnswer(""); }
    catch (e) { fail(e); }
  };
  const submitAssess = async () => {
    if (!assessment) return;
    try {
      const next = await languageApi.answerAssessment(assessment.id, answer);
      setAssessment(next);
      setAnswer("");
      if (next.status === "COMPLETED") { flash(`Assessed level: ${next.overallLevel}`); await load(); }
    } catch (e) { fail(e); }
  };

  const loadLessons = async () => {
    try {
      setLessons(await languageApi.lessons(code));
      setPath(await languageApi.path(code));
    } catch (e) { fail(e); }
  };
  const startLsn = async (id: string) => {
    try {
      const r = await languageApi.startLesson(code, id);
      setAttempt(r.attempt); setIntro(r.intro);
    } catch (e) { fail(e); }
  };
  const answerLsn = async (practiceId: string, response: string) => {
    if (!attempt) return;
    try { setAttempt(await languageApi.answerLesson(attempt.id, practiceId, response)); }
    catch (e) { fail(e); }
  };

  const startConv = async () => {
    try { setConv(await languageApi.startConversation(code, convMode, corr)); }
    catch (e) { fail(e); }
  };
  const sendConv = async () => {
    if (!conv) return;
    try { setConv(await languageApi.conversationTurn(conv.id, convText)); setConvText(""); }
    catch (e) { fail(e); }
  };

  const loadVocab = async () => {
    try {
      setCatalog(await languageApi.vocabCatalog(code));
      setCards(await languageApi.vocab(code));
    } catch (e) { fail(e); }
  };

  const loadGrammar = async () => {
    try { setRules(await languageApi.grammar(code)); }
    catch (e) { fail(e); }
  };

  const loadRest = async () => {
    try {
      setListenItems(await languageApi.listeningItems(code));
      setSpeakPrompts(await languageApi.speakingPrompts(code));
      setPlan(await languageApi.plan(code));
      setProgress(await languageApi.progress(code));
      setRecs(await languageApi.recommendations(code));
    } catch (e) { fail(e); }
  };

  useEffect(() => {
    if (!profile) return;
    if (active === "lesson") void loadLessons();
    if (active === "vocab") void loadVocab();
    if (active === "grammar") void loadGrammar();
    if (active === "plan" || active === "progress" || active === "listening" || active === "speaking") void loadRest();
  }, [active, code, profile?.id]);

  const currentPractice = useMemo(() => {
    if (!attempt || !intro) return null;
    const lesson = lessons.find((l) => l.id === attempt.lessonId);
    const answered = new Set(attempt.answers.map((a) => a.practiceId));
    return lesson?.practice.find((p) => !answered.has(p.id)) ?? null;
  }, [attempt, intro, lessons]);

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-2xl font-black text-text-bright">AI Language Teacher</h1>
        <p className="text-sm text-text-muted max-w-3xl">
          Learn step by step with a teacher that remembers your answers. Levels, progress and weaknesses come from stored work — never invented scores.
        </p>
      </div>
      <div className="rounded-lg border border-azure/30 bg-azure/10 px-4 py-2 text-sm text-azure">
        {dash?.speech.note}
      </div>
      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      <div className="flex gap-1 overflow-x-auto pb-1">
        {VIEWS.map((v) => (
          <button key={v.id} onClick={() => go(v.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs border ${active === v.id ? "bg-azure/20 border-azure/40 text-text-bright" : "border-white/10 text-text-muted"}`}>
            {v.label}
          </button>
        ))}
      </div>

      {dash?.profiles.length ? (
        <div className="flex flex-wrap gap-2">
          {dash.profiles.map((p) => (
            <button key={p.id} onClick={() => setCode(p.languageCode)} className={`rounded-full px-3 py-1 text-xs border ${code === p.languageCode ? "border-azure/50 bg-azure/20 text-text-bright" : "border-white/10 text-text-muted"}`}>
              {dash.languages.find((l) => l.code === p.languageCode)?.name ?? p.languageCode} — {p.currentLevel}
            </button>
          ))}
        </div>
      ) : null}

      {active === "translate" && dash ? (
        <TranslateView languages={dash.languages} />
      ) : null}

      {(active === "home" || active === "catalog") && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My languages</CardTitle>
              <CardDescription>Each language has its own profile, level and progress.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(dash?.profiles ?? []).length === 0 ? <p className="text-sm text-text-muted">You are not learning a language yet. Enroll from the catalog.</p> : dash!.profiles.map((p) => (
                <div key={p.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex justify-between">
                    <div className="text-text-bright font-semibold">{dash?.languages.find((l) => l.code === p.languageCode)?.name} <span className="text-text-muted font-normal">({dash?.languages.find((l) => l.code === p.languageCode)?.nativeName})</span></div>
                    <Badge variant="azure">{p.currentLevel}</Badge>
                  </div>
                  <div className="text-xs text-text-muted mt-1">{p.levelSource} · streak {p.studyStreakDays}d · {p.status}</div>
                  <div className="text-xs mt-2">Vocab known {p.progress?.vocabularyKnown ?? 0} · lessons {p.progress?.lessonsCompleted ?? 0}/{p.progress?.lessonsAvailable ?? 0}</div>
                  <Button size="sm" className="mt-2" onClick={() => { setCode(p.languageCode); go("lesson"); }}>Continue learning</Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Language catalog</CardTitle>
              <CardDescription>
                {(dash?.languages ?? []).length} languages and regional/script variants, registry-driven. Every language supports translation and AI practice; languages with an authored curriculum (vocabulary, grammar, lessons through B2) can also be learned step by step.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={catalogQuery} onChange={(e) => setCatalogQuery(e.target.value)} placeholder="Search languages (name, native name, code)…" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[28rem] overflow-auto">
                {(dash?.languages ?? []).filter((l) => {
                  const q = catalogQuery.trim().toLowerCase();
                  if (!q) return true;
                  return l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q) || l.code.toLowerCase().includes(q) || l.aliases.some((a) => a.toLowerCase().includes(q));
                }).map((l) => (
                  <div key={l.code} className="rounded-lg border border-white/10 px-3 py-2 text-sm flex justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-text-bright truncate" dir={l.textDirection === "RTL" ? "rtl" : "ltr"}>{l.name} <span className="text-text-muted">· {l.nativeName}</span></div>
                      <div className="text-[11px] text-text-muted">
                        {l.bcp47} · {l.writingSystem} · {l.textDirection}
                        {l.learningSupported ? <Badge variant="emerald" className="ml-1">curriculum</Badge> : <Badge variant="slate" className="ml-1">translate</Badge>}
                      </div>
                    </div>
                    {l.learningSupported ? (
                      <Button size="sm" variant="outline" onClick={() => void enroll(l.code)}>Learn</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => go("translate")}>Translate</Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {active === "teacher" && (
        <Card>
          <CardHeader><CardTitle>Talk to the teacher</CardTitle><CardDescription>Try: “Teach me Dutch from the beginning.” / “Test my French level.” / “Practice Italian conversation with me.”</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <Input value={teacherMsg} onChange={(e) => setTeacherMsg(e.target.value)} />
            <Button onClick={() => void ask()}>Ask</Button>
            {teacherOut ? <p className="text-sm whitespace-pre-wrap text-text-main">{teacherOut}</p> : null}
          </CardContent>
        </Card>
      )}

      {active === "assess" && (
        <Card>
          <CardHeader>
            <CardTitle>{language?.name ?? code} assessment</CardTitle>
            <CardDescription>Adaptive questions. The level is computed from your answers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!profile ? <p className="text-sm text-text-muted">Enroll first.</p> : !assessment ? (
              <Button onClick={() => void startAssess()}>Start assessment</Button>
            ) : assessment.status === "COMPLETED" ? (
              <div className="space-y-2 text-sm">
                <div className="text-xl font-black text-text-bright">Overall: {assessment.overallLevel}</div>
                {assessment.skillScores.filter((s) => s.asked).map((s) => (
                  <div key={s.skill}>{s.skill}: {s.level} ({s.correct}/{s.asked})</div>
                ))}
                <div className="text-text-muted">{assessment.recommendedFocus}</div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-text-muted">{assessment.itemsAsked} asked · {assessment.currentItem?.skill} · {assessment.currentItem?.level}</div>
                <div className="text-text-bright">{assessment.currentItem?.prompt}</div>
                {assessment.currentItem?.options?.map((o) => (
                  <Button key={o} variant="outline" size="sm" onClick={() => setAnswer(o)}>{o}</Button>
                ))}
                <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" />
                <Button onClick={() => void submitAssess()} disabled={!answer.trim()}>Submit</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {active === "lesson" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Learning path</CardTitle><CardDescription>{path ? `${path.level} · ${path.modules.length} modules` : "Open a path after you enroll."}</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(path?.modules ?? []).map((m) => (
                <button key={m.id} onClick={() => void startLsn(m.lessonIds[0]!)} className="text-left rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5">
                  <div className="text-text-bright">Week {m.week} · {m.title}</div>
                  <div className="text-[11px] text-text-muted">{m.level} · {m.topic}</div>
                </button>
              ))}
            </CardContent>
          </Card>
          {intro && attempt && (
            <Card>
              <CardHeader><CardTitle>{intro.title}</CardTitle><CardDescription>{intro.explanation}</CardDescription></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {intro.examples.map((ex: any, i: number) => (
                  <div key={i} className="rounded-lg bg-white/5 px-3 py-2">
                    <div className="text-text-bright">{ex.target}</div>
                    <div className="text-xs text-text-muted">{ex.explanation}</div>
                  </div>
                ))}
                {currentPractice ? (
                  <PracticeBox practice={currentPractice} onSubmit={(v) => void answerLsn(currentPractice.id, v)} />
                ) : (
                  <div>
                    <Badge variant={attempt.status === "COMPLETED" ? "emerald" : "amber"}>{attempt.status}</Badge>
                    <div className="text-xs text-text-muted mt-1">{attempt.correctCount}/{attempt.askedCount} correct</div>
                  </div>
                )}
                {attempt.answers.map((a, i) => (
                  <div key={i} className="text-xs text-text-muted">You: {a.response} · {a.correct ? "correct" : `expected ${a.expected}`}</div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {active === "conversation" && (
        <Card>
          <CardHeader><CardTitle>Conversation practice</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Select value={convMode} onChange={(e) => setConvMode(e.target.value as LlConversationMode)}>
                {MODES.map((m) => <option key={m}>{m}</option>)}
              </Select>
              <Select value={corr} onChange={(e) => setCorr(e.target.value as LlCorrectionMode)}>
                {CORRECTIONS.map((m) => <option key={m}>{m}</option>)}
              </Select>
            </div>
            <Button onClick={() => void startConv()}>Start scene</Button>
            {conv ? (
              <div className="space-y-2">
                {conv.turns.map((t, i) => (
                  <div key={i} className={`rounded-lg px-3 py-2 text-sm ${t.role === "TEACHER" ? "bg-azure/10" : "bg-white/5"}`}>
                    <div className="text-[11px] uppercase text-text-muted">{t.role}</div>
                    <div>{t.text}</div>
                    {t.correction ? <div className="text-xs text-amber mt-1">{t.correction}</div> : null}
                    {t.naturalVersion && t.role === "USER" ? <div className="text-xs text-text-muted">More natural: {t.naturalVersion}</div> : null}
                  </div>
                ))}
                <Input value={convText} onChange={(e) => setConvText(e.target.value)} placeholder="Your reply" />
                <Button onClick={() => void sendConv()}>Send</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {active === "vocab" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Learn words</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {catalog.map((v) => (
                <div key={v.id} className="flex justify-between gap-2 rounded-lg border border-white/5 px-3 py-2 text-sm">
                  <div>
                    <div className="text-text-bright">{v.word} <span className="text-text-muted">· {v.translation}</span></div>
                    <div className="text-[11px] text-text-muted">{v.pronunciation} · {v.exampleSentence}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => speak(v.word, language?.iso6391 ?? code)}>Hear</Button>
                    <Button size="sm" onClick={() => void languageApi.saveVocab(code, v.id).then(loadVocab)}>Save</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Due reviews</CardTitle><CardDescription>Spaced repetition from your last quality rating.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {cards.filter((c) => Date.parse(c.nextReviewAt) <= Date.now()).map((c) => (
                <div key={c.id} className="rounded-lg border border-white/10 p-3 text-sm">
                  <div className="text-text-bright text-lg">{c.word}</div>
                  <div className="text-xs text-text-muted mb-2">Do you remember the meaning?</div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void languageApi.reviewVocab(c.id, true, 4).then(loadVocab)}>Yes</Button>
                    <Button size="sm" variant="outline" onClick={() => void languageApi.reviewVocab(c.id, false, 1).then(loadVocab)}>No</Button>
                  </div>
                  <div className="text-[11px] text-text-muted mt-1">{c.translation} · next in {c.intervalDays}d after a successful review</div>
                </div>
              ))}
              {cards.filter((c) => Date.parse(c.nextReviewAt) <= Date.now()).length === 0 ? <p className="text-sm text-text-muted">No cards due. Save words first.</p> : null}
            </CardContent>
          </Card>
        </div>
      )}

      {active === "grammar" && (
        <Card>
          <CardHeader><CardTitle>Grammar</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {rules.map((r) => (
              <div key={r.id} className="rounded-lg border border-white/10 p-3 text-sm space-y-2">
                <div className="text-text-bright font-semibold">{r.title} · {r.level}</div>
                <p>{r.rule}</p>
                <Button size="sm" variant="outline" onClick={async () => {
                  const s = await languageApi.explainGrammar(code, r.id, true);
                  setGrammarText(s.explanation);
                }}>Explain more simply</Button>
                {grammarText ? <p className="text-text-muted">{grammarText}</p> : null}
                <PracticeBox
                  practice={{ id: r.id, prompt: `Exercise for ${r.title}`, hint: r.simpleRule }}
                  onSubmit={(v) => void languageApi.grammarExercise(code, r.id, v).then((res) => flash(res.correct ? "Correct" : `Expected ${res.expected}`))}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {active === "writing" && (
        <Card>
          <CardHeader><CardTitle>Writing practice</CardTitle><CardDescription>Your original text is stored and never overwritten.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <textarea className="w-full min-h-32 rounded-lg bg-black/30 border border-white/10 p-3 text-sm" value={writeText} onChange={(e) => setWriteText(e.target.value)} placeholder="Write in the language you are learning…" />
            <Button onClick={async () => { try { setWriting(await languageApi.write(code, writeText)); } catch (e) { fail(e); } }}>Analyse</Button>
            {writing ? (
              <div className="space-y-2 text-sm">
                <div><div className="text-xs text-text-muted">YOUR ORIGINAL TEXT</div><p>{writing.originalText}</p></div>
                <div><div className="text-xs text-text-muted">CORRECTED VERSION</div><p>{writing.correctedText}</p></div>
                <div><div className="text-xs text-text-muted">MORE NATURAL</div><p>{writing.nativeVersion}</p></div>
                <ul className="list-disc pl-4 text-text-muted">{writing.mistakes.map((m, i) => <li key={i}>{m.kind}: {m.explanation}</li>)}</ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {active === "listening" && (
        <Card>
          <CardHeader><CardTitle>Listening</CardTitle><CardDescription>Audio uses your browser voice. Transcript can be shown after you try.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {listenItems.map((it) => (
              <div key={it.id} className="rounded-lg border border-white/10 p-3 text-sm space-y-2">
                <div>{it.prompt} · {it.level}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => speak(it.audioText, language?.iso6391 ?? code, 0.7)}>Slow</Button>
                  <Button size="sm" variant="outline" onClick={() => speak(it.audioText, language?.iso6391 ?? code, 1)}>Normal</Button>
                  <Button size="sm" variant="outline" onClick={() => speak(it.audioText, language?.iso6391 ?? code, 1.15)}>Native</Button>
                </div>
                <Input value={listenAns} onChange={(e) => setListenAns(e.target.value)} placeholder="What did you hear?" />
                <Button size="sm" onClick={async () => {
                  const r = await languageApi.answerListening(code, it.id, listenAns);
                  flash(r.correct ? "Correct" : `Heard: ${r.transcript}`);
                }}>Check</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {active === "speaking" && (
        <Card>
          <CardHeader><CardTitle>Speaking</CardTitle><CardDescription>Accuracy is transcript-to-target match. Pronunciation scores stay unavailable without a provider.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {speakPrompts.map((p) => (
              <div key={p.id} className="rounded-lg border border-white/10 p-3 text-sm space-y-2">
                <div className="text-text-bright">{p.prompt}</div>
                <div className="text-xs text-text-muted">{p.pronunciation}</div>
                <Input value={speakText} onChange={(e) => setSpeakText(e.target.value)} placeholder="Type or paste your transcript" />
                <Button size="sm" onClick={async () => {
                  const r = await languageApi.speak(code, speakText, p.expected, p.id);
                  flash(`${r.feedback} Pronunciation: ${r.pronunciation.status}`);
                }}>Evaluate transcript</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {active === "plan" && plan && (
        <Card>
          <CardHeader>
            <CardTitle>Your {language?.name} plan today</CardTitle>
            <CardDescription>Estimated {plan.estimatedMinutes} minutes · based on {plan.basedOn.join(", ") || "your path"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {plan.items.map((it, i) => (
              <div key={i} className="rounded-lg border border-white/10 px-3 py-2 text-sm">
                <div className="text-text-bright">{i + 1}. {it.title}</div>
                <div className="text-xs text-text-muted">{it.detail} · {it.estimatedMinutes} min</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {active === "progress" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Level" value={progress?.currentLevel ?? profile?.currentLevel ?? "—"} sub={progress?.levelSource} />
            <Stat label="To next" value={pct(progress?.progressToNext)} sub={progress?.nextLevel ?? undefined} />
            <Stat label="Vocabulary" value={String(progress?.vocabularyKnown ?? 0)} sub={`${progress?.vocabularyDue ?? 0} due`} />
            <Stat label="Streak" value={`${progress?.studyStreakDays ?? 0}d`} />
            <Stat label="Grammar" value={pct(progress?.grammarMastery)} />
            <Stat label="Speaking" value={pct(progress?.speakingAccuracy)} sub="transcript match" />
            <Stat label="Listening" value={pct(progress?.listeningAccuracy)} />
            <Stat label="Writing" value={String(progress?.writingAttempts ?? 0)} sub={pct(progress?.writingNaturalness)} />
          </div>
          <Card>
            <CardHeader><CardTitle>Recommendations</CardTitle><CardDescription>Only from stored misses and due work.</CardDescription></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {recs.map((r) => (
                <div key={r.id}>
                  <div className="text-text-bright">{r.title}</div>
                  <div className="text-xs text-text-muted">{r.detail}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function PracticeBox({ practice, onSubmit }: { practice: { id: string; prompt: string; hint?: string | null }; onSubmit: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="space-y-2">
      <div className="text-text-bright">{practice.prompt}</div>
      {practice.hint ? <div className="text-xs text-text-muted">Hint: {practice.hint}</div> : null}
      <Input value={v} onChange={(e) => setV(e.target.value)} />
      <Button size="sm" onClick={() => onSubmit(v)} disabled={!v.trim()}>Check</Button>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
        <div className="text-xl font-black text-text-bright truncate">{value}</div>
        {sub ? <div className="text-xs text-text-muted">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
