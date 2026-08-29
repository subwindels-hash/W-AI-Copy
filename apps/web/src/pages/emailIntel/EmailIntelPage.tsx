/**
 * Session 91 — Enterprise Email Intelligence dashboard.
 *
 * Mailboxes, threaded conversations, an outbox with a real SMTP connector,
 * AI drafting/summarize/triage (with explicit provider labeling) and
 * deterministic inbox analytics — all from the org-scoped API. No fabricated
 * numbers: fresh orgs show zeros; AI outputs display a demo banner whenever
 * `modelSource` is `echo-demo`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { emailIntelApi } from "@/lib/emailIntel";
import type {
  EiDashboardRollup,
  EiMailbox,
  EiThread,
  EiThreadDetail,
  EiMessage,
  EiDraftResult,
} from "@/lib/emailIntel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Inbox, Send, PenLine, Sparkles, Mail, RefreshCw, PlusCircle, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

function statusBadge(s: EiMailbox["status"]) {
  if (s === "configured") return { cls: "emerald", label: "Configured" } as const;
  if (s === "pending") return { cls: "amber", label: "Pending" } as const;
  return { cls: "danger", label: "Error" } as const;
}

function fmtDur(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function EmailIntelPage() {
  const [rollup, setRollup] = useState<EiDashboardRollup | null>(null);
  const [mailboxes, setMailboxes] = useState<EiMailbox[]>([]);
  const [threads, setThreads] = useState<EiThread[]>([]);
  const [thread, setThread] = useState<EiThreadDetail | null>(null);
  const [messages, setMessages] = useState<EiMessage[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [mbName, setMbName] = useState("");
  const [mbEmail, setMbEmail] = useState("");
  const [mbHost, setMbHost] = useState("");
  const [mbPort, setMbPort] = useState("");
  const [mbUser, setMbUser] = useState("");
  const [mbPass, setMbPass] = useState("");

  const [showCompose, setShowCompose] = useState(false);
  const [coTo, setCoTo] = useState("");
  const [coSubject, setCoSubject] = useState("");
  const [coBody, setCoBody] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);

  const [draftCtx, setDraftCtx] = useState("");
  const [draftTone, setDraftTone] = useState("professional");
  const [draftLen, setDraftLen] = useState<"short" | "medium" | "long">("medium");
  const [draft, setDraft] = useState<EiDraftResult | null>(null);
  const [drafting, setDrafting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, m, t, msgs] = await Promise.all([
        emailIntelApi.rollup(),
        emailIntelApi.listMailboxes(),
        emailIntelApi.listThreads(),
        emailIntelApi.listMessages(),
      ]);
      setRollup(r); setMailboxes(m); setThreads(t); setMessages(msgs);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openThread = useCallback(async (tid: string) => {
    try {
      const detail = await emailIntelApi.getThread(tid);
      setThread(detail);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 4000); };

  const addMailbox = useCallback(async () => {
    if (!mbName.trim() || !mbEmail.trim()) return;
    try {
      await emailIntelApi.createMailbox({
        name: mbName.trim(),
        emailAddress: mbEmail.trim(),
        smtpHost: mbHost.trim() || null,
        smtpPort: mbPort.trim() ? Number(mbPort) : null,
        username: mbUser.trim() || null,
        password: mbPass || null,
      });
      setMbName(""); setMbEmail(""); setMbHost(""); setMbPort(""); setMbUser(""); setMbPass("");
      setShowAdd(false);
      flash("Mailbox added.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [mbName, mbEmail, mbHost, mbPort, mbUser, mbPass, load]);

  const compose = useCallback(async () => {
    const mailbox = mailboxes[0];
    if (!mailbox || !coTo.trim() || !coBody.trim()) return;
    try {
      await emailIntelApi.createMessage({
        mailboxId: mailbox.id,
        direction: "outbound",
        fromAddress: mailbox.emailAddress,
        to: coTo.split(",").map((s) => s.trim()).filter(Boolean),
        subject: coSubject.trim() || "(no subject)",
        bodyText: coBody.trim(),
      });
      setCoTo(""); setCoSubject(""); setCoBody("");
      setShowCompose(false);
      flash("Message queued in the outbox.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [mailboxes, coTo, coSubject, coBody, load]);

  const sendOutbox = useCallback(async (id: string) => {
    setSendingId(id);
    try {
      const res = await emailIntelApi.sendMessage(id);
      if (res.sent) flash(`Delivered via SMTP (${res.reason}).`);
      else flash(`Not sent: ${res.reason}${res.error ? ` — ${res.error}` : ""}.`);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSendingId(null); }
  }, [load]);

  const markRead = useCallback(async (msg: EiMessage) => {
    try {
      await emailIntelApi.updateMessage(msg.id, { isRead: !msg.isRead });
      if (thread) openThread(thread.threadId);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [thread, openThread, load]);

  const generateDraft = useCallback(async () => {
    if (!draftCtx.trim()) return;
    setDrafting(true);
    try {
      const d = await emailIntelApi.draft({ context: draftCtx.trim(), tone: draftTone, length: draftLen });
      setDraft(d);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setDrafting(false); }
  }, [draftCtx, draftTone, draftLen]);

  const outbox = useMemo(() => messages.filter((m) => m.outboxStatus === "queued" || m.outboxStatus === "failed"), [messages]);
  const counts = rollup?.counts;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Email Intelligence</h1>
          <p className="text-sm text-text-muted">
            Mailboxes, threaded conversations, outbox + SMTP delivery, AI drafting — Session 91. All numbers are computed from stored records.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setShowAdd(true); setShowCompose(false); }}>
            <PlusCircle className="w-4 h-4 mr-1" /> Mailbox
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowCompose(true); setShowAdd(false); }} disabled={mailboxes.length === 0}>
            <PenLine className="w-4 h-4 mr-1" /> Compose
          </Button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      {/* Quick-create forms */}
      {showAdd ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Mailbox name" value={mbName} onChange={(e) => setMbName(e.target.value)} />
              <Input placeholder="Email address" value={mbEmail} onChange={(e) => setMbEmail(e.target.value)} />
              <Input placeholder="SMTP host (e.g. smtp.example.com)" value={mbHost} onChange={(e) => setMbHost(e.target.value)} />
              <Input placeholder="SMTP port (e.g. 587)" value={mbPort} onChange={(e) => setMbPort(e.target.value)} />
              <Input placeholder="Username (optional)" value={mbUser} onChange={(e) => setMbUser(e.target.value)} />
              <Input placeholder="Password (optional, encrypted at rest)" type="password" value={mbPass} onChange={(e) => setMbPass(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={addMailbox} disabled={!mbName.trim() || !mbEmail.trim()}>Add mailbox</Button>
              <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showCompose ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="To (comma separated)" value={coTo} onChange={(e) => setCoTo(e.target.value)} />
              <Input placeholder="Subject" value={coSubject} onChange={(e) => setCoSubject(e.target.value)} />
            </div>
            <Textarea placeholder="Body" value={coBody} onChange={(e) => setCoBody(e.target.value)} rows={4} />
            <div className="flex gap-2">
              <Button onClick={compose} disabled={!coTo.trim() || !coBody.trim()}>Queue in outbox</Button>
              <Button variant="ghost" onClick={() => setShowCompose(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Stat icon={<Inbox className="w-5 h-5" />} label="Mailboxes" value={String(counts?.mailboxes ?? 0)} />
        <Stat icon={<Mail className="w-5 h-5" />} label="Messages" value={String(counts?.messages ?? 0)} sub={`${counts?.unread ?? 0} unread`} />
        <Stat icon={<RefreshCw className="w-5 h-5" />} label="Threads" value={String(counts?.threads ?? 0)} />
        <Stat icon={<Send className="w-5 h-5" />} label="Outbox" value={String(counts?.queued ?? 0)} sub={`${counts?.sent ?? 0} sent · ${counts?.failed ?? 0} failed`} />
        <Stat icon={<Mail className="w-5 h-5" />} label="Last 7 days" value={String(rollup?.last7dMessages ?? 0)} />
        <Stat icon={<CheckCircle2 className="w-5 h-5" />} label="Avg response" value={fmtDur(rollup?.avgResponseMs ?? null)} />
        <Stat icon={<Sparkles className="w-5 h-5" />} label="Top sender" value={rollup?.topSenders[0]?.email ?? "—"} />
        <Stat icon={<AlertTriangle className="w-5 h-5" />} label="Open threads" value={String(rollup?.openThreads.length ?? 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Threads */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Threads</CardTitle>
            <CardDescription>Conversations grouped by reply chain and subject.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {threads.map((t) => (
                <button
                  key={t.threadId}
                  onClick={() => openThread(t.threadId)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                    thread?.threadId === t.threadId ? "border-azure/40 bg-azure/10" : "border-white/5 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text-bright truncate">{t.subject}</span>
                    {t.unreadCount > 0 ? <Badge variant="azure">{t.unreadCount}</Badge> : null}
                  </div>
                  <div className="text-xs text-text-muted truncate">{t.participants.slice(0, 3).join(", ")}</div>
                  <div className="text-xs text-text-muted">{t.messageCount} msg · {new Date(t.lastActivityAt).toLocaleString()}</div>
                </button>
              ))}
              {threads.length === 0 ? <p className="text-sm text-text-muted">No threads yet.</p> : null}
            </div>
          </CardContent>
        </Card>

        {/* Thread detail */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">{thread ? thread.subject : "Thread detail"}</CardTitle>
            <CardDescription>
              {thread
                ? `${thread.participants.join(", ")} · ${thread.messageCount} message(s)`
                : "Select a thread to read messages, summary and triage."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {thread ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={thread.triage.label === "urgent" ? "danger" : thread.triage.label === "needs_reply" ? "amber" : "slate"}>
                    Triage: {thread.triage.label} ({thread.triage.urgencyScore}/100, {thread.triage.triageKind})
                  </Badge>
                  <Badge variant="outline">Summary: {thread.summary.summaryKind}</Badge>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-text-main">{thread.summary.summary}</div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {thread.messages.map((m) => (
                    <div key={m.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-text-bright">
                          {m.fromName ? `${m.fromName} ` : ""}{m.fromAddress}
                          <span className="ml-2 text-xs text-text-muted">{m.direction}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-muted">{new Date(m.receivedAt).toLocaleString()}</span>
                          <Button size="sm" variant="ghost" onClick={() => markRead(m)}>
                            {m.isRead ? "Mark unread" : "Mark read"}
                          </Button>
                        </div>
                      </div>
                      <div className="text-sm text-text-main whitespace-pre-wrap mt-1">{m.bodyText.slice(0, 1200)}</div>
                      {m.outboxStatus !== "none" ? (
                        <div className="text-xs text-text-muted mt-1">
                          Outbox: {m.outboxStatus}
                          {m.smtpResponse ? ` · ${m.smtpResponse}` : ""}
                          {m.outboxError ? ` · ${m.outboxError}` : ""}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-text-muted">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Outbox + AI draft */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Outbox</CardTitle>
            <CardDescription>Queued outbound messages — send delivers via the real SMTP connector.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {outbox.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-text-bright truncate">{m.subject}</div>
                    <div className="text-xs text-text-muted truncate">to {m.to.join(", ")}</div>
                    {m.outboxError ? <div className="text-xs text-crimson truncate">{m.outboxError}</div> : null}
                  </div>
                  <Button size="sm" variant="outline" disabled={sendingId === m.id} onClick={() => sendOutbox(m.id)}>
                    {sendingId === m.id ? "Sending…" : "Send"}
                  </Button>
                </div>
              ))}
              {outbox.length === 0 ? <p className="text-sm text-text-muted">Outbox empty.</p> : null}
              {mailboxes.length > 0 && outbox.length > 0 && !mailboxes[0]?.smtpHost ? (
                <p className="text-xs text-amber">No SMTP host configured — sends will report SMTP_NOT_CONFIGURED (honest).</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">AI draft</CardTitle>
            <CardDescription>Generate an email draft via the provider registry (real model when configured).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea placeholder="Context — what the email should say…" value={draftCtx} onChange={(e) => setDraftCtx(e.target.value)} rows={4} />
            <div className="grid grid-cols-2 gap-2">
              <Select value={draftTone} onChange={(e) => setDraftTone(e.target.value)}>
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="formal">Formal</option>
                <option value="concise">Concise</option>
              </Select>
              <Select value={draftLen} onChange={(e) => setDraftLen(e.target.value as "short" | "medium" | "long")}>
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </Select>
            </div>
            <Button onClick={generateDraft} disabled={!draftCtx.trim() || drafting}>
              <Sparkles className="w-4 h-4 mr-1" /> {drafting ? "Drafting…" : "Generate draft"}
            </Button>
            {draft ? (
              <div className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 space-y-2">
                {draft.modelSource === "echo-demo" ? (
                  <div className="rounded bg-amber/10 border border-amber/30 px-3 py-2 text-xs text-amber">
                    DEMO RESPONSE — no real AI model configured (provider: {draft.provider}). Set OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY / OLLAMA_BASE_URL for real drafts.
                  </div>
                ) : null}
                <div className="text-sm font-semibold text-text-bright">{draft.subject}</div>
                <div className="text-sm text-text-main whitespace-pre-wrap">{draft.body}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Mailboxes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mailboxes</CardTitle>
          <CardDescription>Connected mail accounts — credentials are encrypted at rest, never returned.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {mailboxes.map((m) => {
              const badge = statusBadge(m.status);
              return (
                <div key={m.id} className="rounded-lg border border-white/5 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text-bright truncate">{m.name}</span>
                    <Badge variant={badge.cls}>{badge.label}</Badge>
                  </div>
                  <div className="text-xs text-text-muted truncate">{m.emailAddress} · {m.provider}</div>
                  <div className="text-xs text-text-muted">
                    SMTP: {m.smtpHost ? `${m.smtpHost}:${m.smtpPort}` : "not configured"}
                    {m.hasCredentials ? " · creds ✓" : ""}
                  </div>
                  {m.error ? <div className="text-xs text-amber truncate">{m.error}</div> : null}
                </div>
              );
            })}
            {mailboxes.length === 0 ? <p className="text-sm text-text-muted">No mailboxes yet — add one to start.</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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
