/**
 * WINDELS AI OS — AI Advertising Platform (unified, single module).
 *
 * ONE advertising platform with four campaign modes (Standard / AI Smart /
 * Performance / Autonomous). This page is the single advertising dashboard and
 * campaign-creation wizard for all four modes — the mode selector just shows the
 * relevant settings; everything runs through the same backend.
 *
 * Honesty rules: when no real AI provider is configured the UI shows a DataBanner
 * and any generated creative is tagged "demo" (never presented as production).
 * Performance billing surfaces its verification / fraud status transparently.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { advertisingApi, CAMPAIGN_MODES, BILLING_MODES, type AdCampaignRecord, type AdCampaignDashboard, type CampaignMode } from "@/lib/advertising";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { DataBanner } from "@/components/ui/DataBanner";
import {
  Megaphone, Plus, Loader2, Play, Pause, CheckCircle2, XCircle, Sparkles, Send,
  RefreshCw, Bot, ShieldCheck, TrendingUp, Wallet, Activity, ArrowLeft, Zap,
} from "lucide-react";

const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;

const modeColor: Record<CampaignMode, string> = {
  standard: "bg-slate-500/15 text-slate-300",
  smart: "bg-violet-500/15 text-violet-300",
  performance: "bg-emerald-500/15 text-emerald-300",
  autonomous: "bg-azure-500/15 text-azure-300",
};

const healthColor: Record<string, string> = {
  healthy: "bg-emerald-500/15 text-emerald-300",
  watch: "bg-amber-500/15 text-amber-300",
  needs_attention: "bg-rose-500/15 text-rose-300",
  inactive: "bg-slate-500/15 text-slate-300",
};

export function AdsPage() {
  const [campaigns, setCampaigns] = useState<AdCampaignRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dash, setDash] = useState<AdCampaignDashboard | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // wizard form
  const [mode, setMode] = useState<CampaignMode>("standard");
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [billingMode, setBillingMode] = useState<AdCampaignRecord["billingMode"]>("standard");
  const [automationLevel, setAutomationLevel] = useState<AdCampaignRecord["automationLevel"]>("manual");
  const [budget, setBudget] = useState(""); // dollars
  const [pbEvents, setPbEvents] = useState<string>("sale, qualified_lead");
  const [pbPayout, setPbPayout] = useState(""); // dollars per event

  const refreshList = useCallback(async () => {
    try { setCampaigns(await advertisingApi.list()); } catch { /* degrades before server config */ }
  }, []);

  const loadDashboard = useCallback(async (id: string) => {
    setDash(null);
    try { setDash(await advertisingApi.dashboard(id)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);

  useEffect(() => { void refreshList(); }, [refreshList]);
  useEffect(() => {
    if (selectedId) void loadDashboard(selectedId);
    else setDash(null);
  }, [selectedId, loadDashboard]);

  const run = useCallback(async (action: string, fn: () => Promise<unknown>) => {
    setBusy(action); setErr(null); setNotice(null);
    try {
      const res = await fn();
      if (res) setNotice(res as string);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }, []);

  const createCampaign = useCallback(async () => {
    if (!name.trim() || !objective.trim()) { setErr("Campaign name and objective are required."); return; }
    await run("create", async () => {
      const performanceBilling = mode === "performance" ? {
        enabled: true,
        events: pbEvents.split(",").map((s) => s.trim()).filter(Boolean),
        payoutMicros: Math.round((Number(pbPayout) || 0) * 1_000_000),
        payOnlyVerified: true,
      } : undefined;
      const created = await advertisingApi.create({
        name: name.trim(),
        objective: objective.trim(),
        campaignMode: mode,
        billingMode: billingMode === "standard" && mode === "performance" ? "performance" : billingMode,
        automationLevel,
        budgetMicros: Math.round((Number(budget) || 0) * 1_000_000),
        performanceBilling,
      });
      await refreshList();
      setCreating(false);
      setName(""); setObjective(""); setBudget(""); setPbPayout("");
      setSelectedId(created.id);
      return `Campaign "${created.name}" created (${created.campaignMode} mode).`;
    });
  }, [name, objective, mode, billingMode, automationLevel, budget, pbEvents, pbPayout, refreshList, run]);

  const gen = useCallback(async (contentType: string) => {
    if (!selectedId) return;
    await run(`gen-${contentType}`, async () => {
      const r = await advertisingApi.generate(selectedId, contentType, objective || undefined);
      await loadDashboard(selectedId);
      return `${r.aiSource === "demo" ? "Demo" : "AI"} ${contentType} generated. ${r.aiSource === "demo" ? "Configure an AI provider for production creative." : ""}`;
    });
  }, [selectedId, objective, loadDashboard, run]);

  const act = useCallback((action: string, fn: (id: string) => Promise<unknown>) => {
    if (!selectedId) return;
    void run(action, async () => { await fn(selectedId); await loadDashboard(selectedId); });
  }, [selectedId, loadDashboard, run]);

  const reportConv = useCallback(async () => {
    if (!selectedId) return;
    await run("conv", async () => {
      const r = await advertisingApi.reportConversion(selectedId, { eventType: "sale", valueMicros: 50_000_000, proof: `order-${Date.now()}` });
      await loadDashboard(selectedId);
      return r.blocked ? "Conversion rejected by fraud check." : `Conversion verified (status=${r.verificationStatus}).`;
    });
  }, [selectedId, loadDashboard, run]);

  const selected = useMemo(() => campaigns.find((c) => c.id === selectedId) ?? null, [campaigns, selectedId]);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-azure-400" /> AI Advertising Platform
          </h1>
          <p className="text-sm text-text-muted mt-1">
            One unified platform — Standard · AI Smart · Performance · Fully Autonomous. Choose the mode that fits, all through the same system.
          </p>
        </div>
        <Button onClick={() => { setCreating((c) => !c); setErr(null); }}>
          {creating ? <ArrowLeft className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          {creating ? "Back to campaigns" : "New Campaign"}
        </Button>
      </div>

      {!dash?.aiConfigured && selected && (
        <div className="mb-4"><DataBanner message="No real AI provider is configured. Creative generated here is DEMO output and not production-ready. Set OPENAI_API_KEY / ANTHROPIC_API_KEY / OLLAMA_BASE_URL to enable real generation." /></div>
      )}

      {err && <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{err}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">{notice}</div>}

      {creating ? (
        <Wizard
          mode={mode} setMode={setMode} name={name} setName={setName} objective={objective} setObjective={setObjective}
          billingMode={billingMode} setBillingMode={setBillingMode} automationLevel={automationLevel} setAutomationLevel={setAutomationLevel}
          budget={budget} setBudget={setBudget} pbEvents={pbEvents} setPbEvents={setPbEvents} pbPayout={pbPayout} setPbPayout={setPbPayout}
          busy={busy} onCreate={createCampaign}
        />
      ) : selected && dash ? (
        <Dashboard dash={dash} busy={busy} onGen={gen} onAct={act} onConv={reportConv} onBack={() => setSelectedId(null)} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Campaigns</CardTitle>
            <CardDescription>All modes live in one list. Select a campaign to open its dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            {campaigns.length === 0 ? (
              <div className="text-sm text-text-muted py-8 text-center">
                No campaigns yet. Click <span className="text-azure-300">New Campaign</span> and pick a mode.
              </div>
            ) : (
              <div className="grid gap-3">
                {campaigns.map((c) => (
                  <button key={c.id} onClick={() => setSelectedId(c.id)}
                    className="flex items-center justify-between rounded-xl border border-border bg-bg-elevated px-4 py-3 text-left hover:border-azure-500/40 transition-colors">
                    <div>
                      <div className="font-medium text-text-bright">{c.name}</div>
                      <div className="text-xs text-text-muted mt-0.5">{c.objective} · {c.currency}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={modeColor[c.campaignMode]}>{c.campaignMode}</Badge>
                      <Badge variant="outline">{c.billingMode}</Badge>
                      <Badge variant="outline">{c.automationLevel}</Badge>
                      <Badge variant="outline">{c.status}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Campaign Creation Wizard ─────────────────────────────────────── */

function Wizard(props: {
  mode: CampaignMode; setMode: (m: CampaignMode) => void;
  name: string; setName: (s: string) => void;
  objective: string; setObjective: (s: string) => void;
  billingMode: AdCampaignRecord["billingMode"]; setBillingMode: (b: AdCampaignRecord["billingMode"]) => void;
  automationLevel: AdCampaignRecord["automationLevel"]; setAutomationLevel: (a: AdCampaignRecord["automationLevel"]) => void;
  budget: string; setBudget: (s: string) => void;
  pbEvents: string; setPbEvents: (s: string) => void; pbPayout: string; setPbPayout: (s: string) => void;
  busy: string | null; onCreate: () => void;
}) {
  const autoByMode: Record<CampaignMode, AdCampaignRecord["automationLevel"]> = {
    standard: "manual", smart: "assistant", performance: "manual", autonomous: "autonomous",
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a campaign</CardTitle>
        <CardDescription>Choose an advertising mode. The relevant settings appear below; all modes share the same platform.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Mode selector */}
        <div>
          <div className="text-sm font-medium text-text-bright mb-2">Advertising Mode</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {CAMPAIGN_MODES.map((m) => (
              <button key={m.value} onClick={() => { props.setMode(m.value); props.setAutomationLevel(autoByMode[m.value]); }}
                className={`rounded-xl border p-4 text-left transition-colors ${props.mode === m.value ? "border-azure-500 bg-azure-500/10" : "border-border bg-bg-elevated hover:border-azure-500/40"}`}>
                <div className="flex items-center gap-2 font-medium text-text-bright">
                  {m.value === "smart" && <Sparkles className="h-4 w-4 text-violet-300" />}
                  {m.value === "performance" && <ShieldCheck className="h-4 w-4 text-emerald-300" />}
                  {m.value === "autonomous" && <Bot className="h-4 w-4 text-azure-300" />}
                  {m.value === "standard" && <Megaphone className="h-4 w-4 text-slate-300" />}
                  {m.label}
                </div>
                <div className="text-xs text-text-muted mt-1">{m.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Campaign name</label>
            <Input value={props.name} onChange={(e) => props.setName(e.target.value)} placeholder="e.g. Summer launch" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Objective</label>
            <Input value={props.objective} onChange={(e) => props.setObjective(e.target.value)} placeholder="e.g. Drive qualified signups" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Total budget (USD)</label>
            <Input type="number" value={props.budget} onChange={(e) => props.setBudget(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Billing model</label>
            <div className="flex flex-wrap gap-2">
              {BILLING_MODES.map((b) => (
                <button key={b.value} onClick={() => props.setBillingMode(b.value)}
                  className={`rounded-lg border px-2.5 py-1 text-xs ${props.billingMode === b.value ? "border-azure-500 bg-azure-500/10 text-azure-200" : "border-border text-text-muted"}`}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mode-specific settings */}
        {(props.mode === "smart" || props.mode === "autonomous") && (
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Human approval level (automation)</label>
            <div className="flex flex-wrap gap-2">
              {(["manual", "assistant", "autonomous"] as const).map((a) => (
                <button key={a} onClick={() => props.setAutomationLevel(a)}
                  className={`rounded-lg border px-2.5 py-1 text-xs ${props.automationLevel === a ? "border-azure-500 bg-azure-500/10 text-azure-200" : "border-border text-text-muted"}`}>
                  {a}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted pt-1">
              {props.automationLevel === "manual" && "The AI suggests, but a human launches and approves every change."}
              {props.automationLevel === "assistant" && "The AI prepares actions; a human approves before anything runs."}
              {props.automationLevel === "autonomous" && "The AI operates as a full marketing team, subject to approval gates."}
            </p>
          </div>
        )}

        {props.mode === "performance" && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-200"><ShieldCheck className="h-4 w-4" /> Performance billing configuration</div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Paid conversion events (comma separated)</label>
                <Input value={props.pbEvents} onChange={(e) => props.setPbEvents(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Payout per verified event (USD)</label>
                <Input type="number" value={props.pbPayout} onChange={(e) => props.setPbPayout(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <p className="text-xs text-text-muted">Pay only for verified conversions. Eligibility + fraud checks + approval apply. Billing model is forced to <b>performance</b>.</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={props.onCreate} disabled={props.busy === "create"}>
            {props.busy === "create" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
            Create {props.mode} campaign
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Dashboard (extended single dashboard) ────────────────────────── */

function Dashboard(props: {
  dash: AdCampaignDashboard; busy: string | null;
  onGen: (ct: string) => void; onAct: (a: string, fn: (id: string) => Promise<unknown>) => void; onConv: () => void; onBack: () => void;
}) {
  const { dash } = props;
  const m = dash.campaign.metrics;
  const ctr = m.impressions > 0 ? ((m.clicks / m.impressions) * 100).toFixed(2) : "0.00";
  return (
    <div className="space-y-4">
      <button onClick={props.onBack} className="text-sm text-azure-300 hover:underline">← All campaigns</button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-text-bright">{dash.campaign.name}</h2>
          <p className="text-sm text-text-muted">{dash.campaign.objective}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={modeColor[dash.mode]}>{dash.mode} mode</Badge>
          <Badge variant="outline">Automation: {dash.automationLevel}</Badge>
          <Badge variant="outline">Billing: {dash.billingMode}</Badge>
          <Badge className={healthColor[dash.health]}>{dash.health}</Badge>
        </div>
      </div>

      {/* Key stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Impressions" value={m.impressions.toLocaleString()} icon={<Activity className="h-4 w-4" />} />
        <Stat label="Clicks / CTR" value={`${m.clicks.toLocaleString()} (${ctr}%)`} icon={<TrendingUp className="h-4 w-4" />} />
        <Stat label="Conversions" value={m.conversions.toLocaleString()} icon={<CheckCircle2 className="h-4 w-4" />} />
        <Stat label="Spend / ROAS" value={`${usd(m.spendMicros)} / ${dash.revenueAttribution.roas ?? "—"}`} icon={<Wallet className="h-4 w-4" />} />
      </div>

      {/* Performance billing + fraud */}
      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4" /> Performance billing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Verification status" value={dash.performanceBillingStatus} />
            <Row label="Pay per event" value={(dash.campaign.performanceBilling.events.join(", ") || "—")} />
            <Row label="Fraud checks run" value={String(dash.fraudProtection.checksRun)} />
            <Row label="Fraud events blocked" value={String(dash.fraudProtection.blocked)} />
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={props.onConv} disabled={props.busy === "conv"}>
                {props.busy === "conv" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
                Report a verified conversion
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4" /> Revenue attribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Attributed revenue" value={usd(dash.revenueAttribution.revenueMicros)} />
            <Row label="Spend" value={usd(dash.revenueAttribution.spendMicros)} />
            <Row label="ROAS" value={String(dash.revenueAttribution.roas ?? "—")} />
            <div className="pt-1">
              {Object.entries(dash.revenueAttribution.perEvent).map(([k, v]) => (
                <Row key={k} label={k} value={usd(v)} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Campaign controls</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => props.onAct("launch", (id) => advertisingApi.launch(id))} disabled={props.busy === "launch"}>Launch</Button>
          <Button size="sm" variant="outline" onClick={() => props.onAct("pause", (id) => advertisingApi.pause(id))} disabled={props.busy === "pause"}>Pause</Button>
          <Button size="sm" variant="outline" onClick={() => props.onAct("submit", (id) => advertisingApi.submit(id))} disabled={props.busy === "submit"}>Submit for approval</Button>
          <Button size="sm" variant="outline" onClick={() => props.onAct("approve", (id) => advertisingApi.approve(id))} disabled={props.busy === "approve"}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => props.onAct("recommend", (id) => advertisingApi.recommend(id))} disabled={props.busy === "recommend"}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh AI recommendations
          </Button>
          {dash.mode === "autonomous" && (
            <Button size="sm" variant="outline" onClick={() => props.onAct("autonomous", (id) => advertisingApi.autonomousCycle(id))} disabled={props.busy === "autonomous"}>
              <Bot className="h-3 w-3 mr-1" /> Run autonomous cycle
            </Button>
          )}
          {(dash.mode === "smart" || dash.mode === "autonomous") && (
            <>
              <Button size="sm" variant="outline" onClick={() => props.onGen("copy")} disabled={props.busy === "gen-copy"}>Generate copy</Button>
              <Button size="sm" variant="outline" onClick={() => props.onGen("image_prompt")} disabled={props.busy === "gen-image_prompt"}>Image concept</Button>
              <Button size="sm" variant="outline" onClick={() => props.onGen("video_prompt")} disabled={props.busy === "gen-video_prompt"}>Video concept</Button>
              <Button size="sm" variant="outline" onClick={() => props.onGen("budget")} disabled={props.busy === "gen-budget"}>Budget suggestion</Button>
              <Button size="sm" variant="outline" onClick={() => props.onGen("audience")} disabled={props.busy === "gen-audience"}>Audience targeting</Button>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-3">
        {/* Recommendations */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI recommendations</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {dash.recommendations.length === 0 && <p className="text-sm text-text-muted">Run "Refresh AI recommendations" to analyze this campaign.</p>}
            {dash.recommendations.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-bright">{r.title}</span>
                  <Badge variant="outline">{r.priority}</Badge>
                </div>
                <p className="text-xs text-text-muted mt-1">{r.rationale}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Optimization history + autonomous actions */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> AI optimization history</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {dash.automationHistory.length === 0 && <p className="text-sm text-text-muted">No optimization actions yet.</p>}
            {dash.automationHistory.slice().reverse().map((h) => (
              <div key={h.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-bright">{h.summary}</span>
                  <Badge variant="outline">{h.aiSource === "real" ? "real" : "demo"}</Badge>
                </div>
                {h.detail && <p className="text-xs text-text-muted mt-1">{h.detail}</p>}
              </div>
            ))}
            {dash.autonomousActions.length > 0 && (
              <div className="border-t border-border pt-2 mt-2">
                <div className="text-xs text-text-muted mb-1">Autonomous actions</div>
                {dash.autonomousActions.map((a, i) => (
                  <div key={i} className="text-xs text-text-bright">• {a.action}: {a.detail}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="text-azure-300">{icon}</div>
        <div>
          <div className="text-xs text-text-muted">{label}</div>
          <div className="text-lg font-semibold text-text-bright">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium text-text-bright">{value}</span>
    </div>
  );
}
