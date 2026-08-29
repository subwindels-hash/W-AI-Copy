/**
 * Session 111 — dedicated Global Command Center console.
 *
 * Everything on this page comes from records the organization stored. Mean
 * time to resolve is shown only when incidents have actually been closed by a
 * human; a region nobody has reported on is rendered as "unreported" rather
 * than green; initiative progress is labelled self-reported; and AI-assisted
 * briefings carry an explicit advisory badge.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle, CheckCircle2, Globe2, Megaphone, Plus, RefreshCw,
  ShieldCheck, Siren, Target, Trash2,
} from "lucide-react";
import {
  commandApi,
  type CmdBriefing,
  type CmdBriefingCategory,
  type CmdBriefingOrigin,
  type CmdBriefingPriority,
  type CmdDirective,
  type CmdDirectiveScope,
  type CmdDirectiveSeverity,
  type CmdIncident,
  type CmdIncidentSeverity,
  type CmdIncidentStatus,
  type CmdInitiative,
  type CmdInitiativeStatus,
  type CmdOperationsRollup,
  type CmdRegion,
  type CmdRegionHealth,
} from "@/lib/command";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

const SEVERITIES: CmdIncidentSeverity[] = ["info", "warning", "critical"];
const PRIORITIES: CmdBriefingPriority[] = ["low", "med", "high", "critical"];
const CATEGORIES: CmdBriefingCategory[] = ["market", "ops", "risk", "security", "financial", "personnel"];
const ORIGINS: CmdBriefingOrigin[] = ["human", "ai_assisted"];
const INITIATIVE_STATUSES: CmdInitiativeStatus[] = ["planned", "active", "blocked", "done", "cancelled"];
const DIRECTIVE_SCOPES: CmdDirectiveScope[] = ["global", "region", "workspace", "team"];
const DIRECTIVE_SEVERITIES: CmdDirectiveSeverity[] = ["info", "warn", "critical"];

const severityVariant: Record<CmdIncidentSeverity, "azure" | "amber" | "crimson"> = { info: "azure", warning: "amber", critical: "crimson" };
const incidentStatusVariant: Record<CmdIncidentStatus, "crimson" | "amber" | "azure" | "emerald"> = { open: "crimson", acknowledged: "amber", mitigating: "azure", resolved: "emerald" };
const healthVariant: Record<CmdRegionHealth, "emerald" | "amber" | "crimson" | "slate"> = { healthy: "emerald", degraded: "amber", down: "crimson", unreported: "slate" };
const initiativeVariant: Record<CmdInitiativeStatus, "slate" | "azure" | "crimson" | "emerald"> = { planned: "slate", active: "azure", blocked: "crimson", done: "emerald", cancelled: "slate" };

function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return <Card><CardContent className="flex items-start gap-3 p-4">
    <div className="rounded-lg border border-crimson/20 bg-crimson/10 p-2 text-crimson">{icon}</div>
    <div><div className="text-2xl font-black text-text-bright">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
      {detail ? <div className="text-[11px] text-text-muted">{detail}</div> : null}</div>
  </CardContent></Card>;
}

export function CommandCenterPage() {
  const user = useAuthStore((state) => state.user);
  const canWrite = user?.role === "admin" || user?.role === "super_admin";

  const [rollup, setRollup] = useState<CmdOperationsRollup | null>(null);
  const [incidents, setIncidents] = useState<CmdIncident[]>([]);
  const [regions, setRegions] = useState<CmdRegion[]>([]);
  const [briefings, setBriefings] = useState<CmdBriefing[]>([]);
  const [initiatives, setInitiatives] = useState<CmdInitiative[]>([]);
  const [directives, setDirectives] = useState<CmdDirective[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [incidentForm, setIncidentForm] = useState({ title: "", description: "", severity: "warning" as CmdIncidentSeverity, service: "", regionCode: "" });
  const [regionForm, setRegionForm] = useState({ code: "", name: "", servicesTotal: "0" });
  const [reportForm, setReportForm] = useState<Record<string, string>>({});
  const [briefingForm, setBriefingForm] = useState({ title: "", summary: "", priority: "med" as CmdBriefingPriority, category: "ops" as CmdBriefingCategory, origin: "human" as CmdBriefingOrigin, source: "" });
  const [initiativeForm, setInitiativeForm] = useState({ name: "", owner: "", status: "planned" as CmdInitiativeStatus, progressPct: "0", dueAt: "" });
  const [directiveForm, setDirectiveForm] = useState({ scope: "global" as CmdDirectiveScope, targetRef: "", title: "", body: "", severity: "info" as CmdDirectiveSeverity });
  const [resolveNote, setResolveNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [operations, incidentRows, regionRows, briefingRows, initiativeRows, directiveRows] = await Promise.all([
        commandApi.operations(), commandApi.incidents({ limit: 200 }), commandApi.regions({ limit: 200 }),
        commandApi.briefings({ limit: 100 }), commandApi.initiatives({ limit: 100 }), commandApi.directives({ limit: 100 }),
      ]);
      setRollup(operations); setIncidents(incidentRows); setRegions(regionRows);
      setBriefings(briefingRows); setInitiatives(initiativeRows); setDirectives(directiveRows);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(null), 3000); };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  async function declareIncident() {
    if (!incidentForm.title || !incidentForm.service) return;
    try {
      await commandApi.declareIncident({
        title: incidentForm.title, description: incidentForm.description || null,
        severity: incidentForm.severity, service: incidentForm.service,
        regionCode: incidentForm.regionCode || null,
      });
      setIncidentForm({ ...incidentForm, title: "", description: "" });
      flash("Incident declared — it stays open until a human resolves it."); await load();
    } catch (e) { fail(e); }
  }
  async function acknowledge(incident: CmdIncident) {
    try { await commandApi.acknowledgeIncident(incident.id); flash("You now own this incident."); await load(); } catch (e) { fail(e); }
  }
  async function resolve(incident: CmdIncident) {
    if (resolveNote.trim().length < 2) { setError("A resolution note is required — nothing auto-resolves an incident."); return; }
    try { await commandApi.resolveIncident(incident.id, { note: resolveNote.trim() }); setResolveNote(""); flash("Incident resolved by you; the time to resolve is now measured."); await load(); } catch (e) { fail(e); }
  }
  async function removeIncident(incident: CmdIncident) {
    if (!confirm(`Delete incident "${incident.title}"?`)) return;
    try { await commandApi.deleteIncident(incident.id); flash("Incident deleted."); await load(); } catch (e) { fail(e); }
  }
  async function createRegion() {
    if (!regionForm.code || !regionForm.name) return;
    try {
      await commandApi.createRegion({ code: regionForm.code, name: regionForm.name, servicesTotal: Number(regionForm.servicesTotal) || 0 });
      setRegionForm({ code: "", name: "", servicesTotal: "0" }); flash("Region registered — it stays unreported until you file a status report."); await load();
    } catch (e) { fail(e); }
  }
  async function reportRegion(region: CmdRegion) {
    const raw = reportForm[region.id];
    if (raw === undefined || raw === "") { setError(`Enter how many of ${region.name}'s ${region.servicesTotal} services are up.`); return; }
    try {
      await commandApi.reportRegionStatus(region.id, { servicesUp: Number(raw) });
      setReportForm({ ...reportForm, [region.id]: "" }); flash("Status report filed."); await load();
    } catch (e) { fail(e); }
  }
  async function removeRegion(region: CmdRegion) {
    try { await commandApi.deleteRegion(region.id); flash("Region removed."); await load(); } catch (e) { fail(e); }
  }
  async function createBriefing() {
    if (!briefingForm.title || !briefingForm.summary) return;
    try {
      await commandApi.createBriefing({
        title: briefingForm.title, summary: briefingForm.summary, priority: briefingForm.priority,
        category: briefingForm.category, origin: briefingForm.origin, source: briefingForm.source || null,
      });
      setBriefingForm({ ...briefingForm, title: "", summary: "" }); flash("Briefing published."); await load();
    } catch (e) { fail(e); }
  }
  async function createInitiative() {
    if (!initiativeForm.name || !initiativeForm.owner) return;
    try {
      await commandApi.createInitiative({
        name: initiativeForm.name, owner: initiativeForm.owner, status: initiativeForm.status,
        progressPct: Number(initiativeForm.progressPct) || 0,
        dueAt: initiativeForm.dueAt ? new Date(initiativeForm.dueAt).toISOString() : null,
      });
      setInitiativeForm({ ...initiativeForm, name: "" }); flash("Initiative added."); await load();
    } catch (e) { fail(e); }
  }
  async function reportProgress(initiative: CmdInitiative, progressPct: number) {
    try { await commandApi.updateInitiative(initiative.id, { progressPct }); flash("Progress recorded as self-reported."); await load(); } catch (e) { fail(e); }
  }
  async function issueDirective() {
    if (!directiveForm.title || !directiveForm.body) return;
    try {
      await commandApi.issueDirective({
        scope: directiveForm.scope, targetRef: directiveForm.targetRef || null,
        title: directiveForm.title, body: directiveForm.body, severity: directiveForm.severity,
      });
      setDirectiveForm({ ...directiveForm, title: "", body: "" }); flash("Directive issued."); await load();
    } catch (e) { fail(e); }
  }
  async function moveDirective(directive: CmdDirective, status: "acknowledged" | "resolved" | "cancelled") {
    try { await commandApi.setDirectiveStatus(directive.id, { status }); flash(`Directive ${status}.`); await load(); } catch (e) { fail(e); }
  }

  const mttr = rollup?.meanTimeToResolveMinutes;

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><Globe2 className="h-6 w-6 text-crimson" /><h1 className="text-2xl font-black text-text-bright">Global Command Center</h1><Badge variant="crimson">operations register</Badge></div>
        <p className="mt-1 max-w-3xl text-sm text-text-muted">Incidents, regional posture, executive briefings, strategic initiatives and directives your organization actually recorded. Nothing here is probed, predicted or auto-resolved.</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
    </div>
    {error ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{error}<button className="float-right" onClick={() => setError(null)}>✕</button></div> : null}
    {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Stat icon={<Siren className="h-5 w-5" />} label="Unresolved incidents" value={String(rollup?.openIncidents ?? 0)} detail={`${rollup?.unresolvedBySeverity.critical ?? 0} critical · ${rollup?.unacknowledgedIncidents ?? 0} unacknowledged`} />
      <Stat icon={<CheckCircle2 className="h-5 w-5" />} label="Mean time to resolve" value={mttr === null || mttr === undefined ? "—" : `${mttr}m`} detail={rollup?.mttrKind === "measured" ? `measured over ${rollup.mttrSampleSize} resolved incident(s)` : "no incident has been resolved yet"} />
      <Stat icon={<Globe2 className="h-5 w-5" />} label="Regions declared" value={String(rollup?.regionCount ?? 0)} detail={`${rollup?.regionsUnreported ?? 0} unreported · ${rollup?.regionsDegraded ?? 0} degraded · ${rollup?.regionsDown ?? 0} down`} />
      <Stat icon={<Target className="h-5 w-5" />} label="Avg reported progress" value={rollup?.avgReportedProgressPct === null || rollup === null ? "—" : `${rollup.avgReportedProgressPct}%`} detail={rollup?.progressKind === "self_reported_average" ? "self-reported by initiative owners" : "no initiative recorded"} />
    </div>

    <Card><CardContent className="flex items-start gap-3 p-4 text-xs text-text-muted">
      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald" />
      <span>{rollup?.note ?? "Counts are computed from stored records only."} {rollup?.aiAssistedBriefings ? `${rollup.aiAssistedBriefings} briefing(s) are AI-assisted and labelled advisory.` : "No AI-assisted briefings are stored."}</span>
    </CardContent></Card>

    {/* ── Incidents ── */}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <Card><CardHeader><CardTitle>Incident command</CardTitle><CardDescription>Declared, acknowledged and resolved by named humans. Time to resolve is measured, never estimated.</CardDescription></CardHeader>
        <CardContent><div className="space-y-2">
          {incidents.map((incident) => <div key={incident.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 font-medium text-text-bright">{incident.title}</span>
              <Badge variant="slate">{incident.service}</Badge>
              <Badge variant="slate">{incident.regionCode ?? "global"}</Badge>
              <Badge variant={severityVariant[incident.severity]}>{incident.severity}</Badge>
              <Badge variant={incidentStatusVariant[incident.status]}>{incident.status}</Badge>
              {canWrite ? <Button size="sm" variant="ghost" onClick={() => void removeIncident(incident)}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
            </div>
            {incident.description ? <div className="mt-1 text-sm text-text-muted">{incident.description}</div> : null}
            <div className="mt-2 text-xs text-text-muted">
              opened {new Date(incident.openedAt).toLocaleString()}
              {incident.acknowledgedBy ? ` · acknowledged by ${incident.acknowledgedBy}` : " · not acknowledged"}
              {incident.resolvedBy ? ` · resolved by ${incident.resolvedBy}` : ""}
              {incident.timeToResolveMinutes !== null ? ` · ${incident.timeToResolveMinutes}m to resolve` : ""}
            </div>
            {incident.resolutionNote ? <div className="mt-1 text-xs text-text-muted">resolution: {incident.resolutionNote}</div> : null}
            {incident.updates.length ? <div className="mt-2 space-y-1 border-l border-white/10 pl-2 text-[11px] text-text-muted">
              {incident.updates.map((update, index) => <div key={`${incident.id}-${index}`}>{new Date(update.at).toLocaleString()} · {update.author ?? "unattributed"} · {update.note}</div>)}
            </div> : null}
            {incident.status !== "resolved" && canWrite ? <div className="mt-3 space-y-2">
              <Input placeholder="Resolution note (required to resolve)" value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {!incident.acknowledgedAt ? <Button size="sm" variant="outline" onClick={() => void acknowledge(incident)}>Acknowledge</Button> : null}
                <Button size="sm" variant="success" onClick={() => void resolve(incident)}>Resolve</Button>
              </div>
            </div> : null}
          </div>)}
          {incidents.length === 0 ? <p className="py-8 text-center text-sm text-text-muted">No incidents are recorded for this organization.</p> : null}
        </div></CardContent></Card>

      {canWrite ? <Card><CardHeader><CardTitle className="text-base">Declare incident</CardTitle><CardDescription>Severity is your judgement — the platform never picks one for you.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Title" value={incidentForm.title} onChange={(e) => setIncidentForm({ ...incidentForm, title: e.target.value })} />
          <Textarea rows={3} placeholder="What is happening" value={incidentForm.description} onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })} />
          <Input placeholder="Affected service" value={incidentForm.service} onChange={(e) => setIncidentForm({ ...incidentForm, service: e.target.value })} />
          <Select value={incidentForm.severity} onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value as CmdIncidentSeverity })}>{SEVERITIES.map((severity) => <option key={severity} value={severity}>{severity}</option>)}</Select>
          <Select value={incidentForm.regionCode} onChange={(e) => setIncidentForm({ ...incidentForm, regionCode: e.target.value })}>
            <option value="">Global (no region)</option>
            {regions.map((region) => <option key={region.id} value={region.code}>{region.code} — {region.name}</option>)}
          </Select>
          <Button className="w-full" onClick={() => void declareIncident()}><Plus className="h-4 w-4" />Declare incident</Button>
        </CardContent></Card> : null}
    </div>

    {/* ── Regions ── */}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <Card><CardHeader><CardTitle>Regional posture</CardTitle><CardDescription>Health is derived from the operator's own last status report plus unresolved incidents. Nothing is probed.</CardDescription></CardHeader>
        <CardContent><div className="space-y-2">
          {regions.map((region) => <div key={region.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 font-medium text-text-bright">{region.code} — {region.name}</span>
              <Badge variant={healthVariant[region.health]}>{region.health}</Badge>
              {region.openIncidents ? <Badge variant="crimson">{region.openIncidents} unresolved</Badge> : null}
              {canWrite ? <Button size="sm" variant="ghost" onClick={() => void removeRegion(region)}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
            </div>
            <div className="mt-1 text-xs text-text-muted">{region.healthBasis}</div>
            <div className="mt-1 text-xs text-text-muted">
              {region.servicesUp === null ? `${region.servicesTotal} services declared · never reported` : `${region.servicesUp}/${region.servicesTotal} services up`}
              {region.latencyMs === null ? " · latency not reported" : ` · ${region.latencyMs}ms reported`}
              {region.activeUsers === null ? " · users not reported" : ` · ${region.activeUsers} users reported`}
              {region.statusReportedAt ? ` · reported ${new Date(region.statusReportedAt).toLocaleString()}${region.statusReportedBy ? ` by ${region.statusReportedBy}` : ""}` : ""}
            </div>
            {canWrite ? <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input className="max-w-[160px]" type="number" min="0" max={String(region.servicesTotal)} placeholder="Services up" value={reportForm[region.id] ?? ""} onChange={(e) => setReportForm({ ...reportForm, [region.id]: e.target.value })} />
              <Button size="sm" variant="outline" onClick={() => void reportRegion(region)}>File status report</Button>
            </div> : null}
          </div>)}
          {regions.length === 0 ? <p className="py-8 text-center text-sm text-text-muted">No regions are declared for this organization.</p> : null}
        </div></CardContent></Card>

      {canWrite ? <Card><CardHeader><CardTitle className="text-base">Register region</CardTitle><CardDescription>A new region is `unreported` until someone files a status report.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Code (e.g. eu-west-1)" value={regionForm.code} onChange={(e) => setRegionForm({ ...regionForm, code: e.target.value })} />
          <Input placeholder="Name" value={regionForm.name} onChange={(e) => setRegionForm({ ...regionForm, name: e.target.value })} />
          <Input type="number" min="0" placeholder="Declared services" value={regionForm.servicesTotal} onChange={(e) => setRegionForm({ ...regionForm, servicesTotal: e.target.value })} />
          <Button className="w-full" onClick={() => void createRegion()}><Plus className="h-4 w-4" />Register region</Button>
        </CardContent></Card> : null}
    </div>

    {/* ── Briefings & initiatives ── */}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">Executive briefings</CardTitle><CardDescription>Authored by people. AI-assisted entries are advisory and counted separately.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {briefings.map((briefing) => <div key={briefing.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Megaphone className="h-3.5 w-3.5 text-amber" />
              <span className="flex-1 font-medium text-text-bright">{briefing.title}</span>
              <Badge variant="slate">{briefing.category}</Badge>
              <Badge variant={briefing.priority === "critical" ? "crimson" : briefing.priority === "high" ? "amber" : "azure"}>{briefing.priority}</Badge>
              {briefing.aiAssisted ? <Badge variant="fuchsia">AI-assisted (advisory)</Badge> : null}
            </div>
            <div className="mt-1 text-sm text-text-muted">{briefing.summary}</div>
            <div className="mt-1 text-xs text-text-muted">
              {briefing.authoredBy ? `by ${briefing.authoredBy}` : "author not recorded"}
              {briefing.source ? ` · source ${briefing.source}` : " · no source recorded"}
              {` · ${new Date(briefing.createdAt).toLocaleString()}`}
            </div>
          </div>)}
          {briefings.length === 0 ? <p className="py-8 text-center text-sm text-text-muted">No briefings are published for this organization.</p> : null}
          {canWrite ? <div className="space-y-2 border-t border-white/10 pt-3">
            <Input placeholder="Briefing title" value={briefingForm.title} onChange={(e) => setBriefingForm({ ...briefingForm, title: e.target.value })} />
            <Textarea rows={3} placeholder="Summary" value={briefingForm.summary} onChange={(e) => setBriefingForm({ ...briefingForm, summary: e.target.value })} />
            <Input placeholder="Source (optional)" value={briefingForm.source} onChange={(e) => setBriefingForm({ ...briefingForm, source: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <Select value={briefingForm.priority} onChange={(e) => setBriefingForm({ ...briefingForm, priority: e.target.value as CmdBriefingPriority })}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</Select>
              <Select value={briefingForm.category} onChange={(e) => setBriefingForm({ ...briefingForm, category: e.target.value as CmdBriefingCategory })}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</Select>
              <Select value={briefingForm.origin} onChange={(e) => setBriefingForm({ ...briefingForm, origin: e.target.value as CmdBriefingOrigin })}>{ORIGINS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}</Select>
            </div>
            <Button className="w-full" onClick={() => void createBriefing()}><Plus className="h-4 w-4" />Publish briefing</Button>
          </div> : null}
        </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Strategic initiatives</CardTitle><CardDescription>Progress is reported by the owner. It is never inferred from tasks or workflow runs.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {initiatives.map((initiative) => <div key={initiative.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 font-medium text-text-bright">{initiative.name}</span>
              <Badge variant={initiativeVariant[initiative.status]}>{initiative.status}</Badge>
              <Badge variant="secondary">{initiative.progressPct}% self-reported</Badge>
            </div>
            <div className="mt-1 text-xs text-text-muted">
              owner {initiative.owner}
              {initiative.dueAt ? ` · due ${new Date(initiative.dueAt).toLocaleDateString()}` : " · no due date committed"}
              {initiative.lastReportedAt ? ` · last reported ${new Date(initiative.lastReportedAt).toLocaleString()}` : ""}
            </div>
            {canWrite ? <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input className="max-w-[140px]" type="number" min="0" max="100" defaultValue={String(initiative.progressPct)}
                onBlur={(e) => { const value = Number(e.target.value); if (Number.isFinite(value) && value !== initiative.progressPct) void reportProgress(initiative, Math.max(0, Math.min(100, Math.round(value)))); }} />
              <span className="text-[11px] text-text-muted">report progress (0–100)</span>
            </div> : null}
          </div>)}
          {initiatives.length === 0 ? <p className="py-8 text-center text-sm text-text-muted">No strategic initiatives are recorded.</p> : null}
          {canWrite ? <div className="space-y-2 border-t border-white/10 pt-3">
            <Input placeholder="Initiative name" value={initiativeForm.name} onChange={(e) => setInitiativeForm({ ...initiativeForm, name: e.target.value })} />
            <Input placeholder="Owner" value={initiativeForm.owner} onChange={(e) => setInitiativeForm({ ...initiativeForm, owner: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <Select value={initiativeForm.status} onChange={(e) => setInitiativeForm({ ...initiativeForm, status: e.target.value as CmdInitiativeStatus })}>{INITIATIVE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</Select>
              <Input type="number" min="0" max="100" placeholder="Progress %" value={initiativeForm.progressPct} onChange={(e) => setInitiativeForm({ ...initiativeForm, progressPct: e.target.value })} />
              <Input type="date" value={initiativeForm.dueAt} onChange={(e) => setInitiativeForm({ ...initiativeForm, dueAt: e.target.value })} />
            </div>
            <Button className="w-full" onClick={() => void createInitiative()}><Plus className="h-4 w-4" />Add initiative</Button>
          </div> : null}
        </CardContent></Card>
    </div>

    {/* ── Directives ── */}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <Card><CardHeader><CardTitle>Command directives</CardTitle><CardDescription>The Session 70 directive log, now recording who issued it and who moved it.</CardDescription></CardHeader>
        <CardContent><div className="space-y-2">
          {directives.map((directive) => <div key={directive.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber" />
              <span className="flex-1 font-medium text-text-bright">{directive.title}</span>
              <Badge variant="slate">{directive.scope}</Badge>
              <Badge variant={directive.severity === "critical" ? "crimson" : directive.severity === "warn" ? "amber" : "azure"}>{directive.severity}</Badge>
              <Badge variant={directive.status === "issued" ? "amber" : directive.status === "resolved" ? "emerald" : "slate"}>{directive.status}</Badge>
            </div>
            <div className="mt-1 text-sm text-text-muted">{directive.body}</div>
            <div className="mt-1 text-xs text-text-muted">
              {directive.issuedBy ? `issued by ${directive.issuedBy}` : "issuer not recorded"}
              {` · ${new Date(directive.createdAt).toLocaleString()}`}
              {directive.statusChangedBy ? ` · moved to ${directive.status} by ${directive.statusChangedBy}` : ""}
              {directive.statusNote ? ` · ${directive.statusNote}` : ""}
            </div>
            {canWrite && directive.status === "issued" ? <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void moveDirective(directive, "acknowledged")}>Acknowledge</Button>
              <Button size="sm" variant="success" onClick={() => void moveDirective(directive, "resolved")}>Resolve</Button>
              <Button size="sm" variant="ghost" onClick={() => void moveDirective(directive, "cancelled")}>Cancel</Button>
            </div> : null}
            {canWrite && directive.status === "acknowledged" ? <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="success" onClick={() => void moveDirective(directive, "resolved")}>Resolve</Button>
              <Button size="sm" variant="ghost" onClick={() => void moveDirective(directive, "cancelled")}>Cancel</Button>
            </div> : null}
          </div>)}
          {directives.length === 0 ? <p className="py-8 text-center text-sm text-text-muted">No directives have been issued.</p> : null}
        </div></CardContent></Card>

      {canWrite ? <Card><CardHeader><CardTitle className="text-base">Issue directive</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Title" value={directiveForm.title} onChange={(e) => setDirectiveForm({ ...directiveForm, title: e.target.value })} />
          <Textarea rows={3} placeholder="Directive body" value={directiveForm.body} onChange={(e) => setDirectiveForm({ ...directiveForm, body: e.target.value })} />
          <Input placeholder="Target reference (optional)" value={directiveForm.targetRef} onChange={(e) => setDirectiveForm({ ...directiveForm, targetRef: e.target.value })} />
          <Select value={directiveForm.scope} onChange={(e) => setDirectiveForm({ ...directiveForm, scope: e.target.value as CmdDirectiveScope })}>{DIRECTIVE_SCOPES.map((scope) => <option key={scope} value={scope}>{scope}</option>)}</Select>
          <Select value={directiveForm.severity} onChange={(e) => setDirectiveForm({ ...directiveForm, severity: e.target.value as CmdDirectiveSeverity })}>{DIRECTIVE_SEVERITIES.map((severity) => <option key={severity} value={severity}>{severity}</option>)}</Select>
          <Button className="w-full" onClick={() => void issueDirective()}><Plus className="h-4 w-4" />Issue directive</Button>
        </CardContent></Card> : null}
    </div>

    {!canWrite ? <Card><CardContent className="p-4 text-xs text-text-muted">You are viewing the command centre in read-only mode. Declaring, acknowledging and resolving records requires an administrator.</CardContent></Card> : null}
  </div>;
}
