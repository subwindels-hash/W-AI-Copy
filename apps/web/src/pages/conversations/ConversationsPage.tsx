/**
 * Session 112 — Conversation Operations console.
 *
 * ChatPage stays the place you talk. This page is the place you *administer*
 * threads: who is in them, what is unread, what a thread actually cost, where
 * a phrase was said, and how to withdraw something that should not have been
 * posted.
 *
 * Every number rendered here is a measurement of stored rows, and the page says
 * so where it matters:
 *   - an unread badge shows its basis ("never marked read" vs a timestamp);
 *   - usage counters that no message recorded render as "not recorded", never 0;
 *   - search results are labelled as case-insensitive substring matches;
 *   - the digest carries its non-AI disclaimer verbatim.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3, FileText, Inbox, MessagesSquare, RefreshCw, Search, Sparkles,
  Trash2, Undo2, UserPlus, Users,
} from "lucide-react";
import { chatApi, type Conversation } from "@/lib/chat";
import {
  conversationsApi,
  type ConvDeletedConversation,
  type ConvDigest,
  type ConvParticipant,
  type ConvReadState,
  type ConvSearchResult,
  type ConvStats,
  type ConvTranscript,
  type ConvUnreadSummary,
} from "@/lib/conversations";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg border border-azure/20 bg-azure/10 p-2 text-azure">{icon}</div>
        <div>
          <div className="text-2xl font-black text-text-bright">{value}</div>
          <div className="text-xs text-text-muted">{label}</div>
          {detail ? <div className="text-[11px] text-text-muted">{detail}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Renders a counter that may legitimately be unknown. Never invents a zero. */
function Measured({ value, suffix }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-text-muted italic">not recorded</span>;
  return <span className="text-text-bright">{value.toLocaleString()}{suffix ?? ""}</span>;
}

