/**
 * Session 98 — Enterprise Search.
 *
 * Unified, org-scoped search over the REAL module records (CRM, ERP, Email,
 * Social, Helpdesk, Software Factory, BI) with deterministic relevance
 * ranking and facets. Results are computed live — no fabricated hits.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { searchApi } from "@/lib/enterpriseSearch";
import type { EsSearchResult, EsRollup, EsRecentSearch, EsEntityType } from "@/lib/enterpriseSearch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Search, History, XCircle, Database } from "lucide-react";

const TYPE_LABEL: Record<EsEntityType, string> = {
  contact: "Contact", company: "Company", deal: "Deal", product: "Product",
  supplier: "Supplier", purchase_order: "PO", sales_order: "SO",
  message: "Message", post: "Post", comment: "Comment", ticket: "Ticket",
  task: "Task", project: "Project", artifact: "Artifact", report: "Report",
};

const TYPE_BADGE: Record<EsEntityType, "slate" | "azure" | "violet" | "teal" | "amber" | "emerald" | "fuchsia"> = {
  contact: "azure", company: "violet", deal: "amber", product: "teal",
  supplier: "emerald", purchase_order: "slate", sales_order: "slate",
  message: "azure", post: "violet", comment: "teal", ticket: "amber",
  task: "emerald", project: "fuchsia", artifact: "azure", report: "violet",
};

export function EnterpriseSearchPage() {
  const [rollup, setRollup] = useState<EsRollup | null>(null);
  const [history, setHistory] = useState<EsRecentSearch[]>([]);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<EsSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, h] = await Promise.all([searchApi.rollup(), searchApi.history()]);
      setRollup(r); setHistory(h);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 3000); };

  const run = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setSearching(true); setErr(null);
    try {
      const res = await searchApi.query(query.trim());
      setResult(res);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setSearching(false); }
  }, [load]);

  const totalIndexed = useMemo(
    () => (rollup ? Object.values(rollup.indexedCounts).reduce((s, n) => s + n, 0) : 0),
    [rollup]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-text-bright">Enterprise Search</h1>
        <p className="text-sm text-text-muted">
          Unified search across the real module records — Session 98. Results are computed live with deterministic relevance ranking.
        </p>
      </div>

      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <Input
            placeholder="Search contacts, products, tickets, emails, projects…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") run(q); }}
            className="pl-9"
          />
        </div>
        <Button onClick={() => run(q)} disabled={!q.trim() || searching}>
          {searching ? "Searching…" : "Search"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-text-muted uppercase tracking-wide flex items-center gap-1"><Database className="w-3.5 h-3.5" /> Indexed records</div>
            <div className="text-2xl font-black text-text-bright">{totalIndexed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-text-muted uppercase tracking-wide flex items-center gap-1"><History className="w-3.5 h-3.5" /> Recent searches</div>
            <div className="text-2xl font-black text-text-bright">{history.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-text-muted uppercase tracking-wide">Last search</div>
            <div className="text-2xl font-black text-text-bright truncate">{rollup?.lastUpdatedAt ? new Date(rollup.lastUpdatedAt).toLocaleTimeString() : "—"}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Results */}
        <div className="lg:col-span-2 space-y-3">
          {result ? (
            <div className="text-sm text-text-muted">
              {result.total} result(s) for "{result.query}" · {result.tookMs}ms
            </div>
          ) : null}
          {result?.hits.map((h) => (
            <Card key={`${h.type}:${h.id}`}>
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-text-bright truncate">{h.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={TYPE_BADGE[h.type]}>{TYPE_LABEL[h.type]}</Badge>
                    <span className="text-xs text-text-muted">{h.score.toFixed(1)}</span>
                  </div>
                </div>
                {h.snippet ? <p className="text-sm text-text-main line-clamp-2">{h.snippet}</p> : null}
                <div className="text-xs text-text-muted">
                  {h.meta ? `${h.meta} · ` : ""}{new Date(h.updatedAt).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          ))}
          {result && result.hits.length === 0 ? <p className="text-sm text-text-muted">No matches for "{result.query}".</p> : null}
          {!result ? <p className="text-sm text-text-muted">Run a search to see live results from the module stores.</p> : null}
        </div>

        {/* Facets + history */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Facets</CardTitle><CardDescription>Matches grouped by entity type.</CardDescription></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(result?.facets ?? []).map((f) => (
                  <button key={f.type} onClick={() => run(result!.query)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10">
                    {TYPE_LABEL[f.type]} <span className="text-text-muted">{f.count}</span>
                  </button>
                ))}
                {result && result.facets.length === 0 ? <p className="text-sm text-text-muted">No facets.</p> : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent searches</CardTitle>
              <CardDescription>Org-scoped history.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                    <button onClick={() => run(h.query)} className="text-sm text-text-bright hover:underline truncate">{h.query}</button>
                    <button onClick={() => searchApi.removeHistory(h.id).then(load)} className="text-text-muted hover:text-crimson shrink-0">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {history.length === 0 ? <p className="text-sm text-text-muted">No recent searches.</p> : null}
                {history.length > 0 ? (
                  <Button size="sm" variant="ghost" onClick={() => searchApi.clearHistory().then(() => { setHistory([]); flash("History cleared."); })}>
                    Clear history
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
