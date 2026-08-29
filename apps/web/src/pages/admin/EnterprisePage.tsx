import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import * as ent from "@/lib/enterprise";
import * as dp from "@/lib/dataPlatform";
import * as ac from "@/lib/agentComm";
import { Server, Radio, FileCode2, BookMarked, Activity, Network, CheckCircle2, XCircle, Database, Brain, Archive, RefreshCw, Play, Search, MessageSquare, Users, GitBranch, ThumbsUp, AlertTriangle, Bot } from "lucide-react";
import type { AgentLifecycle, CommEnvelope, AgentTeam, ReasoningArtifact, Escalation, EscalationPolicy } from "@windels/shared/agentComm";

export default function EnterprisePage() {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 h-[calc(100vh-56px)] overflow-y-auto">
      <div>
        <h1 className="text-2xl font-semibold text-text-bright">Enterprise Hub</h1>
        <p className="text-sm text-text-muted mt-1">Engineering framework, data platform, AI workforce comms, models, monitoring, plugins, integrations, SSO, white labeling.</p>
      </div>
      <Tabs defaultValue="architecture">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="architecture"><BookMarked className="h-3.5 w-3.5 mr-1"/>Architecture</TabsTrigger>
          <TabsTrigger value="services"><Server className="h-3.5 w-3.5 mr-1"/>Services</TabsTrigger>
          <TabsTrigger value="events"><Radio className="h-3.5 w-3.5 mr-1"/>Events</TabsTrigger>
          <TabsTrigger value="apis"><FileCode2 className="h-3.5 w-3.5 mr-1"/>APIs</TabsTrigger>
          <TabsTrigger value="catalog"><Database className="h-3.5 w-3.5 mr-1"/>Data Catalog</TabsTrigger>
          <TabsTrigger value="kg"><Network className="h-3.5 w-3.5 mr-1"/>Knowledge Graph</TabsTrigger>
          <TabsTrigger value="memory"><Brain className="h-3.5 w-3.5 mr-1"/>Memory</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="monitoring">AI Monitoring</TabsTrigger>
          <TabsTrigger value="plugins">Plugins</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="sso">SSO</TabsTrigger>
          <TabsTrigger value="brand">Brand</TabsTrigger>
          <TabsTrigger value="agentComm"><MessageSquare className="h-3.5 w-3.5 mr-1"/>Agent Comm</TabsTrigger>
        </TabsList>
        <TabsContent value="architecture"><ArchitectureTab /></TabsContent>
        <TabsContent value="services"><ServicesTab /></TabsContent>
        <TabsContent value="events"><EventsTab /></TabsContent>
        <TabsContent value="apis"><ApisTab /></TabsContent>
        <TabsContent value="catalog"><CatalogTab /></TabsContent>
        <TabsContent value="kg"><KnowledgeGraphTab /></TabsContent>
        <TabsContent value="memory"><MemoryTab /></TabsContent>
        <TabsContent value="models"><ModelsTab /></TabsContent>
        <TabsContent value="monitoring"><MonitoringTab /></TabsContent>
        <TabsContent value="plugins"><PluginsTab /></TabsContent>
        <TabsContent value="integrations"><IntegrationsTab /></TabsContent>
        <TabsContent value="sso"><SsoTab /></TabsContent>
        <TabsContent value="brand"><BrandTab /></TabsContent>
        <TabsContent value="agentComm"><AgentCommTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function field(label: string, el: React.ReactNode) {
  return <div><label className="text-xs text-text-muted block mb-1">{label}</label>{el}</div>;
}

function ModelsTab() {
  const [models, setModels] = useState<ent.ModelRecord[]>([]);
  const [form, setForm] = useState({ provider: "", modelId: "", name: "" });
  async function load() { setModels(await ent.modelsApi.list()); }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!form.provider || !form.modelId || !form.name) return;
    await ent.modelsApi.create({ ...form, capabilities: ["chat"], contextWindow: 128000, maxOutputTokens: 4096, costInputPer1k: 0, costOutputPer1k: 0, config: {} } as any);
    setForm({ provider: "", modelId: "", name: "" }); toast.success("Model registered"); load();
  }
  async function setDefault(id: string) { await ent.modelsApi.setDefault(id); toast.success("Default model updated"); load(); }
  async function toggle(id: string, enabled: boolean) { await ent.modelsApi.update(id, { enabled }); load(); }
  async function del(id: string) { if (confirm("Delete this model?")) { await ent.modelsApi.del(id); load(); } }
  return (
    <div className="grid md:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-2">
        {models.map((m) => (
          <Card key={m.id}>
            <CardContent className="py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-text-bright">{m.name}</span>
                  <span className="text-[11px] font-mono text-text-muted">{m.provider}/{m.modelId}</span>
                  {m.isDefault && <Badge variant="azure">default</Badge>}
                  {!m.organizationId && <Badge variant="slate">system</Badge>}
                  {!m.enabled && <Badge variant="crimson">disabled</Badge>}
                </div>
                <div className="text-xs text-text-muted mt-1">{m.contextWindow.toLocaleString()} ctx · {m.maxOutputTokens.toLocaleString()} out · {m.capabilities.join(", ")}</div>
              </div>
              {m.organizationId && <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setDefault(m.id)}>Default</Button>
                <Button size="sm" variant="outline" onClick={() => toggle(m.id, !m.enabled)}>{m.enabled ? "Disable" : "Enable"}</Button>
                <Button size="sm" variant="danger" onClick={() => del(m.id)}>✕</Button>
              </div>}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Register model</CardTitle><CardDescription>Add a custom model endpoint.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="provider (e.g. ollama)" value={form.provider} onChange={(e)=>setForm({...form, provider: e.target.value})}/>
          <Input placeholder="model id (e.g. llama3.1)" value={form.modelId} onChange={(e)=>setForm({...form, modelId: e.target.value})}/>
          <Input placeholder="Display name" value={form.name} onChange={(e)=>setForm({...form, name: e.target.value})}/>
          <Button className="w-full" onClick={add}>Register</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function MonitoringTab() {
  const [m, setM] = useState<ent.AiMetrics | null>(null);
  useEffect(() => { ent.monitoringApi.get().then(setM); }, []);
  if (!m) return <Card><CardContent className="py-12 text-center text-text-muted">Loading…</CardContent></Card>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Requests (30d)" value={m.totals.requests.toLocaleString()}/>
        <Stat label="Success rate" value={`${m.totals.successRate}%`} tone="emerald"/>
        <Stat label="Avg latency" value={`${m.totals.avgLatency}ms`}/>
        <Stat label="Tokens" value={`${((m.totals.totalPromptTokens+m.totals.totalCompletionTokens)/1000).toFixed(1)}k`}/>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>By model</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {m.byModel.map(b => <div key={b.modelId} className="flex justify-between text-sm border-b border-white/5 py-1.5">
              <span className="font-mono text-text-bright">{b.modelId}</span>
              <span className="text-text-muted">{b.count} · {b.avgDurationMs}ms avg</span>
            </div>)}
            {m.byModel.length === 0 && <p className="text-sm text-text-muted">No data yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>By channel</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {m.byChannel.map(c => <div key={c.channel} className="flex justify-between text-sm border-b border-white/5 py-1.5">
              <span className="capitalize text-text-bright">{c.channel}</span>
              <span className="text-text-muted">{c.count}</span>
            </div>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PluginsTab() {
  const [data, setData] = useState<{ system: ent.PluginRecord[]; custom: ent.PluginRecord[] } | null>(null);
  const [slug, setSlug] = useState(""), [pname, setPName] = useState("");
  async function load() { setData(await ent.pluginsApi.list()); }
  useEffect(() => { load(); }, []);
  async function install() {
    if (!slug || !pname) return;
    await ent.pluginsApi.install({ slug, name: pname }); setSlug(""); setPName("");
    toast.success("Plugin installed"); load();
  }
  async function toggle(p: ent.PluginRecord, enabled: boolean) { await ent.pluginsApi.toggle(p.id, enabled); load(); }
  if (!data) return null;
  return (
    <div className="grid md:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-2">
        {[...data.system, ...data.custom].map(p => <Card key={p.id}>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet/15 text-violet grid place-items-center text-lg">🧩</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-text-bright">{p.name}</span>
                <span className="text-[11px] font-mono text-text-muted">{p.slug} · v{p.version}</span>
                {p.isSystem && <Badge variant="slate">system</Badge>}
              </div>
              {p.description && <div className="text-xs text-text-muted mt-0.5">{p.description}</div>}
            </div>
            <Switch checked={p.enabled} onChange={(v)=>toggle(p,v)}/>
          </CardContent>
        </Card>)}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Install custom plugin</CardTitle><CardDescription>Register a plugin by slug.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="plugin-slug" value={slug} onChange={(e)=>setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-"))}/>
          <Input placeholder="Plugin name" value={pname} onChange={(e)=>setPName(e.target.value)}/>
          <Button className="w-full" onClick={install}>Install</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationsTab() {
  const [data, setData] = useState<{ available: ent.IntegrationType[]; installed: ent.IntegrationRecord[] } | null>(null);
  const [connecting, setConnecting] = useState<ent.IntegrationType | null>(null);
  const [cname, setCName] = useState("");
  async function load() { setData(await ent.integrationsApi.list()); }
  useEffect(() => { load(); }, []);
  async function doConnect() {
    if (!connecting) return;
    await ent.integrationsApi.connect({ type: connecting.type, name: cname || connecting.name });
    toast.success(`${connecting.name} connected`); setConnecting(null); setCName(""); load();
  }
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        {data.available.map(a => {
          const installed = data.installed.find(i => i.type === a.type);
          return (
            <Card key={a.type}>
              <CardContent className="py-4">
                <div className="text-2xl mb-2">{a.icon}</div>
                <div className="font-medium text-text-bright">{a.name}</div>
                <div className="text-xs text-text-muted mt-1 mb-3">{a.description}</div>
                {installed ? <Badge variant="emerald">connected</Badge> : <Button size="sm" onClick={()=>setConnecting(a)}>Connect</Button>}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {connecting && (
        <Card>
          <CardHeader><CardTitle className="text-base">Connect {connecting.name}</CardTitle><CardDescription>{connecting.description}</CardDescription></CardHeader>
          <CardContent className="space-y-3 max-w-md">
            <Input placeholder="Connection name" value={cname} onChange={(e)=>setCName(e.target.value)}/>
            <p className="text-xs text-text-muted">Credentials and API keys can be added after connecting. OAuth flows ship in a later session.</p>
            <div className="flex gap-2"><Button onClick={doConnect}>Connect</Button><Button variant="outline" onClick={()=>setConnecting(null)}>Cancel</Button></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SsoTab() {
  const [cfg, setCfg] = useState<ent.SsoInfo | null>(null);
  const [form, setForm] = useState({ provider: "google", domains: "", clientId: "", clientSecret: "", entryPoint: "", issuer: "", cert: "" });
  async function load() { setCfg(await ent.ssoApi.get()); }
  useEffect(() => { load(); }, []);
  async function save() {
    await ent.ssoApi.upsert({
      provider: form.provider,
      domains: form.domains.split(",").map(s=>s.trim()).filter(Boolean),
      clientId: form.clientId || undefined,
      clientSecret: form.clientSecret || undefined,
      entryPoint: form.entryPoint || undefined,
      issuer: form.issuer || undefined,
      cert: form.cert || undefined,
      enabled: true,
    });
    toast.success("SSO configuration saved"); load();
  }
  if (!cfg) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Single Sign-On</CardTitle><CardDescription>Configure SAML 2.0, OIDC, Google or Microsoft SSO.</CardDescription></CardHeader>
      <CardContent className="space-y-3 max-w-xl">
        {field("Provider",
          <select value={form.provider} onChange={(e)=>setForm({...form, provider: e.target.value})}
            className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm">
            <option value="google">Google Workspace</option>
            <option value="microsoft">Microsoft Entra</option>
            <option value="oidc">OpenID Connect (OIDC)</option>
            <option value="saml">SAML 2.0</option>
          </select>
        )}
        {field("Email domains (comma-separated)", <Input placeholder="acme.com, acme.co" value={form.domains} onChange={(e)=>setForm({...form, domains: e.target.value})}/>)}
        {(form.provider === "oidc" || form.provider === "google" || form.provider === "microsoft") && <>
          {field("Client ID", <Input value={form.clientId} onChange={(e)=>setForm({...form, clientId: e.target.value})}/>)}
          {field("Client Secret", <Input type="password" value={form.clientSecret} onChange={(e)=>setForm({...form, clientSecret: e.target.value})}/>)}
          {field("Issuer URL (optional)", <Input value={form.issuer} onChange={(e)=>setForm({...form, issuer: e.target.value})}/>)}
        </>}
        {form.provider === "saml" && <>
          {field("SAML Entry Point (SSO URL)", <Input value={form.entryPoint} onChange={(e)=>setForm({...form, entryPoint: e.target.value})}/>)}
          {field("Issuer", <Input value={form.issuer} onChange={(e)=>setForm({...form, issuer: e.target.value})}/>)}
          {field("X.509 Signing Certificate (PEM)", <Textarea value={form.cert} onChange={(e)=>setForm({...form, cert: e.target.value})}/>)}
        </>}
        <div className="flex gap-2">
          <Button onClick={save}>Save & Enable</Button>
          {cfg.configured && cfg.enabled && <Button variant="danger" onClick={async()=>{await ent.ssoApi.disable(); toast.success("SSO disabled"); load();}}>Disable</Button>}
        </div>
        {cfg.configured && <div className="text-xs text-text-muted">SSO status: <span className={cn(cfg.enabled?"text-emerald":"text-amber")}>{cfg.enabled?"enabled":"configured but disabled"}</span></div>}
      </CardContent>
    </Card>
  );
}

function BrandTab() {
  const [org, setOrg] = useState<ent.OrgInfo | null>(null);
  const [form, setForm] = useState({ name: "", appName: "", primaryColor: "#3B82F6", supportEmail: "", brandingHidden: false });
  async function load() { const o = await ent.orgApi.get(); setOrg(o); setForm({ name: o.name, appName: o.whiteLabel.appName ?? "WINDELS AI OS", primaryColor: o.whiteLabel.primaryColor ?? "#3B82F6", supportEmail: o.whiteLabel.supportEmail ?? "", brandingHidden: !!o.whiteLabel.brandingHidden }); }
  useEffect(() => { load(); }, []);
  async function save() { await ent.orgApi.update({ name: form.name, whiteLabel: { appName: form.appName, primaryColor: form.primaryColor, supportEmail: form.supportEmail, brandingHidden: form.brandingHidden } }); toast.success("Brand saved"); load(); }
  if (!org) return null;
  return (
    <div className="grid md:grid-cols-[1fr_360px] gap-4">
      <Card>
        <CardHeader><CardTitle>White Label</CardTitle><CardDescription>Customize how WINDELS appears to your team.</CardDescription></CardHeader>
        <CardContent className="space-y-3 max-w-xl">
          {field("Organization name", <Input value={form.name} onChange={(e)=>setForm({...form, name: e.target.value})}/>)}
          {field("App display name", <Input value={form.appName} onChange={(e)=>setForm({...form, appName: e.target.value})}/>)}
          <div>
            <label className="text-xs text-text-muted block mb-1">Primary brand color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.primaryColor} onChange={(e)=>setForm({...form, primaryColor: e.target.value})} className="h-10 w-16 rounded border border-white/10 bg-transparent"/>
              <Input value={form.primaryColor} onChange={(e)=>setForm({...form, primaryColor: e.target.value})} className="font-mono"/>
            </div>
          </div>
          {field("Support email", <Input type="email" value={form.supportEmail} onChange={(e)=>setForm({...form, supportEmail: e.target.value})}/>)}
          <Switch checked={form.brandingHidden} onChange={(v)=>setForm({...form, brandingHidden: v})} label="Hide WINDELS branding on shared exports"/>
          <Button onClick={save}>Save changes</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Preview</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 p-4" style={{ background: `linear-gradient(135deg, ${form.primaryColor}22, transparent)` }}>
            <div className="h-10 w-10 rounded-lg grid place-items-center font-bold text-white" style={{ background: form.primaryColor }}>W</div>
            <div className="mt-3 text-lg font-semibold text-text-bright">{form.appName}</div>
            <div className="text-xs text-text-muted">{form.supportEmail || "support@example.com"}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Session 18: Enterprise Engineering Framework ──────────
function ArchitectureTab() {
  const [adrs, setAdrs] = useState<ent.AdrRecord[]>([]);
  const [standards, setStandards] = useState<ent.ArchitectureStandard[]>([]);
  const [filter, setFilter] = useState<"all"|"proposed"|"accepted"|"superseded"|"deprecated"|"rejected">("all");
  const [form, setForm] = useState({ title: "", context: "", decision: "", consequences: "", tags: "" });
  const [showForm, setShowForm] = useState(false);
  async function load() {
    setAdrs(await ent.govApi.listAdrs(filter === "all" ? {} : { status: filter }));
    setStandards(await ent.govApi.listStandards());
  }
  useEffect(() => { load(); }, [filter]);
  async function create() {
    if (!form.title || !form.context || !form.decision || !form.consequences) return;
    await ent.govApi.createAdr({ ...form, tags: form.tags.split(",").map(s=>s.trim()).filter(Boolean), status: "proposed" });
    setForm({ title: "", context: "", decision: "", consequences: "", tags: "" });
    setShowForm(false); toast.success("ADR proposed"); load();
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="ADRs" value={adrs.length}/>
        <Stat label="Accepted" value={adrs.filter(a=>a.status==="accepted").length} tone="emerald"/>
        <Stat label="Proposed" value={adrs.filter(a=>a.status==="proposed").length} tone="azure"/>
        <Stat label="Standards" value={standards.length}/>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {(["all","accepted","proposed","deprecated","superseded","rejected"] as const).map(s => (
            <button key={s} onClick={()=>setFilter(s)} className={cn(
              "px-3 py-1 rounded-md text-xs capitalize",
              filter===s?"bg-azure-500/20 text-azure-300":"text-text-muted hover:bg-white/5"
            )}>{s}</button>
          ))}
        </div>
        <Button size="sm" onClick={()=>setShowForm(v=>!v)}>{showForm?"Cancel":"New ADR"}</Button>
      </div>
      {showForm && (
        <Card><CardContent className="py-4 space-y-2">
          <Input placeholder="Title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
          <Textarea placeholder="Context" rows={3} value={form.context} onChange={e=>setForm({...form,context:e.target.value})}/>
          <Textarea placeholder="Decision" rows={3} value={form.decision} onChange={e=>setForm({...form,decision:e.target.value})}/>
          <Textarea placeholder="Consequences" rows={2} value={form.consequences} onChange={e=>setForm({...form,consequences:e.target.value})}/>
          <Input placeholder="Tags (comma-separated)" value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})}/>
          <Button size="sm" onClick={create}>Propose ADR</Button>
        </CardContent></Card>
      )}
      <div className="space-y-2">
        {adrs.map(a => (
          <Card key={a.id}>
            <CardContent className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-text-muted">ADR-{String(a.number).padStart(4,"0")}</span>
                    <Badge variant={
                      a.status==="accepted"?"emerald":
                      a.status==="proposed"?"azure":
                      a.status==="deprecated"?"amber":
                      a.status==="rejected"?"crimson":"slate"
                    }>{a.status}</Badge>
                    <span className="font-medium text-text-bright">{a.title}</span>
                  </div>
                  <div className="text-xs text-text-muted mt-1">{a.date.slice(0,10)} · {a.tags.join(", ") || "no tags"}</div>
                  <details className="mt-2 text-sm text-text-main/80"><summary className="cursor-pointer text-text-muted hover:text-text-bright text-xs">Read</summary>
                    <div className="mt-2 space-y-2">
                      <p><strong className="text-text-bright">Context:</strong> {a.context}</p>
                      <p><strong className="text-text-bright">Decision:</strong> {a.decision}</p>
                      <p><strong className="text-text-bright">Consequences:</strong> {a.consequences}</p>
                    </div>
                  </details>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ServicesTab() {
  const [services, setServices] = useState<ent.ServiceRecord[]>([]);
  const [deps, setDeps] = useState<{from:string;to:string;kind:string;criticality:string}[]>([]);
  const [val, setVal] = useState<{missing:string[];healthy:boolean} | null>(null);
  const [form, setForm] = useState({id:"",name:"",version:"0.1.0",baseUrl:"http://",capabilities:"",region:"local"});
  const [showForm, setShowForm] = useState(false);
  async function load() {
    setServices(await ent.discoveryApi.list());
    setDeps(await ent.discoveryApi.dependencies());
    setVal(await ent.discoveryApi.validate());
  }
  useEffect(()=>{ load(); const t=setInterval(load, 10000); return ()=>clearInterval(t); }, []);
  async function register() {
    if(!form.id||!form.name||!form.baseUrl) return;
    await ent.discoveryApi.register({...form,capabilities:form.capabilities.split(",").map(s=>s.trim()).filter(Boolean), status:"healthy"});
    setForm({id:"",name:"",version:"0.1.0",baseUrl:"http://",capabilities:"",region:"local"});
    setShowForm(false); toast.success("Service registered"); load();
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Services" value={services.length}/>
        <Stat label="Healthy" value={services.filter(s=>s.status==="healthy").length} tone="emerald"/>
        <Stat label="Degraded" value={services.filter(s=>s.status!=="healthy"&&s.status!=="offline").length} tone="amber"/>
        <Stat label="Dependencies" value={val?.healthy?<CheckCircle2 className="h-6 w-6 text-emerald inline"/>:<><XCircle className="h-6 w-6 text-crimson inline"/> {val?.missing.length}</>}/>
      </div>
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-text-bright uppercase tracking-wide">Registry</h3>
        <Button size="sm" onClick={()=>setShowForm(v=>!v)}>{showForm?"Cancel":"Register service"}</Button>
      </div>
      {showForm && (
        <Card><CardContent className="py-4 grid grid-cols-2 gap-2">
          <Input placeholder="service-id" value={form.id} onChange={e=>setForm({...form,id:e.target.value})}/>
          <Input placeholder="Display name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
          <Input placeholder="version (semver)" value={form.version} onChange={e=>setForm({...form,version:e.target.value})}/>
          <Input placeholder="http://host:port" value={form.baseUrl} onChange={e=>setForm({...form,baseUrl:e.target.value})}/>
          <Input placeholder="capabilities (comma-separated)" value={form.capabilities} onChange={e=>setForm({...form,capabilities:e.target.value})}/>
          <Input placeholder="region" value={form.region} onChange={e=>setForm({...form,region:e.target.value})}/>
          <div className="col-span-2"><Button size="sm" onClick={register}>Register</Button></div>
        </CardContent></Card>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        {services.map(s => (
          <Card key={`${s.id}:${s.instanceId}`}>
            <CardContent className="py-3 flex items-start gap-3">
              <div className={cn(
                "h-10 w-10 rounded-lg grid place-items-center",
                s.status==="healthy"?"bg-emerald-500/15 text-emerald":
                s.status==="starting"?"bg-azure/15 text-azure":
                s.status==="degraded"?"bg-amber/15 text-amber":
                "bg-crimson/15 text-crimson"
              )}><Network className="h-5 w-5"/></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-text-bright">{s.name}</span>
                  <span className="text-[11px] font-mono text-text-muted">{s.id} v{s.version}</span>
                  <Badge variant={s.status==="healthy"?"emerald":"slate"}>{s.status}</Badge>
                </div>
                <div className="text-xs text-text-muted mt-0.5 font-mono truncate">{s.baseUrl}</div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {s.capabilities.slice(0,8).map(c => <Badge key={c} variant="slate">{c}</Badge>)}
                  {s.capabilities.length>8 && <Badge variant="slate">+{s.capabilities.length-8}</Badge>}
                </div>
                <div className="text-[10px] text-text-muted mt-1">hb: {s.lastHeartbeat ? new Date(s.lastHeartbeat).toLocaleTimeString() : "—"}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {deps.length>0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Dependency Graph</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1.5 text-xs">
            {deps.map((d,i)=>(
              <span key={i} className="px-2 py-1 rounded bg-white/5 font-mono">
                <span className="text-violet">{d.from}</span>
                <span className="text-text-muted mx-1">→</span>
                <span className={val?.missing.includes(d.to)?"text-crimson":"text-emerald"}>{d.to}</span>
                <span className="text-text-muted ml-1">({d.kind})</span>
              </span>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EventsTab() {
  const [schemas, setSchemas] = useState<ent.EventSchema[]>([]);
  const [events, setEvents] = useState<ent.EventRecord[]>([]);
  const [dlq, setDlq] = useState<ent.DlqEntry[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  async function load() {
    setSchemas(await ent.eventsApi.listSchemas());
    setEvents(await ent.eventsApi.recent({type: typeFilter||undefined}));
    setDlq(await ent.eventsApi.listDlq());
  }
  useEffect(()=>{ load(); const t=setInterval(load, 5000); return ()=>clearInterval(t); }, [typeFilter]);
  async function replay(id: string) { await ent.eventsApi.replayDlq(id); toast.success("Replayed"); load(); }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Schemas" value={schemas.length}/>
        <Stat label="Events (ring)" value={events.length}/>
        <Stat label="DLQ pending" value={dlq.filter(d=>d.status==="pending").length} tone={dlq.filter(d=>d.status==="pending").length>0?"crimson":undefined}/>
        <Stat label="Producers" value={new Set(schemas.map(s=>s.producer)).size}/>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text-bright uppercase tracking-wide mb-2">Event schemas</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
          {schemas.map(s => (
            <Card key={`${s.type}@${s.version}`}>
              <CardContent className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-sm text-text-bright truncate">{s.type}</div>
                  <Badge variant="slate">{s.version}</Badge>
                </div>
                <p className="text-xs text-text-muted mt-1 line-clamp-2">{s.description}</p>
                <div className="text-[10px] text-text-muted mt-1">producer: {s.producer} · consumers: {s.consumers.length}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text-bright uppercase tracking-wide">Recent event stream</h3>
          <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
            className="rounded-md bg-bg-dark border border-white/10 px-2 py-1 text-xs">
            <option value="">all types</option>
            {schemas.map(s => <option key={s.type} value={s.type}>{s.type}</option>)}
          </select>
        </div>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {events.slice().reverse().map(e => (
            <div key={e.id} className="font-mono text-[11px] bg-white/5 rounded px-2 py-1.5 flex gap-3 items-start">
              <span className="text-text-muted shrink-0">{new Date(e.timestamp).toLocaleTimeString()}</span>
              <Badge variant="violet" className="shrink-0">{e.type}</Badge>
              <span className="text-text-muted shrink-0">{e.producer.slice(0,16)}</span>
              <span className="text-azure/70 truncate shrink-0">c={e.correlationId.slice(0,8)}</span>
              <span className="text-text-muted truncate flex-1">{JSON.stringify(e.payload).slice(0,120)}</span>
            </div>
          ))}
          {events.length===0 && <div className="text-center text-xs text-text-muted py-6">no events yet</div>}
        </div>
      </div>
      {dlq.some(d=>d.status==="pending") && (
        <div>
          <h3 className="text-sm font-semibold text-crimson uppercase tracking-wide mb-2">Dead-letter queue</h3>
          <div className="space-y-2">
            {dlq.filter(d=>d.status==="pending").map(d => (
              <Card key={d.id}>
                <CardContent className="py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="crimson">{d.event.type}</Badge>
                      <span className="text-text-bright font-mono">{d.failedConsumer}</span>
                      <span className="text-text-muted text-xs">attempts {d.attempts}</span>
                    </div>
                    <p className="text-xs text-crimson mt-0.5 font-mono">{d.error}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={()=>replay(d.id)}>Replay</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ApisTab() {
  const [endpoints, setEndpoints] = useState<ent.ApiEndpoint[]>([]);
  const [versions, setVersions] = useState<ent.ApiVersion[]>([]);
  const [filter, setFilter] = useState<"all"|"GET"|"POST"|"PATCH"|"PUT"|"DELETE">("all");
  const [versionFilter, setVersionFilter] = useState<string>("all");
  async function load() {
    setEndpoints(await ent.apiGovApi.endpoints());
    setVersions(await ent.apiGovApi.versions());
  }
  useEffect(()=>{ load(); }, []);
  const methodColor = (m: string) => ({GET:"azure",POST:"emerald",PATCH:"violet",PUT:"fuchsia",DELETE:"crimson"} as Record<string,string>)[m] ?? "slate";
  const filtered = endpoints.filter(e => (filter==="all"||e.method===filter) && (versionFilter==="all"||e.version===versionFilter));
  async function downloadOpenApi() {
    const spec = await ent.apiGovApi.openapi();
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "openapi.json"; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Endpoints" value={endpoints.length}/>
        <Stat label="Auth required" value={endpoints.filter(e=>e.authRequired).length}/>
        <Stat label="Deprecated" value={endpoints.filter(e=>e.deprecated).length} tone="amber"/>
        <Stat label="Versions" value={versions.length}/>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 flex-wrap">
          {(["all","GET","POST","PATCH","PUT","DELETE"] as const).map(m=>(
            <button key={m} onClick={()=>setFilter(m)} className={cn(
              "px-2.5 py-1 rounded-md text-xs font-mono",
              filter===m?"bg-white/10 text-text-bright":"text-text-muted hover:bg-white/5"
            )}>{m}</button>
          ))}
          <select value={versionFilter} onChange={e=>setVersionFilter(e.target.value)} className="rounded bg-bg-dark border border-white/10 px-2 py-1 text-xs">
            <option value="all">all versions</option>
            {versions.map(v => <option key={v.version} value={v.version}>{v.version} · {v.status}</option>)}
          </select>
        </div>
        <Button size="sm" variant="outline" onClick={downloadOpenApi}>
          <FileCode2 size={14}/> Download OpenAPI
        </Button>
      </div>
      <Card>
        <div className="divide-y divide-white/5">
          {filtered.map((e,i)=>(
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5">
              <span className={cn(
                "font-mono text-[11px] w-14 font-bold",
                e.method==="GET"&&"text-azure", e.method==="POST"&&"text-emerald", e.method==="PATCH"&&"text-violet",
                e.method==="PUT"&&"text-fuchsia", e.method==="DELETE"&&"text-crimson"
              )}>{e.method}</span>
              <span className="font-mono text-sm text-text-bright flex-1 truncate">{e.path}</span>
              <Badge variant="slate">{e.version}</Badge>
              {e.authRequired ? <Badge variant="azure">auth</Badge> : <Badge variant="emerald">public</Badge>}
              {e.deprecated && <Badge variant="amber">deprecated</Badge>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Session 19: Enterprise Data Platform ──────────
function CatalogTab() {
  const [assets, setAssets] = useState<dp.DataAsset[]>([]);
  const [stats, setStats] = useState<dp.DataAssetStats | null>(null);
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  async function load() {
    const r = await dp.catalogApi.list(kindFilter !== "all" ? { kind: kindFilter as dp.DataAssetKind } : {});
    setAssets(r.assets); setStats(r.stats);
  }
  useEffect(() => { load(); }, [kindFilter]);
  const filtered = assets.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
             a.namespace.toLowerCase().includes(search.toLowerCase()) ||
             a.description.toLowerCase().includes(search.toLowerCase()));
  const classificationColor = (c: string) => ({public:"emerald",internal:"azure",confidential:"amber",restricted:"crimson",pii:"fuchsia"} as Record<string,string>)[c] ?? "slate";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Assets" value={stats?.total ?? 0}/>
        <Stat label="Kinds" value={stats ? Object.keys(stats.byKind).length : 0}/>
        <Stat label="Owners" value={stats?.owners ?? 0} tone="azure"/>
        <Stat label="Classifications" value={stats ? Object.keys(stats.byClassification).length : 0}/>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"/>
          <input placeholder="Search assets…" value={search} onChange={e=>setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 pl-8 pr-3 py-2 text-sm"/>
        </div>
        <select value={kindFilter} onChange={e=>setKindFilter(e.target.value)}
          className="rounded-lg bg-bg-dark border border-white/10 px-2 py-2 text-xs">
          <option value="all">all kinds</option>
          {["table","view","topic","bucket","index","api","file","document","graph","vector_index"].map(k=><option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {filtered.map(a => (
          <Card key={a.id}>
            <CardContent className="py-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-azure/15 text-azure grid place-items-center"><Database size={18}/></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-text-bright">{a.name}</span>
                    <span className="text-[11px] font-mono text-text-muted">{a.namespace}</span>
                    <Badge variant="slate">{a.kind}</Badge>
                    <Badge variant={classificationColor(a.classification) as any}>{a.classification}</Badge>
                  </div>
                  <p className="text-xs text-text-muted mt-1 line-clamp-2">{a.description || "—"}</p>
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {a.tags.slice(0,5).map(t => <Badge key={t} variant="slate">{t}</Badge>)}
                    {a.indexes.length>0 && <Badge variant="violet">{a.indexes.length} idx</Badge>}
                    {a.lineage && (a.lineage.sources.length+a.lineage.targets.length)>0 && <Badge variant="teal">lineage</Badge>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function KnowledgeGraphTab() {
  const [entities, setEntities] = useState<dp.KGEntity[]>([]);
  const [stats, setStats] = useState<dp.KGStats | null>(null);
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{entity:dp.KGEntity;relations:dp.KGRelation[];triples:dp.KGTriple[]}|null>(null);
  async function load() {
    const e = await dp.kgApi.list(kindFilter!=="all"?{kind:kindFilter as dp.EntityKind,search:search||undefined,limit:200}:{search:search||undefined,limit:200});
    setEntities(e);
    setStats(await dp.kgApi.stats());
  }
  useEffect(() => { load(); }, [kindFilter]);
  async function openEntity(id: string) {
    const det = await dp.kgApi.get(id);
    const triples = await dp.kgApi.traverse(id, { depth: 2 });
    setSelected({ entity: det.entity, relations: det.relations, triples });
  }
  const kindColor = (k: string) => ({user:"azure",agent:"violet",service:"emerald",concept:"fuchsia",document:"amber",organization:"teal",workspace:"sky"} as Record<string,string>)[k] ?? "slate";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Entities" value={stats?.entities ?? 0}/>
        <Stat label="Relations" value={stats?.relations ?? 0}/>
        <Stat label="Kinds" value={stats?Object.keys(stats.byKind).length:0} tone="azure"/>
        <Stat label="Relation types" value={stats?Object.keys(stats.byRelation).length:0} tone="violet"/>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"/>
          <input placeholder="Search entities…" value={search} onChange={e=>setSearch(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")load();}}
            className="w-full rounded-lg border border-white/10 bg-white/5 pl-8 pr-3 py-2 text-sm"/>
        </div>
        <select value={kindFilter} onChange={e=>setKindFilter(e.target.value)}
          className="rounded-lg bg-bg-dark border border-white/10 px-2 py-2 text-xs">
          <option value="all">all kinds</option>
          {["user","agent","organization","workspace","project","document","conversation","message","task","workflow","service","event","topic","concept","memory","file","custom"].map(k=><option key={k} value={k}>{k}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw size={14}/></Button>
      </div>
      {selected && (
        <Card>
          <CardHeader className="pb-2 flex-row flex items-start justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">{selected.entity.name}
                <Badge variant={kindColor(selected.entity.kind) as any}>{selected.entity.kind}</Badge>
              </CardTitle>
              <CardDescription className="font-mono text-[11px]">{selected.entity.id}</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={()=>setSelected(null)}>Close</Button>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-text-muted mb-2">Traversal (depth=2):</div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {selected.triples.map((t,i)=>(
                <div key={i} className="font-mono text-xs bg-white/5 rounded px-2 py-1 flex items-center gap-2">
                  <span className="text-azure truncate">{t.subject.name}</span>
                  <Badge variant="violet">{t.predicate}</Badge>
                  <span className="text-emerald truncate">{t.object.name}</span>
                </div>
              ))}
              {selected.triples.length===0 && <p className="text-xs text-text-muted">no relations within depth 2</p>}
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {entities.map(e => (
          <Card key={e.id} className="cursor-pointer hover:bg-white/5" onClick={()=>openEntity(e.id)}>
            <CardContent className="py-3">
              <div className="flex items-center gap-2">
                <Badge variant={kindColor(e.kind) as any}>{e.kind}</Badge>
                <span className="font-medium text-text-bright truncate">{e.name}</span>
              </div>
              <div className="text-[11px] font-mono text-text-muted truncate mt-1">{e.id}</div>
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {e.tags.slice(0,4).map(t => <Badge key={t} variant="slate">{t}</Badge>)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MemoryTab() {
  const [namespace, setNamespace] = useState<dp.MemoryNamespace>("global");
  const [scopeId, setScopeId] = useState("platform");
  const [entries, setEntries] = useState<dp.MemoryEntry[]>([]);
  const [stats, setStats] = useState<{total:number;byType:Record<string,number>;avgImportance:number}|null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [content, setContent] = useState("");
  const [memType, setMemType] = useState<dp.MemoryType>("fact");
  const [importance, setImportance] = useState(0.6);
  const [tags, setTags] = useState("");
  async function load() {
    setEntries(await dp.memoryApi.recall({namespace, scopeId, type: typeFilter!=="all"?typeFilter as dp.MemoryType:undefined, limit:200}));
    setStats(await dp.memoryApi.stats(namespace, scopeId));
  }
  useEffect(() => { load(); }, [namespace, scopeId, typeFilter]);
  async function remember() {
    if(!content.trim()) return;
    await dp.memoryApi.remember({namespace, scopeId, type: memType, content, importance, tags: tags.split(",").map(s=>s.trim()).filter(Boolean)});
    setContent(""); setTags(""); setImportance(0.6);
    toast.success("Memory stored"); load();
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Memories" value={stats?.total ?? 0}/>
        <Stat label="Types" value={stats?Object.keys(stats.byType).length:0}/>
        <Stat label="Avg importance" value={stats?stats.avgImportance.toFixed(2):0} tone="violet"/>
        <Stat label="Scope" value={`${namespace}:${scopeId.slice(0,12)}`}/>
      </div>
      <div className="grid md:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-2">
          <div className="flex gap-2 items-center flex-wrap">
            <select value={namespace} onChange={e=>setNamespace(e.target.value as dp.MemoryNamespace)}
              className="rounded bg-bg-dark border border-white/10 px-2 py-1.5 text-xs">
              {(["user","agent","workspace","org","global","session"] as dp.MemoryNamespace[]).map(n=><option key={n} value={n}>{n}</option>)}
            </select>
            <Input placeholder="scope id" value={scopeId} onChange={e=>setScopeId(e.target.value)} className="flex-1 max-w-[200px]"/>
            <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
              className="rounded bg-bg-dark border border-white/10 px-2 py-1.5 text-xs">
              <option value="all">all types</option>
              {(["fact","preference","episode","procedure","semantic","summary","feedback"] as dp.MemoryType[]).map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={load}><RefreshCw size={14}/></Button>
          </div>
          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {entries.map(m=>(
              <Card key={m.id}>
                <CardContent className="py-2 flex gap-3">
                  <Archive size={14} className="text-violet mt-1 shrink-0"/>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="violet">{m.type}</Badge>
                      <span className="text-[11px] text-text-muted font-mono">v{m.version}</span>
                      <span className="text-[11px] text-text-muted">imp {m.importance.toFixed(2)}</span>
                      <span className="text-[11px] text-text-muted">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-text-bright mt-1 whitespace-pre-wrap">{m.content}</p>
                    <div className="flex gap-1 mt-1">{m.tags.map(t=><Badge key={t} variant="slate">{t}</Badge>)}</div>
                  </div>
                  <Button size="sm" variant="danger" onClick={async()=>{await dp.memoryApi.forget(m.id); toast.success("forgotten"); load();}}>✕</Button>
                </CardContent>
              </Card>
            ))}
            {entries.length===0 && <div className="text-center text-xs text-text-muted py-8">no memories in this scope</div>}
          </div>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Remember</CardTitle><CardDescription>Store a new memory in the selected scope.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <select value={memType} onChange={e=>setMemType(e.target.value as dp.MemoryType)}
              className="w-full rounded bg-bg-dark border border-white/10 px-2 py-2 text-sm">
              {(["fact","preference","episode","procedure","semantic","summary","feedback"] as dp.MemoryType[]).map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <Textarea placeholder="Memory content…" rows={4} value={content} onChange={e=>setContent(e.target.value)}/>
            <Input placeholder="tags (comma-separated)" value={tags} onChange={e=>setTags(e.target.value)}/>
            <div>
              <label className="text-xs text-text-muted block mb-1">importance: {importance.toFixed(2)}</label>
              <input type="range" min="0" max="1" step="0.05" value={importance} onChange={e=>setImportance(Number(e.target.value))} className="w-full"/>
            </div>
            <Button className="w-full" onClick={remember}><Play size={14}/> Remember</Button>
            <SyncJobsBlock/>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SyncJobsBlock() {
  const [jobs, setJobs] = useState<dp.SyncJob[]>([]);
  const [runs, setRuns] = useState<dp.SyncRun[]>([]);
  async function load() { setJobs(await dp.syncApi.listJobs()); setRuns(await dp.syncApi.recentRuns(5)); }
  useEffect(()=>{load(); const t=setInterval(load,8000); return()=>clearInterval(t);}, []);
  return (
    <div className="mt-4 pt-4 border-t border-white/5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-text-bright uppercase tracking-wide">Sync Jobs</span>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw size={12}/></Button>
      </div>
      <div className="space-y-1">
        {jobs.map(j=>(
          <div key={j.id} className="flex items-center gap-2 p-1.5 rounded bg-white/5">
            <span className={cn("h-2 w-2 rounded-full",
              j.status==="running"?"bg-amber animate-pulse":j.status==="error"?"bg-crimson":j.enabled?"bg-emerald":"bg-slate")}/>
            <span className="text-xs text-text-bright flex-1 truncate">{j.name}</span>
            <span className="text-[10px] text-text-muted">{j.runs} runs</span>
            <Button size="sm" variant="outline" onClick={async()=>{await dp.syncApi.run(j.id); toast.success("run triggered"); load();}}>
              <Play size={11}/>
            </Button>
          </div>
        ))}
      </div>
      {runs.length>0 && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <div className="text-[10px] text-text-muted mb-1">recent runs</div>
          {runs.slice(0,3).map(r=>(
            <div key={r.jobId+r.startedAt} className="text-[11px] font-mono flex gap-2">
              <span className="text-text-muted">{new Date(r.startedAt).toLocaleTimeString()}</span>
              <span className="text-text-bright flex-1 truncate">{r.jobId}</span>
              <span className={r.errors.length?"text-crimson":"text-emerald"}>{r.durationMs}ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Session 20: Agent Comm Tab ────────────────────────────────────────
function AgentCommTab() {
  const [sub, setSub] = useState<"overview"|"identities"|"messages"|"teams"|"reasoning"|"feedback"|"escalation">("overview");
  const [stats, setStats] = useState<ac.AgentCommStats | null>(null);
  const [identities, setIdentities] = useState<any[]>([]);
  const [messages, setMessages] = useState<CommEnvelope[]>([]);
  const [teams, setTeams] = useState<AgentTeam[]>([]);
  const [artifacts, setArtifacts] = useState<ReasoningArtifact[]>([]);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [policies, setPolicies] = useState<EscalationPolicy[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [msgForm, setMsgForm] = useState({ to:"", subject:"", payload:"{}", priority:"normal" as any });
  const [policyForm, setPolicyForm] = useState({ name:"", minConfidence:0.6 });

  async function load() {
    try {
      const s = await ac.agentCommApi.stats();
      setStats(s);
      setIdentities((await ac.agentCommApi.listIdentities()) as any);
      setTeams(await ac.agentCommApi.listTeams());
      setMessages(await ac.agentCommApi.history());
      setArtifacts(await ac.agentCommApi.listReasoning({ limit: 20 }));
      setFeedbacks(await ac.agentCommApi.listFeedback());
      setPolicies(await ac.agentCommApi.listPolicies());
      setEscalations(await ac.agentCommApi.listEscalations());
    } catch (e:any) { toast.error(e?.message ?? "load failed"); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (selectedAgent) {
      ac.agentCommApi.inbox(selectedAgent, 20).then((m) => setMessages(m)).catch(() => {});
    } else {
      ac.agentCommApi.history().then((m) => setMessages(m)).catch(() => {});
    }
  }, [selectedAgent]);

  const lifecycleColor: Record<AgentLifecycle,string> = { created:"text-text-muted", trained:"text-azure", active:"text-emerald", optimized:"text-teal", suspended:"text-amber", archived:"text-violet", retired:"text-text-muted" };

  async function sendMsg() {
    try {
      let payload: any = {};
      try { payload = JSON.parse(msgForm.payload); } catch { payload = { text: msgForm.payload }; }
      if (!identities[0]) { toast.error("no sender available"); return; }
      await ac.agentCommApi.sendMessage({ from: identities[0].agentId, to: msgForm.to || "*", type: "event", subject: msgForm.subject || "(no subject)", priority: msgForm.priority, payload });
      toast.success("message sent"); setMsgForm({ to:"", subject:"", payload:"{}", priority:"normal" }); load();
    } catch (e:any) { toast.error(e?.message ?? "send failed"); }
  }

  async function transition(id:string,to:AgentLifecycle){
    await ac.agentCommApi.transitionLifecycle(id,to); toast.success(`→ ${to}`); load();
  }
  async function togglePolicy(id:string,enabled:boolean){ await ac.agentCommApi.togglePolicy(id,enabled); load(); }
  async function decideEsc(id:string,approved:boolean){
    if (!identities[0]) return;
    await ac.agentCommApi.decideEscalation(id, approved, identities[0].agentId, "manual review");
    toast.success(approved ? "approved":"denied"); load();
  }
  async function createPolicy() {
    if (!policyForm.name) return;
    await ac.agentCommApi.createPolicy({
      name: policyForm.name, scope:"*",
      conditions: { minConfidence: policyForm.minConfidence },
      actions: ["request_human_approval","pause_task"], enabled: true,
    });
    toast.success("policy created"); setPolicyForm({ name:"", minConfidence:0.6 }); load();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          ["overview","Overview",Activity],
          ["identities","Identities",Bot],
          ["messages","Messages",MessageSquare],
          ["teams","Teams",Users],
          ["reasoning","Reasoning",GitBranch],
          ["feedback","Feedback",ThumbsUp],
          ["escalation","Escalation",AlertTriangle],
        ].map(([k,lbl,Icon]:any)=>{
          const Ic = Icon;
          return <Button key={k} size="sm" variant={sub===k?"primary":"outline"} onClick={()=>setSub(k)}><Ic className="h-3.5 w-3.5 mr-1"/>{lbl}</Button>;
        })}
        <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-3.5 w-3.5"/></Button>
      </div>

      {sub==="overview" && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Stat label="Identities" value={stats.identities}/>
          <Stat label="Teams" value={stats.teams}/>
          <Stat label="Messages" value={stats.messagesTotal}/>
          <Stat label="Reasoning" value={stats.reasoningArtifacts}/>
          <Stat label="Feedback" value={stats.feedbackSignals}/>
          <Stat label="Open Esc" value={stats.openEscalations} tone={stats.openEscalations?"amber":undefined}/>
          <Stat label="Policies" value={stats.policies}/>
        </div>
      )}

      {sub==="identities" && (
        <div className="grid gap-3">
          {identities.map(i=>(
            <Card key={i.agentId}>
              <CardHeader className="py-3 flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2"><Bot className="h-4 w-4 text-azure"/>{i.displayName}<Badge className={cn("ml-1", lifecycleColor[i.lifecycle as AgentLifecycle])}>{i.lifecycle}</Badge></CardTitle>
                  <CardDescription className="text-xs">{i.department} · v{i.version} · perf {(i.performanceScore*100).toFixed(0)}% · rep {(i.reputationScore*100).toFixed(0)}%</CardDescription>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {(["trained","active","optimized","suspended","archived","retired"] as AgentLifecycle[]).map(s=>(
                    <Button key={s} size="sm" variant="outline" onClick={()=>transition(i.agentId,s)}>{s}</Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="py-2 text-xs">
                <div className="flex gap-2 flex-wrap mb-2">
                  {i.capabilities.slice(0,8).map((c:any)=>(<Badge key={c.id} variant="violet">{c.id}</Badge>))}
                  {i.capabilities.length>8 && <Badge>+{i.capabilities.length-8}</Badge>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {i.credentials.map((c:any)=>(
                    <span key={c.id} className="font-mono text-[10px] text-text-muted">{c.keyHint} · {c.scopes.join(",")||"no scopes"} {c.revokedAt && <span className="text-crimson">revoked</span>}</span>
                  ))}
                  <Button size="sm" variant="ghost" onClick={async()=>{
                    const r = await ac.agentCommApi.mintCredential(i.agentId, ["comm.send"]);
                    toast.success(`Key: ${r.rawKey.slice(0,20)}... (copy now — only shown once)`);
                    load();
                  }}>mint key</Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {identities.length===0 && <div className="text-sm text-text-muted">no identities yet</div>}
        </div>
      )}

      {sub==="messages" && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Send message</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div>
                <label className="text-xs text-text-muted block mb-1">from</label>
                <select className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs" value={identities[0]?.agentId??""} onChange={()=>{}}>
                  {identities.map(i=><option key={i.agentId} value={i.agentId}>{i.displayName}</option>)}
                </select>
              </div>
              <Input placeholder="to (agent id, team:<id>, or *)" value={msgForm.to} onChange={(e)=>setMsgForm({...msgForm,to:e.target.value})}/>
              <Input placeholder="subject" value={msgForm.subject} onChange={(e)=>setMsgForm({...msgForm,subject:e.target.value})}/>
              <Textarea placeholder='payload JSON e.g. {"text":"hello"}' value={msgForm.payload} onChange={(e)=>setMsgForm({...msgForm,payload:e.target.value})} className="font-mono text-xs" rows={3}/>
              <div className="flex gap-2 items-center">
                <select className="rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs" value={msgForm.priority} onChange={(e)=>setMsgForm({...msgForm,priority:e.target.value as any})}>
                  <option value="low">low</option><option value="normal">normal</option><option value="high">high</option><option value="urgent">urgent</option>
                </select>
                <Button size="sm" onClick={sendMsg}>send</Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">{selectedAgent ? `Inbox: ${selectedAgent.slice(0,8)}` : "Global history"}</CardTitle>
              <select className="rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs" value={selectedAgent} onChange={(e)=>setSelectedAgent(e.target.value)}>
                <option value="">all (history)</option>
                {identities.map(i=><option key={i.agentId} value={i.agentId}>{i.displayName} inbox</option>)}
              </select>
            </CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {messages.slice(0,40).map(m=>(
                <div key={m.id} className="text-xs border border-white/5 rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{m.from.slice(0,8)} → {m.to.slice(0,8)}</span>
                    <Badge variant={m.priority==="urgent"?"crimson":m.priority==="high"?"amber":"azure"}>{m.priority}</Badge>
                  </div>
                  <div className="text-text-bright mt-0.5">{m.subject}</div>
                  <div className="text-text-muted font-mono text-[10px] mt-1">{m.type} · {new Date(m.createdAt).toLocaleTimeString()} · corr {m.correlationId.slice(0,8)}</div>
                </div>
              ))}
              {messages.length===0 && <div className="text-xs text-text-muted">no messages</div>}
            </CardContent>
          </Card>
        </div>
      )}

      {sub==="teams" && (
        <div className="grid gap-3">
          {teams.map(t=>(
            <Card key={t.id}>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-teal"/>{t.name}</CardTitle>
                <CardDescription className="text-xs">{t.mission} · {t.members.length} members · channel {t.channel}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 flex-wrap">
                  {t.members.map((m:any)=>(
                    <Badge key={m.agentId} variant={m.role==="coordinator"?"emerald":m.role==="reviewer"?"violet":"default"}>{m.role} · {m.agentId.slice(0,8)}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {teams.length===0 && <div className="text-sm text-text-muted">no teams yet</div>}
        </div>
      )}

      {sub==="reasoning" && (
        <div className="grid gap-3">
          {artifacts.map(a=>(
            <Card key={a.id}>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><GitBranch className="h-4 w-4 text-violet"/>{a.subject}<Badge variant="azure">{a.status}</Badge></CardTitle>
                <CardDescription className="text-xs">by {a.authorAgentId.slice(0,8)} · conf {(a.confidence*100).toFixed(0)}% · {a.critiques.length} critiques · chain {a.chainId.slice(0,8)}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div><span className="text-text-muted">H:</span> {a.hypothesis}</div>
                {a.conclusion && <div><span className="text-text-muted">C:</span> {a.conclusion}</div>}
                {a.evidence.length>0 && <div className="flex gap-1 flex-wrap">{a.evidence.slice(0,4).map(e=><Badge key={e.id} variant="teal">{e.strength}: {e.source}</Badge>)}</div>}
                {a.critiques.length>0 && (
                  <div className="space-y-1">
                    {a.critiques.map(c=>(<div key={c.id} className="pl-2 border-l-2 border-white/10"><span className={cn("font-semibold", c.verdict==="approve"?"text-emerald":c.verdict==="reject"?"text-crimson":"text-amber")}>{c.verdict}</span> · {c.note} <span className="text-text-muted">— {c.reviewerAgentId.slice(0,8)}</span></div>))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sub==="feedback" && (
        <div className="grid gap-2">
          {feedbacks.map((f:any)=>(
            <div key={f.id} className="flex items-center gap-2 text-xs border border-white/5 rounded p-2">
              <Badge variant={f.kind==="upvote"?"emerald":f.kind==="downvote"?"crimson":"azure"}>{f.kind}</Badge>
              <span className="text-text-bright">{f.fromId.slice(0,8)} → {f.targetAgentId.slice(0,8)}</span>
              <span className="text-text-muted flex-1 truncate">{f.comment ?? ""}</span>
              {typeof f.value==="number" && <span className="font-mono">{f.value}</span>}
              <span className="text-text-muted">{new Date(f.createdAt).toLocaleString()}</span>
            </div>
          ))}
          {feedbacks.length===0 && <div className="text-xs text-text-muted">no feedback</div>}
        </div>
      )}

      {sub==="escalation" && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Policies</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Input placeholder="policy name" value={policyForm.name} onChange={(e)=>setPolicyForm({...policyForm,name:e.target.value})}/>
                <Button size="sm" onClick={createPolicy}>+</Button>
              </div>
              {policies.map(p=>(
                <div key={p.id} className="text-xs border border-white/5 rounded p-2 flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-semibold">{p.name} {!p.enabled && <span className="text-text-muted">(disabled)</span>}</div>
                    <div className="text-text-muted">
                      {p.conditions.minConfidence!=null && <span>conf≥{p.conditions.minConfidence} </span>}
                      {p.conditions.priorityAtLeast && <span>prio≥{p.conditions.priorityAtLeast} </span>}
                      {p.conditions.dataClassifications && <span>{p.conditions.dataClassifications.join(",")} </span>}
                      → {p.actions.join(",")}
                    </div>
                  </div>
                  <Switch checked={p.enabled} onChange={(v)=>togglePolicy(p.id,v)}/>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Open escalations</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {escalations.map(e=>(
                <div key={e.id} className="text-xs border border-white/5 rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber">{e.status}</span>
                    <span className="text-text-muted">{new Date(e.createdAt).toLocaleString()}</span>
                  </div>
                  <div>{e.fromAgentId.slice(0,8)} → {e.toId.slice(0,8)}</div>
                  <div className="text-text-muted">{e.reason}</div>
                  {e.status==="open" && (
                    <div className="flex gap-1 mt-1">
                      <Button size="sm" variant="primary" onClick={()=>decideEsc(e.id,true)}>approve</Button>
                      <Button size="sm" variant="danger" onClick={()=>decideEsc(e.id,false)}>deny</Button>
                    </div>
                  )}
                </div>
              ))}
              {escalations.length===0 && <div className="text-xs text-text-muted">all quiet</div>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: any; tone?: string }) {
  return (
    <Card><CardContent className="py-4">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={cn("text-2xl font-semibold mt-1", tone === "emerald" ? "text-emerald" : "text-text-bright")}>{value}</div>
    </CardContent></Card>
  );
}
