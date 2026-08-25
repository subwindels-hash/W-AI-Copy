/**
 * WINDELS AI OS — Plugin OS console.
 *
 * Marketplace, installed plugins and connections. Plugin status reflects the
 * real registry.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Puzzle, Plus, X, Plug } from "lucide-react";
import type { InstalledPlugin, MarketplaceEntry, PluginConnection, PluginManifest } from "@windels/shared";
import { pluginOsApi } from "@/lib/pluginOs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function statusTone(s?: string): any {
  return s === "enabled" || s === "installed" ? "emerald"
    : s === "disabled" || s === "auth_required" || s === "degraded" ? "amber"
    : s === "failed" || s === "blocked" ? "crimson" : "slate";
}
function connTone(s?: string): any {
  return s === "connected" || s === "active" ? "emerald" : s === "error" || s === "revoked" ? "crimson" : "amber";
}

export function PluginOsPage() {
  const [installed, setInstalled] = useState<Array<{ plugin: InstalledPlugin; manifest: PluginManifest | null }>>([]);
  const [marketplace, setMarketplace] = useState<MarketplaceEntry[]>([]);
  const [connections, setConnections] = useState<PluginConnection[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [i, m, c] = await Promise.all([pluginOsApi.installed(), pluginOsApi.marketplace(), pluginOsApi.connections()]);
      setInstalled(i); setMarketplace(m); setConnections(c);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function install(id: string) {
    setErr(null); try { await pluginOsApi.install(id); await load(); } catch (e: any) { setErr(e?.message ?? "Install failed"); }
  }
  async function setStatus(id: string, status: string) {
    setErr(null); try { await pluginOsApi.setStatus(id, status); await load(); } catch (e: any) { setErr(e?.message ?? "Update failed"); }
  }
  async function uninstall(id: string) {
    setErr(null); try { await pluginOsApi.uninstall(id); await load(); } catch (e: any) { setErr(e?.message ?? "Uninstall failed"); }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Puzzle className="h-6 w-6 text-azure" /> Plugin OS</h1>
          <p className="text-sm text-text-muted">Marketplace, installed plugins &amp; connections.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <Tabs defaultValue="installed">
        <TabsList>
          <TabsTrigger value="installed">Installed ({installed.length})</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace ({marketplace.length})</TabsTrigger>
          <TabsTrigger value="connections">Connections ({connections.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="installed">
          <Card><CardContent className="space-y-2 pt-4">
            {installed.length === 0 ? <div className="text-sm text-text-muted">No plugins installed.</div> : installed.map(({ plugin, manifest }) => (
              <div key={plugin.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{manifest?.name ?? plugin.id}</span>
                    {manifest && <Badge variant="outline">v{manifest.version}</Badge>}
                    <Badge variant={statusTone(plugin.status)}>{plugin.status}</Badge>
                  </div>
                  <div className="text-xs text-text-muted truncate">{manifest?.description}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {plugin.status !== "enabled" && plugin.status !== "installed" && <Button size="sm" variant="outline" onClick={() => void setStatus(plugin.id, "enabled")}>Enable</Button>}
                  {(plugin.status === "enabled" || plugin.status === "installed") && <Button size="sm" variant="outline" onClick={() => void setStatus(plugin.id, "disabled")}>Disable</Button>}
                  <Button size="sm" variant="outline" onClick={() => void uninstall(plugin.id)}>Uninstall</Button>
                </div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="marketplace">
          <Card><CardContent className="space-y-2 pt-4">
            {marketplace.length === 0 ? <div className="text-sm text-text-muted">Marketplace is empty.</div> : marketplace.map((m) => (
              <div key={m.manifest.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{m.manifest.name} <Badge variant="outline">v{m.manifest.version}</Badge></div>
                  <div className="text-xs text-text-muted truncate">{m.manifest.description}</div>
                  <div className="text-[11px] text-text-muted">{m.installs} installs · ★ {m.ratingAvg}</div>
                </div>
                {m.installed ? <Badge variant="emerald">installed</Badge> : <Button size="sm" variant="outline" onClick={() => void install(m.manifest.id)}><Plus className="h-3 w-3 mr-1"/>Install</Button>}
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="connections">
          <Card><CardContent className="space-y-2 pt-4">
            {connections.length === 0 ? <div className="text-sm text-text-muted flex items-center gap-2"><Plug className="h-4 w-4"/>No connections.</div> : connections.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-border/30 py-2 text-sm">
                <span className="flex items-center gap-2"><Plug className="h-4 w-4 text-azure"/>{c.displayName ?? c.id}</span>
                <Badge variant={connTone(c.status)}>{c.status}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default PluginOsPage;
