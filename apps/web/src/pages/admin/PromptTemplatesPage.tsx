/**
 * Session 119 — Prompt Templates Library console.
 *
 * Session 23 shipped the API but no console page; the library was only
 * reachable through raw API calls. This page is the module's first UI.
 *
 * Honesty rules the page is built around:
 *   - a template variable that is neither supplied nor defaulted is shown as
 *     an **unresolved** hole with the rendered gap visible — it is never
 *     presented as a complete prompt;
 *   - usage statistics never render a missing measure as `0`. `avgUsesPerDay`
 *     prints "not recorded" when the ledger covers no day, `ledgerStart` is
 *     shown so days before it are not read as zero-use days, and a failed
 *     ledger read is surfaced as `ledgerAvailable: false` rather than an
 *     empty dashboard;
 *   - lifetime `totalUses` comes from the database counter, window numbers
 *     from the event ledger — the page labels which is which;
 *   - built-in templates cannot be edited or deleted (the API refuses), so
 *     the page hides those controls and offers **Duplicate** instead — the
 *     copy is an ordinary editable user template.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BarChart3, Copy, Layers, Pencil, Play, Plus, RefreshCw,
  Search, Trash2,
} from "lucide-react";
import {
  PROMPT_TEMPLATE_CATEGORIES,
  extractTemplateDefaults,
  extractTemplateVars,
  renderPromptTemplate,
  type PromptTemplate,
  type PromptTemplateStats,
} from "@windels/shared/promptTemplates";
import { promptTemplatesApi } from "@/lib/promptTemplates";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { useAuthStore } from "@/store/auth";

type Tab = "library" | "usage";

const CATEGORY_VARIANT: Record<string, "azure" | "violet" | "emerald" | "amber" | "fuchsia" | "default"> = {
  general: "azure",
  coding: "violet",
  writing: "emerald",
  creative: "fuchsia",
  analysis: "amber",
};

interface EditorState {
  id: string | null; // null = new
  title: string;
  category: string;
  icon: string;
  description: string;
  content: string;
}

const emptyEditor: EditorState = {
  id: null, title: "", category: "general", icon: "📝", description: "", content: "",
};

function snippet(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

/** Null-aware number rendering: a missing measure is "not recorded", never 0. */
function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "not recorded" : String(n);
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-text-bright">{value}</div>
      {hint ? <div className="mt-1 text-xs text-text-muted">{hint}</div> : null}
    </Card>
  );
}

