/**
 * Session 95 — Enterprise Helpdesk dashboard.
 *
 * Tickets with an honest lifecycle, deterministic SLA tracking, a comment
 * timeline (with internal staff notes), assignment, and a rollup computed
 * from stored records. Fresh orgs start empty; SLA compliance and resolution
 * times are measured from real timestamps.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { helpdeskApi } from "@/lib/helpdesk";
import type { HdRollup, HdTicket, HdTicketDetail, HdPriority, HdTicketStatus } from "@/lib/helpdesk";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { LifeBuoy, Clock, CheckCircle2, AlertTriangle, UserX, PlusCircle, Send, ChevronRight, Lock } from "lucide-react";

const PRIORITY_BADGE: Record<HdPriority, "slate" | "azure" | "amber" | "danger"> = {
  low: "slate", medium: "azure", high: "amber", urgent: "danger",
};
const STATUS_BADGE: Record<HdTicketStatus, "slate" | "azure" | "amber" | "emerald" | "outline"> = {
  new: "slate", open: "azure", pending: "amber", resolved: "emerald", closed: "outline",
};

const NEXT_STATUS: Record<HdTicketStatus, HdTicketStatus | null> = {
  new: "open", open: "pending", pending: "resolved", resolved: "closed", closed: null,
};

function fmtHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
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

export function HelpdeskPage() {
  const [rollup, setRollup] = useState<HdRollup | null>(null);
  const [tickets, setTickets] = useState<HdTicket[]>([]);
  const [selected, setSelected] = useState<HdTicketDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [nSubject, setNSubject] = useState("");
  const [nRequester, setNRequester] = useState("");
  const [nEmail, setNEmail] = useState("");
  const [nPriority, setNPriority] = useState<HdPriority>("medium");
  const [nDesc, setNDesc] = useState("");

  const [commentBody, setCommentBody] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentInternal, setCommentInternal] = useState(false);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const params: Record<string, unknown> = {};
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (q) params.q = q;
      const [r, t] = await Promise.all([helpdeskApi.rollup(), helpdeskApi.listTickets(params)]);
      setRollup(r); setTickets(t);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [filterStatus, filterPriority, q]);

  useEffect(() => { void load(); }, [load]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 4000); };

  const openTicket = useCallback(async (id: string) => {
    try {
      setSelected(await helpdeskApi.getTicket(id));
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);

  const create = useCallback(async () => {
    if (!nSubject.trim() || !nRequester.trim()) return;
    try {
      await helpdeskApi.createTicket({
        subject: nSubject.trim(), requesterName: nRequester.trim(),
        requesterEmail: nEmail.trim() || null, priority: nPriority,
        description: nDesc.trim() || null,
      });
      setNSubject(""); setNRequester(""); setNEmail(""); setNDesc("");
      setShowNew(false);
      flash("Ticket created.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [nSubject, nRequester, nEmail, nPriority, nDesc, load]);

  const advance = useCallback(async (t: HdTicket) => {
    const next = NEXT_STATUS[t.status];
    if (!next) return;
    try {
      await helpdeskApi.transitionTicket(t.id, next);
      flash(`${t.number} → ${next}.`);
      if (selected?.id === t.id) await openTicket(t.id);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [selected, openTicket, load]);

  const addComment = useCallback(async () => {
    if (!selected || !commentBody.trim() || !commentAuthor.trim()) return;
    try {
      await helpdeskApi.createComment(selected.id, {
        authorName: commentAuthor.trim(), body: commentBody.trim(), internal: commentInternal,
      });
      setCommentBody("");
      flash(commentInternal ? "Internal note added." : "Comment added.");
      await openTicket(selected.id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [selected, commentBody, commentAuthor, commentInternal, openTicket]);

  const isOverdue = useMemo(() => {
    const now = Date.now();
    return (t: HdTicket) => t.slaDueAt && new Date(t.slaDueAt).getTime() < now;
  }, [tickets]);

  const c = rollup?.counts;
  const openTickets = tickets.filter((t) => ["new", "open", "pending"].includes(t.status));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Helpdesk</h1>
          <p className="text-sm text-text-muted">
            Customer support tickets — Session 95. SLA due dates are computed from priority targets; compliance is measured from real timestamps.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowNew((v) => !v)}>
          <PlusCircle className="w-4 h-4 mr-1" /> New ticket
        </Button>
      </div>

      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      {showNew ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Subject" value={nSubject} onChange={(e) => setNSubject(e.target.value)} />
              <Select value={nPriority} onChange={(e) => setNPriority(e.target.value as HdPriority)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
              <Input placeholder="Requester name" value={nRequester} onChange={(e) => setNRequester(e.target.value)} />
              <Input placeholder="Requester email (optional)" value={nEmail} onChange={(e) => setNEmail(e.target.value)} />
            </div>
            <Textarea placeholder="Description (optional)" value={nDesc} onChange={(e) => setNDesc(e.target.value)} rows={3} />
            <div className="flex gap-2">
              <Button onClick={create} disabled={!nSubject.trim() || !nRequester.trim()}>Create ticket</Button>
              <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Stat icon={<LifeBuoy className="w-5 h-5" />} label="Tickets" value={String(c?.tickets ?? 0)} />
        <Stat icon={<Clock className="w-5 h-5" />} label="Open" value={String(c?.open ?? 0)} />
        <Stat icon={<CheckCircle2 className="w-5 h-5" />} label="Resolved" value={String(c?.resolved ?? 0)} />
        <Stat icon={<AlertTriangle className="w-5 h-5" />} label="Overdue" value={String(c?.overdue ?? 0)} />
        <Stat icon={<UserX className="w-5 h-5" />} label="Unassigned" value={String(c?.unassigned ?? 0)} />
        <Stat icon={<CheckCircle2 className="w-5 h-5" />} label="SLA compliance" value={rollup?.slaCompliancePct === null ? "—" : `${Math.round((rollup?.slaCompliancePct ?? 0) * 100)}%`} />
        <Stat icon={<Clock className="w-5 h-5" />} label="Avg resolution" value={fmtHours(rollup?.avgResolutionHours ?? null)} />
        <Stat icon={<LifeBuoy className="w-5 h-5" />} label="Top priority" value={rollup?.byPriority[0]?.priority ?? "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Ticket list */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Tickets</CardTitle>
            <CardDescription>Filters are server-side; SLA due dates are computed per priority.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All statuses</option>
                {["new", "open", "pending", "resolved", "closed"].map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                <option value="">All priorities</option>
                {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
              <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="space-y-2">
              {tickets.map((t) => {
                const overdue = isOverdue(t);
                return (
                  <div key={t.id} className={`rounded-lg border px-3 py-2 ${overdue ? "border-crimson/30 bg-crimson/5" : "border-white/5 bg-white/5"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => openTicket(t.id)} className="flex items-center gap-2 min-w-0 text-left hover:underline">
                        <span className="text-xs font-mono text-text-muted">{t.number}</span>
                        <span className="text-sm font-semibold text-text-bright truncate">{t.subject}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant={PRIORITY_BADGE[t.priority]}>{t.priority}</Badge>
                        <Badge variant={STATUS_BADGE[t.status]}>{t.status}</Badge>
                        {overdue ? <Badge variant="danger">SLA</Badge> : null}
                        <Button size="sm" variant="ghost" onClick={() => advance(t)} disabled={!NEXT_STATUS[t.status]}>Advance</Button>
                      </div>
                    </div>
                    <div className="text-xs text-text-muted">
                      {t.requesterName} · {t.channel} · SLA due {t.slaDueAt ? new Date(t.slaDueAt).toLocaleString() : "—"}
                      {t.assigneeId ? " · assigned" : " · unassigned"}
                    </div>
                  </div>
                );
              })}
              {tickets.length === 0 ? <p className="text-sm text-text-muted">No tickets match.</p> : null}
            </div>
          </CardContent>
        </Card>

        {/* Detail */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{selected ? `${selected.number} — ${selected.subject}` : "Ticket detail"}</CardTitle>
            <CardDescription>
              {selected ? `${selected.status} · ${selected.priority} · SLA due ${selected.slaDueAt ? new Date(selected.slaDueAt).toLocaleString() : "—"}` : "Select a ticket to view its timeline."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selected ? (
              <>
                <p className="text-sm text-text-main whitespace-pre-wrap">{selected.description ?? "No description."}</p>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {selected.comments.map((cm) => (
                    <div key={cm.id} className={`rounded-lg border px-3 py-2 text-sm ${cm.internal ? "border-amber/20 bg-amber/5" : "border-white/5 bg-white/5"}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text-bright">{cm.authorName}</span>
                        <span className="text-xs text-text-muted">{new Date(cm.createdAt).toLocaleString()}</span>
                        {cm.internal ? <Badge variant="amber"><Lock className="w-3 h-3 mr-1" />internal</Badge> : null}
                      </div>
                      <div className="text-text-main">{cm.body}</div>
                    </div>
                  ))}
                  {selected.comments.length === 0 ? <p className="text-xs text-text-muted">No comments yet.</p> : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Your name" value={commentAuthor} onChange={(e) => setCommentAuthor(e.target.value)} />
                  <label className="flex items-center gap-2 text-xs text-text-muted">
                    <input type="checkbox" checked={commentInternal} onChange={(e) => setCommentInternal(e.target.checked)} className="accent-azure" />
                    internal note
                  </label>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Add to timeline…" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} />
                  <Button onClick={addComment} disabled={!commentBody.trim() || !commentAuthor.trim()}><Send className="w-4 h-4 mr-1" /></Button>
                </div>
              </>
            ) : <p className="text-sm text-text-muted">—</p>}
          </CardContent>
        </Card>
      </div>

      {/* Open queue by priority */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Open queue by priority</CardTitle>
          <CardDescription>Live counts from the ticket store.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {(rollup?.byPriority ?? []).map((p) => (
              <div key={p.priority} className="rounded-lg border border-white/5 bg-white/5 p-3">
                <Badge variant={PRIORITY_BADGE[p.priority]}>{p.priority}</Badge>
                <div className="mt-1 text-2xl font-black text-text-bright">{p.count}</div>
                <div className="text-xs text-text-muted">tickets total</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
