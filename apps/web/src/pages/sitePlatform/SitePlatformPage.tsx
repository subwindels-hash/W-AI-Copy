/**
 * WINDELS AI OS — Site Platform console.
 *
 * Control summary, editable public pages and the review/testimonial feed used
 * on the marketing site. All state comes from the real site control plane.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Globe, FileText, Star, X } from "lucide-react";
import type { SpControlSummary, SpPageContent, SpReview } from "@windels/shared/sitePlatform";
import { siteAdminApi } from "@/lib/sitePlatform";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function toggleTone(v: boolean): any { return v ? "emerald" : "slate"; }

export function SitePlatformPage() {
  const [summary, setSummary] = useState<SpControlSummary | null>(null);
  const [pages, setPages] = useState<SpPageContent[]>([]);
  const [reviews, setReviews] = useState<SpReview[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [s, p, r] = await Promise.all([siteAdminApi.summary(), siteAdminApi.pageContent(), siteAdminApi.reviews()]);
      setSummary(s); setPages(p); setReviews(r);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!summary) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading site platform…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Globe className="h-6 w-6 text-azure" /> Site Platform</h1>
          <p className="text-sm text-text-muted">Public marketing site — pages, reviews &amp; integrations.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{summary.pagesEditable}</div><div className="text-sm text-text-muted">Editable pages</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{summary.reviews}</div><div className="text-sm text-text-muted">Reviews</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold text-azure">{summary.apisConfigured}/{summary.apisTotal}</div><div className="text-sm text-text-muted">APIs configured</div></CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-3xl font-semibold flex items-center gap-2">
            <Badge variant={toggleTone(summary.announcementLive)}>{summary.announcementLive ? "live" : "off"}</Badge>
          </div>
          <div className="text-sm text-text-muted">Announcement</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Integrations</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant={toggleTone(summary.smtpConfigured)}>SMTP {summary.smtpConfigured ? `(${summary.smtpProvider ?? "configured"})` : "not configured"}</Badge>
          <Badge variant={toggleTone(summary.mapEnabled)}>Contact map {summary.mapEnabled ? "enabled" : "disabled"}</Badge>
          <Badge variant={toggleTone(summary.chatConfigured)}>AI chat {summary.chatConfigured ? "configured" : "not configured"}</Badge>
        </CardContent>
      </Card>

      <Tabs defaultValue="pages">
        <TabsList>
          <TabsTrigger value="pages">Pages ({pages.length})</TabsTrigger>
          <TabsTrigger value="reviews">Reviews ({reviews.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pages">
          <Card><CardContent className="space-y-2 pt-4">
            {pages.length === 0 ? <div className="text-sm text-text-muted">No editable pages.</div> : pages.map((p) => (
              <div key={p.path} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-azure shrink-0"/>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{p.title}</div>
                    <div className="text-xs text-text-muted truncate">{p.path} — {p.lead}</div>
                  </div>
                </div>
                <Badge variant={p.enabled ? "emerald" : "slate"}>{p.enabled ? "enabled" : "disabled"}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="reviews">
          <Card><CardContent className="space-y-2 pt-4">
            {reviews.length === 0 ? <div className="text-sm text-text-muted flex items-center gap-2"><Star className="h-4 w-4"/>No reviews.</div> : reviews.map((r) => (
              <div key={r.id} className="border-b border-border/40 py-2">
                <div className="flex items-center gap-2 text-sm"><Star className="h-4 w-4 fill-amber-400 text-amber-400"/><span className="font-medium">{r.name}</span><span className="text-text-muted">· {r.title}</span></div>
                <div className="text-sm text-text-muted mt-0.5">"{r.quote}"</div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default SitePlatformPage;
