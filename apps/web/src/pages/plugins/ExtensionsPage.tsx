/**
 * WINDELS Command Center → Extensions.
 *
 * Marketplace discovery, one-click install with permissions, installed
 * extensions with configure/disable/uninstall, connections (OAuth/API key),
 * and natural-language capability discovery. Reuses the existing design
 * system; all actions hit /plugins.
 */
import { useCallback, useEffect, useState } from "react";
import { pluginOsApi } from "@/lib/pluginOs";
import type { InstalledPlugin, IntentResolution, MarketplaceEntry, PluginConnection, PluginManifest } from "@windels/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Puzzle, Power, Search, Shield, Link2, Sparkles, Check, Trash2 } from "lucide-react";

export default function ExtensionsPage() {
  const [tab, setTab] = useState("discover");
  const [catalog, setCatalog] = useState<MarketplaceEntry[]>([]);
  const [installed, setInstalled] = useState<Array<{ plugin: InstalledPlugin; manifest: PluginManifest | null }>>([]);
  const [connections, setConnections] = useState<PluginConnection[]>([]);
  const [q, setQ] = useState("");
  const [intent, setIntent] = useState("");
  const [resolved, setResolved] = useState<IntentResolution | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [c, i, conn] = await Promise.all([pluginOsApi.marketplace(), pluginOsApi.installed(), pluginOsApi.connections()]);
    setCatalog(c); setInstalled(i); setConnections(conn);
  }, []);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  const install = async (m: PluginManifest) => {
    setBusy(true); setErr(null);
    try {
      const granted = confirm(`Install ${m.name}?\n\nPermissions: ${m.permissions.join(", ") || "none"}`);
      if (!granted) return;
      await pluginOsApi.install(m.id, m.permissions);
      await refresh();
    } catch (e: any) { setErr(e?.message ?? "Install failed"); }
    finally { setBusy(false); }
  };

  const toggle = async (p: InstalledPlugin) => {
    await pluginOsApi.setStatus(p.manifestId, p.status === "enabled" ? "disabled" : "enabled");
    refresh();
  };

  const uninstall = async (p: InstalledPlugin) => {
    if (!confirm(`Uninstall ${p.manifestId}?`)) return;
    await pluginOsApi.uninstall(p.manifestId); refresh();
  };

  const isInstalled = (id: string) => installed.some((i) => i.plugin.manifestId === id);

  const resolveIntent = async () => {
    setBusy(true); setErr(null);
    try { setResolved(await pluginOsApi.resolveIntent(intent)); }
    catch (e: any) { setErr(e?.message); }
    finally { setBusy(false); }
  };

  const filtered = catalog.filter((c) =>
    !q || c.manifest.name.toLowerCase().includes(q.toLowerCase()) || c.manifest.description.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Puzzle className="w-7 h-7 text-violet" />
        <div>
          <h1 className="text-2xl font-bold">Extensions</h1>
          <p className="text-sm text-text-muted">Install plugins and modules; WINDELS discovers and routes capabilities to agents automatically.</p>
        </div>
      </div>

      {err && <div className="rounded-lg border border-crimson/40 bg-crimson/10 px-4 py-2 text-sm text-crimson">{err}</div>}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Ask WINDELS</CardTitle>
          <CardDescription>Describe what you want — WINDELS finds the right capability or suggests an extension.</CardDescription></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="Create a cinematic product advertisement video." value={intent} onChange={(e) => setIntent(e.target.value)} />
          <Button onClick={resolveIntent} loading={busy}><Search className="w-4 h-4 mr-1" /> Find</Button>
        </CardContent>
        {resolved && (
          <CardContent>
            <div className="rounded-lg border border-white/10 p-3 space-y-2">
              <div className="text-sm">Capability: <b className="text-text-bright">{resolved.capability}</b></div>
              {resolved.route.installed ? (
                <div className="flex items-center gap-2 text-sm text-emerald"><Check className="w-4 h-4" /> Ready via {resolved.route.pluginId}</div>
              ) : (
                <div className="text-sm">
                  Not installed. {resolved.recommendations?.length ? "Recommended:" : ""}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {resolved.recommendations?.map((r: { id: string; name: string }) => (
                      <Badge key={r.id} variant="violet">{r.name}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="discover">Discover</TabsTrigger>
          <TabsTrigger value="installed">Installed ({installed.length})</TabsTrigger>
          <TabsTrigger value="connections">Connections ({connections.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="space-y-4">
          <Input placeholder="Search extensions..." value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(({ manifest: m, installs, ratingAvg, reviewCount }) => (
              <Card key={m.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="text-3xl">{m.icon ?? "🧩"}</div>
                    <Badge variant={m.trust === "official" ? "emerald" : m.trust === "verified" ? "azure" : "slate"}>{m.trust}</Badge>
                  </div>
                  <CardTitle className="text-base">{m.name}</CardTitle>
                  <CardDescription>{m.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">{m.category}</Badge>
                    {m.capabilities.slice(0, 3).map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
                  </div>
                  <div className="text-xs text-text-muted">{installs.toLocaleString()} installs · {ratingAvg.toFixed(1)}★ ({reviewCount}) · v{m.version}</div>
                  {isInstalled(m.id)
                    ? <Button variant="secondary" disabled className="w-full"><Check className="w-4 h-4 mr-1" /> Installed</Button>
                    : <Button onClick={() => install(m)} loading={busy} className="w-full">Install</Button>}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="installed" className="space-y-3">
          {installed.length === 0 && <p className="text-sm text-text-muted">No extensions installed yet.</p>}
          {installed.map(({ plugin: p, manifest: m }) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <div className="font-medium flex items-center gap-2">{m?.name ?? p.manifestId}
                    <Badge variant={p.health === "healthy" ? "emerald" : "amber"}>{p.health}</Badge></div>
                  <div className="text-xs text-text-muted">v{p.version} · {p.grantedPermissions.length} permissions</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => toggle(p)}><Power className="w-3 h-3 mr-1" />{p.status === "enabled" ? "Disable" : "Enable"}</Button>
                  <Button size="sm" variant="outline" onClick={() => uninstall(p)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="connections" className="space-y-3">
          {connections.length === 0 && <p className="text-sm text-text-muted">No connections. Connect a plugin from its settings.</p>}
          {connections.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3"><Link2 className="w-4 h-4 text-azure" />
                  <div><div className="font-medium text-sm">{c.displayName}</div><div className="text-xs text-text-muted">{c.type} · {c.status}</div></div>
                </div>
                <Button size="sm" variant="outline" onClick={() => pluginOsApi.removeConnection(c.id).then(refresh)}><Trash2 className="w-3 h-3" /></Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
