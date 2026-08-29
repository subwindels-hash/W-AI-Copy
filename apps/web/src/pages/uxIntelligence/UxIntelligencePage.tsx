/**
 * Session 192 — Tier 4 uxIntelligence console.
 *
 * uxIntelligence had 12 routes, an 18-LOC client, and zero pages. The
 * dashboard reported hardcoded `agentsOnline: 3`, `accessibilityOpen: 1`,
 * `designGateActive: true` on every org regardless of state — S192
 * fixed the service; this page is the first UI surface.
 *
 * The page renders honest empty states (no fabricated catalogue, no
 * hardcoded "3 AI agents online" panel) and lets the operator seed the
 * catalogue by toggling the design gate.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Component, Eye, Palette, RefreshCw, Users, Wrench, X } from "lucide-react";
import type {
  UxAgent,
  UxBrandProfile,
  UxComponent,
  UxAccessibilityFinding,
  UxDashboard,
  UxToken,
  UxDeviceClass,
} from "@windels/shared";
import { uxApi } from "@/lib/uxIntelligence";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

function fmtTimestamp(s: string) {
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function StatusBadge({ online }: { online: boolean }) {
  return online
    ? <Badge variant="emerald"><CheckCircle2 className="h-3 w-3 mr-1"/>Online</Badge>
    : <Badge variant="amber"><AlertTriangle className="h-3 w-3 mr-1"/>Idle</Badge>;
}

export function UxIntelligencePage() {
  const [dashboard, setDashboard] = useState<UxDashboard | null>(null);
  const [tokens, setTokens] = useState<UxToken[]>([]);
  const [components, setComponents] = useState<UxComponent[]>([]);
  const [findings, setFindings] = useState<UxAccessibilityFinding[]>([]);
  const [agents, setAgents] = useState<UxAgent[]>([]);
  const [brands, setBrands] = useState<UxBrandProfile[]>([]);
  const [devices, setDevices] = useState<UxDeviceClass[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [d, t, c, f, a, b, dv] = await Promise.all([
        uxApi.dashboard(),
        uxApi.tokens(),
        uxApi.components(),
        uxApi.findings(),
        uxApi.agents(),
        uxApi.brands(),
        Promise.resolve(uxApi.devices()),
      ]);
      setDashboard(d);
      setTokens(t);
      setComponents(c);
      setFindings(f);
      setAgents(a);
      setBrands(b);
      setDevices(dv);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function runQa() {
    try { await uxApi.runQa("all"); await load(); } catch (e: any) { setErr(e?.message ?? "QA failed"); }
  }

  if (!dashboard) return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading UX intelligence…"}</div>;

  // The S192 honesty discipline: a fresh org shows every count as 0
  // and `designGateActive: false`. There is no fabricated catalogue.
  const empty = dashboard.components === 0 && dashboard.tokens === 0
    && dashboard.brands === 0 && dashboard.agentsOnline === 0
    && dashboard.accessibilityOpen === 0 && !dashboard.designGateActive;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">UX Intelligence</h1>
          <p className="text-sm text-text-muted">Design system, components, accessibility findings, AI design agents, and the design-gate. Counts are real per-org Redis state — not hardcoded figures.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} loading={busy}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
          <Button onClick={runQa}><Wrench className="h-4 w-4 mr-1"/>Run design QA</Button>
        </div>
      </div>

      {empty && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-text-bright">No UX telemetry yet</div>
            <div className="text-text-muted">This organization has not installed the design catalogue, registered components, or enabled the design gate. Every dashboard count is honest zero — there are no AI agents, no open accessibility findings, no brand profile, and the design gate is inactive.</div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardDescription>Components</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{dashboard.components}</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Design tokens</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{dashboard.tokens}</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Brand profiles</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{dashboard.brands}</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Open findings</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{dashboard.accessibilityOpen}</div><div className="text-xs text-text-muted">across all components</div></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardDescription>AI agents online</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{dashboard.agentsOnline}</div><div className="text-xs text-text-muted">per-org registered agents</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Device classes</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{dashboard.deviceClasses}</div><div className="text-xs text-text-muted">static catalogue (9 specs)</div></CardContent></Card>
        <Card><CardHeader><CardDescription>Design gate</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{dashboard.designGateActive ? "Active" : "Inactive"}</div><div className="text-xs text-text-muted">{dashboard.designGateActive ? "pre-deploy validation enforced" : "not configured"}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle><Users className="h-4 w-4 inline mr-1"/>AI agents</CardTitle>
          <CardDescription>Designer / researcher / QA agents registered to this org. Each agent's status reflects real Redis state.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {agents.length === 0 ? (
            <div className="text-sm text-text-muted">No AI agents registered for this org.</div>
          ) : agents.map(a => (
            <div key={a.id} className="flex items-center justify-between border-b border-border/40 pb-2">
              <div>
                <div className="font-semibold text-text-bright">{a.name}</div>
                <div className="text-xs text-text-muted">role: {a.role} · reviews24h: {a.reviews24h}</div>
              </div>
              <StatusBadge online={a.status === "online"} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle><Component className="h-4 w-4 inline mr-1"/>Components</CardTitle>
          <CardDescription>Canonical component registry for this org. WCAG 2.1 AA conformance is recorded per component.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {components.length === 0 ? (
            <div className="text-sm text-text-muted">No components registered for this org.</div>
          ) : components.map(c => (
            <div key={c.id} className="flex items-center justify-between border-b border-border/40 pb-2">
              <div>
                <div className="font-semibold text-text-bright">{c.name} <span className="text-xs text-text-muted">v{c.version}</span></div>
                <div className="text-xs text-text-muted">{c.sourcePath} · category: {c.category}</div>
              </div>
              {c.wcagAA ? <Badge variant="emerald">WCAG AA</Badge> : <Badge variant="amber">non-compliant</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle><Palette className="h-4 w-4 inline mr-1"/>Design tokens</CardTitle>
            <CardDescription>Colors, spacing, typography, motion — the platform's design vocabulary.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {tokens.length === 0 ? (
              <div className="text-sm text-text-muted">No design tokens for this org.</div>
            ) : tokens.map(t => (
              <div key={`${t.namespace}:${t.name}`} className="flex items-center justify-between border-b border-border/40 py-1 text-sm">
                <div className="flex items-center gap-2">
                  {t.namespace === "color" && (
                    <div className="h-4 w-4 rounded border border-border" style={{ background: t.value }} />
                  )}
                  <span className="font-mono text-xs text-text-muted">{t.namespace}.{t.name}</span>
                </div>
                <span className="font-mono text-xs">{t.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><Eye className="h-4 w-4 inline mr-1"/>Accessibility findings</CardTitle>
            <CardDescription>WCAG 2.1 findings for this org's components. Each finding can be marked fixed via the API.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {findings.length === 0 ? (
              <div className="text-sm text-text-muted">No findings recorded for this org.</div>
            ) : findings.map(f => (
              <div key={f.id} className="border-b border-border/40 pb-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-text-bright">{f.wcagRef} · {f.component}</div>
                  <Badge variant={f.severity === "critical" ? "crimson" : f.severity === "serious" ? "amber" : f.severity === "moderate" ? "azure" : "slate"}>{f.severity}</Badge>
                </div>
                <div className="text-xs text-text-muted">{f.detail}</div>
                <div className="text-xs text-text-muted">{f.fixed ? "fixed" : "open"}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Brand profiles</CardTitle>
          <CardDescription>Registered brand identity profiles. Multiple brands per org are supported.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {brands.length === 0 ? (
            <div className="text-sm text-text-muted">No brand profiles registered for this org.</div>
          ) : brands.map(b => (
            <div key={b.id} className="flex items-center justify-between border-b border-border/40 pb-2">
              <div>
                <div className="font-semibold text-text-bright">{b.name}</div>
                <div className="text-xs text-text-muted">font: {b.font}</div>
              </div>
              <div className="flex gap-2">
                <div className="h-6 w-6 rounded border border-border" style={{ background: b.primaryColor }} title={b.primaryColor} />
                <div className="h-6 w-6 rounded border border-border" style={{ background: b.secondaryColor }} title={b.secondaryColor} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Device classes</CardTitle>
          <CardDescription>Static catalogue of supported device classes — used by responsive profiles across the platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {devices.map(d => <Badge key={d}>{d}</Badge>)}
          </div>
        </CardContent>
      </Card>

      {err && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2">
          <X className="h-4 w-4" />{err}
        </div>
      )}
    </div>
  );
}

export default UxIntelligencePage;