export function PromptTemplatesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [tab, setTab] = useState<Tab>("library");

  // Library
  const [templates, setTemplates] = useState<PromptTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [useFor, setUseFor] = useState<PromptTemplate | null>(null);
  const [useVars, setUseVars] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Usage
  const [windowDays, setWindowDays] = useState(7);
  const [stats, setStats] = useState<PromptTemplateStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await promptTemplatesApi.list({ q: q || undefined, category: category || undefined });
      setTemplates(data);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [q, category]);

  useEffect(() => {
    void load();
  }, [load, accessToken]);

  const loadStats = useCallback(async () => {
    setStatsError(null);
    try {
      const data = await promptTemplatesApi.stats(windowDays);
      setStats(data);
    } catch (e) {
      setStatsError((e as Error).message);
      setStats(null);
    }
  }, [windowDays]);

  useEffect(() => {
    if (tab === "usage") void loadStats();
  }, [tab, loadStats, accessToken]);

  const visibleTemplates = useMemo(() => {
    if (!templates) return null;
    const needle = q.trim().toLowerCase();
    return templates.filter((t) => {
      if (category && t.category !== category) return false;
      if (!needle) return true;
      return (
        t.title.toLowerCase().includes(needle) ||
        t.content.toLowerCase().includes(needle) ||
        (t.description ?? "").toLowerCase().includes(needle)
      );
    });
  }, [templates, q, category]);

  const openNew = () => setEditor({ ...emptyEditor });
  const openEdit = (t: PromptTemplate) =>
    setEditor({
      id: t.id,
      title: t.title,
      category: t.category,
      icon: t.icon ?? "",
      description: t.description ?? "",
      content: t.content,
    });

  const saveTemplate = async () => {
    if (!editor) return;
    setSaving(true);
    setActionError(null);
    try {
      const payload = {
        title: editor.title,
        category: editor.category,
        icon: editor.icon || undefined,
        description: editor.description || undefined,
        content: editor.content,
      };
      if (editor.id) await promptTemplatesApi.update(editor.id, payload);
      else await promptTemplatesApi.create(payload);
      setEditor(null);
      await load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openUse = (t: PromptTemplate) => {
    setUseVars(extractTemplateDefaults(t.content));
    setUseFor(t);
  };

  const useResult = useMemo(() => {
    if (!useFor) return null;
    const { rendered, missing } = renderPromptTemplate(useFor.content, useVars);
    return { rendered, missing };
  }, [useFor, useVars]);

  const useNow = async () => {
    if (!useFor) return;
    setBusyId(useFor.id);
    setActionError(null);
    try {
      await promptTemplatesApi.use(useFor.id, useVars);
      setUseFor(null);
      await Promise.all([load(), loadStats()]);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = async (t: PromptTemplate) => {
    setBusyId(t.id);
    setActionError(null);
    try {
      await promptTemplatesApi.duplicate(t.id);
      await load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (t: PromptTemplate) => {
    if (!window.confirm(`Delete "${t.title}"? This cannot be undone.`)) return;
    setBusyId(t.id);
    setActionError(null);
    try {
      await promptTemplatesApi.remove(t.id);
      await load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const copyRendered = async () => {
    if (!useResult) return;
    try {
      await navigator.clipboard.writeText(useResult.rendered);
    } catch { /* clipboard unavailable — the text stays visible to copy by hand */ }
  };

  const statCards = stats ? (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Templates" value={fmt(stats.totalTemplates)} hint={`${stats.builtInTemplates} built-in · ${stats.userTemplates} user`} />
      <StatCard label="Lifetime uses" value={fmt(stats.totalUses)} hint="database usageCount — the durable counter" />
      <StatCard label={`Uses in ${stats.windowDays}d`} value={fmt(stats.usesInWindow)} hint={`${stats.distinctUseDays} day(s) with recorded use`} />
      <StatCard
        label="Avg uses / covered day"
        value={fmt(stats.avgUsesPerDay)}
        hint={stats.ledgerCoveredDays > 0 ? `over ${stats.ledgerCoveredDays} covered day(s)` : "no covered day in window"}
      />
    </div>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-bright">Prompt Templates</h1>
          <p className="mt-1 text-sm text-text-muted">
            Reusable prompts for your organization&apos;s AI workflows. Built-ins are read-only — duplicate one to edit.
          </p>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="library"><Layers className="mr-1 h-4 w-4" />Library</TabsTrigger>
            <TabsTrigger value="usage"><BarChart3 className="mr-1 h-4 w-4" />Usage</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {actionError ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-2 text-sm text-crimson">
          <AlertTriangle className="h-4 w-4 shrink-0" />{actionError}
        </div>
      ) : null}

      {tab === "library" ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Substring search over title, content, description…"
                className="pl-9"
              />
            </div>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
              <option value="">All categories</option>
              {PROMPT_TEMPLATE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
            <Button onClick={openNew}><Plus className="h-4 w-4" />New template</Button>
            <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Refresh</Button>
          </div>

          {loadError ? (
            <Card className="mt-4 p-4 text-sm text-crimson">{loadError}</Card>
          ) : visibleTemplates === null ? (
            <Card className="mt-4 p-6 text-center text-sm text-text-muted">Loading library…</Card>
          ) : visibleTemplates.length === 0 ? (
            <Card className="mt-4 p-6 text-center text-sm text-text-muted">
              No templates match. {templates?.length === 0 ? "Create your first template." : "Try a different search or category."}
            </Card>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleTemplates.map((t) => (
                <Card key={t.id} className="flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl" aria-hidden>{t.icon ?? "📄"}</span>
                      <div>
                        <div className="font-medium text-text-bright">{t.title}</div>
                        <div className="text-xs text-text-muted">{t.usageCount} use{t.usageCount === 1 ? "" : "s"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={CATEGORY_VARIANT[t.category] ?? "default"}>{t.category}</Badge>
                      {t.isBuiltIn ? <Badge variant="slate">built-in</Badge> : null}
                    </div>
                  </div>
                  {t.description ? <p className="mt-2 text-sm text-text-muted">{t.description}</p> : null}
                  <p className="mt-2 flex-1 rounded-lg border border-white/10 bg-bg-deep/50 p-2 font-mono text-xs text-text-main">
                    {snippet(t.content)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="success" onClick={() => openUse(t)} disabled={busyId === t.id}>
                      <Play className="h-3.5 w-3.5" />Use
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void duplicate(t)} disabled={busyId === t.id}>
                      <Copy className="h-3.5 w-3.5" />Duplicate
                    </Button>
                    {!t.isBuiltIn ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openEdit(t)} disabled={busyId === t.id}>
                          <Pencil className="h-3.5 w-3.5" />Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="text-crimson" onClick={() => void remove(t)} disabled={busyId === t.id}>
                          <Trash2 className="h-3.5 w-3.5" />Delete
                        </Button>
                      </>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Create / edit modal */}
          <Modal
            open={editor !== null}
            onClose={() => setEditor(null)}
            title={editor?.id ? "Edit template" : "New template"}
            size="lg"
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
                <Button onClick={() => void saveTemplate()} loading={saving} disabled={!editor?.title.trim() || !editor?.content.trim()}>
                  {editor?.id ? "Save changes" : "Create template"}
                </Button>
              </div>
            }
          >
            {editor ? (
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_10rem_6rem]">
                  <label className="text-sm">
                    <span className="text-text-muted">Title</span>
                    <Input value={editor.title} maxLength={200} onChange={(e) => setEditor({ ...editor, title: e.target.value })} />
                  </label>
                  <label className="text-sm">
                    <span className="text-text-muted">Category</span>
                    <Select value={editor.category} onChange={(e) => setEditor({ ...editor, category: e.target.value })}>
                      {PROMPT_TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </label>
                  <label className="text-sm">
                    <span className="text-text-muted">Icon</span>
                    <Input value={editor.icon} maxLength={8} onChange={(e) => setEditor({ ...editor, icon: e.target.value })} />
                  </label>
                </div>
                <label className="text-sm">
                  <span className="text-text-muted">Description</span>
                  <Input value={editor.description} maxLength={500} onChange={(e) => setEditor({ ...editor, description: e.target.value })} />
                </label>
                <label className="text-sm">
                  <span className="text-text-muted">
                    Content — use {"{{variable}}"} placeholders, {"{{variable|default}}"} for defaults
                  </span>
                  <Textarea
                    value={editor.content}
                    rows={10}
                    onChange={(e) => setEditor({ ...editor, content: e.target.value })}
                    className="font-mono text-xs"
                  />
                </label>
                {extractTemplateVars(editor.content).length > 0 ? (
                  <div className="text-xs text-text-muted">
                    Variables: {extractTemplateVars(editor.content).map((v) => <code key={v} className="mx-1 rounded bg-white/10 px-1">{v}</code>)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Modal>

          {/* Use / render modal */}
          <Modal
            open={useFor !== null}
            onClose={() => setUseFor(null)}
            title={useFor ? `Use — ${useFor.title}` : "Use template"}
            size="xl"
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setUseFor(null)}>Close</Button>
                <Button variant="success" onClick={() => void useNow()} disabled={busyId === useFor?.id}>
                  <Play className="h-4 w-4" />Record use
                </Button>
              </div>
            }
          >
            {useFor && useResult ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="grid gap-2">
                  <div className="text-sm text-text-muted">Variables</div>
                  {Object.keys(useVars).length === 0 ? (
                    <p className="text-sm text-text-muted">This template has no variables.</p>
                  ) : (
                    Object.entries(useVars).map(([name, value]) => (
                      <label key={name} className="text-sm">
                        <span className="text-text-muted">{name}</span>
                        <Input value={value} onChange={(e) => setUseVars({ ...useVars, [name]: e.target.value })} />
                      </label>
                    ))
                  )}
                  {useResult.missing.length > 0 ? (
                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/10 p-2 text-xs text-amber">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Unresolved: {useResult.missing.join(", ")} — these will render empty. Fill them before using the prompt.
                      </span>
                    </div>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => void copyRendered()}>
                    <Copy className="h-3.5 w-3.5" />Copy rendered text
                  </Button>
                </div>
                <div>
                  <div className="text-sm text-text-muted">Rendered preview</div>
                  <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-bg-deep/60 p-3 font-mono text-xs text-text-main">
                    {useResult.rendered}
                  </pre>
                </div>
              </div>
            ) : null}
          </Modal>
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Select value={String(windowDays)} onChange={(e) => setWindowDays(Number(e.target.value))} className="w-40">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void loadStats()}><RefreshCw className="h-4 w-4" />Refresh</Button>
          </div>

          {statsError ? (
            <Card className="mt-4 p-4 text-sm text-crimson">{statsError}</Card>
          ) : stats === null ? (
            <Card className="mt-4 p-6 text-center text-sm text-text-muted">Loading usage…</Card>
          ) : (
            <>
              {!stats.ledgerAvailable ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  The usage ledger could not be read. Window numbers below are empty, not zero.
                </div>
              ) : null}

              <div className="mt-4">{statCards}</div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Most used in window</CardTitle>
                    <CardDescription>uses recorded in the event ledger for this window</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {stats.topTemplates.length === 0 ? (
                      <p className="text-sm text-text-muted">No template was used in this window.</p>
                    ) : (
                      stats.topTemplates.map((t, i) => (
                        <div key={t.templateId} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-2 truncate">
                            <span className="text-text-muted">#{i + 1}</span>
                            <span className="truncate">{t.title ?? <em className="text-text-muted">deleted template</em>}</span>
                          </span>
                          <span className="shrink-0 text-text-muted">{t.uses} use{t.uses === 1 ? "" : "s"}</span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Recently used</CardTitle>
                    <CardDescription>most recent last-used timestamps from the ledger</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {stats.recentTemplates.length === 0 ? (
                      <p className="text-sm text-text-muted">No use has ever been recorded.</p>
                    ) : (
                      stats.recentTemplates.map((t) => (
                        <div key={t.templateId} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate">{t.title ?? <em className="text-text-muted">deleted template</em>}</span>
                          <span className="shrink-0 text-xs text-text-muted">
                            {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "unknown"}
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="mt-3">
                <CardHeader>
                  <CardTitle className="text-sm">Days with recorded use</CardTitle>
                  <CardDescription>
                    a day with no recorded event is absent, not zero — the ledger began {stats.ledgerStart ? new Date(stats.ledgerStart).toLocaleString() : "… never (no use recorded yet)"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stats.daily.length === 0 ? (
                    <p className="text-sm text-text-muted">No recorded use in this window.</p>
                  ) : (
                    <div className="grid gap-1.5">
                      {stats.daily.map((d) => {
                        const maxDaily = Math.max(...stats.daily.map((x) => x.uses));
                        const width = maxDaily > 0 ? Math.max(2, Math.min(100, (d.uses / maxDaily) * 100)) : 2;
                        return (
                          <div key={d.day} className="flex items-center gap-2 text-sm">
                            <span className="w-24 shrink-0 text-xs text-text-muted">{d.day}</span>
                            <div className="h-4 flex-1 overflow-hidden rounded bg-white/5">
                              <div className="h-full rounded bg-azure/60" style={{ width: `${width}%` }} />
                            </div>
                            <span className="w-16 shrink-0 text-right text-xs text-text-muted">{d.uses}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <p className="mt-3 text-xs text-text-muted">{stats.note}</p>
            </>
          )}
        </>
      )}

    </div>
  );
}

// Re-export so lazy imports can use `.then(m => m.PromptTemplatesPage)` uniformly.
export default PromptTemplatesPage;