export function ConversationsPage() {
  const user = useAuthStore((state) => state.user);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unread, setUnread] = useState<ConvUnreadSummary | null>(null);
  const [deleted, setDeleted] = useState<ConvDeletedConversation[]>([]);
  const [participants, setParticipants] = useState<ConvParticipant[]>([]);
  const [readState, setReadState] = useState<ConvReadState | null>(null);
  const [stats, setStats] = useState<ConvStats | null>(null);
  const [digest, setDigest] = useState<ConvDigest | null>(null);
  const [transcript, setTranscript] = useState<ConvTranscript | null>(null);
  const [results, setResults] = useState<ConvSearchResult | null>(null);

  const [query, setQuery] = useState("");
  const [participantRef, setParticipantRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(null), 3000); };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [list, unreadSummary, deletedPage] = await Promise.all([
        chatApi.listConversations(),
        conversationsApi.unread(50),
        conversationsApi.deleted(1, 20),
      ]);
      setConversations(list.items ?? []);
      setUnread(unreadSummary);
      setDeleted(deletedPage.items ?? []);
      setError(null);
      setSelectedId((current) => current ?? list.items?.[0]?.id ?? null);
    } catch (e) { fail(e); } finally { setLoading(false); }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try {
      const [people, read, measured, extract] = await Promise.all([
        conversationsApi.participants(id),
        conversationsApi.readState(id),
        conversationsApi.stats(id),
        conversationsApi.digest(id, 8),
      ]);
      setParticipants(people);
      setReadState(read);
      setStats(measured);
      setDigest(extract);
      setTranscript(null);
      setError(null);
    } catch (e) { fail(e); }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => { if (selectedId) void loadThread(selectedId); }, [selectedId, loadThread]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  async function runSearch() {
    if (query.trim().length < 2) { setError("Enter at least two characters to search message bodies."); return; }
    try { setResults(await conversationsApi.search({ q: query.trim(), perPage: 20 })); setError(null); }
    catch (e) { fail(e); }
  }

  async function addParticipant() {
    if (!selectedId || !participantRef.trim()) return;
    const ref = participantRef.trim();
    try {
      // Agent ids and user ids are both cuids; the caller picks which by prefix.
      const input = ref.startsWith("agent:") ? { agentId: ref.slice(6) } : { userId: ref.replace(/^user:/, "") };
      await conversationsApi.addParticipant(selectedId, input);
      setParticipantRef("");
      flash("Participant added.");
      await loadThread(selectedId);
    } catch (e) { fail(e); }
  }

  async function removeParticipant(participant: ConvParticipant) {
    if (!selectedId) return;
    try {
      await conversationsApi.removeParticipant(selectedId, participant.id);
      flash("Participant removed.");
      await loadThread(selectedId);
    } catch (e) { fail(e); }
  }

  async function markRead() {
    if (!selectedId) return;
    try {
      setReadState(await conversationsApi.markRead(selectedId));
      flash("Marked read.");
      setUnread(await conversationsApi.unread(50));
    } catch (e) { fail(e); }
  }

  async function loadTranscript(format: "json" | "markdown") {
    if (!selectedId) return;
    try { setTranscript(await conversationsApi.transcript(selectedId, format)); setError(null); }
    catch (e) { fail(e); }
  }

  async function restore(id: string) {
    try { await conversationsApi.restore(id); flash("Conversation restored."); await loadOverview(); }
    catch (e) { fail(e); }
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-text-bright">
            <MessagesSquare className="h-6 w-6 text-azure" /> Conversation Operations
          </h1>
          <p className="text-sm text-text-muted">
            Participants, unread state, measured usage, message search and recovery — all read from stored rows.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void loadOverview()} loading={loading}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </header>

      {error ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-2 text-sm text-crimson">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-2 text-sm text-emerald">{notice}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Inbox className="h-5 w-5" />} label="Unread messages"
          value={unread ? String(unread.totalUnread) : "—"}
          detail={unread ? `${unread.conversationsWithUnread} of ${unread.inspectedConversations} threads inspected${unread.truncated ? " (capped)" : ""}` : undefined} />
        <Stat icon={<MessagesSquare className="h-5 w-5" />} label="Conversations" value={String(conversations.length)} />
        <Stat icon={<Users className="h-5 w-5" />} label="Participants in thread"
          value={participants.length ? String(participants.length) : "—"}
          detail={stats ? `${stats.humanParticipants} human · ${stats.agentParticipants} agent` : undefined} />
        <Stat icon={<Trash2 className="h-5 w-5" />} label="Restorable (soft-deleted)" value={String(deleted.length)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Threads</CardTitle>
            <CardDescription>Unread counts state how they were derived.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {conversations.length === 0 ? (
              <p className="text-sm text-text-muted">No conversations yet.</p>
            ) : conversations.map((c) => {
              const item = unread?.items.find((i) => i.conversationId === c.id);
              return (
                <button key={c.id} onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                    c.id === selectedId ? "border-azure/40 bg-azure/10" : "border-white/10 hover:bg-white/5"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-text-bright">{c.title}</span>
                    {item ? (
                      <Badge variant="azure" title={item.basis === "never_marked_read" ? "Never marked read" : `Since ${item.lastReadAt}`}>
                        {item.unreadCount}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-text-muted">{c.messageCount ?? 0} message(s)</div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Participants</CardTitle>
              <CardDescription>
                {selected ? selected.title : "Select a thread"} — the creator cannot be removed from their own thread.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2">
                  <div>
                    <div className="text-sm text-text-bright">{p.displayName ?? p.userId ?? p.agentId}</div>
                    <div className="text-[11px] text-text-muted">
                      {p.kind}{p.isCreator ? " · creator" : ""} · {p.lastReadAt ? `read ${new Date(p.lastReadAt).toLocaleString()}` : "never marked read"}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" disabled={p.isCreator} onClick={() => void removeParticipant(p)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input placeholder="user:<id> or agent:<id>" value={participantRef}
                  onChange={(e) => setParticipantRef(e.target.value)} />
                <Button size="sm" onClick={() => void addParticipant()} disabled={!selectedId}>
                  <UserPlus className="mr-2 h-4 w-4" /> Add
                </Button>
              </div>
              {readState ? (
                <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-xs text-text-muted">
                  <span>
                    {readState.unreadCount} unread for you · basis:{" "}
                    <span className="text-text-bright">{readState.basis.replace(/_/g, " ")}</span> · own messages excluded
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => void markRead()}>Mark read</Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Measured usage</CardTitle>
              <CardDescription>
                Counted from stored messages. Counters no message recorded are shown as “not recorded”.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats ? (
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>Messages: <span className="text-text-bright">{stats.messageCount}</span></div>
                  <div>Edited: <span className="text-text-bright">{stats.editedMessages}</span></div>
                  <div>Redacted: <span className="text-text-bright">{stats.redactedMessages}</span></div>
                  <div>Tokens in: <Measured value={stats.usage.tokensIn} /></div>
                  <div>Tokens out: <Measured value={stats.usage.tokensOut} /></div>
                  <div>Cost (µ): <Measured value={stats.usage.costMicros} /></div>
                  <div>Avg reply latency: <Measured value={stats.usage.avgAssistantDurationMs} suffix="ms" /></div>
                  <div className="sm:col-span-2 text-[11px] text-text-muted">
                    {stats.usage.messagesWithUsage} of {stats.messageCount} message(s) recorded usage.
                  </div>
                </div>
              ) : <p className="text-sm text-text-muted">Select a thread.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Extractive digest</CardTitle>
              <CardDescription>Quoted excerpts and raw term counts — no model is called.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {digest ? (
                <>
                  <Badge variant="slate">{digest.kind.replace(/_/g, " ")}</Badge>
                  <p className="text-[11px] text-text-muted">{digest.disclaimer}</p>
                  <div className="text-sm text-text-main"><span className="text-text-muted">Opening: </span>{digest.openingExcerpt ?? "—"}</div>
                  <div className="text-sm text-text-main"><span className="text-text-muted">Latest: </span>{digest.latestExcerpt ?? "—"}</div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {digest.keywords.map((k) => <Badge key={k.term} variant="secondary">{k.term} · {k.occurrences}</Badge>)}
                  </div>
                  {digest.skippedMessages > 0 ? (
                    <p className="text-[11px] text-text-muted">{digest.skippedMessages} message(s) skipped (redacted or empty).</p>
                  ) : null}
                </>
              ) : <p className="text-sm text-text-muted">Select a thread.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Search className="h-4 w-4" /> Message search</CardTitle>
              <CardDescription>Case-insensitive substring match across threads you can read. Not semantic, not ranked.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="Search message bodies…" value={query} onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }} />
                <Button size="sm" onClick={() => void runSearch()}>Search</Button>
              </div>
              {results ? (
                <>
                  <div className="text-[11px] text-text-muted">
                    {results.pagination.total} match(es) across {results.searchedConversations} thread(s) · {results.matchKind.replace(/_/g, " ")}
                  </div>
                  {results.hits.map((h) => (
                    <button key={h.messageId} onClick={() => setSelectedId(h.conversationId)}
                      className="block w-full rounded-lg border border-white/10 px-3 py-2 text-left hover:bg-white/5">
                      <div className="text-xs text-text-muted">{h.conversationTitle} · {h.role} · offset {h.matchOffset}</div>
                      <div className="text-sm text-text-main">{h.excerptTruncated ? "…" : ""}{h.excerpt}{h.excerptTruncated ? "…" : ""}</div>
                    </button>
                  ))}
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Transcript export</CardTitle>
              <CardDescription>Redacted bodies export as “[redacted]”, never as their original text.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={!selectedId} onClick={() => void loadTranscript("json")}>JSON</Button>
                <Button size="sm" variant="secondary" disabled={!selectedId} onClick={() => void loadTranscript("markdown")}>Markdown</Button>
              </div>
              {transcript ? (
                <pre className="max-h-64 overflow-auto rounded-lg border border-white/10 bg-bg-deep/60 p-3 text-[11px] text-text-main">
                  {transcript.markdown ?? JSON.stringify(transcript.entries, null, 2)}
                </pre>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Undo2 className="h-4 w-4" /> Recover deleted</CardTitle>
              <CardDescription>Deleting a conversation is a soft delete; its creator can restore it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {deleted.length === 0 ? <p className="text-sm text-text-muted">Nothing deleted.</p> : deleted.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2">
                  <div>
                    <div className="text-sm text-text-bright">{d.title}</div>
                    <div className="text-[11px] text-text-muted">
                      deleted {new Date(d.deletedAt).toLocaleString()} · {d.messageCount} message(s)
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" disabled={!d.restorableByCaller} onClick={() => void restore(d.id)}>
                    Restore
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <p className="text-[11px] text-text-muted">
            Signed in as {user?.email ?? "unknown"} — every listing above is scoped to your organization and to
            threads you participate in.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ConversationsPage;
