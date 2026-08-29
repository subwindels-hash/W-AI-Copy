/**
 * Session 168 — Digital Humans console (/app/digital-humans).
 *
 * Honesty notes, because this module previously misreported on three fronts:
 *  - A created avatar is a DRAFT. Nothing here trains, renders or validates a
 *    digital human, so nothing marks one "ready" on its own. Before S168 a
 *    setTimeout(1500ms) flipped the status and the UI showed a trained avatar.
 *  - Transcript length is the sum of recorded turns. endSession used to
 *    overwrite it with a random number on a live user action.
 *  - Satisfaction and average duration are null until sessions actually
 *    complete and are rated; they render as "—", not 0%.
 */
import { useCallback, useEffect, useState } from "react";
import { UserCircle, Play, Square, CheckCircle2, MessageSquare } from "lucide-react";
import { dhApi, type DigitalHuman, type DigitalHumanDashboard, type DigitalHumanSession } from "@/lib/digitalHumans";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

/** Render an unmeasured value as an em-dash. Never `|| 0`. */
function metric(v: number | null | undefined, fmt: (n: number) => string = String) {
  return v === null || v === undefined ? <span className="text-slate-500">—</span> : fmt(v);
}

const ROLES = [
  "virtual_receptionist", "ai_teacher", "ai_trainer", "sales_rep", "news_presenter",
  "virtual_executive", "customer_agent", "brand_ambassador", "companion", "healthcare_guide",
] as const;
const STYLES = ["realistic", "stylized", "photoreal", "anime", "cinematic", "corporate", "holographic"] as const;
const GENDERS = ["feminine", "masculine", "androgynous"] as const;

