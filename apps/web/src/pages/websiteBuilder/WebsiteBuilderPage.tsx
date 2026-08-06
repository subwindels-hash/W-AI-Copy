/**
 * Session 93 — Website Builder dashboard.
 *
 * Sites, pages built from typed blocks, a real block→HTML renderer
 * (preview/publish snapshots), and AI copy with explicit provider labeling.
 * Fresh orgs start empty; published HTML is real renderer output.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { websiteBuilderApi } from "@/lib/websiteBuilder";
import type {
  WbRollup,
  WbSite,
  WbSiteDetail,
  WbPage,
  WbBlock,
  WbBlockProps,
  WbCopyResult,
} from "@/lib/websiteBuilder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Globe, FileText, Boxes, Rocket, Archive, PlusCircle, Sparkles, Eye, Trash2, ChevronDown, ChevronUp } from "lucide-react";

const SITE_BADGE: Record<WbSite["status"], "slate" | "emerald" | "danger"> = {
  draft: "slate", published: "emerald", archived: "danger",
};

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

export function WebsiteBuilderPage() {
  const [rollup, setRollup] = useState<WbRollup | null>(null);
  const [sites, setSites] = useState<WbSite[]>([]);
  const [detail, setDetail] = useState<WbSiteDetail | null>(null);
  const [selectedPage, setSelectedPage] = useState<WbPage | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [sName, setSName] = useState("");
  const [sSlug, setSSlug] = useState("");
  const [showPage, setShowPage] = useState(false);
  const [pPath, setPPath] = useState("");
  const [pTitle, setPTitle] = useState("");
  const [blockType, setBlockType] = useState<WbBlockProps["type"]>("hero");
  const [blockDraft, setBlockDraft] = useState("");
  const [blockDraft2, setBlockDraft2] = useState("");

  const [copyCtx, setCopyCtx] = useState("");
  const [copyKind, setCopyKind] = useState<"hero" | "section" | "cta">("hero");
  const [copy, setCopy] = useState<WbCopyResult | null>(null);
  const [copying, setCopying] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([websiteBuilderApi.rollup(), websiteBuilderApi.listSites()]);
      setRollup(r); setSites(s);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 4000); };

  const openSite = useCallback(async (id: string) => {
    try {
      const d = await websiteBuilderApi.getSiteDetail(id);
      setDetail(d);
      setPreview(null);
      setSelectedPage(null);
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);

  const selectPage = useCallback(async (page: WbPage) => {
    setSelectedPage(page);
    setPreview(null);
  }, []);

  const createSite = useCallback(async () => {
    if (!sName.trim() || !sSlug.trim()) return;
    try {
      await websiteBuilderApi.createSite({ name: sName.trim(), slug: sSlug.trim() });
      setSName(""); setSSlug("");
      setShowNew(false);
      flash("Site created.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [sName, sSlug, load]);

  const createPage = useCallback(async () => {
    if (!detail || !pPath.trim() || !pTitle.trim()) return;
    try {
      await websiteBuilderApi.createPage(detail.id, { path: pPath.trim(), title: pTitle.trim() });
      setPPath(""); setPTitle("");
      setShowPage(false);
      flash("Page created.");
      await openSite(detail.id);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [detail, pPath, pTitle, openSite]);

  const addBlock = useCallback(async () => {
    if (!selectedPage || !blockDraft.trim()) return;
    const props: WbBlockProps = (() => {
      switch (blockType) {
        case "hero": return { type: "hero", headline: blockDraft.trim(), subheadline: blockDraft2.trim() || undefined };
        case "text": return { type: "text", body: blockDraft.trim() };
        case "button": return { type: "button", label: blockDraft.trim(), href: blockDraft2.trim() || "#" };
        case "cta": return { type: "cta", headline: blockDraft.trim(), subheadline: blockDraft2.trim() || undefined };
        case "divider": return { type: "divider" };
        case "image": return { type: "image", src: blockDraft2.trim() || "#", alt: blockDraft.trim() };
        case "features": return { type: "features", items: [{ title: blockDraft.trim(), description: blockDraft2.trim() }] };
        case "html": return { type: "html", content: blockDraft.trim() };
      }
    })();
    try {
      await websiteBuilderApi.addBlock(selectedPage.id, props);
      setBlockDraft(""); setBlockDraft2("");
      flash("Block added.");
      const d = await websiteBuilderApi.getSiteDetail(detail!.id);
      setDetail(d);
      const page = d.pages.find((p) => p.id === selectedPage.id);
      if (page) setSelectedPage(page);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [selectedPage, blockType, blockDraft, blockDraft2, detail]);

  const removeBlock = useCallback(async (pageId: string, blockId: string) => {
    try {
      await websiteBuilderApi.removeBlock(pageId, blockId);
      const d = await websiteBuilderApi.getSiteDetail(detail!.id);
      setDetail(d);
      const page = d.pages.find((p) => p.id === pageId);
      if (page) setSelectedPage(page);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [detail]);

  const moveBlock = useCallback(async (page: WbPage, blockId: string, dir: -1 | 1) => {
    const ids = page.blocks.map((b) => b.id);
    const idx = ids.indexOf(blockId);
    const swap = idx + dir;
    if (swap < 0 || swap >= ids.length) return;
    const a = ids[idx];
    const b = ids[swap];
    if (a === undefined || b === undefined) return;
    ids[idx] = b;
    ids[swap] = a;
    try {
      await websiteBuilderApi.reorderBlocks(page.id, ids);
      const d = await websiteBuilderApi.getSiteDetail(detail!.id);
      setDetail(d);
      const p = d.pages.find((x) => x.id === page.id);
      if (p) setSelectedPage(p);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [detail]);

  const publish = useCallback(async () => {
    if (!detail) return;
    try {
      await websiteBuilderApi.publishSite(detail.id);
      flash("Site published — every page re-rendered from the real renderer.");
      await openSite(detail.id);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [detail, openSite, load]);

  const showPreview = useCallback(async (pageId: string) => {
    try {
      const res = await websiteBuilderApi.previewPage(pageId);
      setPreview(res.html);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);

  const generateCopy = useCallback(async () => {
    if (!copyCtx.trim()) return;
    setCopying(true);
    try {
      const c = await websiteBuilderApi.generateCopy({ kind: copyKind, context: copyCtx.trim() });
      setCopy(c);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setCopying(false); }
  }, [copyCtx, copyKind]);

  const sortedBlocks = useMemo(
    () => selectedPage ? [...selectedPage.blocks].sort((a, b) => a.order - b.order) : [],
    [selectedPage]
  );

  const c = rollup?.counts;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Website Builder</h1>
          <p className="text-sm text-text-muted">
            Sites, pages and blocks — Session 93. Published HTML is real renderer output, never simulated.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setShowNew(true); setShowPage(false); }}>
            <PlusCircle className="w-4 h-4 mr-1" /> Site
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowPage(true); setShowNew(false); }} disabled={!detail}>
            <FileText className="w-4 h-4 mr-1" /> Page
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPage(false)} disabled={!detail} title="Publish site">
            <Rocket className="w-4 h-4 mr-1" /> Publish
          </Button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      {showNew ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Site name" value={sName} onChange={(e) => setSName(e.target.value)} />
              <Input placeholder="Slug (e.g. marketing-site)" value={sSlug} onChange={(e) => setSSlug(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={createSite} disabled={!sName.trim() || !sSlug.trim()}>Create site</Button>
              <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showPage ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Path (e.g. /about)" value={pPath} onChange={(e) => setPPath(e.target.value)} />
              <Input placeholder="Title" value={pTitle} onChange={(e) => setPTitle(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={createPage} disabled={!pPath.trim() || !pTitle.trim()}>Create page</Button>
              <Button variant="ghost" onClick={() => setShowPage(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <Stat icon={<Globe className="w-5 h-5" />} label="Sites" value={String(c?.sites ?? 0)} sub={`${c?.publishedSites ?? 0} published`} />
        <Stat icon={<FileText className="w-5 h-5" />} label="Pages" value={String(c?.pages ?? 0)} sub={`${c?.publishedPages ?? 0} published`} />
        <Stat icon={<Boxes className="w-5 h-5" />} label="Blocks" value={String(c?.blocks ?? 0)} />
        <Stat icon={<Rocket className="w-5 h-5" />} label="Rendered" value={`${((c?.publishedPages ?? 0) > 0 ? 1 : 0)}`} sub={`${((rollup?.totalRenderedBytes ?? 0) / 1024).toFixed(1)} kB HTML`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sites */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sites</CardTitle>
            <CardDescription>Select a site to edit its pages.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sites.map((s) => (
                <button
                  key={s.id}
                  onClick={() => openSite(s.id)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                    detail?.id === s.id ? "border-azure/40 bg-azure/10" : "border-white/5 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text-bright truncate">{s.name}</span>
                    <Badge variant={SITE_BADGE[s.status]}>{s.status}</Badge>
                  </div>
                  <div className="text-xs text-text-muted truncate">/{s.slug}{s.domain ? ` · ${s.domain}` : ""}</div>
                </button>
              ))}
              {sites.length === 0 ? <p className="text-sm text-text-muted">No sites yet.</p> : null}
            </div>
          </CardContent>
        </Card>

        {/* Pages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pages</CardTitle>
            <CardDescription>{detail ? `${detail.pages.length} page(s) · ${detail.blocksTotal} block(s)` : "Select a site first."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(detail?.pages ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPage(p)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                    selectedPage?.id === p.id ? "border-azure/40 bg-azure/10" : "border-white/5 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text-bright truncate">{p.title}</span>
                    <Badge variant={p.status === "published" ? "emerald" : "slate"}>{p.status}</Badge>
                  </div>
                  <div className="text-xs text-text-muted">{p.path} · {p.blocks.length} blocks</div>
                </button>
              ))}
              {(detail?.pages ?? []).length === 0 ? <p className="text-sm text-text-muted">No pages yet.</p> : null}
            </div>
          </CardContent>
        </Card>

        {/* Page editor */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{selectedPage ? selectedPage.title : "Page editor"}</CardTitle>
            <CardDescription>
              {selectedPage ? `${selectedPage.path} — add, remove and reorder blocks.` : "Select a page to edit."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedPage ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Select value={blockType} onChange={(e) => setBlockType(e.target.value as WbBlockProps["type"])}>
                    <option value="hero">Hero</option>
                    <option value="text">Text</option>
                    <option value="button">Button</option>
                    <option value="cta">CTA</option>
                    <option value="divider">Divider</option>
                  </Select>
                  <Input placeholder={blockType === "button" ? "Label" : "Primary content"} value={blockDraft} onChange={(e) => setBlockDraft(e.target.value)} className="min-w-40 flex-1" />
                  {blockType !== "divider" && blockType !== "text" ? (
                    <Input placeholder={blockType === "button" ? "href" : "Secondary (optional)"} value={blockDraft2} onChange={(e) => setBlockDraft2(e.target.value)} className="min-w-40 flex-1" />
                  ) : null}
                  <Button onClick={addBlock} disabled={!blockDraft.trim()}><PlusCircle className="w-4 h-4 mr-1" />Add</Button>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {sortedBlocks.map((b, i) => (
                    <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-azure uppercase">{b.type}</div>
                        <div className="text-sm text-text-bright truncate">
                          {"headline" in b.props ? b.props.headline : "body" in b.props ? b.props.body : "label" in b.props ? b.props.label : b.type === "divider" ? "—" : "…"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => moveBlock(selectedPage, b.id, -1)} disabled={i === 0} className="text-text-muted hover:text-text-bright disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                        <button onClick={() => moveBlock(selectedPage, b.id, 1)} disabled={i === sortedBlocks.length - 1} className="text-text-muted hover:text-text-bright disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                        <button onClick={() => removeBlock(selectedPage.id, b.id)} className="text-text-muted hover:text-crimson"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                  {sortedBlocks.length === 0 ? <p className="text-sm text-text-muted">No blocks yet.</p> : null}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => showPreview(selectedPage.id)}><Eye className="w-4 h-4 mr-1" />Preview</Button>
                  <Button size="sm" variant="outline" onClick={() => websiteBuilderApi.publishPage(selectedPage.id).then(() => flash("Page published — snapshot rendered.")).then(() => openSite(detail!.id))}>
                    <Rocket className="w-4 h-4 mr-1" />Publish page
                  </Button>
                </div>
              </>
            ) : <p className="text-sm text-text-muted">—</p>}
          </CardContent>
        </Card>
      </div>

      {/* Preview */}
      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Preview (real renderer output)</CardTitle>
          </CardHeader>
          <CardContent>
            <iframe title="preview" sandbox="allow-same-origin" className="w-full h-96 rounded-lg border border-white/10 bg-white" srcDoc={preview} />
          </CardContent>
        </Card>
      ) : null}

      {/* AI copy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">AI copy</CardTitle>
          <CardDescription>Generate hero/section/CTA copy via the provider registry (real model when configured).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Select value={copyKind} onChange={(e) => setCopyKind(e.target.value as "hero" | "section" | "cta")}>
              <option value="hero">Hero</option>
              <option value="section">Section</option>
              <option value="cta">CTA</option>
            </Select>
            <Input placeholder="Context — what the site/company does…" value={copyCtx} onChange={(e) => setCopyCtx(e.target.value)} className="md:col-span-2" />
          </div>
          <Button onClick={generateCopy} disabled={!copyCtx.trim() || copying}>
            <Sparkles className="w-4 h-4 mr-1" /> {copying ? "Generating…" : "Generate copy"}
          </Button>
          {copy ? (
            <div className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 space-y-2">
              {copy.modelSource === "echo-demo" ? (
                <div className="rounded bg-amber/10 border border-amber/30 px-3 py-2 text-xs text-amber">
                  DEMO RESPONSE — no real AI model configured (provider: {copy.provider}). Set OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY / OLLAMA_BASE_URL for real copy.
                </div>
              ) : null}
              <div className="text-sm text-text-main whitespace-pre-wrap">{copy.text}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Site actions */}
      {detail ? (
        <div className="flex gap-2">
          <Button onClick={publish} disabled={detail.status === "archived"}>
            <Rocket className="w-4 h-4 mr-1" /> Publish {detail.name}
          </Button>
          <Button variant="outline" onClick={() => websiteBuilderApi.archiveSite(detail.id).then(() => flash("Site archived.")).then(load)}>
            <Archive className="w-4 h-4 mr-1" /> Archive
          </Button>
        </div>
      ) : null}
    </div>
  );
}
