import { useCallback, useEffect, useState } from "react";
import { adminApi, type AdmUserRow } from "@/lib/admin";
import { siteAdminApi } from "@/lib/sitePlatform";
import type {
  SpAnnouncement, SpApiCredentialPublic, SpBrand, SpContactMap,
  SpPageContent, SpReview, SpSeoSettings, SpSmtpConfigPublic,
} from "@/lib/sitePlatform";
import { SP_API_CATALOG, SP_IMAGE_SLOTS } from "@windels/shared/sitePlatform";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import { useAuthStore } from "@/store/auth";

const TABS = ["brand", "pages", "reviews", "map", "apis", "announcement", "seo", "smtp", "admins"] as const;
type Tab = (typeof TABS)[number];

export function SiteControlPage({ embedded }: { embedded?: boolean }) {
  const me = useAuthStore((s) => s.user);
  const isSa = me?.role === "super_admin";
  const [tab, setTab] = useState<Tab>("brand");
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ann, setAnn] = useState<SpAnnouncement | null>(null);
  const [seo, setSeo] = useState<SpSeoSettings | null>(null);
  const [smtp, setSmtp] = useState<SpSmtpConfigPublic | null>(null);
  const [admins, setAdmins] = useState<AdmUserRow[]>([]);
  const [testTo, setTestTo] = useState(me?.email ?? "");
  const [newAdmin, setNewAdmin] = useState({ email: "", password: "", displayName: "" });
  const [brand, setBrand] = useState<SpBrand | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [pages, setPages] = useState<SpPageContent[]>([]);
  const [reviews, setReviews] = useState<SpReview[]>([]);
  const [map, setMap] = useState<SpContactMap | null>(null);
  const [apis, setApis] = useState<SpApiCredentialPublic[]>([]);
  const [customApi, setCustomApi] = useState({ label: "", baseUrl: "", apiKey: "" });
  const [apiDraft, setApiDraft] = useState<Record<string, { apiKey: string; baseUrl: string }>>({});

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 4000); };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : String(e));

  const load = useCallback(async () => {
    try {
      setAnn(await siteAdminApi.announcement());
      if (isSa) {
        const [s, sm, b, imgs, pc, rv, mp, al, list] = await Promise.all([
          siteAdminApi.seo(),
          siteAdminApi.smtp(),
          siteAdminApi.brand(),
          siteAdminApi.images(),
          siteAdminApi.pageContent(),
          siteAdminApi.reviews(),
          siteAdminApi.map(),
          siteAdminApi.apis(),
          adminApi.listUsers({ role: "admin", perPage: 50 }),
        ]);
        setSeo(s); setSmtp(sm); setBrand(b); setImages(imgs); setPages(pc); setReviews(rv); setMap(mp); setApis(al); setAdmins(list.users);
      }
      setErr(null);
    } catch (e) { fail(e); }
  }, [isSa]);
  useEffect(() => { void load(); }, [load]);

  async function onUpload(slot: string, file: File) {
    const mime = file.type as "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml" | "image/gif";
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"].includes(mime)) {
      setErr("Use PNG, JPEG, WebP, SVG, or GIF.");
      return;
    }
    const dataBase64 = await fileToDataUrl(file);
    try {
      const media = await siteAdminApi.uploadMedia({ slot, mime, dataBase64, filename: file.name });
      setImages((prev) => ({ ...prev, [slot]: media.url }));
      if (brand) {
        const next = { ...brand };
        if (slot === "logo") next.logo = media.url;
        if (slot === "favicon") next.favicon = media.url;
        if (slot === "chatAvatar") next.chatAvatar = media.url;
        if (slot === "hero") next.heroImage = media.url;
        if (slot === "workforceHero") next.workforceHero = media.url;
        setBrand(next);
      }
      flash(`Uploaded ${slot}.`);
    } catch (e) { fail(e); }
  }

  return (
    <div className={embedded ? "space-y-6" : "mx-auto max-w-6xl space-y-6"}>
      {!embedded && (
        <div>
          <Badge variant="crimson" className="mb-2">Super Admin</Badge>
          <h1 className="text-2xl font-black text-text-bright">Site & platform control</h1>
          <p className="text-sm text-text-muted">Logo, pages, reviews, contact map, and API credentials. Authorization is enforced by the API.</p>
        </div>
      )}
      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
        {TABS.filter((t) => isSa || t === "announcement").map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${tab === t ? "bg-azure-600 text-white" : "text-text-muted hover:text-white"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "brand" && isSa && brand && (
        <Card>
          <CardHeader><CardTitle>Brand & images</CardTitle><CardDescription>Logo, favicon, chat avatar, heroes, agent portraits, and review photos. Upload replaces the public slot immediately.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs">Chat agent name<Input value={brand.chatName} onChange={(e) => setBrand({ ...brand, chatName: e.target.value })} /></label>
              <label className="text-xs">Logo URL<Input value={brand.logo} onChange={(e) => setBrand({ ...brand, logo: e.target.value })} /></label>
              <label className="text-xs">Favicon URL<Input value={brand.favicon} onChange={(e) => setBrand({ ...brand, favicon: e.target.value })} /></label>
              <label className="text-xs">Chat avatar URL<Input value={brand.chatAvatar} onChange={(e) => setBrand({ ...brand, chatAvatar: e.target.value })} /></label>
            </div>
            <Button onClick={async () => { try { setBrand(await siteAdminApi.saveBrand(brand)); flash("Brand saved."); } catch (e) { fail(e); } }}>Save brand</Button>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SP_IMAGE_SLOTS.map((slot) => (
                <div key={slot} className="rounded-lg border border-white/10 p-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
                    <span>{slot}</span>
                    <img src={images[slot]} alt="" className="h-10 w-10 rounded object-cover bg-black/30" />
                  </div>
                  <Input className="mb-2 text-xs" value={images[slot] ?? ""} onChange={(e) => setImages({ ...images, [slot]: e.target.value })} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={async () => { try { setImages(await siteAdminApi.saveImage(slot, images[slot])); flash(`${slot} URL saved.`); } catch (e) { fail(e); } }}>Save URL</Button>
                    <label className="inline-flex cursor-pointer items-center rounded-lg border border-white/15 px-2 text-[11px] text-text-muted">
                      Upload
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(slot, f); }} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "pages" && isSa && (
        <Card>
          <CardHeader><CardTitle>Public pages</CardTitle><CardDescription>Edit title, lead, body, and hero image for every public page.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {pages.map((p, i) => (
              <div key={p.path} className="grid gap-2 rounded-lg border border-white/10 p-3 md:grid-cols-2">
                <div className="md:col-span-2 text-sm font-semibold text-text-bright">{p.path}</div>
                <label className="text-xs">Title<Input value={p.title} onChange={(e) => { const n = pages.slice(); n[i] = { ...p, title: e.target.value }; setPages(n); }} /></label>
                <label className="text-xs">Image URL<Input value={p.image ?? ""} onChange={(e) => { const n = pages.slice(); n[i] = { ...p, image: e.target.value || null }; setPages(n); }} /></label>
                <label className="text-xs md:col-span-2">Lead<Input value={p.lead} onChange={(e) => { const n = pages.slice(); n[i] = { ...p, lead: e.target.value }; setPages(n); }} /></label>
                <label className="text-xs md:col-span-2">Body<Textarea rows={3} value={p.body} onChange={(e) => { const n = pages.slice(); n[i] = { ...p, body: e.target.value }; setPages(n); }} /></label>
                <Button size="sm" onClick={async () => { try { const saved = await siteAdminApi.savePageContent(p); setPages((cur) => cur.map((x) => x.path === saved.path ? saved : x)); flash(`${p.path} saved.`); } catch (e) { fail(e); } }}>Save {p.path}</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "reviews" && isSa && (
        <Card>
          <CardHeader><CardTitle>Reviews</CardTitle><CardDescription>Always published as illustrative product-story quotes — never as verified customers.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {reviews.map((r, i) => (
              <div key={r.id} className="grid gap-2 rounded-lg border border-white/10 p-3 md:grid-cols-2">
                <Input value={r.name} onChange={(e) => { const n = reviews.slice(); n[i] = { ...r, name: e.target.value }; setReviews(n); }} />
                <Input value={r.title} onChange={(e) => { const n = reviews.slice(); n[i] = { ...r, title: e.target.value }; setReviews(n); }} />
                <Input className="md:col-span-2" value={r.quote} onChange={(e) => { const n = reviews.slice(); n[i] = { ...r, quote: e.target.value }; setReviews(n); }} />
                <div className="flex items-center gap-2 md:col-span-2">
                  <img src={r.image} alt="" className="h-10 w-10 rounded-full object-cover" />
                  <Input value={r.image} onChange={(e) => { const n = reviews.slice(); n[i] = { ...r, image: e.target.value }; setReviews(n); }} />
                  <Button size="sm" variant="outline" onClick={() => setReviews(reviews.filter((x) => x.id !== r.id))}>Remove</Button>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setReviews([...reviews, { id: `rev-${Date.now()}`, name: "New reviewer", title: "Illustrative org", quote: "Write an illustrative product-story quote.", image: "/reviews/reviewer-4.png", illustrative: true }])}>Add review</Button>
              <Button onClick={async () => { try { setReviews(await siteAdminApi.saveReviews(reviews)); flash("Reviews saved."); } catch (e) { fail(e); } }}>Save reviews</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "map" && isSa && map && (
        <Card>
          <CardHeader><CardTitle>Contact map</CardTitle><CardDescription>Shown on /contact only after you set latitude and longitude. OpenStreetMap tiles — no invented office.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <label className="text-xs">Enabled
              <Select value={map.enabled ? "yes" : "no"} onChange={(e) => setMap({ ...map, enabled: e.target.value === "yes" })}>
                <option value="yes">Enabled</option><option value="no">Disabled</option>
              </Select>
            </label>
            <label className="text-xs">Label<Input value={map.label ?? ""} onChange={(e) => setMap({ ...map, label: e.target.value || null })} /></label>
            <label className="text-xs md:col-span-2">Address<Input value={map.address ?? ""} onChange={(e) => setMap({ ...map, address: e.target.value || null })} /></label>
            <label className="text-xs">City<Input value={map.city ?? ""} onChange={(e) => setMap({ ...map, city: e.target.value || null })} /></label>
            <label className="text-xs">Country<Input value={map.country ?? ""} onChange={(e) => setMap({ ...map, country: e.target.value || null })} /></label>
            <label className="text-xs">Latitude<Input type="number" value={map.lat ?? ""} onChange={(e) => setMap({ ...map, lat: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label className="text-xs">Longitude<Input type="number" value={map.lng ?? ""} onChange={(e) => setMap({ ...map, lng: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label className="text-xs">Zoom<Input type="number" value={map.zoom} onChange={(e) => setMap({ ...map, zoom: Number(e.target.value) })} /></label>
            <Button onClick={async () => { try { setMap(await siteAdminApi.saveMap({ ...map, lat: map.lat, lng: map.lng })); flash("Map saved."); } catch (e) { fail(e); } }}>Save map</Button>
          </CardContent>
        </Card>
      )}

      {tab === "apis" && isSa && (
        <Card>
          <CardHeader><CardTitle>API credentials</CardTitle><CardDescription>Add, configure, or remove platform APIs. Keys are encrypted and never returned. Dashboard values override environment variables when enabled.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {apis.map((a) => {
              const cat = SP_API_CATALOG.find((c) => c.slot === a.slot);
              const draft = apiDraft[a.id] ?? { apiKey: "", baseUrl: a.baseUrl ?? cat?.defaultBaseUrl ?? "" };
              return (
                <div key={a.id} className="grid gap-2 rounded-lg border border-white/10 p-3 md:grid-cols-2">
                  <div className="md:col-span-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text-bright">{a.label}</span>
                    <Badge variant="slate">{a.category}</Badge>
                    {a.keySet ? <Badge variant="emerald">Key set</Badge> : <Badge variant="amber">No dashboard key</Badge>}
                    {a.envFallback ? <Badge variant="slate">env fallback</Badge> : null}
                  </div>
                  <Input placeholder="Base URL" value={draft.baseUrl} onChange={(e) => setApiDraft({ ...apiDraft, [a.id]: { ...draft, baseUrl: e.target.value } })} />
                  <Input placeholder="New secret (leave blank to keep)" type="password" value={draft.apiKey} onChange={(e) => setApiDraft({ ...apiDraft, [a.id]: { ...draft, apiKey: e.target.value } })} />
                  <div className="flex flex-wrap gap-2 md:col-span-2">
                    <Button size="sm" onClick={async () => {
                      try {
                        setApis(await siteAdminApi.saveApi({
                          id: a.id, slot: a.slot, enabled: true, baseUrl: draft.baseUrl || null,
                          apiKey: draft.apiKey || undefined, label: a.label, category: a.category,
                        }));
                        setApiDraft({ ...apiDraft, [a.id]: { ...draft, apiKey: "" } });
                        flash(`${a.label} saved.`);
                      } catch (e) { fail(e); }
                    }}>Save</Button>
                    <Button size="sm" variant="outline" onClick={async () => {
                      try { setApis(await siteAdminApi.saveApi({ id: a.id, slot: a.slot, enabled: !a.enabled })); flash(`${a.label} ${a.enabled ? "disabled" : "enabled"}.`); }
                      catch (e) { fail(e); }
                    }}>{a.enabled ? "Disable" : "Enable"}</Button>
                    {(a.removable || a.keySet) && (
                      <Button size="sm" variant="outline" onClick={async () => {
                        try { setApis(await siteAdminApi.removeApi(a.id)); flash(`${a.label} removed from dashboard.`); }
                        catch (e) { fail(e); }
                      }}>Remove</Button>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="grid gap-2 rounded-lg border border-dashed border-white/15 p-3 md:grid-cols-4">
              <Input placeholder="Custom API name" value={customApi.label} onChange={(e) => setCustomApi({ ...customApi, label: e.target.value })} />
              <Input placeholder="https://api.example.com" value={customApi.baseUrl} onChange={(e) => setCustomApi({ ...customApi, baseUrl: e.target.value })} />
              <Input placeholder="API key" type="password" value={customApi.apiKey} onChange={(e) => setCustomApi({ ...customApi, apiKey: e.target.value })} />
              <Button onClick={async () => {
                if (!customApi.label || !customApi.baseUrl) { setErr("Custom APIs need a name and URL."); return; }
                try {
                  setApis(await siteAdminApi.saveApi({
                    slot: `custom-${customApi.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
                    label: customApi.label, category: "custom", enabled: true,
                    baseUrl: customApi.baseUrl, apiKey: customApi.apiKey || undefined,
                  }));
                  setCustomApi({ label: "", baseUrl: "", apiKey: "" });
                  flash("Custom API added.");
                } catch (e) { fail(e); }
              }}>Add API</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "announcement" && ann && (
        <Card>
          <CardHeader><CardTitle>Announcement</CardTitle><CardDescription>Public ticker. Hidden automatically when disabled or outside its dates.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <label className="text-xs">Enabled
              <Select value={ann.enabled ? "yes" : "no"} onChange={(e) => setAnn({ ...ann, enabled: e.target.value === "yes" })}>
                <option value="yes">Enabled</option><option value="no">Disabled</option>
              </Select>
            </label>
            <label className="text-xs">Animation
              <Select value={ann.animationEnabled ? "yes" : "no"} onChange={(e) => setAnn({ ...ann, animationEnabled: e.target.value === "yes" })}>
                <option value="yes">On</option><option value="no">Off</option>
              </Select>
            </label>
            <label className="text-xs md:col-span-2">Message<Input value={ann.message} onChange={(e) => setAnn({ ...ann, message: e.target.value })} /></label>
            <label className="text-xs">Link<Input value={ann.link ?? ""} onChange={(e) => setAnn({ ...ann, link: e.target.value || null })} /></label>
            <label className="text-xs">Link label<Input value={ann.linkLabel ?? ""} onChange={(e) => setAnn({ ...ann, linkLabel: e.target.value || null })} /></label>
            <Button onClick={async () => { try { setAnn(await siteAdminApi.saveAnnouncement(ann)); flash("Announcement saved."); } catch (e) { fail(e); } }}>Save announcement</Button>
          </CardContent>
        </Card>
      )}

      {tab === "seo" && isSa && seo && (
        <Card>
          <CardHeader><CardTitle>SEO settings</CardTitle><CardDescription>Applied to public pages. Do not put secrets in metadata.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {(["siteTitle", "metaDescription", "keywords", "canonicalUrl", "robots", "ogTitle", "ogDescription", "ogImage", "twitterTitle", "twitterDescription", "twitterImage", "favicon", "siteLogo", "googleVerification", "bingVerification"] as const).map((k) => (
              <label key={k} className="text-xs">
                {k}
                <Input value={(seo[k] as string | null) ?? ""} onChange={(e) => setSeo({ ...seo, [k]: e.target.value || null })} />
              </label>
            ))}
            <Button onClick={async () => { try { setSeo(await siteAdminApi.saveSeo(seo)); flash("SEO saved."); } catch (e) { fail(e); } }}>Save SEO</Button>
          </CardContent>
        </Card>
      )}

      {tab === "smtp" && isSa && smtp && (
        <Card>
          <CardHeader><CardTitle>Email / SMTP</CardTitle><CardDescription>Two slots. Passwords are stored encrypted and never returned.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <label className="text-xs">Active provider
              <Select value={smtp.active} onChange={(e) => setSmtp({ ...smtp, active: e.target.value as "cpanel" | "external" })}>
                <option value="cpanel">cPanel SMTP</option>
                <option value="external">External SMTP</option>
              </Select>
            </label>
            {smtp.slots.map((slot, i) => (
              <div key={slot.id} className="grid gap-2 rounded-lg border border-white/10 p-3 md:grid-cols-2">
                <div className="md:col-span-2 text-sm text-text-bright">{slot.label} {slot.passwordSet ? <Badge variant="slate">Password •••••••••</Badge> : <Badge variant="amber">No password</Badge>}</div>
                <Input placeholder="Host" value={slot.host} onChange={(e) => {
                  const slots = smtp.slots.slice(); slots[i] = { ...slot, host: e.target.value }; setSmtp({ ...smtp, slots });
                }} />
                <Input placeholder="Port" type="number" value={slot.port} onChange={(e) => {
                  const slots = smtp.slots.slice(); slots[i] = { ...slot, port: Number(e.target.value) }; setSmtp({ ...smtp, slots });
                }} />
                <Input placeholder="Username" value={slot.username} onChange={(e) => {
                  const slots = smtp.slots.slice(); slots[i] = { ...slot, username: e.target.value }; setSmtp({ ...smtp, slots });
                }} />
                <Input placeholder="New password (leave blank to keep)" type="password" onChange={(e) => {
                  const slots = smtp.slots.slice(); (slots[i] as any).password = e.target.value; setSmtp({ ...smtp, slots });
                }} />
                <Input placeholder="From email" value={slot.fromEmail} onChange={(e) => {
                  const slots = smtp.slots.slice(); slots[i] = { ...slot, fromEmail: e.target.value }; setSmtp({ ...smtp, slots });
                }} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button onClick={async () => {
                try {
                  const cpanel = smtp.slots.find((s) => s.id === "cpanel")!;
                  const external = smtp.slots.find((s) => s.id === "external")!;
                  setSmtp(await siteAdminApi.saveSmtp({
                    active: smtp.active,
                    cpanel: { host: cpanel.host, port: cpanel.port, username: cpanel.username, fromEmail: cpanel.fromEmail, password: (cpanel as any).password },
                    external: { host: external.host, port: external.port, username: external.username, fromEmail: external.fromEmail, password: (external as any).password },
                  }));
                  flash("SMTP saved.");
                } catch (e) { fail(e); }
              }}>Save configuration</Button>
              <Input className="max-w-xs" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Test recipient" />
              <Button variant="outline" onClick={async () => {
                try {
                  const r = await siteAdminApi.testSmtp(testTo);
                  flash(r.ok && r.sent ? `✓ Test email sent via ${r.provider}` : `✕ ${r.reason}${r.error ? `: ${r.error}` : ""}`);
                } catch (e) { fail(e); }
              }}>Send test email</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "admins" && isSa && (
        <Card>
          <CardHeader><CardTitle>Administrators</CardTitle><CardDescription>Create, disable, or change roles. Super Admin only. Enforced on the API.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-4">
              <Input placeholder="Name" value={newAdmin.displayName} onChange={(e) => setNewAdmin({ ...newAdmin, displayName: e.target.value })} />
              <Input placeholder="Email" value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} />
              <Input placeholder="Temporary password" type="password" value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} />
              <Button onClick={async () => {
                try { await siteAdminApi.createAdmin(newAdmin); flash("Administrator created."); setNewAdmin({ email: "", password: "", displayName: "" }); await load(); }
                catch (e) { fail(e); }
              }}>Create admin</Button>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {admins.map((u) => (
                  <tr key={u.id} className="border-t border-white/5">
                    <td className="py-2">{u.profile?.displayName || u.email}<div className="text-xs text-text-muted">{u.email}</div></td>
                    <td><Badge variant={u.isSuspended ? "crimson" : "emerald"}>{u.isSuspended ? "disabled" : "active"}</Badge></td>
                    <td className="text-right">
                      <Button size="sm" variant="outline" onClick={() => void adminApi.setSuspended(u.id, !u.isSuspended).then(load)}>{u.isSuspended ? "Reactivate" : "Disable"}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export default SiteControlPage;
