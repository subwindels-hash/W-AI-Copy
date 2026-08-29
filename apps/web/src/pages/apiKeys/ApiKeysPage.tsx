/** Session 104 — dedicated API key management page. */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BarChart3, Check, Clipboard, KeyRound, Plus, RefreshCw, RotateCw, ShieldCheck, Trash2 } from "lucide-react";
import { API_SCOPE_GROUPS } from "@windels/shared/developerPlatform";
import type { ApiScope } from "@windels/shared/developerPlatform";
import { apiKeysApi, type AkApiKeyCreated, type AkApiKeyRow, type AkScope } from "@/lib/apiKeys";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

const SCOPES: AkScope[] = ["READ", "WRITE", "ADMIN"];
const scopeVariant: Record<AkScope, "azure" | "violet" | "crimson"> = { READ: "azure", WRITE: "violet", ADMIN: "crimson" };

function SecretNotice({ created, onDismiss }: { created: AkApiKeyCreated; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(created.key); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard permission is optional */ }
  }
  return <Card className="border-emerald/30 bg-emerald/10"><CardHeader><CardTitle className="flex items-center gap-2 text-base text-emerald"><ShieldCheck className="h-5 w-5" />Copy your secret now</CardTitle><CardDescription className="text-emerald/80">This plaintext key is shown once. It is not stored or recoverable after this panel is dismissed.</CardDescription></CardHeader><CardContent className="flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-black/20 p-3 text-sm text-text-bright">{created.key}</code><Button size="sm" variant="success" onClick={() => void copy()}>{copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}{copied ? "Copied" : "Copy"}</Button><Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button></CardContent></Card>;
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg border border-azure/20 bg-azure/10 p-2 text-azure">{icon}</div><div><div className="text-2xl font-black text-text-bright">{value}</div><div className="text-xs text-text-muted">{label}</div></div></CardContent></Card>; }

