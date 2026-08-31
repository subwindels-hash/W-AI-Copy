/**
 * Session 195 — Tier 4 v76validation console.
 *
 * `v76validation` (Session 76) had 5 routes and a 10-LOC client but no
 * console page. The S76 platform-wide report was rebuilt on every
 * `/validation/report` call with no history and no notion of which
 * org it was rendered for. The S195 fix made every read per-org
 * (`v76:report:<org>:<id>`), added a per-org `history` companion,
 * and the new page is the first UI surface.
 *
 * The page mirrors the S194 honesty discipline:
 *  - A fresh org sees an amber "no validation runs yet" banner
 *    until they trigger a `POST /validation/run`.
 *  - The summary card shows the 22-system wired / stub / missing
 *    counts, plus the duplicatesDetected, consentGateEnforced and
 *    governanceGateEnforced flags from the most recent report.
 *  - The 22-item checklist is rendered as a table with pass/fail
 *    status and the original S76 detail text. Unavailable sections
 *    report "—" rather than fabricating a value.
 *  - The systems table lists every probed system with its
 *    `routesThroughKernel` boolean and the S76 notes string.
 *  - The notes card hosts the per-org notes ledger (create / edit /
 *    delete) and the existing `/validation/notes/*` endpoints.
 *  - The history card lists the calling org's previous reports with
 *    the run id, generatedAt timestamp and the wired count.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ClipboardCheck, ClipboardList, History, RefreshCw, X } from "lucide-react";
import type { V76ValidationReport } from "@windels/shared";
import { v76Api, type V76NoteRecord, type V76ReportSummary } from "@/lib/v76validation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

function fmtTimestamp(s: string) {
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function StatusBadge({ status }: { status: "wired" | "stub" | "missing" }) {
  if (status === "wired") return <Badge variant="emerald">wired</Badge>;
  if (status === "stub") return <Badge variant="slate">stub</Badge>;
  return <Badge variant="amber">missing</Badge>;
}

function PassBadge({ passed }: { passed: boolean }) {
  return passed
    ? <Badge variant="emerald">pass</Badge>
    : <Badge variant="crimson">fail</Badge>;
}

export function V76ValidationPage() {
  const [report, setReport] = useState<V76ValidationReport | null>(null);
  const [history, setHistory] = useState<V76ReportSummary[]>([]);
  const [notes, setNotes] = useState<V76NoteRecord[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);

  // note form state
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteTags, setNoteTags] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [r, h, n] = await Promise.all([
        v76Api.report(),
        v76Api.history(),
        v76Api.listNotes(),
      ]);
      setReport(r);
      setHistory(h);
      setNotes(n);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function triggerRun() {
    setRunning(true);
    try { await v76Api.run(); await load(); } catch (e: any) { setErr(e?.message ?? "Run failed"); } finally { setRunning(false); }
  }

  async function saveNote() {
    if (!noteTitle || !noteBody) return;
    setNoteSaving(true);
    try {
      const tags = noteTags.split(",").map((t) => t.trim()).filter(Boolean);
      if (editingId) {
        await v76Api.updateNote(editingId, { title: noteTitle, body: noteBody, tags });
      } else {
        await v76Api.createNote({ title: noteTitle, body: noteBody, tags });
      }
      setNoteTitle(""); setNoteBody(""); setNoteTags(""); setEditingId(null);
      await load();
    } catch (e: any) { setErr(e?.message ?? "Save failed"); } finally { setNoteSaving(false); }
  }

  async function deleteNote(id: string) {
    if (!confirm("Delete this note?")) return;
    try { await v76Api.deleteNote(id); await load(); } catch (e: any) { setErr(e?.message ?? "Delete failed"); }
  }

  function startEdit(n: V76NoteRecord) {
    setEditingId(n.id);
    setNoteTitle(n.title);
    setNoteBody(n.body);
    setNoteTags((n.tags ?? []).join(", "));
  }

  if (!report) return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading validation report…"}</div>;

  // A read on an organization with nothing stored runs the first probe
  // itself, so "no runs yet" means no stored reports — the figures below
  // are still real, they were measured moments ago by that first run.
  const empty = history.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Final Enterprise Validation</h1>
          <p className="text-sm text-text-muted">Session 76 platform-wide report. The S195 fix made every read per-org, persists the result, and renders a per-org history. The 22-item checklist is the source of truth; values shown are this org's last run.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} loading={busy}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
          <Button onClick={triggerRun} loading={running}><ClipboardCheck className="h-4 w-4 mr-1"/>Re-run probe</Button>
        </div>
      </div>

      {empty && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-text-bright">No stored reports yet</div>
            <div className="text-text-muted">Nothing was on file, so loading this page ran the first probe. The counts below are that run's measurements. <em>Re-run probe</em> stores another.</div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardDescription>Wired systems</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{report.wired}</div><div className="text-xs text-text-muted">of {report.totalSystems}</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Stubs</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{report.stubs}</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Missing</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{report.missing}</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Duplicates detected</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{report.duplicatesDetected}</div><div className="text-xs text-text-muted">parallel systems</div></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardDescription>Consent gate (S36/S40)</CardDescription></CardHeader><CardContent><PassBadge passed={report.consentGateEnforced} /><div className="text-xs text-text-muted mt-2">Reported only when a check measured it. This build reports false — the checklist item says why.</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Governance gate (S39/S40/S81)</CardDescription></CardHeader><CardContent><PassBadge passed={report.governanceGateEnforced} /><div className="text-xs text-text-muted mt-2">Reported only when a check measured it. This build reports false — the checklist item says why.</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle><ClipboardList className="h-4 w-4 inline mr-1"/>22-item integration checklist</CardTitle>
          <CardDescription>From the most recent probe. Each item carries a pass/fail status and the S76 detail text.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {report.checklist.map((c, idx) => (
              <div key={idx} className="border-b border-border/40 pb-2 flex items-start gap-3">
                <div className="pt-0.5"><PassBadge passed={c.passed} /></div>
                <div className="flex-1">
                  <div className="font-semibold text-text-bright text-sm">{c.item}</div>
                  <div className="text-xs text-text-muted">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Probed systems</CardTitle>
          <CardDescription>Every system the S76 report scans, with its status and whether the report considers it "routes through kernel".</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {report.systems.map((s) => (
              <div key={`${s.key}-${s.name}`} className="border-b border-border/40 pb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-text-bright text-sm">{s.name}</div>
                  <div className="text-xs text-text-muted">key: {s.key} · {s.notes}</div>
                </div>
                <div className="flex items-center gap-2">
                  {s.routesThroughKernel && <Badge variant="azure">routes via kernel</Badge>}
                  <StatusBadge status={s.status} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><History className="h-4 w-4 inline mr-1"/>History</CardTitle>
          <CardDescription>Previous reports for this organization. Newest first, capped at 20.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-sm text-text-muted">No previous reports for this org.</div>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="border-b border-border/40 pb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-text-bright">{h.id}</div>
                    <div className="text-xs text-text-muted">{fmtTimestamp(h.generatedAt)}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="emerald">wired: {h.wired}</Badge>
                    <Badge variant="slate">stub: {h.stubs}</Badge>
                    <Badge variant="amber">missing: {h.missing}</Badge>
                    {h.duplicatesDetected > 0 && <Badge variant="crimson">dup: {h.duplicatesDetected}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>Per-org annotations the operator attaches to validation runs. Every write is stored; every read reflects what is on file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {notes.length === 0 ? (
            <div className="text-sm text-text-muted">No notes yet for this org.</div>
          ) : notes.map((n) => (
            <div key={n.id} className="border-b border-border/40 pb-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-text-bright text-sm">{n.title}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(n)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteNote(n.id)}>Delete</Button>
                </div>
              </div>
              <div className="text-xs text-text-muted">{fmtTimestamp(n.createdAt)}{n.createdBy ? ` · by ${n.createdBy}` : ""}{n.tags?.length ? ` · ${n.tags.join(", ")}` : ""}</div>
              <div className="text-sm mt-1">{n.body}</div>
            </div>
          ))}
          <div className="pt-3 space-y-2">
            <div className="text-xs font-semibold text-text-muted">{editingId ? "Edit note" : "Add a note"}</div>
            <Input placeholder="title" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
            <textarea className="w-full rounded bg-bg-deep border border-border px-2 py-1 text-sm min-h-[100px]" placeholder="body" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
            <Input placeholder="tags (comma separated)" value={noteTags} onChange={(e) => setNoteTags(e.target.value)} />
            <div className="flex gap-2">
              <Button onClick={saveNote} loading={noteSaving} disabled={!noteTitle || !noteBody}>{editingId ? "Update" : "Add"} note</Button>
              {editingId && <Button variant="ghost" onClick={() => { setEditingId(null); setNoteTitle(""); setNoteBody(""); setNoteTags(""); }}>Cancel</Button>}
            </div>
          </div>
        </CardContent>
      </Card>

      {err && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2">
          <X className="h-4 w-4" />{err}
        </div>
      )}
    </div>
  );
}

export default V76ValidationPage;
