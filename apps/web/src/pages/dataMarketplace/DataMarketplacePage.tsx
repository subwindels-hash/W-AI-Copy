/**
 * WINDELS AI OS — Data & Knowledge Marketplace console.
 *
 * Dedicated console for the Session 61 Data Marketplace (datasets, knowledge
 * packs, RAG collections, prompt libraries, business templates, licensed data
 * products). Mirrors the Session 168 honesty discipline: ratings are the mean
 * of persisted reviews (null until the first), quality scores are null (the
 * platform never assesses quality), and revenue is a real 30-day window.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Package, Star, Plus, X, Download, ShieldCheck, ShieldAlert } from "lucide-react";
import type { DmDashboard, MarketplaceAsset, MarketplaceInstall } from "@windels/shared";
import { MKT_ASSET_KINDS, MKT_LICENSE_MODELS } from "@windels/shared";
import { dmApi } from "@/lib/dataMarketplace";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

function fmtMoney(n: number) { return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }
function fmtDate(s?: string) { if (!s) return "—"; try { return new Date(s).toLocaleString(); } catch { return s; } }

function LicenseBadge({ model }: { model: MarketplaceAsset["licenseModel"] }) {
  const tone = model === "free" ? "emerald" : model === "one_time" ? "azure" : "violet";
  return <Badge variant={tone as any}>{model.replace("_", " ")}</Badge>;
}

function Rating({ asset }: { asset: MarketplaceAsset }) {
  if (asset.rating === null) return <span className="text-xs text-text-muted">no reviews</span>;
  return (
    <span className="text-xs text-amber-400 flex items-center gap-1">
      <Star className="h-3 w-3 fill-current" /> {asset.rating.toFixed(1)}
      <span className="text-text-muted">({asset.reviewCount})</span>
    </span>
  );
}

export function DataMarketplacePage() {
  const [data, setData] = useState<DmDashboard | null>(null);
  const [assets, setAssets] = useState<MarketplaceAsset[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<string>("");

  // publish form
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [pKind, setPKind] = useState<MarketplaceAsset["kind"]>("dataset");
  const [licenseModel, setLicenseModel] = useState<MarketplaceAsset["licenseModel"]>("free");
  const [priceUsd, setPriceUsd] = useState("");
  const [tags, setTags] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, a] = await Promise.all([dmApi.dashboard(), dmApi.list(kind || undefined)]);
      setData(d); setAssets(a);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, [kind]);

  useEffect(() => { void load(); }, [load]);

  async function publish() {
    setErr(null);
    try {
      await dmApi.publish({
        name, description: desc, kind: pKind, licenseModel,
        priceUsd: priceUsd ? Number(priceUsd) : undefined,
        tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setName(""); setDesc(""); setPriceUsd(""); setTags("");
      await load();
    } catch (e: any) { setErr(e?.message ?? "Publish failed"); }
  }

  async function install(id: string) {
    setErr(null);
    try { await dmApi.install(id); await load(); } catch (e: any) { setErr(e?.message ?? "Install failed"); }
  }

  async function review(id: string, rating: number) {
    setErr(null);
    try { await dmApi.review(id, rating); await load(); } catch (e: any) { setErr(e?.message ?? "Review failed"); }
  }

  if (!data) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading marketplace…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Package className="h-6 w-6 text-azure" /> Data &amp; Knowledge Marketplace</h1>
          <p className="text-sm text-text-muted">Datasets, knowledge packs, RAG collections, prompt libraries and licensed data products.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2">
          <X className="h-4 w-4" />{err}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{data.totalAssets}</div><div className="text-sm text-text-muted">Total assets</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold text-emerald-500">{data.published}</div><div className="text-sm text-text-muted">Published</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold">{data.installsTotal}</div><div className="text-sm text-text-muted">Installs</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-3xl font-semibold text-azure">{fmtMoney(data.revenue30dUsd)}</div><div className="text-sm text-text-muted">Revenue (30d)</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Publish an asset</CardTitle><CardDescription>Create a draft that becomes visible once approved.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Select value={pKind} onChange={(e) => setPKind(e.target.value as any)}>
              {MKT_ASSET_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
            </Select>
            <Select value={licenseModel} onChange={(e) => setLicenseModel(e.target.value as any)}>
              {MKT_LICENSE_MODELS.map((l) => <option key={l} value={l}>{l.replace(/_/g, " ")}</option>)}
            </Select>
          </div>
          <Textarea placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input placeholder="Price (USD) — leave blank for free" type="number" value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} />
            <Input placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <Button onClick={() => void publish()}><Plus className="h-4 w-4 mr-1"/>Publish</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Assets</CardTitle>
            <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-48">
              <option value="">All kinds</option>
              {MKT_ASSET_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
            </Select>
          </div>
          <CardDescription>{busy ? "Refreshing…" : `${assets.length} assets`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {assets.length === 0 ? (
            <div className="text-sm text-text-muted">No assets yet. Publish one above.</div>
          ) : assets.map((a) => (
            <div key={a.id} className="border-b border-border/40 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{a.name}</span>
                  <Badge variant="outline">{a.kind.replace(/_/g, " ")}</Badge>
                  <LicenseBadge model={a.licenseModel} />
                  <Rating asset={a} />
                </div>
                <div className="text-sm text-text-muted mt-1 truncate">{a.description}</div>
                <div className="text-xs text-text-muted mt-1">
                  {a.installs} installs · v{a.version} · {a.lineageStatus}
                  {a.qualityScore === null ? " · quality not assessed" : ` · quality ${Math.round(a.qualityScore * 100)}%`}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex flex-col gap-1">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button key={r} className="text-xs text-amber-500 hover:text-amber-300" onClick={() => void review(a.id, r)}>{r}★</button>
                  ))}
                </div>
                <Button size="sm" variant="outline" onClick={() => void install(a.id)} disabled={a.status !== "published"}>
                  <Download className="h-3 w-3 mr-1"/>Install
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent installs</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {data.recentInstalls.length === 0 ? (
            <div className="text-sm text-text-muted">No installs recorded.</div>
          ) : data.recentInstalls.map((inst: MarketplaceInstall) => (
            <div key={inst.id} className="text-sm flex justify-between py-1 border-b border-border/30">
              <span>{inst.assetId} — {inst.status}</span>
              <span className="text-text-muted text-xs">{fmtDate(inst.installedAt)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {data.provenance && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {data.provenance.entries.some((e) => e.basis === "not_measured")
                ? <ShieldAlert className="h-4 w-4 text-amber-400" /> : <ShieldCheck className="h-4 w-4 text-emerald-400" />}
              Provenance
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-text-muted space-y-1">
            {data.provenance.entries.map((e, i) => (
              <div key={i}><strong>{e.field}:</strong> {e.basis} — {e.detail}</div>
            ))}
            <div className="pt-2">{data.provenance.note}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default DataMarketplacePage;
