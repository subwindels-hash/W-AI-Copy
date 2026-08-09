/**
 * Admin Contact Center dashboard.
 *
 * Staff view of all contact/support requests: overview metrics, filtering,
 * assignment, status transitions, and responding (public or internal note).
 */
import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, RefreshCw, Search, Send } from "lucide-react";
import { contactApi, type ContactDashboardRow, type ContactRequestRow } from "@/lib/contact";
import { CONTACT_CATEGORY_LABELS } from "@windels/shared/contactCenter";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { toast } from "@/lib/toast";

const STATUSES = ["new","ai_handling","awaiting_human","assigned","in_progress","awaiting_customer","resolved","closed"];
const statusVariant: Record<string, "azure"|"success"|"danger"|"slate"|"warning"> = {
  new: "azure", ai_handling: "azure", awaiting_human: "warning", assigned: "warning",
  in_progress: "warning", awaiting_customer: "slate", resolved: "success", closed: "slate",
};

function Stat({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><div className="text-xs uppercase tracking-wide text-text-muted">{label}</div><div className="mt-1 text-2xl font-semibold text-text-bright">{value}</div></CardContent></Card>;
}

export function ContactCenterPage() {
  const [dashboard, setDashboard] = useState<ContactDashboardRow | null>(null);
  const [requests, setRequests] = useState<ContactRequestRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<ContactRequestRow | null>(null);
  const [detail, setDetail] = useState<{ request: ContactRequestRow; messages: any[]; history: any[] } | null>(null);
  const [respondText, setRespondText] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, r] = await Promise.all([
        contactApi.adminDashboard(),
        contactApi.adminList({ q: q || undefined, status: status || undefined, perPage: 100 }),
      ]);
      setDashboard(d); setRequests(r.items); setError(null);
    } catch (e: any) { setError(e?.message ?? "Failed to load contact center."); }
    finally { setLoading(false); }
  }, [q, status]);

  useEffect(() => { void load(); }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    try { setDetail(await contactApi.adminRequest(id)); }
    catch (e: any) { toast.error(e?.message ?? "Failed to load request."); }
  }, []);
  useEffect(() => { if (selected) void loadDetail(selected.id); }, [selected, loadDetail]);

  async function assign(id: string) {
    const staffId = window.prompt("Assignee user id (leave blank to unassign):") ?? "";
    try { await contactApi.adminAssign(id, staffId ? { userId: staffId } : {}); toast.success("Request updated."); await load(); if (selected) void loadDetail(id); }
    catch (e: any) { toast.error(e?.message); }
  }
  async function transition(id: string, to: string) {
    try { await contactApi.adminTransition(id, to); toast.success(`Moved to ${to.replace(/_/g, " ")}.`); await load(); if (selected) void loadDetail(id); }
    catch (e: any) { toast.error(e?.message); }
  }
  async function respond(id: string) {
    if (!respondText.trim()) return;
    try { await contactApi.adminRespond(id, { body: respondText.trim(), isInternal: false }); setRespondText(""); toast.success("Response sent."); await load(); void loadDetail(id); }
    catch (e: any) { toast.error(e?.message); }
  }
  async function addNote(id: string) {
    if (!internalNote.trim()) return;
    try { await contactApi.adminRespond(id, { body: internalNote.trim(), isInternal: true }); setInternalNote(""); toast.success("Internal note added."); void loadDetail(id); }
    catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-7 w-7 text-azure" />
            <h1 className="text-2xl font-black text-text-bright">Contact Center</h1>
            <Badge variant="azure">Staff</Badge>
          </div>
          <p className="mt-1 text-sm text-text-muted">Manage contact and support requests across WINDELS AI OS.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4"/>Refresh</Button>
      </header>

      {error ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{error}</div> : null}

      {dashboard && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Total" value={String(dashboard.total)} />
          <Stat label="AI-handled" value={String(dashboard.aiHandled)} />
          <Stat label="Human-handled" value={String(dashboard.humanHandled)} />
          <Stat label="Avg resolution" value={dashboard.avgResolutionHours === null ? "—" : `${dashboard.avgResolutionHours}h`} />
          <Stat label="By country" value={String(dashboard.byCountry.length)} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* List */}
        <Card>
          <CardHeader><CardTitle>Requests</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-text-muted"/>
                <Input className="pl-8" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Select className="w-32" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </Select>
            </div>
            {requests.length === 0 && <p className="text-sm text-text-muted py-6 text-center">No requests.</p>}
            {requests.map((r) => (
              <button key={r.id} onClick={() => setSelected(r)}
                className={`w-full rounded-lg border px-3 py-2 text-left ${selected?.id === r.id ? "border-azure/40 bg-azure/10" : "border-white/10 hover:bg-white/5"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-text-bright">{r.subject}</span>
                  <Badge variant={statusVariant[r.status] ?? "slate"}>{r.status.replace(/_/g, " ")}</Badge>
                </div>
                <div className="text-[11px] text-text-muted">{r.name} · {r.email} · {CONTACT_CATEGORY_LABELS[r.category] ?? r.category}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Detail */}
        <Card>
          <CardHeader>
            <CardTitle>{detail?.request.subject ?? "Select a request"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!detail ? (
              <p className="text-sm text-text-muted">Select a request to view and manage it.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{detail.request.requestNumber}</Badge>
                  <Badge variant={statusVariant[detail.request.status] ?? "slate"}>{detail.request.status.replace(/_/g, " ")}</Badge>
                  <Badge variant={detail.request.priority === "urgent" ? "danger" : "secondary"}>{detail.request.priority}</Badge>
                  <Badge variant="secondary">{detail.request.department} dept</Badge>
                </div>
                <div className="text-sm text-text-muted">
                  {detail.request.name} · {detail.request.email}
                  {detail.request.phone ? ` · ${detail.request.phone}` : ""}
                  {detail.request.country ? ` · ${detail.request.country}` : ""}
                  {detail.request.company ? ` · ${detail.request.company}` : ""}
                </div>

                <div className="rounded-lg border border-white/10 bg-bg-deep/40 p-3 text-sm text-text-main whitespace-pre-wrap">
                  {detail.request.message}
                </div>

                {/* Conversation */}
                <div className="space-y-2">
                  {detail.messages.filter((m) => !m.isInternal).map((m) => (
                    <div key={m.id} className="rounded-lg border border-white/10 px-3 py-2 text-sm">
                      <div className="text-[11px] text-text-muted">{m.authorName ?? m.authorType} · {new Date(m.createdAt).toLocaleString()}</div>
                      <div className="text-text-main whitespace-pre-wrap">{m.body}</div>
                    </div>
                  ))}
                </div>

                {/* Respond */}
                <div className="space-y-2">
                  <Textarea rows={3} placeholder="Public reply to customer…" value={respondText} onChange={(e) => setRespondText(e.target.value)} />
                  <Button size="sm" onClick={() => void respond(detail.request.id)}><Send className="h-3.5 w-3.5"/>Send reply</Button>
                </div>
                {/* Internal note */}
                <div className="space-y-2 border-t border-white/5 pt-3">
                  <Textarea rows={2} placeholder="Internal note (staff only)…" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
                  <Button size="sm" variant="secondary" onClick={() => void addNote(detail.request.id)}>Add internal note</Button>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 border-t border-white/5 pt-3">
                  <Button size="sm" variant="secondary" onClick={() => void assign(detail.request.id)}>Assign</Button>
                  {STATUSES.filter((s) => s !== detail.request.status).slice(0, 6).map((s) => (
                    <Button key={s} size="sm" variant="outline" onClick={() => void transition(detail.request.id, s)}>
                      → {s.replace(/_/g, " ")}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
