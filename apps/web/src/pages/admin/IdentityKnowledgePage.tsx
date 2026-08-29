/**
 * Session 125 — Super Admin Biography Manager & AI Knowledge System.
 *
 * The Biography Manager tabs (records, versions, approvals, permissions,
 * documents, import/export, synchronization) are visible ONLY to the Super
 * Admin — the single trusted authority for identity knowledge. Regular
 * members see the Library (per their classification) and the AI Insights
 * (ask) tab, which answers only from approved knowledge they are authorized
 * to see.
 *
 * Honesty rules:
 *   - the AI answer shows its sections (Verified Facts / Super Admin
 *     Approved / Organization Information / AI-Generated Summary / Unknown)
 *     and its source list — full traceability;
 *   - "I do not have sufficient approved knowledge" is shown as-is when the
 *     engine finds nothing — never a fabricated answer;
 *   - verified badges only appear on records published by the Super Admin.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Archive, BookOpen, Bot, Brain, CheckCircle2, FileUp,
  GitBranch, Network, RefreshCw, Send, ShieldCheck, Trash2, Upload, Workflow,
} from "lucide-react";
import type {
  IkAnswer,
  IkKnowledgeRecord,
  IkRecordVersion,
} from "@windels/shared/identityKnowledge";
import { IDENTITY_KNOWLEDGE_KINDS } from "@windels/shared/identityKnowledge";
import { identityKnowledgeApi } from "@/lib/identityKnowledge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useAuthStore } from "@/store/auth";

const CLASS_VARIANT: Record<string, "crimson" | "amber" | "emerald" | "slate"> = {
  private: "crimson",
  organization: "amber",
  public: "emerald",
};
const STATUS_VARIANT: Record<string, "slate" | "amber" | "azure" | "emerald" | "default"> = {
  draft: "slate",
  pending_approval: "amber",
  approved: "azure",
  published: "emerald",
  archived: "default",
};

type Tab = "records" | "library" | "ask" | "approvals" | "documents" | "graph" | "activity";

export function IdentityKnowledgePage() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.role === "super_admin";
  const accessToken = useAuthStore((s) => s.accessToken);

  const [tab, setTab] = useState<Tab>("records");
  const [records, setRecords] = useState<IkKnowledgeRecord[]>([]);
  const [answer, setAnswer] = useState<IkAnswer | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [versions, setVersions] = useState<Record<string, IkRecordVersion[]>>({});
  const [graph, setGraph] = useState<{ nodes: any[]; edges: any[]; note?: string } | null>(null);
  const [activity, setActivity] = useState<Array<{ at: string; action: string; label: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editModal, setEditModal] = useState<{ record?: IkKnowledgeRecord; mode: "create" | "edit" } | null>(null);
  const [form, setForm] = useState({ kind: "biography_official", title: "", body: "", classification: "organization", category: "general", tags: "" });
  const [uploadModal, setUploadModal] = useState(false);
  const [upload, setUpload] = useState<{ file: File | null; title: string; classification: string }>({ file: null, title: "", classification: "organization" });
  const [askHistory, setAskHistory] = useState<IkAnswer[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [recs, acts] = await Promise.all([
        identityKnowledgeApi.records({ limit: 200 }),
        identityKnowledgeApi.activity(),
      ]);
      setRecords(recs);
      setActivity(acts);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, accessToken]);

  const loadGraph = useCallback(async () => {
    try { setGraph(await identityKnowledgeApi.graph()); } catch { /* best effort */ }
  }, []);

  const ask = async () => {
    if (!question.trim()) return;
    setAsking(true);
    setError(null);
    try {
      const a = await identityKnowledgeApi.ask(question);
      setAnswer(a);
      setAskHistory((h) => [a, ...h].slice(0, 20));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        kind: form.kind as any,
        title: form.title,
        body: form.body,
        classification: form.classification as any,
        category: form.category,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      if (editModal?.mode === "edit" && editModal.record) {
        await identityKnowledgeApi.updateRecord(editModal.record.id, payload);
      } else {
        await identityKnowledgeApi.createRecord(payload);
      }
      setEditModal(null);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const lifecycle = async (id: string, action: "approve" | "publish" | "archive" | "remove") => {
    if (action === "remove" && !window.confirm("Delete this record permanently? This cannot be undone.")) return;
    setBusy(true);
    try {
      if (action === "approve") await identityKnowledgeApi.approve(id);
      if (action === "publish") await identityKnowledgeApi.publish(id);
      if (action === "archive") await identityKnowledgeApi.archive(id);
      if (action === "remove") await identityKnowledgeApi.removeRecord(id);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const showVersions = async (id: string) => {
    try {
      const vs = await identityKnowledgeApi.versions(id);
      setVersions((v) => ({ ...v, [id]: vs }));
    } catch { /* best effort */ }
  };

  const syncAll = async () => {
    setBusy(true);
    try { await identityKnowledgeApi.sync(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const uploadDoc = async () => {
    if (!upload.file) return;
    setBusy(true);
    try {
      await identityKnowledgeApi.uploadDocument(upload.file, { title: upload.title, classification: upload.classification as any });
      setUploadModal(false);
      setUpload({ file: null, title: "", classification: "organization" });
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const runAgent = useCallback(async (agentId: any) => {
    setBusy(true);
    try {
      const run = await identityKnowledgeApi.runAgent(agentId);
      setError(null);
      await load();
      return run;
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [load]);

  const classified = useMemo(() => {
    const shown = records.filter((r) => r.status !== "archived");
    return shown;
  }, [records]);

  const managerTabs: Array<{ id: Tab; label: string }> = [
    { id: "records", label: "Biography Manager" },
    { id: "approvals", label: "Approval Center" },
    { id: "documents", label: "Document Upload" },
    { id: "graph", label: "Knowledge Graph" },
    { id: "activity", label: "Activity History" },
  ];
  const memberTabs: Array<{ id: Tab; label: string }> = [
    { id: "library", label: "Knowledge Library" },
    { id: "ask", label: "AI Knowledge Insights" },
  ];

  const tabs = isSuperAdmin ? [...managerTabs, ...memberTabs] : memberTabs;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-bright">
            <ShieldCheck className="h-6 w-6 text-teal" />Identity Knowledge
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {isSuperAdmin
              ? "Super Admin Biography Manager — the single trusted authority for identity knowledge. Every change is versioned, audited and synchronized."
              : "Governed knowledge library — you see only information your access allows."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={tab} onChange={(e) => { setTab(e.target.value as Tab); if (e.target.value === "graph") void loadGraph(); }} className="w-56">
            {tabs.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
          {isSuperAdmin ? (
            <Button size="sm" variant="outline" onClick={() => void syncAll()} disabled={busy}><Workflow className="h-4 w-4" />Sync memory</Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Refresh</Button>
        </div>
      </div>

      {!isSuperAdmin ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Only the Super Admin can create, edit, approve, publish or remove biography records. You are viewing approved knowledge.
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-2 text-sm text-crimson">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      ) : null}

      {tab === "records" && isSuperAdmin ? (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-text-muted">Biographies, profiles, brand story, mission, vision, values, FAQs, statements and more — every mutation versioned and audit-logged.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setUploadModal(true)}><Upload className="h-4 w-4" />Upload document</Button>
              <Button size="sm" onClick={() => { setForm({ kind: "biography_official", title: "", body: "", classification: "organization", category: "general", tags: "" }); setEditModal({ mode: "create" }); }}><BookOpen className="h-4 w-4" />New record</Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {classified.length === 0 ? <Card className="p-6 text-sm text-text-muted">No records yet.</Card> : classified.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-text-bright">{r.title}</div>
                    <div className="text-xs text-text-muted">{r.kind} · v{r.version} · {r.category}</div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Badge variant={CLASS_VARIANT[r.classification] ?? "slate"}>{r.classification}</Badge>
                    <Badge variant={STATUS_VARIANT[r.status] ?? "slate"}>{r.status}</Badge>
                    {r.verified ? <Badge variant="emerald">verified</Badge> : null}
                  </div>
                </div>
                <p className="mt-2 line-clamp-3 text-xs text-text-muted">{r.body}</p>
                <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-text-muted">
                  {r.tags.map((t) => <span key={t} className="rounded bg-white/5 px-1">#{t}</span>)}
                  {r.documents.length ? <span className="rounded bg-white/5 px-1">📎 {r.documents.length}</span> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => { setForm({ kind: r.kind, title: r.title, body: r.body, classification: r.classification, category: r.category, tags: r.tags.join(", ") }); setEditModal({ record: r, mode: "edit" }); }}>Edit</Button>
                  {r.status !== "published" ? (
                    <Button size="sm" variant="secondary" onClick={() => void lifecycle(r.id, "approve")} disabled={busy}><CheckCircle2 className="h-3.5 w-3.5" />Approve</Button>
                  ) : null}
                  {r.status !== "published" ? (
                    <Button size="sm" variant="success" onClick={() => void lifecycle(r.id, "publish")} disabled={busy}><ShieldCheck className="h-3.5 w-3.5" />Publish</Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => void lifecycle(r.id, "archive")} disabled={busy}><Archive className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-crimson" onClick={() => void lifecycle(r.id, "remove")} disabled={busy}><Trash2 className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => void showVersions(r.id)} title="Version history"><GitBranch className="h-3.5 w-3.5" /></Button>
                </div>
                {versions[r.id] ? (
                  <div className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-white/10 bg-bg-deep/50 p-2 text-[10px] text-text-muted">
                    {versions[r.id]!.map((v) => (
                      <div key={v.version} className="flex items-center gap-1">
                        <span>v{v.version}</span><Badge variant="slate">{v.action}</Badge>
                        <span className="truncate">{v.actor} · {new Date(v.at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </>
      ) : null}

      {tab === "approvals" && isSuperAdmin ? (
        <div className="mt-4 grid gap-3">
          <p className="text-sm text-text-muted">Records awaiting approval or re-approval after edits.</p>
          {records.filter((r) => r.status === "pending_approval").length === 0 ? (
            <Card className="p-6 text-sm text-text-muted">Nothing awaiting approval.</Card>
          ) : records.filter((r) => r.status === "pending_approval").map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <div className="font-medium text-text-bright">{r.title}</div>
                <div className="text-xs text-text-muted">{r.kind} · {r.classification} · edited from published (v{r.version})</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void lifecycle(r.id, "approve")} disabled={busy}>Approve</Button>
                <Button size="sm" variant="success" onClick={() => void lifecycle(r.id, "publish")} disabled={busy}>Approve & publish</Button>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "documents" && isSuperAdmin ? (
        <Card className="mt-4 p-4">
          <CardHeader><CardTitle className="text-sm">Document Upload Center</CardTitle>
            <CardDescription>Uploads reuse the attachments infrastructure (25 MB, checksummed); the file becomes a governed knowledge record.</CardDescription></CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm"><span className="text-text-muted">Title</span>
                <Input value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} /></label>
              <label className="text-sm"><span className="text-text-muted">Classification</span>
                <Select value={upload.classification} onChange={(e) => setUpload({ ...upload, classification: e.target.value })}>
                  <option value="public">public</option><option value="organization">organization</option><option value="private">private</option>
                </Select></label>
              <label className="text-sm"><span className="text-text-muted">File (PDF / DOCX / TXT / image / video / presentation)</span>
                <input type="file" className="block w-72 text-xs text-text-muted" onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] ?? null })} /></label>
              <Button onClick={() => void uploadDoc()} disabled={busy || !upload.file || !upload.title.trim()}><FileUp className="h-4 w-4" />Upload</Button>
            </div>
            <div className="mt-4 grid gap-2">
              {records.filter((r) => r.kind === "document").map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-bg-deep/50 px-3 py-2 text-sm">
                  <span className="truncate font-medium">{r.documents[0]?.filename ?? r.title}</span>
                  <span className="shrink-0 text-xs text-text-muted">
                    {r.documents[0]?.mimeType} · `${Math.round((r.documents[0]?.sizeBytes ?? 0) / 1024)} KB` · <Badge variant={CLASS_VARIANT[r.classification] ?? "slate"}>{r.classification}</Badge> · <Badge variant={STATUS_VARIANT[r.status] ?? "slate"}>{r.status}</Badge>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "graph" && isSuperAdmin ? (
        <Card className="mt-4 p-4">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Network className="h-4 w-4" />Knowledge Graph</CardTitle>
            <CardDescription>{graph?.note ?? "Super Admin-defined relations between approved records."}</CardDescription></CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-text-muted">Nodes ({graph?.nodes.length ?? 0})</div>
                <div className="mt-1 max-h-80 overflow-y-auto grid gap-1">
                  {graph?.nodes.map((n) => (
                    <div key={n.id} className="flex items-center gap-2 text-xs">
                      <Badge variant="azure">{n.kind}</Badge>
                      <span className="truncate">{n.title}</span>
                      {n.verified ? <Badge variant="emerald">verified</Badge> : null}
                      <Badge variant={CLASS_VARIANT[n.classification] ?? "slate"}>{n.classification}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-text-muted">Edges ({graph?.edges.length ?? 0})</div>
                <div className="mt-1 max-h-80 overflow-y-auto grid gap-1">
                  {graph?.edges.map((e, i) => {
                    const from = graph.nodes.find((n) => n.id === e.from);
                    const to = graph.nodes.find((n) => n.id === e.to);
                    return (
                      <div key={i} className="flex items-center gap-1 text-xs">
                        <span className="truncate">{from?.title ?? e.from}</span>
                        <Badge variant="slate">{e.relation}</Badge>
                        <span className="truncate">{to?.title ?? e.to}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "activity" && isSuperAdmin ? (
        <Card className="mt-4 p-4">
          <CardHeader><CardTitle className="text-sm">Activity History</CardTitle>
            <CardDescription>Every mutation is also written to the enterprise AuditLog.</CardDescription></CardHeader>
          <CardContent className="grid gap-1">
            {activity.length === 0 ? <p className="text-sm text-text-muted">No activity yet.</p> : activity.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="shrink-0 text-text-muted">{new Date(a.at).toLocaleString()}</span>
                <Badge variant="slate">{a.action}</Badge>
                <span className="truncate">{a.label}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {tab === "library" ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {classified.length === 0 ? <Card className="p-6 text-sm text-text-muted">No approved knowledge to show.</Card> : classified.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-text-bright">{r.title}</div>
                  <div className="text-xs text-text-muted">{r.kind}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Badge variant={CLASS_VARIANT[r.classification] ?? "slate"}>{r.classification}</Badge>
                  {r.verified ? <Badge variant="emerald">verified</Badge> : null}
                </div>
              </div>
              <p className="mt-2 line-clamp-3 text-xs text-text-muted">{r.body}</p>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "ask" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Bot className="h-4 w-4" />AI Knowledge Insights</CardTitle>
              <CardDescription>Answers come only from approved knowledge you are authorized to see — verified first, with full source traceability.</CardDescription></CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Who is the founder? What businesses do they own? …"
                  onKeyDown={(e) => e.key === "Enter" && void ask()} />
                <Button onClick={() => void ask()} disabled={asking || !question.trim()}><Send className="h-4 w-4" /></Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {["Who is the founder?", "What is the mission?", "What products do they offer?", "What awards have they received?"].map((q) => (
                  <button key={q} className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-text-muted hover:bg-white/5" onClick={() => setQuestion(q)}>{q}</button>
                ))}
              </div>
              <div className="mt-4 grid gap-2">
                {askHistory.map((a, i) => (
                  <div key={i} className="rounded-lg border border-white/10 bg-bg-deep/50 p-3 text-xs">
                    <div className="font-medium text-text-bright">{a.question}</div>
                    <div className="mt-1 whitespace-pre-wrap text-text-muted">{a.answer}</div>
                    {a.sources.length ? (
                      <div className="mt-2 border-t border-white/5 pt-1 text-[10px] text-text-muted">
                        Sources: {a.sources.map((s) => `${s.title} (${s.classification}${s.verified ? ", verified" : ""})`).join(" · ")}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-3">
            <Card className="p-4">
              <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Brain className="h-4 w-4" />Knowledge Agents</CardTitle>
                <CardDescription>Specialized AI workforce roles — deterministic runs, audit-logged and kernel-dispatched.</CardDescription></CardHeader>
              <CardContent className="grid gap-1.5">
                {[
                  { id: "biography_agent", label: "Biography Agent" },
                  { id: "organization_knowledge_agent", label: "Organization Knowledge Agent" },
                  { id: "company_profile_agent", label: "Company Profile Agent" },
                  { id: "knowledge_verification_agent", label: "Knowledge Verification Agent" },
                  { id: "knowledge_curator_agent", label: "Knowledge Curator Agent" },
                  { id: "knowledge_synchronization_agent", label: "Knowledge Synchronization Agent" },
                  { id: "ai_memory_manager", label: "AI Memory Manager" },
                  { id: "public_information_agent", label: "Public Information Agent" },
                ].map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{a.label}</span>
                    <Button size="sm" variant="outline" onClick={async () => { const run = await runAgent(a.id); if (run) window.alert(`${run.title}: ${run.summary}`); }} disabled={busy || (a.id === "knowledge_synchronization_agent" && !isSuperAdmin)}>
                      Run
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
            {isSuperAdmin ? (
              <Card className="p-4">
                <CardHeader><CardTitle className="text-sm">Bulk import / export</CardTitle></CardHeader>
                <CardContent className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={async () => {
                    try {
                      const data = await identityKnowledgeApi.exportRecords();
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url; a.download = "identity-knowledge-export.json"; a.click();
                      URL.revokeObjectURL(url);
                    } catch (e) { setError((e as Error).message); }
                  }}>Export JSON</Button>
                  <input type="file" accept="application/json" className="text-xs text-text-muted"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        const records = JSON.parse(await f.text());
                        const res = await identityKnowledgeApi.importRecords(records);
                        setError(null);
                        window.alert(`Imported ${res.imported} record(s).`);
                        await load();
                      } catch (err) { setError((err as Error).message); }
                    }} />
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Create/edit modal */}
      <Modal open={editModal !== null} onClose={() => setEditModal(null)} title={editModal?.mode === "edit" ? "Edit record" : "New knowledge record"} size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditModal(null)}>Cancel</Button><Button onClick={() => void save()} loading={busy} disabled={!form.title.trim() || !form.body.trim()}>Save</Button></div>}>
        {editModal ? (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm"><span className="text-text-muted">Kind</span>
                <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {IDENTITY_KNOWLEDGE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </Select></label>
              <label className="text-sm"><span className="text-text-muted">Classification</span>
                <Select value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })}>
                  <option value="private">private</option><option value="organization">organization</option><option value="public">public</option>
                </Select></label>
            </div>
            <label className="text-sm"><span className="text-text-muted">Title</span>
              <Input value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="text-sm"><span className="text-text-muted">Body (markdown — the approved content)</span>
              <textarea rows={8} className="w-full rounded-lg border border-white/10 bg-bg-deep/60 px-3 py-2 text-sm text-text-bright focus:outline-none focus:ring-2 focus:ring-azure/60"
                value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm"><span className="text-text-muted">Category</span>
                <Input value={form.category} maxLength={60} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
              <label className="text-sm"><span className="text-text-muted">Tags (comma separated)</span>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Upload modal */}
      <Modal open={uploadModal} onClose={() => setUploadModal(false)} title="Upload a document"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setUploadModal(false)}>Cancel</Button><Button onClick={() => void uploadDoc()} loading={busy} disabled={!upload.file || !upload.title.trim()}>Upload</Button></div>}>
        <div className="grid gap-3">
          <label className="text-sm"><span className="text-text-muted">Title</span>
            <Input value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} /></label>
          <label className="text-sm"><span className="text-text-muted">Classification</span>
            <Select value={upload.classification} onChange={(e) => setUpload({ ...upload, classification: e.target.value })}>
              <option value="public">public</option><option value="organization">organization</option><option value="private">private</option>
            </Select></label>
          <label className="text-sm"><span className="text-text-muted">File</span>
            <input type="file" className="block w-full text-xs text-text-muted" onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] ?? null })} /></label>
        </div>
      </Modal>
    </div>
  );
}

// Re-export so lazy imports can use `.then(m => m.IdentityKnowledgePage)` uniformly.
export default IdentityKnowledgePage;
