/**
 * Session 115 — Lead pipeline console.
 *
 * Session 85's `LeadsPage` (search, results, collections, export) is untouched
 * and still lives at `/app/leads`. This page is everything that happens after a
 * lead is found, and it is deliberately built to avoid four comfortable lies:
 *
 *   - **"You have N leads."** Three records of the same shop are one business.
 *     The overview shows records held *and* distinct listings, and says how many
 *     duplicate groups are still unresolved.
 *   - **"These businesses have no phone number."** The contact columns are
 *     empty because Places text search never returned them. Coverage renders
 *     the API's own explanation next to the zero instead of leaving the reader
 *     to draw the obvious wrong conclusion.
 *   - **"Qualified" means verified.** It does not. The status legend says so in
 *     the API's words, on the screen where statuses are set.
 *   - **"Export looks fine."** The preview names the columns that will be empty
 *     and the cells the formula guard will rewrite, before the file downloads.
 *
 * Write controls that change many records at once (resolving duplicates,
 * deleting a collection) are hidden from non-administrators, because the API
 * refuses them and a button that always fails is worse than no button.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ClipboardList, Copy, Download, FileWarning, History, Layers,
  Loader2, RefreshCw, Search, ShieldAlert, StickyNote, UserCheck,
} from "lucide-react";
import {
  leadPipelineApi,
  LEAD_STATUS_LABELS,
  type LeadCoverageReport,
  type LeadDuplicateReport,
  type LeadExportPreview,
  type LeadList,
  type LeadNote,
  type LeadSearchHistory,
  type LeadStatus,
  type LeadSummary,
  type LeadWithPipeline,
} from "@/lib/leadDiscovery";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Tab = "overview" | "pipeline" | "duplicates" | "coverage" | "history";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "pipeline", label: "Pipeline" },
  { id: "duplicates", label: "Duplicates" },
  { id: "coverage", label: "Field coverage" },
  { id: "history", label: "Search log" },
];

/** Statuses an operator can set. `duplicate` is set only by the grouping pass. */
const SETTABLE: Array<Exclude<LeadStatus, "duplicate">> = [
  "new", "contacted", "qualified", "disqualified",
];

const STATUS_VARIANT: Record<LeadStatus, "slate" | "azure" | "emerald" | "crimson" | "amber"> = {
  new: "slate",
  contacted: "azure",
  qualified: "emerald",
  disqualified: "crimson",
  duplicate: "amber",
};

const when = (iso: string | null, fallback = "never") =>
  iso ? new Date(iso).toLocaleString() : fallback;

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-azure/20 bg-azure/5 p-3 text-xs leading-relaxed text-text-muted">
      {children}
    </div>
  );
}

