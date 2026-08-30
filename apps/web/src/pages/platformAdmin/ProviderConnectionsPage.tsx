import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Link2, Loader2, PlugZap, Save, XCircle } from "lucide-react";
import { siteAdminApi } from "@/lib/sitePlatform";
import {
  SP_API_CATEGORY_LABELS,
  type SpApiCategory,
  type SpApiCredentialPublic,
} from "@windels/shared/sitePlatform";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

const CATEGORY_ORDER: SpApiCategory[] = [
  "ai", "voice", "payments", "social", "messaging", "lead_discovery",
  "sports", "lottery", "maps", "email", "integrations", "infra",
  "trading", "robotics", "quantum", "custom",
];

export function ProviderConnectionsPage() {
  const [providers, setProviders] = useState<SpApiCredentialPublic[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<SpApiCredentialPublic | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [enabled, setEnabled] = useState(true);

  const load = useCallback(async () => {
    setProviders(await siteAdminApi.apis());
  }, []);
  useEffect(() => { void load().catch((e) => setErr(e instanceof Error ? e.message : String(e))); }, [load]);

  const openEdit = (p: SpApiCredentialPublic) => {
    setEditing(p); setApiKey(""); setBaseUrl(p.baseUrl ?? ""); setEnabled(p.enabled);
  };

  const save = async () => {
    if (!editing) return;
    setBusy(editing.slot); setErr(null); setNotice(null);
    try {
      const input: Record<string, unknown> = { slot: editing.slot, enabled, baseUrl: baseUrl.trim() || null };
      if (apiKey.trim()) input.apiKey = apiKey.trim();
      await siteAdminApi.saveApi(input as never);
      setEditing(null);
      await load();
      setNotice(`Saved connection for "${editing.label}".`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  const remove = async (p: SpApiCredentialPublic) => {
    setBusy(p.slot); setErr(null); setNotice(null);
    try {
      await siteAdminApi.removeApi(p.id);
      await load();
      setNotice(`Removed stored key for "${p.label}" (env fallback, if any, still applies).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  const grouped = CATEGORY_ORDER.map((cat) => ({ cat, items: providers.filter((p) => p.category === cat) })).filter((g) => g.items.length > 0);
  const configured = providers.filter((p) => p.keySet || p.envFallback).length;

  return (
    <div className="space-y-5 p-1">
      <div>
        <Badge variant="crimson" className="mb-2"><PlugZap className="mr-1 h-3 w-3" /> Super Admin · Connections</Badge>
        <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2"><KeyRound className="h-6 w-6 text-azure" /> Provider Connections</h1>
        <p className="mt-1 text-sm text-text-muted">Connect every external provider API from one place. Keys set here are stored encrypted, take precedence over environment variables, and are used live by the services that call each provider.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <Badge variant="azure">Connected: {configured}/{providers.length}</Badge>
          <span>A provider shows "env" when its key is set via environment variables, and "dashboard" when you save a key here.</span>
        </div>
      </div>

      {err && <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div>}
      {notice && !err && <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}</div>}

      {grouped.map(({ cat, items }) => (
        <Card key={cat}>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><PlugZap className="h-4 w-4 text-azure" /> {SP_API_CATEGORY_LABELS[cat]}</CardTitle></CardHeader>
          <CardContent>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((p) => {
                const connected = p.keySet || p.envFallback;
                return (
                  <li key={p.slot} className="rounded-lg border border-white/10 bg-black/10 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-text-bright">{p.label}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-text-muted">{p.slot}</div>
                      </div>
                      {connected
                        ? <Badge variant={p.envFallback && !p.keySet ? "violet" : "emerald"}>{p.envFallback && !p.keySet ? "env" : "dashboard"}</Badge>
                        : <Badge variant="outline">disconnected</Badge>}
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-text-muted">
                      {connected ? <CheckCircle2 className="h-3 w-3 text-emerald" /> : <XCircle className="h-3 w-3 text-crimson" />}
                      env hint: <code className="rounded bg-black/20 px-1 text-azure">{p.envHint}</code>
                    </div>
                    {p.baseUrl && <div className="mt-1 truncate text-[11px] text-text-muted">base: {p.baseUrl}</div>}
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)}><Link2 className="h-3.5 w-3.5" /> Configure</Button>
                      {p.removable && <Button size="sm" variant="danger" onClick={() => void remove(p)} disabled={busy === p.slot}>Remove</Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} size="md" title={`Connect · ${editing?.label ?? ""}`}
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={() => void save()} disabled={busy === editing?.slot}>{busy === editing?.slot ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</Button></>}>
        {editing && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-muted">API key / token</label>
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={editing.keySet ? "Leave blank to keep the stored key" : "Enter API key…"} />
              <p className="mt-1 text-[11px] text-text-muted">Stored encrypted. Leave blank to keep the current key.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-muted">Base URL</label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…" />
            </div>
            <label className="flex items-center gap-2 text-sm text-text-muted">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-azure" />
              Enable this provider connection
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
