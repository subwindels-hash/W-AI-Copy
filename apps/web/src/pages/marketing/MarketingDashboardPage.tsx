/**
 * WINDELS AI OS — AI Marketing Intelligence & Campaign Management dashboard.
 *
 * A Tier-1 module: 28 specialized marketing agents, multi-platform campaign
 * management, AI copywriting (10 frameworks), customer personas, A/B testing,
 * performance analytics, and optimization recommendations — all org-scoped and
 * integrated with the AI Workforce + Media Generation Studio.
 */
import { useCallback, useEffect, useState } from "react";
import { marketingApi, MARKETING_PLATFORMS, COPY_FRAMEWORKS, type MarketingDashboard, type MarketingCampaign, type MarketingAgent, type Persona, type AbTest, type CopyFramework, type MarketingPlatform } from "@/lib/marketing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { DataBanner } from "@/components/ui/DataBanner";
import { BarChart3, Plus, Loader2, Trash2, Bot, Target, Sparkles, FlaskConical, Users, Megaphone, Wallet, TrendingUp, CheckCircle2, Activity } from "lucide-react";

const usd = (n: number) => `$${(n / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function MarketingDashboardPage() {
  const [dash, setDash] = useState<MarketingDashboard | null>(null);
  const [agents, setAgents] = useState<MarketingAgent[]>([]);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [abTests, setAbTests] = useState<AbTest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // forms
  const [campName, setCampName] = useState("");
  const [campObjective, setCampObjective] = useState("");
  const [campPlatform, setCampPlatform] = useState<MarketingPlatform>("facebook");
  const [campBudget, setCampBudget] = useState("");
  const [copyProduct, setCopyProduct] = useState("");
  const [copyAudience, setCopyAudience] = useState("");
  const [copyGoal, setCopyGoal] = useState("");
  const [copyFramework, setCopyFramework] = useState<CopyFramework>("aida");
  const [generatedCopy, setGeneratedCopy] = useState<{ copy: string; aiSource: string } | null>(null);
  const [personaName, setPersonaName] = useState("");
  const [personaProduct, setPersonaProduct] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [d, ag, c, p, a] = await Promise.all([
        marketingApi.dashboard(), marketingApi.agents(), marketingApi.campaigns(), marketingApi.personas(), marketingApi.abTests(),
      ]);
      setDash(d); setAgents(ag); setCampaigns(c); setPersonas(p); setAbTests(a);
    } catch { /* degrades before server config */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = useCallback(async (action: string, fn: () => Promise<unknown>) => {
    setBusy(action); setErr(null); setNotice(null);
    try {
      const res = await fn();
      if (res) setNotice(res as string);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }, [refresh]);

  const createCampaign = useCallback(async () => {
    if (!campName.trim() || !campObjective.trim()) { setErr("Campaign name + objective required."); return; }
    await run("createCamp", async () => {
      await marketingApi.createCampaign({ name: campName.trim(), objective: campObjective.trim(), platform: campPlatform, budgetMicros: Math.round((Number(campBudget) || 0) * 1_000_000) });
      setCampName(""); setCampObjective(""); setCampBudget("");
      return "Campaign created.";
    });
  }, [campName, campObjective, campPlatform, campBudget, run]);

  const genCopy = useCallback(async () => {
    if (!copyProduct.trim()) { setErr("Enter a product to generate copy."); return; }
    await run("copy", async () => {
      const r = await marketingApi.copy({ product: copyProduct.trim(), audience: copyAudience || "general", goal: copyGoal || "convert", framework: copyFramework });
      setGeneratedCopy({ copy: r.copy, aiSource: r.aiSource });
      return r.aiSource === "real" ? "AI copy generated." : "Demo copy generated (configure an AI provider for production copy).";
    });
  }, [copyProduct, copyAudience, copyGoal, copyFramework, run]);

  const createPersona = useCallback(async () => {
    if (!personaName.trim()) { setErr("Persona name required."); return; }
    await run("persona", async () => {
      await marketingApi.createPersona({ name: personaName.trim(), product: personaProduct || "product", audience: "target" });
      setPersonaName(""); setPersonaProduct("");
      return "Persona created.";
    });
  }, [personaName, personaProduct, run]);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-azure-400" /> AI Marketing Intelligence
          </h1>
          <p className="text-sm text-text-muted mt-1">
            28 specialized agents · multi-platform campaigns · copywriting · personas · A/B testing · analytics.
          </p>
        </div>
      </div>

      {err && <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{err}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">{notice}</div>}
      {generatedCopy?.aiSource === "demo" && <div className="mb-4"><DataBanner message="No real AI provider configured — copy is DEMO output. Set OPENAI_API_KEY / ANTHROPIC_API_KEY / OLLAMA_BASE_URL for production copy." /></div>}

      {/* KPI cards */}
      {dash && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <Stat label="Campaigns" value={`${dash.totalCampaigns} (${dash.activeCampaigns} active)`} icon={<Megaphone className="h-4 w-4" />} />
          <Stat label="Spend / ROAS" value={`${usd(dash.totalSpendMicros)} / ${dash.roas ?? "—"}`} icon={<Wallet className="h-4 w-4" />} />
          <Stat label="Conversions" value={dash.totalConversions.toLocaleString()} icon={<CheckCircle2 className="h-4 w-4" />} />
          <Stat label="CTR" value={`${dash.totalCtr}%`} icon={<Activity className="h-4 w-4" />} />
          <Stat label="Agents online" value={`${dash.agents.online}/${dash.agents.total}`} icon={<Bot className="h-4 w-4" />} />
        </div>
      )}

      {/* Campaigns + create */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" /> Campaigns</CardTitle>
          <CardDescription>Multi-platform campaign management (Facebook · Instagram · YouTube · Google · LinkedIn · TikTok · X · Pinterest · Snapchat · Microsoft Ads).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-5 gap-2">
            <div className="space-y-1"><label className="text-xs text-text-muted">Name</label><Input value={campName} onChange={(e) => setCampName(e.target.value)} placeholder="e.g. Summer launch" /></div>
            <div className="space-y-1"><label className="text-xs text-text-muted">Objective</label><Input value={campObjective} onChange={(e) => setCampObjective(e.target.value)} placeholder="e.g. Drive signups" /></div>
            <div className="space-y-1"><label className="text-xs text-text-muted">Platform</label><Select value={campPlatform} onChange={(e) => setCampPlatform(e.target.value as MarketingPlatform)}>{MARKETING_PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></div>
            <div className="space-y-1"><label className="text-xs text-text-muted">Budget (USD)</label><Input type="number" value={campBudget} onChange={(e) => setCampBudget(e.target.value)} /></div>
            <div className="flex items-end"><Button onClick={createCampaign} disabled={busy === "createCamp"} className="w-full"><Plus className="h-4 w-4 mr-1" /> Create</Button></div>
          </div>
          {campaigns.length === 0 ? (
            <p className="text-sm text-text-muted">No campaigns yet.</p>
          ) : (
            <div className="grid gap-2">
              {campaigns.map((c) => {
                const m = c.metrics;
                const ctr = m.impressions > 0 ? ((m.clicks / m.impressions) * 100).toFixed(2) : "0";
                const roas = m.spendMicros > 0 ? (m.revenueMicros / m.spendMicros).toFixed(2) : "—";
                return (
                  <div key={c.id} className="rounded-xl border border-border bg-bg-elevated px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-text-bright">{c.name} <span className="text-text-muted text-xs">({c.platform})</span></div>
                        <div className="text-xs text-text-muted mt-0.5">{c.objective} · {c.status}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{m.impressions} imp</Badge>
                        <Badge variant="outline">CTR {ctr}%</Badge>
                        <Badge variant="outline">{m.conversions} conv</Badge>
                        <Badge variant="outline">{usd(m.spendMicros)} / ROAS {roas}</Badge>
                        <Select value={c.status} onChange={(e) => void run(`st-${c.id}`, async () => { await marketingApi.updateStatus(c.id, e.target.value as any); })} className="w-28">
                          <option value="draft">draft</option><option value="active">active</option><option value="paused">paused</option><option value="completed">completed</option><option value="archived">archived</option>
                        </Select>
                        <Button size="sm" variant="outline" onClick={() => void run(`del-${c.id}`, async () => { await marketingApi.removeCampaign(c.id); })}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        {/* Copywriting engine */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI Copywriting Engine</CardTitle>
            <CardDescription>10 proven frameworks: AIDA · PAS · BAB · StoryBrand · FAB · 4Ps · QUEST · ACCA · more.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><label className="text-xs text-text-muted">Product</label><Input value={copyProduct} onChange={(e) => setCopyProduct(e.target.value)} placeholder="e.g. CRM software" /></div>
              <div className="space-y-1"><label className="text-xs text-text-muted">Audience</label><Input value={copyAudience} onChange={(e) => setCopyAudience(e.target.value)} placeholder="e.g. startup founders" /></div>
              <div className="space-y-1"><label className="text-xs text-text-muted">Goal</label><Input value={copyGoal} onChange={(e) => setCopyGoal(e.target.value)} placeholder="e.g. book a demo" /></div>
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1 flex-1"><label className="text-xs text-text-muted">Framework</label><Select value={copyFramework} onChange={(e) => setCopyFramework(e.target.value as CopyFramework)}>{COPY_FRAMEWORKS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</Select></div>
              <Button onClick={genCopy} disabled={busy === "copy"}>{busy === "copy" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />} Generate copy</Button>
            </div>
            {generatedCopy && (
              <div className="rounded-lg border border-border bg-bg-deep/40 p-3 text-sm whitespace-pre-wrap text-text-main">
                <div className="flex items-center justify-between mb-1"><Badge className={generatedCopy.aiSource === "real" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}>{generatedCopy.aiSource}</Badge></div>
                {generatedCopy.copy}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Personas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Customer Personas</CardTitle>
            <CardDescription>AI-built audience profiles: demographics, interests, pain points, motivations, buying triggers, objections.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="space-y-1 flex-1"><label className="text-xs text-text-muted">Persona name</label><Input value={personaName} onChange={(e) => setPersonaName(e.target.value)} placeholder="e.g. Startup Founder Sam" /></div>
              <div className="space-y-1 flex-1"><label className="text-xs text-text-muted">Product context</label><Input value={personaProduct} onChange={(e) => setPersonaProduct(e.target.value)} /></div>
              <Button onClick={createPersona} disabled={busy === "persona"}><Plus className="h-3 w-3 mr-1" /> Add</Button>
            </div>
            {personas.length === 0 && <p className="text-sm text-text-muted">No personas yet.</p>}
            {personas.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-bg-elevated px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-bright">{p.name}</span>
                  <div className="flex items-center gap-2"><Badge variant="outline">{p.aiSource}</Badge><Button size="sm" variant="outline" onClick={() => void run(`dp-${p.id}`, async () => { await marketingApi.removePersona(p.id); })}><Trash2 className="h-3 w-3" /></Button></div>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.painPoints.slice(0, 2).map((x, i) => <span key={i} className="rounded bg-bg-hover px-1.5 text-[11px] text-text-muted">pain: {x}</span>)}
                  {p.motivations.slice(0, 2).map((x, i) => <span key={i} className="rounded bg-bg-hover px-1.5 text-[11px] text-text-muted">motivation: {x}</span>)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* A/B tests + agents */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><FlaskConical className="h-4 w-4" /> A/B Testing Engine</CardTitle>
            <CardDescription>Compare creative variations, detect winners, optimize.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {abTests.length === 0 && <p className="text-sm text-text-muted">No A/B tests yet. Create one via the API to compare variants.</p>}
            {abTests.map((t) => (
              <div key={t.id} className="rounded-xl border border-border bg-bg-elevated px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-bright">{t.name}</span>
                  <Badge variant={t.status === "running" ? "outline" : "secondary"}>{t.status}</Badge>
                </div>
                <div className="mt-2 space-y-1">
                  {t.variants.map((v) => (
                    <div key={v.id} className="flex items-center justify-between text-xs">
                      <span className="text-text-bright">{v.name} <span className="text-text-muted">({v.impressions} imp · {v.conversions} conv)</span></span>
                      {t.status === "completed" && t.winnerVariantId === v.id && <Badge className="bg-emerald-500/15 text-emerald-300">WINNER</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Bot className="h-4 w-4" /> AI Marketing Workforce ({agents.length} agents)</CardTitle>
            <CardDescription>Specialized AI employees — run one for a real decision.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-2">
              {agents.slice(0, 8).map((a) => (
                <div key={a.key} className="rounded-xl border border-border bg-bg-elevated px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-bright font-medium">{a.name}</span>
                    <Button size="sm" variant="outline" onClick={() => void run(`ag-${a.key}`, async () => {
                      const r = await marketingApi.runAgent(a.key, a.key === "copywriter" ? { product: "windels", audience: "enterprise", goal: "demo" } : undefined);
                      return `${r.agent}: ${r.verdict} — ${r.detail}`;
                    })} disabled={busy === `ag-${a.key}`}>{busy === `ag-${a.key}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}</Button>
                  </div>
                  <p className="text-xs text-text-muted mt-1">{a.description}</p>
                </div>
              ))}
            </div>
            {agents.length > 8 && <p className="text-xs text-text-muted mt-2">+ {agents.length - 8} more agents available</p>}
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      {dash && dash.topRecommendations.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> AI Optimization Recommendations</CardTitle>
            <CardDescription>Generated from measured campaign performance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {dash.topRecommendations.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-bright">{r.title}</span>
                  <Badge variant="outline">{r.priority}</Badge>
                </div>
                <p className="text-xs text-text-muted mt-1">{r.rationale}</p>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => void run("genRecs", async () => { await marketingApi.generateRecommendations(); })}><TrendingUp className="h-3 w-3 mr-1" /> Regenerate recommendations</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card><CardContent className="flex items-center gap-3 py-4"><div className="text-azure-300">{icon}</div><div><div className="text-xs text-text-muted">{label}</div><div className="text-lg font-semibold text-text-bright">{value}</div></div></CardContent></Card>
  );
}