export function DigitalHumansPage() {
  const [dash, setDash] = useState<DigitalHumanDashboard | null>(null);
  const [humans, setHumans] = useState<DigitalHuman[]>([]);
  const [session, setSession] = useState<DigitalHumanSession | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<DigitalHuman["role"]>("virtual_receptionist");
  const [style, setStyle] = useState<DigitalHuman["style"]>("corporate");
  const [gender, setGender] = useState<DigitalHuman["gender"]>("feminine");
  const [turn, setTurn] = useState("120");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, l] = await Promise.all([dhApi.dashboard(), dhApi.list()]);
    setDash(d); setHumans(l);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, note: string) => {
    try { await fn(); setMsg(note); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "request failed"); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Digital Humans</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          A register of avatar definitions and the conversation sessions held against them.
          Nothing here trains or renders an avatar: a new avatar is a <strong>draft</strong> and
          becomes "ready" only when you say so. Averages stay blank until sessions complete.
        </p>
      </div>
      {msg ? <p className="text-xs text-slate-400">{msg}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.total ?? "…"}</CardTitle><CardDescription>Avatars</CardDescription></CardHeader></Card>
        <Card><CardHeader><CardTitle className="text-2xl">{dash?.totalSessions ?? "…"}</CardTitle><CardDescription>Sessions (counted once)</CardDescription></CardHeader></Card>
        <Card><CardHeader>
          <CardTitle className="text-2xl">{dash ? metric(dash.avgSatisfactionPct, (n) => `${n.toFixed(0)}%`) : "…"}</CardTitle>
          <CardDescription>{dash?.avgSatisfactionPct === null ? "No rated sessions" : "Satisfaction"}</CardDescription>
        </CardHeader></Card>
        <Card><CardHeader>
          <CardTitle className="text-2xl">{dash ? metric(dash.avgSessionSec, (n) => `${n}s`) : "…"}</CardTitle>
          <CardDescription>{dash?.avgSessionSec === null ? "No completed sessions" : "Avg session"}</CardDescription>
        </CardHeader></Card>
      </div>

      <Tabs defaultValue="avatars">
        <TabsList>
          <TabsTrigger value="avatars"><UserCircle className="mr-1.5 h-4 w-4" />Avatars</TabsTrigger>
          <TabsTrigger value="sessions"><MessageSquare className="mr-1.5 h-4 w-4" />Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="avatars" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader>
              <CardTitle className="text-sm">Define an avatar</CardTitle>
              <CardDescription>
                Creates a definition row in status <code>draft</code>. No model is trained and no
                asset is rendered — use "Mark ready" once something real backs it.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2">
              <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-56" />
              <Select value={role} onChange={(e) => setRole(e.target.value as DigitalHuman["role"])}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
              <Select value={style} onChange={(e) => setStyle(e.target.value as DigitalHuman["style"])}>
                {STYLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
              <Select value={gender} onChange={(e) => setGender(e.target.value as DigitalHuman["gender"])}>
                {GENDERS.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
              <Button
                disabled={name.trim().length < 2}
                onClick={() => run(() => dhApi.create({ name, role, style, gender }), "Avatar created as draft.")}
              >Create</Button>
            </CardContent>
          </Card>

          {humans.length === 0 ? (
            <p className="text-sm text-slate-500">
              No avatars. This organization starts empty — nothing is seeded on read.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {humans.map((h) => (
                <Card key={h.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm">{h.name}</CardTitle>
                      <Badge variant={h.status === "ready" ? "emerald" : h.status === "live" ? "azure" : "amber"}>{h.status}</Badge>
                    </div>
                    <CardDescription>{h.role} · {h.style} · {h.languages.join(", ")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-slate-400">
                    <div className="grid grid-cols-2 gap-1">
                      <span>Started: {h.totalSessions}</span>
                      <span>Completed: {h.completedSessions}</span>
                      <span>Satisfaction: {metric(h.satisfactionPct, (n) => `${n}%`)}</span>
                      <span>Avg: {metric(h.avgSessionSec, (n) => `${n}s`)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {h.status === "draft" ? (
                        <Button size="sm" variant="ghost" onClick={() => run(() => dhApi.markReady(h.id), `${h.name} marked ready.`)}>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Mark ready
                        </Button>
                      ) : null}
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => run(async () => { setSession(await dhApi.startSession(h.id)); }, `Session started with ${h.name}.`)}
                      ><Play className="mr-1 h-3.5 w-3.5" />Start session</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader>
              <CardTitle className="text-sm">Live session</CardTitle>
              <CardDescription>
                Transcript length grows only by recorded turns. It is a measurement, not an estimate.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {session ? (
                <>
                  <p className="text-xs text-slate-400">
                    {session.id} · {session.language} · transcript {session.transcriptLength} chars
                    {session.endedAt ? ` · ended (${session.durationSec ?? 0}s)` : " · active"}
                  </p>
                  {!session.endedAt ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <Input value={turn} onChange={(e) => setTurn(e.target.value)} className="w-28" placeholder="chars" />
                      <Button size="sm" variant="ghost" onClick={() => run(async () => {
                        setSession(await dhApi.recordTurn(session.id, Number(turn) || 0));
                      }, "Turn recorded.")}>Record turn</Button>
                      <Button size="sm" onClick={() => run(async () => {
                        setSession(await dhApi.endSession(session.id, "resolved", 5));
                      }, "Session ended.")}><Square className="mr-1 h-3.5 w-3.5" />End (5★)</Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-slate-500">No session in this tab yet. Start one from the Avatars tab.</p>
              )}
            </CardContent>
          </Card>

          {dash?.recentSessions?.length ? (
            <Card>
              <CardHeader><CardTitle className="text-sm">Recent sessions</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs text-slate-400">
                {dash.recentSessions.map((s) => (
                  <div key={s.id} className="flex justify-between gap-2">
                    <span>{s.id}</span>
                    <span>{s.transcriptLength} chars · {s.endedAt ? `${s.durationSec ?? 0}s` : "active"}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>

      {dash?.provenance ? (
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader>
            <CardTitle className="text-sm">Where these numbers come from</CardTitle>
            <CardDescription>{dash.provenance.note}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-slate-400">
            {dash.provenance.entries.map((e) => (
              <div key={e.field} className="flex gap-2">
                <Badge variant={e.basis === "measured" ? "emerald" : "amber"}>{e.basis}</Badge>
                <span className="font-mono">{e.field}</span>
                <span className="text-slate-500">{e.detail}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