export function ApiKeysPage() {
  const [keys, setKeys] = useState<AkApiKeyRow[]>([]);
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<AkScope[]>(["READ", "WRITE"]);
  const [granularScopes, setGranularScopes] = useState<ApiScope[]>(["models:read", "ai:execute"]);
  const [environment, setEnvironment] = useState("development");
  const [ipRestrictions, setIpRestrictions] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [created, setCreated] = useState<AkApiKeyCreated | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [rename, setRename] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setKeys(await apiKeysApi.list(includeRevoked)); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }, [includeRevoked]);
  useEffect(() => { void load(); }, [load]);
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(null), 3000); };

  async function create() {
    if (!name.trim()) return;
    try { setCreated(await apiKeysApi.create({ name: name.trim(), scopes, granularScopes, environment: environment as "development" | "test" | "production", ipRestrictions: ipRestrictions.split(",").map((item) => item.trim()).filter(Boolean), expiresInDays: expiresInDays ? Number(expiresInDays) : undefined })); setName(""); setExpiresInDays(""); setIpRestrictions(""); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function revoke(row: AkApiKeyRow) {
    if (!confirm(`Revoke ${row.name}? It cannot be used again.`)) return;
    try { await apiKeysApi.revoke(row.id); flash("API key revoked."); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function rotate(row: AkApiKeyRow) {
    if (!confirm(`Rotate ${row.name}? The current key will be revoked immediately.`)) return;
    try { setCreated(await apiKeysApi.rotate(row.id)); flash("API key rotated. Copy the replacement secret now."); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function renameKey(row: AkApiKeyRow) {
    if (!rename.trim()) return;
    try { await apiKeysApi.update(row.id, { name: rename.trim() }); setRenameId(null); setRename(""); flash("API key renamed."); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><KeyRound className="h-6 w-6 text-azure" /><h1 className="text-2xl font-black text-text-bright">API Keys</h1><Badge variant="azure">one-time secrets</Badge></div><p className="mt-1 text-sm text-text-muted">Create scoped WND credentials for the WINDELS Native AI API and existing REST gateway. Plaintext secrets are returned once; only SHA-256 hashes are stored.</p></div><Button size="sm" variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button></div>
    {error ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{error}<button className="float-right" onClick={() => setError(null)}>✕</button></div> : null}
    {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}
    {created ? <SecretNotice created={created} onDismiss={() => setCreated(null)} /> : null}

    <div className="grid grid-cols-1 gap-3 md:grid-cols-3"><Stat icon={<KeyRound className="h-5 w-5" />} label="Active keys" value={String(keys.filter((key) => !key.revoked).length)} /><Stat icon={<ShieldCheck className="h-5 w-5" />} label="Admin-scoped keys" value={String(keys.filter((key) => key.scopes.includes("ADMIN") && !key.revoked).length)} /><Stat icon={<Trash2 className="h-5 w-5" />} label="Revoked visible" value={String(keys.filter((key) => key.revoked).length)} /></div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
      <Card><CardHeader><CardTitle>Organization keys</CardTitle><CardDescription>Only key prefixes and metadata are shown after creation. Revoked keys cannot be reactivated.</CardDescription></CardHeader><CardContent><div className="space-y-2">{keys.map((row) => <div key={row.id} className={cn("rounded-lg border p-3", row.revoked ? "border-crimson/20 bg-crimson/5" : "border-white/10 bg-white/5")}><div className="flex flex-wrap items-center gap-3"><KeyRound className={cn("h-4 w-4", row.revoked ? "text-crimson" : "text-azure")} /><div className="min-w-40 flex-1"><div className="font-medium text-text-bright">{row.name}</div><div className="font-mono text-xs text-text-muted">{row.keyPrefix}••••••••</div></div><div className="flex flex-wrap gap-1">{row.scopes.map((scope) => <Badge key={scope} variant={scopeVariant[scope]}>{scope}</Badge>)}</div>{row.revoked ? <Badge variant="crimson">revoked</Badge> : <Badge variant="emerald">active</Badge>}<Button size="sm" variant="ghost" onClick={() => { setRenameId(row.id); setRename(row.name); }} disabled={row.revoked}>Rename</Button>{!row.revoked ? <Button size="sm" variant="outline" onClick={() => void rotate(row)}><RotateCw className="h-3.5 w-3.5" />Rotate</Button> : null}{!row.revoked ? <Button size="sm" variant="danger" onClick={() => void revoke(row)}>Revoke</Button> : null}</div>{renameId === row.id ? <div className="mt-2 flex gap-2"><Input value={rename} onChange={(e) => setRename(e.target.value)} /><Button size="sm" onClick={() => void renameKey(row)}>Save</Button><Button size="sm" variant="ghost" onClick={() => setRenameId(null)}>Cancel</Button></div> : null}<div className="mt-2 text-xs text-text-muted">created by {row.createdBy.displayName} · {new Date(row.createdAt).toLocaleString()} · {row.lastUsedAt ? `last used ${new Date(row.lastUsedAt).toLocaleString()}` : "never used"}{row.expiresAt ? ` · expires ${new Date(row.expiresAt).toLocaleDateString()}` : " · no expiry"}</div><div className="mt-2 flex flex-wrap gap-2 text-[11px] text-text-muted"><span><BarChart3 className="mr-1 inline h-3 w-3" />{row.usage.requests.toLocaleString()} requests</span><span>{(row.usage.tokensIn + row.usage.tokensOut).toLocaleString()} tokens</span><span>${(row.usage.costMicros / 1e8).toFixed(4)}</span><span>{row.usage.errors} errors</span></div></div>)}{keys.length === 0 ? <p className="py-8 text-center text-sm text-text-muted">No API keys in this organization.</p> : null}</div><label className="mt-4 flex items-center gap-2 text-xs text-text-muted"><input type="checkbox" checked={includeRevoked} onChange={(e) => setIncludeRevoked(e.target.checked)} />Show revoked keys</label></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Create API key</CardTitle><CardDescription>Use the smallest scope set required by the integration.</CardDescription></CardHeader><CardContent className="space-y-3"><Input placeholder="Key name" value={name} onChange={(e) => setName(e.target.value)} /><div><div className="mb-1 text-xs text-text-muted">Scopes</div><div className="flex flex-wrap gap-2">{SCOPES.map((scope) => <button key={scope} type="button" onClick={() => setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope])} className={cn("rounded border px-2 py-1 text-xs", scopes.includes(scope) ? "border-azure/40 bg-azure/20 text-azure" : "border-white/10 text-text-muted")}>{scope}</button>)}</div></div><div><div className="mb-1 text-xs text-text-muted">Fine-grained capabilities</div><div className="max-h-48 space-y-2 overflow-auto rounded-lg border border-white/10 p-2">{Object.entries(API_SCOPE_GROUPS).map(([group, values]) => <div key={group}><div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{group}</div><div className="mt-1 flex flex-wrap gap-1">{values.map((scope) => <button key={scope} type="button" onClick={() => setGranularScopes((current) => current.includes(scope as ApiScope) ? current.filter((item) => item !== scope) : [...current, scope as ApiScope])} className={cn("rounded border px-2 py-1 text-[11px]", granularScopes.includes(scope as ApiScope) ? "border-violet/40 bg-violet/20 text-violet" : "border-white/10 text-text-muted")}>{scope}</button>)}</div></div>)}</div></div><select className="h-10 w-full rounded-lg border border-white/10 bg-bg-deep px-3 text-sm" value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="development">Development</option><option value="test">Test</option><option value="production">Production</option></select><Input placeholder="Allowed IP CIDRs, comma-separated (optional)" value={ipRestrictions} onChange={(event) => setIpRestrictions(event.target.value)} /><Input type="number" min="1" max="365" placeholder="Expires in days (optional)" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} /><Button className="w-full" onClick={() => void create()} disabled={!name.trim() || scopes.length === 0 || granularScopes.length === 0}><Plus className="h-4 w-4" />Create key</Button></CardContent></Card>
    </div>
  </div>;
}
