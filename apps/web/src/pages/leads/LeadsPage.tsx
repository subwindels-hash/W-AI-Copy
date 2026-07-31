/**
 * Session 85 — AI Lead Discovery (search + results dashboard + collections +
 * export). User-initiated only: nothing here ever contacts a lead. Search
 * requires GOOGLE_PLACES_API_KEY on the server; the UI says so honestly when
 * it is missing (SERVICE_UNAVAILABLE).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { leadApi, type Lead, type LeadCollection, type SearchResult } from "@/lib/leadDiscovery";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { DataBanner } from "@/components/ui/DataBanner";
import {
  Search, Loader2, Users, FolderPlus, Download, Globe2, Phone, FileText, CheckCircle2, Link2,
} from "lucide-react";

export function LeadsPage() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [collections, setCollections] = useState<LeadCollection[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newCollection, setNewCollection] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [l, c] = await Promise.all([leadApi.leads(), leadApi.collections()]);
      setLeads(l);
      setCollections(c);
    } catch { /* degrades silently on first load before server config */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = useCallback(async (action: string, fn: () => Promise<unknown>) => {
    setBusy(action); setErr(null); setNotice(null);
    try {
      const msg = await fn();
      if (typeof msg === "string") setNotice(msg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }, []);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    await run("search", async () => {
      const res = await leadApi.search(query.trim());
      setSearchResult(res);
      setCreatedAt(new Date().toISOString());
      await refresh();
      return `Found ${res.results.length} lead(s) for "${res.query}" from ${res.source}.`;
    });
  }, [query, run, refresh]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const createCollection = useCallback(async () => {
    const name = newCollection.trim();
    if (!name) return;
    await run("collection", async () => {
      const c = await leadApi.createCollection(name);
      setNewCollection("");
      await refresh();
      return `Collection "${c.name}" created.`;
    });
  }, [newCollection, run, refresh]);

  const saveToCollection = useCallback(async (collectionId: string, leadId: string) => {
    await run("save", async () => {
      const c = await leadApi.addToCollection(collectionId, leadId);
      await refresh();
      return `Saved "${leads.find((l) => l.id === leadId)?.name}" to "${c.name}".`;
    });
  }, [run, refresh, leads]);

  const exportLeads = useCallback(async (format: "json" | "csv") => {
    const ids = [...selected];
    if (ids.length === 0) { setErr("Select at least one lead to export."); return; }
    await run("export", async () => {
      if (format === "csv") { await leadApi.exportCsv(ids); return `Exported ${ids.length} lead(s) as CSV.`; }
      const data = await leadApi.exportJson(ids);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "windels-leads.json"; a.click();
      URL.revokeObjectURL(url);
      return `Exported ${data.leads.length} lead(s) as JSON.`;
    });
  }, [selected, run]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => [l.name, l.category, l.address, l.website, l.phone].some((v) => v?.toLowerCase().includes(q)));
  }, [leads, filter]);

  return (
    <div className="space-y-5 p-1">
      <div>
        <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2"><Users className="h-6 w-6 text-azure"/> AI Lead Discovery</h1>
        <p className="text-sm text-text-muted mt-1">Natural-language business search ("gyms in London", "construction companies in Nigeria") → structured results → collections → export. Discovery only — no automated outreach, ever.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-azure"/> Lead search</CardTitle><CardDescription>Powered by Google Places (textsearch) when GOOGLE_PLACES_API_KEY is configured on the server.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. gyms in London, construction companies in Abuja…" className="flex-1 min-w-64" onKeyDown={(e) => e.key === "Enter" && void search()}/>
          <Button onClick={search} disabled={searching || !query.trim()} className="gap-2">
            {searching ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>} Search
          </Button>
        </CardContent>
      </Card>

      {err && <DataBanner variant="no-creds" title="LEAD DISCOVERY" message={err}/>}
      {notice && !err && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0"/> {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Leads</CardTitle>
              <CardDescription>{visible.length} stored · {searchResult ? `${searchResult.results.length} from last search (${createdAt?.slice(0, 16).replace("T", " ")})` : "run a search to discover more"}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="w-40 h-8 text-xs"/>
              <Button size="sm" variant="outline" onClick={() => exportLeads("csv")} disabled={selected.size === 0 || busy === "export"} className="gap-1 h-8 text-xs"><Download className="h-3 w-3"/> CSV</Button>
              <Button size="sm" variant="outline" onClick={() => exportLeads("json")} disabled={selected.size === 0 || busy === "export"} className="gap-1 h-8 text-xs"><FileText className="h-3 w-3"/> JSON</Button>
            </div>
          </CardHeader>
          <CardContent>
            {visible.length === 0 && <div className="text-sm text-text-muted">No leads stored yet. Search above to discover businesses.</div>}
            <ul className="space-y-2">
              {visible.map((l) => (
                <li key={l.id} className={`p-2.5 rounded-lg border transition-colors ${selected.has(l.id) ? "border-azure/50 bg-azure/10" : "border-white/10 bg-white/[0.03]"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" className="accent-azure" checked={selected.has(l.id)} onChange={() => toggle(l.id)}/>
                        <span className="text-sm font-medium text-text-bright">{l.name}</span>
                        {l.category && <Badge variant="outline" className="capitalize">{l.category.replace(/_/g, " ")}</Badge>}
                      </div>
                      {l.address && <div className="text-xs text-text-muted mt-0.5 ml-6">{l.address}</div>}
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-muted ml-6 mt-0.5">
                        {l.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3"/> {l.phone}</span>}
                        {l.website && <a href={l.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-azure hover:underline"><Globe2 className="h-3 w-3"/> {l.website}</a>}
                        <span>· source: {l.source} · {l.discoveredAt.slice(0, 10)}</span>
                        <Badge variant="outline" className="text-emerald-300">{l.verificationStatus}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <SelectCollection collections={collections} onSave={(cid) => saveToCollection(cid, l.id)} disabled={busy === "save"}/>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FolderPlus className="h-4 w-4 text-azure"/> Collections</CardTitle><CardDescription>Organize selected leads into named lists.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={newCollection} onChange={(e) => setNewCollection(e.target.value)} placeholder="New collection name…" className="h-8 text-xs"/>
              <Button size="sm" variant="outline" onClick={createCollection} disabled={busy === "collection" || !newCollection.trim()} className="gap-1 h-8 text-xs"><FolderPlus className="h-3 w-3"/> Add</Button>
            </div>
            {collections.length === 0 && <div className="text-xs text-text-muted">No collections yet.</div>}
            <ul className="space-y-2">
              {collections.map((c) => (
                <li key={c.id} className="p-2 rounded-lg border border-white/10 bg-white/[0.03] text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-text-bright">{c.name}</span>
                    <Badge variant="outline">{c.leadIds.length} leads</Badge>
                  </div>
                  <div className="text-text-muted mt-1">created {c.createdAt.slice(0, 10)} · updated {c.updatedAt.slice(0, 16).replace("T", " ")}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SelectCollection({ collections, onSave, disabled }: { collections: LeadCollection[]; onSave: (id: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)} disabled={disabled || collections.length === 0} className="gap-1 h-7 text-xs">
        <Link2 className="h-3 w-3"/> Save to…
      </Button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-48 rounded-lg border border-white/15 bg-bg-card shadow-xl overflow-hidden">
          {collections.map((c) => (
            <button key={c.id} className="block w-full text-left px-3 py-2 text-xs hover:bg-white/5 text-text-bright" onClick={() => { onSave(c.id); setOpen(false); }}>
              {c.name} <span className="text-text-muted">({c.leadIds.length})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default LeadsPage;
