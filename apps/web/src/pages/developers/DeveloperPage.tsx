import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import * as dev from "@/lib/developers";
import * as wf from "@/lib/workflow";

const SCOPE_COLORS: Record<string, string> = { READ: "azure", WRITE: "violet", ADMIN: "crimson" };

export default function DeveloperPage() {
  const [keys, setKeys] = useState<dev.ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<dev.WebhookEndpoint[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<("READ"|"WRITE"|"ADMIN")[]>(["READ"]);
  const [revealedKey, setRevealedKey] = useState<{ id: string; key: string } | null>(null);
  const [newWhUrl, setNewWhUrl] = useState("");
  const [newWhEvents, setNewWhEvents] = useState<string[]>(["workflow.run.succeeded"]);
  const [newWhSecret, setNewWhSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [k, w] = await Promise.all([dev.listApiKeys(), dev.listWebhooks()]);
      setKeys(k); setWebhooks(w);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function createKey() {
    if (!newKeyName.trim()) return;
    try {
      const k = await dev.createApiKey({ name: newKeyName.trim(), scopes: newKeyScopes });
      setKeys((arr) => [k, ...arr]);
      setRevealedKey({ id: k.id, key: k.key });
      setNewKeyName(""); setNewKeyScopes(["READ"]);
      toast.success("API key created — copy it now, it won't be shown again.");
    } catch (e: any) { toast.error(e.message); }
  }
  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key? It can't be used again.")) return;
    await dev.revokeApiKey(id);
    setKeys((a) => a.filter((k) => k.id !== id));
    toast.success("API key revoked.");
  }
  async function createWebhook() {
    if (!newWhUrl.trim()) return;
    try {
      const w = await dev.createWebhook({ url: newWhUrl.trim(), events: newWhEvents });
      setWebhooks((arr) => [w, ...arr]);
      setNewWhSecret(w.secret);
      setNewWhUrl("");
      toast.success("Webhook created.");
    } catch (e: any) { toast.error(e.message); }
  }
  async function toggleWebhook(id: string, active: boolean) {
    await dev.updateWebhook(id, { active: !active });
    load();
  }
  async function delWebhook(id: string) {
    if (!confirm("Delete this webhook?")) return;
    await dev.deleteWebhook(id); setWebhooks((a) => a.filter((w) => w.id !== id));
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 h-[calc(100vh-56px)] overflow-y-auto">
      <div>
        <h1 className="text-2xl font-semibold text-text-bright">Developer Portal</h1>
        <p className="text-sm text-text-muted mt-1">Manage API keys, webhooks, and explore the REST gateway.</p>
      </div>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="docs">REST API Reference</TabsTrigger>
        </TabsList>

        <TabsContent value="keys">
          <div className="grid md:grid-cols-[1fr_320px] gap-4">
            <div className="space-y-3">
              {keys.length === 0 && !loading && (
                <Card><CardContent className="py-8 text-center text-text-muted">No API keys yet.</CardContent></Card>
              )}
              {keys.map((k) => (
                <Card key={k.id}>
                  <CardContent className="py-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-azure/15 text-azure grid place-items-center text-lg">🔑</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-bright">{k.name}</span>
                        {k.scopes.map((s) => <Badge key={s} variant={SCOPE_COLORS[s] as any}>{s}</Badge>)}
                      </div>
                      <div className="text-xs text-text-muted mt-1 font-mono">{k.keyPrefix}•••••••••••• • created {new Date(k.createdAt).toLocaleDateString()} {k.lastUsedAt ? `· used ${new Date(k.lastUsedAt).toLocaleString()}` : "· never used"}</div>
                      {revealedKey?.id === k.id && (
                        <div className="mt-2 p-2 rounded bg-emerald/10 border border-emerald/30 text-xs font-mono text-emerald break-all">{revealedKey.key}</div>
                      )}
                    </div>
                    <Button variant="danger" size="sm" onClick={() => revokeKey(k.id)}>Revoke</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader><CardTitle className="text-base">New API key</CardTitle><CardDescription>Grants access to the REST gateway at <code className="text-azure">/api/rest/v1</code>.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Key name (e.g. Production)" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
                <div>
                  <div className="text-xs text-text-muted mb-1">Scopes</div>
                  <div className="flex gap-2 flex-wrap">
                    {(["READ","WRITE","ADMIN"] as const).map((s) => (
                      <button key={s} onClick={() => setNewKeyScopes((sc) => sc.includes(s) ? sc.filter(x=>x!==s) : [...sc,s])} className={cn(
                        "px-2 py-1 text-xs rounded border",
                        newKeyScopes.includes(s) ? "bg-azure/20 border-azure/40 text-azure" : "border-white/10 text-text-muted"
                      )}>{s}</button>
                    ))}
                  </div>
                </div>
                <Button className="w-full" onClick={createKey} disabled={!newKeyName.trim()}>Create key</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="webhooks">
          <div className="grid md:grid-cols-[1fr_340px] gap-4">
            <div className="space-y-3">
              {webhooks.map((w) => (
                <Card key={w.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-violet/15 text-violet grid place-items-center">🔔</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-text-bright truncate">{w.url}</span>
                          {w.active ? <Badge variant="emerald">active</Badge> : <Badge variant="slate">paused</Badge>}
                          {w.failureCount > 0 && <Badge variant="crimson">{w.failureCount} fails</Badge>}
                        </div>
                        <div className="text-xs text-text-muted mt-1">{w.events.join(", ")} · {w.deliveriesCount} deliveries {w.lastDeliveryAt && `· last ${new Date(w.lastDeliveryAt).toLocaleString()}`}</div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => toggleWebhook(w.id, w.active)}>{w.active ? "Pause" : "Resume"}</Button>
                        <Button size="sm" variant="danger" onClick={() => delWebhook(w.id)}>Delete</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {webhooks.length === 0 && <Card><CardContent className="py-8 text-center text-text-muted">No webhooks yet.</CardContent></Card>}
            </div>
            <Card>
              <CardHeader><CardTitle className="text-base">New webhook</CardTitle><CardDescription>Receive POST notifications to a URL you control.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="https://example.com/hook" value={newWhUrl} onChange={(e) => setNewWhUrl(e.target.value)} />
                <div>
                  <div className="text-xs text-text-muted mb-1">Events</div>
                  <div className="flex flex-wrap gap-1">
                    {dev.WEBHOOK_EVENTS.map((ev) => (
                      <button key={ev} onClick={() => setNewWhEvents((es) => es.includes(ev) ? es.filter(x=>x!==ev) : [...es, ev])} className={cn(
                        "px-2 py-0.5 text-[11px] rounded border font-mono",
                        newWhEvents.includes(ev) ? "bg-violet/20 border-violet/40 text-violet" : "border-white/10 text-text-muted"
                      )}>{ev}</button>
                    ))}
                  </div>
                </div>
                {newWhSecret && (
                  <div className="p-2 rounded bg-violet/10 border border-violet/30 text-[11px] font-mono text-violet break-all">Signing secret: {newWhSecret}</div>
                )}
                <Button className="w-full" onClick={createWebhook} disabled={!newWhUrl.trim()}>Create webhook</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="docs">
          <Card>
            <CardHeader><CardTitle>REST API Reference</CardTitle><CardDescription>Base URL: <code className="text-azure">/api/rest/v1</code> — authenticate with header <code className="text-azure">Authorization: Bearer wnd_…</code></CardDescription></CardHeader>
            <CardContent className="space-y-4 text-sm">
              {[
                {m:"GET", p:"/", d:"Service identity & organization"},
                {m:"GET", p:"/workflows", d:"List workflows in your organization"},
                {m:"POST", p:"/workflows/:id/run", d:"Trigger a workflow run. JSON body: { input: {...} }"},
                {m:"GET", p:"/agents", d:"List agents"},
                {m:"GET", p:"/talk/channels", d:"List Talk channels"},
                {m:"POST", p:"/talk/channels/:id/messages", d:"Send a message. JSON body: { content: \"...\" }"},
              ].map((r) => (
                <div key={r.p} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded font-mono", r.m==="GET"?"bg-azure/20 text-azure":"bg-emerald/20 text-emerald")}>{r.m}</span>
                  <code className="font-mono text-text-bright min-w-[220px]">{r.p}</code>
                  <span className="text-text-muted text-xs">{r.d}</span>
                </div>
              ))}
              <div className="mt-4 p-3 rounded bg-bg-deep border border-white/10 font-mono text-xs text-text-muted">
                <div className="text-text-main"># Example</div>
                <div>curl https://your-windels/api/rest/v1/workflows/:id/run \</div>
                <div>&nbsp;&nbsp;-H "Authorization: Bearer wnd_..." \</div>
                <div>&nbsp;&nbsp;-H "Content-Type: application/json" \</div>
                <div>&nbsp;&nbsp;-d '{`{ "input": { "foo": "bar" } }`}'</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