function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: ReactNode; detail?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg border border-azure/20 bg-azure/10 p-2 text-azure">{icon}</div>
        <div className="min-w-0">
          <div className="truncate text-xl font-black text-text-bright">{value}</div>
          <div className="text-xs text-text-muted">{label}</div>
          {detail ? <div className="text-[11px] text-text-muted">{detail}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** A count that may legitimately mean "nothing was recorded", not "zero". */
function Recorded({ value, unit }: { value: number; unit: string }) {
  if (value === 0) return <span className="italic text-text-muted">none recorded</span>;
  return <span className="text-text-bright">{value.toLocaleString()} {unit}</span>;
}

export function LeadPipelinePage() {
  const user = useAuthStore((state) => state.user);
  const canAdminister = user?.role === "admin" || user?.role === "super_admin";

  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [summary, setSummary] = useState<LeadSummary | null>(null);
  const [list, setList] = useState<LeadList | null>(null);
  const [duplicates, setDuplicates] = useState<LeadDuplicateReport | null>(null);
  const [coverage, setCoverage] = useState<LeadCoverageReport | null>(null);
  const [history, setHistory] = useState<LeadSearchHistory | null>(null);

  const [statusFilter, setStatusFilter] = useState<"" | LeadStatus>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openLead, setOpenLead] = useState<LeadWithPipeline | null>(null);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [draftNote, setDraftNote] = useState("");
  const [preview, setPreview] = useState<LeadExportPreview | null>(null);

  const run = useCallback(async (action: string, fn: () => Promise<string | void>) => {
    setBusy(action); setErr(null); setNotice(null);
    try {
      const message = await fn();
      if (typeof message === "string") setNotice(message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const loadList = useCallback(async () => {
    const data = await leadPipelineApi.pipeline({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search.trim() ? { q: search.trim() } : {}),
      limit: 100,
    });
    setList(data);
  }, [statusFilter, search]);

  const refresh = useCallback(async () => {
    await run("refresh", async () => {
      const [s, d, c, h] = await Promise.all([
        leadPipelineApi.summary(),
        leadPipelineApi.duplicates(),
        leadPipelineApi.coverage(),
        leadPipelineApi.history(50),
      ]);
      setSummary(s); setDuplicates(d); setCoverage(c); setHistory(h);
      await loadList();
    });
  }, [run, loadList]);

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { void loadList().catch(() => {}); }, [loadList]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openDetail = (lead: LeadWithPipeline) =>
    run("detail", async () => {
      setOpenLead(lead);
      setNotes((await leadPipelineApi.notes(lead.id)).notes);
    });

  const setStatus = (lead: LeadWithPipeline, status: Exclude<LeadStatus, "duplicate">) =>
    run(`status:${lead.id}`, async () => {
      const updated = await leadPipelineApi.setStatus(lead.id, status);
      setOpenLead((cur) => (cur?.id === lead.id ? updated : cur));
      await loadList();
      return `${lead.name} is now ${status}. The provider's record is unchanged.`;
    });

  const emptySelection = selected.size === 0;

  const rows = list?.leads ?? [];
  const statusCounts = list?.statusCounts;

  const totals = useMemo(() => {
    if (!summary) return null;
    const inflated = summary.totalLeads - summary.distinctListings;
    return { inflated };
  }, [summary]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Lead pipeline</h1>
          <p className="max-w-3xl text-sm text-text-muted">
            What happens after discovery: status, ownership, notes, duplicate grouping and a
            safe export. To find new businesses, use{" "}
            <Link className="text-azure underline" to="/app/leads">Lead Discovery</Link>.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()} disabled={busy === "refresh"}>
          {busy === "refresh" ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          Refresh
        </Button>
      </header>

      {err ? (
        <div className="flex items-start gap-2 rounded-lg border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">
          <AlertTriangle size={16} className="mt-0.5" /> <span>{err}</span>
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald/30 bg-emerald/10 p-3 text-sm text-emerald">{notice}</div>
      ) : null}

      <nav className="flex flex-wrap gap-2 border-b border-white/5 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === t.id ? "bg-azure/15 text-azure" : "text-text-muted hover:text-text-bright"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── Overview ─────────────────────────────────────────────────── */}
      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={<ClipboardList size={18} />}
              label="Records held"
              value={summary ? summary.totalLeads.toLocaleString() : "—"}
              detail="Rows stored, including repeats of the same listing."
            />
            <Stat
              icon={<Layers size={18} />}
              label="Distinct listings"
              value={summary ? summary.distinctListings.toLocaleString() : "—"}
              detail={
                totals && totals.inflated > 0
                  ? `${totals.inflated.toLocaleString()} record(s) repeat a listing already held.`
                  : "Every record is a different provider listing."
              }
            />
            <Stat
              icon={<UserCheck size={18} />}
              label="Owned"
              value={summary ? `${summary.ownedLeads.toLocaleString()} / ${summary.totalLeads.toLocaleString()}` : "—"}
              detail={summary ? `${summary.unownedLeads.toLocaleString()} not taken by anyone.` : undefined}
            />
            <Stat
              icon={<Copy size={18} />}
              label="Unresolved duplicate groups"
              value={summary ? summary.unresolvedDuplicateGroups.toLocaleString() : "—"}
              detail="Groups whose repeats are not yet marked."
            />
          </div>

          {summary ? (
            <Card>
              <CardHeader>
                <CardTitle>Where the pipeline stands</CardTitle>
                <CardDescription>
                  Last recorded search: {summary.lastSearchQuery
                    ? <>“{summary.lastSearchQuery}” on {when(summary.lastSearchAt)}</>
                    : <span className="italic">no search has been recorded</span>}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(summary.statusCounts) as LeadStatus[]).map((status) => (
                    <Badge key={status} variant={STATUS_VARIANT[status]}>
                      {status}: {summary.statusCounts[status]}
                    </Badge>
                  ))}
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>Notes recorded: <Recorded value={summary.notesRecorded} unit="note(s)" /></div>
                  <div>Searches recorded: <Recorded value={summary.searchesRecorded} unit="search(es)" /></div>
                  <div>Collections: <Recorded value={summary.collections} unit="collection(s)" /></div>
                  <div>
                    Leads with a phone or website:{" "}
                    {summary.contactable === 0
                      ? <span className="italic text-text-muted">none — see field coverage</span>
                      : summary.contactable.toLocaleString()}
                  </div>
                </div>
                {!summary.searchConfigured ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber/30 bg-amber/10 p-3 text-xs text-amber">
                    <ShieldAlert size={14} className="mt-0.5" />
                    <span>
                      No Google Places key is configured on this server, so new searches will be
                      refused. Everything already stored is still readable.
                    </span>
                  </div>
                ) : null}
                <Note>{summary.providerNote}</Note>
                <Note>{summary.historyNote}</Note>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ── Pipeline ─────────────────────────────────────────────────── */}
      {tab === "pipeline" ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-xs text-text-muted">Search stored leads</label>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="name, address, category or the query that found it"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-muted">Status</label>
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
                  <option value="">All</option>
                  {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </div>
              <Button
                variant="secondary"
                disabled={emptySelection || busy === "preview"}
                onClick={() =>
                  run("preview", async () => {
                    setPreview(await leadPipelineApi.exportPreview([...selected]));
                    return "Export preview generated. Nothing has downloaded yet.";
                  })
                }
              >
                <FileWarning size={16} /> Preview export ({selected.size})
              </Button>
              <Button
                disabled={emptySelection || busy === "csv"}
                onClick={() =>
                  run("csv", async () => {
                    await leadPipelineApi.exportCsv([...selected]);
                    return "CSV downloaded.";
                  })
                }
              >
                <Download size={16} /> Download CSV
              </Button>
            </CardContent>
          </Card>

          {preview ? (
            <Card>
              <CardHeader>
                <CardTitle>Export preview</CardTitle>
                <CardDescription>
                  {preview.resolved} of {preview.requested} requested row(s) resolved
                  {preview.duplicatesInSelection > 0
                    ? `, ${preview.duplicatesInSelection} duplicate selection(s) collapsed`
                    : ""}
                  {preview.missingIds.length > 0
                    ? `, ${preview.missingIds.length} id(s) did not resolve`
                    : ""}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {preview.columns.map((c) => (
                    <Badge key={c.field} variant={c.alwaysEmpty ? "amber" : "slate"}>
                      {c.field}{c.alwaysEmpty ? " — empty" : ` · ${c.populated}`}
                    </Badge>
                  ))}
                </div>
                {preview.cellsNeutralised > 0 ? (
                  <div className="rounded-lg border border-amber/30 bg-amber/10 p-3 text-xs text-amber">
                    {preview.cellsNeutralised} cell(s) begin with a formula character and will be
                    exported as text. {preview.csvInjectionNote}
                  </div>
                ) : null}
                <Note>{preview.exportNote}</Note>
                <Note>{preview.coverageNote}</Note>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>
                {list ? `${list.total.toLocaleString()} lead(s)` : "Leads"}
                {list?.truncated ? <span className="ml-2 text-xs text-text-muted">(showing {list.returned})</span> : null}
              </CardTitle>
              <CardDescription>
                {statusCounts
                  ? (Object.keys(statusCounts) as LeadStatus[])
                      .map((s) => `${s} ${statusCounts[s]}`).join(" · ")
                  : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-text-muted">
                  No stored leads match. Discovery lives on the{" "}
                  <Link className="text-azure underline" to="/app/leads">Lead Discovery</Link> page.
                </p>
              ) : (
                rows.map((lead) => (
                  <div
                    key={lead.id}
                    className="flex flex-wrap items-center gap-3 border-b border-white/5 py-2 last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggle(lead.id)}
                      aria-label={`Select ${lead.name}`}
                    />
                    <button
                      className="min-w-[180px] flex-1 text-left"
                      onClick={() => void openDetail(lead)}
                    >
                      <div className="truncate text-sm font-semibold text-text-bright">{lead.name}</div>
                      <div className="truncate text-xs text-text-muted">
                        {lead.address ?? <span className="italic">no address returned</span>}
                        {" · found by “"}{lead.query}{"”"}
                      </div>
                    </button>
                    <Badge variant={STATUS_VARIANT[lead.pipeline.status]}>{lead.pipeline.status}</Badge>
                    {lead.pipeline.ownerId
                      ? <Badge variant="violet">{lead.pipeline.ownerId}</Badge>
                      : <span className="text-xs italic text-text-muted">unowned</span>}
                    {lead.pipeline.noteCount > 0 ? (
                      <span className="flex items-center gap-1 text-xs text-text-muted">
                        <StickyNote size={12} /> {lead.pipeline.noteCount}
                      </span>
                    ) : null}
                    <Select
                      value={lead.pipeline.status === "duplicate" ? "" : lead.pipeline.status}
                      onChange={(e) => void setStatus(lead, e.target.value as Exclude<LeadStatus, "duplicate">)}
                      className="w-36"
                    >
                      {lead.pipeline.status === "duplicate" ? <option value="">duplicate</option> : null}
                      {SETTABLE.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </div>
                ))
              )}
              {list ? <Note>{list.statusNote}</Note> : null}
            </CardContent>
          </Card>

          {openLead ? (
            <Card>
              <CardHeader>
                <CardTitle>{openLead.name}</CardTitle>
                <CardDescription>
                  Provider record: {openLead.source} · {openLead.sourceId} · discovered{" "}
                  {when(openLead.discoveredAt)} · verification “{openLead.verificationStatus}”
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>Category: {openLead.category ?? <span className="italic text-text-muted">not returned</span>}</div>
                  <div>Address: {openLead.address ?? <span className="italic text-text-muted">not returned</span>}</div>
                  <div>Phone: {openLead.phone ?? <span className="italic text-text-muted">never returned by this provider call</span>}</div>
                  <div>Website: {openLead.website ?? <span className="italic text-text-muted">never returned by this provider call</span>}</div>
                </div>
                {openLead.pipeline.duplicateOf ? (
                  <div className="rounded-lg border border-amber/30 bg-amber/10 p-3 text-xs text-amber">
                    Marked as a repeat of {openLead.pipeline.duplicateOf}. Setting any other status
                    returns it to the pipeline and clears the pointer.
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    placeholder="Record what actually happened"
                    className="min-w-[240px] flex-1"
                  />
                  <Button
                    disabled={!draftNote.trim() || busy === "note"}
                    onClick={() =>
                      run("note", async () => {
                        await leadPipelineApi.addNote(openLead.id, draftNote.trim());
                        setNotes((await leadPipelineApi.notes(openLead.id)).notes);
                        setDraftNote("");
                        await loadList();
                        return "Note recorded.";
                      })
                    }
                  >
                    Add note
                  </Button>
                </div>
                <div className="space-y-1">
                  {notes.length === 0
                    ? <p className="text-xs italic text-text-muted">No notes recorded for this lead.</p>
                    : notes.map((note) => (
                        <div key={note.id} className="border-b border-white/5 py-1 text-xs last:border-0">
                          <div className="text-text-bright">{note.body}</div>
                          <div className="text-text-muted">{note.authorId ?? "unknown author"} · {when(note.createdAt)}</div>
                        </div>
                      ))}
                </div>
                <div className="text-xs text-text-muted">{LEAD_STATUS_LABELS[openLead.pipeline.status]}</div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ── Duplicates ───────────────────────────────────────────────── */}
      {tab === "duplicates" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {duplicates ? `${duplicates.groups.length} duplicate group(s)` : "Duplicates"}
              </CardTitle>
              <CardDescription>
                {duplicates
                  ? `${duplicates.affectedLeads} record(s) across ${duplicates.distinctListings} distinct listing(s); ${duplicates.unresolvedGroups} group(s) still unresolved.`
                  : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {canAdminister ? (
                <Button
                  disabled={busy === "resolve" || !duplicates?.unresolvedGroups}
                  onClick={() =>
                    run("resolve", async () => {
                      const result = await leadPipelineApi.resolveDuplicates();
                      await refresh();
                      return `${result.leadsMarked} record(s) marked across ${result.groupsResolved} group(s). Nothing was deleted.`;
                    })
                  }
                >
                  <Copy size={16} /> Mark repeats in every group
                </Button>
              ) : (
                <p className="text-xs italic text-text-muted">
                  Resolving duplicates changes many records at once and is limited to administrators.
                </p>
              )}

              {duplicates?.groups.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-muted">
                  No listing appears more than once.
                </p>
              ) : (
                duplicates?.groups.map((group) => (
                  <div key={group.sourceId} className="border-b border-white/5 py-2 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-text-bright">{group.name}</span>
                      <Badge variant={group.resolved ? "emerald" : "amber"}>
                        {group.resolved ? "resolved" : `${group.count} records`}
                      </Badge>
                    </div>
                    <div className="text-xs text-text-muted">
                      Keeper {group.keeperId} · repeats {group.duplicateIds.join(", ")}
                    </div>
                    <div className="text-xs text-text-muted">
                      Returned by: {group.queries.map((q) => `“${q}”`).join(", ")} · first seen{" "}
                      {when(group.firstDiscoveredAt)}
                    </div>
                  </div>
                ))
              )}
              {duplicates ? <Note>{duplicates.dedupeNote}</Note> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ── Coverage ─────────────────────────────────────────────────── */}
      {tab === "coverage" ? (
        <Card>
          <CardHeader>
            <CardTitle>What the provider actually returned</CardTitle>
            <CardDescription>
              Measured across {coverage?.totalLeads.toLocaleString() ?? "—"} stored lead(s).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {coverage?.fields.map((field) => (
              <div key={field.field} className="border-b border-white/5 py-2 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-text-bright">{field.field}</span>
                  <Badge variant={field.suppliedByProvider ? "slate" : "amber"}>
                    {field.suppliedByProvider ? "supplied by provider" : "not requested from provider"}
                  </Badge>
                  <span className="text-xs text-text-muted">
                    {field.percentPresent === null
                      ? "nothing to measure"
                      : `${field.present} present · ${field.percentPresent}%`}
                  </span>
                </div>
                <p className="text-xs text-text-muted">{field.detail}</p>
              </div>
            ))}
            {coverage ? <Note>{coverage.coverageNote}</Note> : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ── History ──────────────────────────────────────────────────── */}
      {tab === "history" ? (
        <Card>
          <CardHeader>
            <CardTitle>Recorded searches</CardTitle>
            <CardDescription>
              {history
                ? `${history.stored} of a maximum ${history.retentionLimit} entries held; oldest ${when(history.oldestAt, "n/a")}.`
                : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {history?.entries.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">
                No search has been recorded for this organization yet.
              </p>
            ) : (
              history?.entries.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center gap-3 border-b border-white/5 py-2 text-xs last:border-0">
                  <Search size={12} className="text-text-muted" />
                  <span className="flex-1 text-text-bright">“{entry.query}”</span>
                  <span className="text-text-muted">{entry.returned} returned</span>
                  <Badge variant="emerald">{entry.newListings} new</Badge>
                  <Badge variant="slate">{entry.repeatListings} repeat</Badge>
                  <span className="text-text-muted">{entry.actorId ?? "unattributed"}</span>
                  <span className="flex items-center gap-1 text-text-muted">
                    <History size={12} /> {when(entry.at)}
                  </span>
                </div>
              ))
            )}
            {history ? <Note>{history.historyNote}</Note> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
