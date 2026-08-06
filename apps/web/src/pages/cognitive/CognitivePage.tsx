/**
 * Session 110 — dedicated Cognitive / World Model console.
 *
 * The page renders only what the register actually stores. Recorded
 * confidences are labelled as self-reported, AI-assisted observations carry an
 * explicit badge, hypotheses show that a named human resolved them, and empty
 * organizations are shown as empty rather than filled with plausible numbers.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Brain, Compass, Eye, FlaskConical, Plus, RefreshCw, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import {
  cogApi,
  type CogEntity,
  type CogEntityKind,
  type CogHypothesis,
  type CogObservation,
  type CogObservationOrigin,
  type CogWorldModelRollup,
  type WorldModelDomain,
} from "@/lib/cognitive";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

const DOMAINS: WorldModelDomain[] = [
  "enterprise", "customers", "projects", "markets", "competitors", "supply_chain",
  "financial", "regulatory", "infrastructure", "global_events", "risk", "industry_trends",
];
const KINDS: CogEntityKind[] = ["customer", "competitor", "market", "supplier", "regulator", "technology", "internal_system", "partner", "other"];
const ORIGINS: CogObservationOrigin[] = ["human", "integration", "ai_assisted"];

function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return <Card><CardContent className="flex items-start gap-3 p-4"><div className="rounded-lg border border-violet/20 bg-violet/10 p-2 text-violet">{icon}</div><div><div className="text-2xl font-black text-text-bright">{value}</div><div className="text-xs text-text-muted">{label}</div>{detail ? <div className="text-[11px] text-text-muted">{detail}</div> : null}</div></CardContent></Card>;
}

const originVariant: Record<CogObservationOrigin, "emerald" | "azure" | "fuchsia"> = { human: "emerald", integration: "azure", ai_assisted: "fuchsia" };
const statusVariant: Record<CogHypothesis["status"], "amber" | "emerald" | "crimson" | "slate"> = { open: "amber", supported: "emerald", refuted: "crimson", inconclusive: "slate" };

export function CognitivePage() {
  const user = useAuthStore((state) => state.user);
  const canWrite = user?.role === "admin" || user?.role === "super_admin";

  const [rollup, setRollup] = useState<CogWorldModelRollup | null>(null);
  const [entities, setEntities] = useState<CogEntity[]>([]);
  const [observations, setObservations] = useState<CogObservation[]>([]);
  const [hypotheses, setHypotheses] = useState<CogHypothesis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [entityForm, setEntityForm] = useState({ name: "", kind: "customer" as CogEntityKind, domain: "customers" as WorldModelDomain, description: "" });
  const [observationForm, setObservationForm] = useState({ topic: "", claim: "", confidence: "0.5", source: "", evidence: "", domain: "enterprise" as WorldModelDomain, entityId: "", origin: "human" as CogObservationOrigin });
  const [hypothesisForm, setHypothesisForm] = useState({ statement: "", domain: "markets" as WorldModelDomain, horizonMonths: "6" });
  const [resolveNote, setResolveNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [worldModel, entityRows, observationRows, hypothesisRows] = await Promise.all([
        cogApi.worldModel(), cogApi.entities({ limit: 200 }), cogApi.observations({ limit: 200 }), cogApi.hypotheses({ limit: 200 }),
      ]);
      setRollup(worldModel); setEntities(entityRows); setObservations(observationRows); setHypotheses(hypothesisRows); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(null), 3000); };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  async function createEntity() {
    if (!entityForm.name) return;
    try {
      await cogApi.createEntity({ name: entityForm.name, kind: entityForm.kind, domain: entityForm.domain, description: entityForm.description || null });
      setEntityForm({ ...entityForm, name: "", description: "" }); flash("Entity added to the world model."); await load();
    } catch (e) { fail(e); }
  }
  async function deleteEntity(entity: CogEntity) {
    if (!confirm(`Remove ${entity.name} from the world model?`)) return;
    try { await cogApi.deleteEntity(entity.id); flash("Entity removed."); await load(); } catch (e) { fail(e); }
  }
  async function recordObservation() {
    if (!observationForm.topic || !observationForm.claim || !observationForm.source) return;
    try {
      await cogApi.recordObservation({
        topic: observationForm.topic, claim: observationForm.claim,
        confidence: Number(observationForm.confidence), source: observationForm.source,
        evidence: observationForm.evidence.split("\n").map((line) => line.trim()).filter(Boolean),
        domain: observationForm.domain, origin: observationForm.origin,
        entityId: observationForm.entityId || null,
      });
      setObservationForm({ ...observationForm, topic: "", claim: "", evidence: "" }); flash("Observation recorded."); await load();
    } catch (e) { fail(e); }
  }
  async function deleteObservation(observation: CogObservation) {
    try { await cogApi.deleteObservation(observation.id); flash("Observation deleted."); await load(); } catch (e) { fail(e); }
  }
  async function createHypothesis() {
    if (!hypothesisForm.statement) return;
    try {
      await cogApi.createHypothesis({ statement: hypothesisForm.statement, domain: hypothesisForm.domain, horizonMonths: Number(hypothesisForm.horizonMonths) });
      setHypothesisForm({ ...hypothesisForm, statement: "" }); flash("Hypothesis opened — it stays open until a human resolves it."); await load();
    } catch (e) { fail(e); }
  }
  async function resolveHypothesis(hypothesis: CogHypothesis, resolution: "supported" | "refuted" | "inconclusive") {
    if (resolveNote.trim().length < 2) { setError("A resolution note is required — the platform never decides a hypothesis for you."); return; }
    try { await cogApi.resolveHypothesis(hypothesis.id, { resolution, note: resolveNote.trim() }); setResolveNote(""); flash("Hypothesis resolved by you."); await load(); } catch (e) { fail(e); }
  }

  const entityName = (id: string | null) => entities.find((entity) => entity.id === id)?.name ?? null;

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><Brain className="h-6 w-6 text-violet" /><h1 className="text-2xl font-black text-text-bright">Cognitive / World Model</h1><Badge variant="violet">evidence register</Badge></div>
        <p className="mt-1 max-w-3xl text-sm text-text-muted">Entities, observations and hypotheses your organization actually recorded. Confidence is whatever the recorder entered — it is never computed, and no outcome is predicted here.</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
    </div>
    {error ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{error}<button className="float-right" onClick={() => setError(null)}>✕</button></div> : null}
    {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Stat icon={<Compass className="h-5 w-5" />} label="Modelled entities" value={String(rollup?.entityCount ?? 0)} detail={`${rollup?.entitiesWithoutObservations.length ?? 0} with no observation yet`} />
      <Stat icon={<Eye className="h-5 w-5" />} label="Observations" value={String(rollup?.observationCount ?? 0)} detail={`${rollup?.evidenceCoveragePct ?? 0}% carry evidence`} />
      <Stat icon={<FlaskConical className="h-5 w-5" />} label="Open hypotheses" value={String(rollup?.openHypotheses ?? 0)} detail={`${rollup?.resolvedHypotheses ?? 0} resolved by a human`} />
      <Stat icon={<Sparkles className="h-5 w-5" />} label="Avg recorded confidence" value={rollup?.avgRecordedConfidencePct === null || rollup === null ? "—" : `${rollup.avgRecordedConfidencePct}%`} detail={rollup?.confidenceKind === "self_reported_average" ? "self-reported average" : "nothing recorded yet"} />
    </div>

    <Card><CardContent className="flex items-start gap-3 p-4 text-xs text-text-muted"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald" /><span>{rollup?.note ?? "Counts are computed from stored records only."} {rollup?.aiAssistedObservations ? `${rollup.aiAssistedObservations} observation(s) are AI-assisted and labelled as advisory.` : "No AI-assisted observations are stored."}</span></CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">Domain coverage</CardTitle><CardDescription>Uncovered domains are a real gap in the register, not a forecast.</CardDescription></CardHeader>
      <CardContent><div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {(rollup?.domains ?? []).map((domain) => <div key={domain.domain} className="flex items-center gap-2 rounded border border-white/10 bg-white/5 p-2 text-xs">
          <span className="flex-1 text-text-bright">{domain.domain.replace(/_/g, " ")}</span>
          <Badge variant="slate">{domain.entities} entities</Badge>
          <Badge variant={domain.observations ? "azure" : "secondary"}>{domain.observations} obs</Badge>
          <Badge variant={domain.openHypotheses ? "amber" : "secondary"}>{domain.openHypotheses} open</Badge>
        </div>)}
        {!rollup ? <p className="text-sm text-text-muted">Loading coverage…</p> : null}
      </div></CardContent></Card>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <Card><CardHeader><CardTitle>Modelled entities</CardTitle><CardDescription>Entities with no observation are shown as blind spots.</CardDescription></CardHeader>
        <CardContent><div className="space-y-2">
          {entities.map((entity) => {
            const blind = (rollup?.entitiesWithoutObservations ?? []).some((item) => item.id === entity.id);
            return <div key={entity.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 font-medium text-text-bright">{entity.name}</span>
                <Badge variant="violet">{entity.kind}</Badge>
                <Badge variant="slate">{entity.domain.replace(/_/g, " ")}</Badge>
                {blind ? <Badge variant="amber">no observations</Badge> : null}
                {canWrite ? <Button size="sm" variant="ghost" onClick={() => void deleteEntity(entity)}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
              </div>
              {entity.description ? <div className="mt-1 text-xs text-text-muted">{entity.description}</div> : null}
            </div>;
          })}
          {entities.length === 0 ? <p className="py-8 text-center text-sm text-text-muted">No entities are modelled for this organization.</p> : null}
        </div></CardContent></Card>

      {canWrite ? <Card><CardHeader><CardTitle className="text-base">Add entity</CardTitle><CardDescription>Something this organization tracks in its world model.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Name" value={entityForm.name} onChange={(e) => setEntityForm({ ...entityForm, name: e.target.value })} />
          <Select value={entityForm.kind} onChange={(e) => setEntityForm({ ...entityForm, kind: e.target.value as CogEntityKind })}>{KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</Select>
          <Select value={entityForm.domain} onChange={(e) => setEntityForm({ ...entityForm, domain: e.target.value as WorldModelDomain })}>{DOMAINS.map((domain) => <option key={domain} value={domain}>{domain}</option>)}</Select>
          <Textarea rows={3} placeholder="Description (optional)" value={entityForm.description} onChange={(e) => setEntityForm({ ...entityForm, description: e.target.value })} />
          <Button className="w-full" onClick={() => void createEntity()}><Plus className="h-4 w-4" />Add entity</Button>
        </CardContent></Card>
        : <Card><CardContent className="p-5 text-sm text-text-muted">Read-only view. Administrator access is required to change the world model.</CardContent></Card>}
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <Card><CardHeader><CardTitle>Observations</CardTitle><CardDescription>Each row shows its origin; AI-assisted entries are advisory and never counted as verified evidence.</CardDescription></CardHeader>
        <CardContent><div className="space-y-2">
          {observations.map((observation) => <div key={observation.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 font-medium text-text-bright">{observation.topic}</span>
              <Badge variant={originVariant[observation.origin]}>{observation.origin === "ai_assisted" ? "AI-assisted (advisory)" : observation.origin}</Badge>
              <Badge variant="slate">{observation.domain.replace(/_/g, " ")}</Badge>
              {canWrite ? <Button size="sm" variant="ghost" onClick={() => void deleteObservation(observation)}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
            </div>
            <div className="mt-1 text-sm text-text-muted">{observation.claim}</div>
            <div className="mt-2 text-xs text-text-muted">
              confidence {(observation.confidence * 100).toFixed(0)}% (self-reported) · source {observation.source}
              {entityName(observation.entityId) ? ` · ${entityName(observation.entityId)}` : ""}
              {observation.evidence.length ? ` · ${observation.evidence.length} evidence item(s)` : " · no evidence attached"}
              {` · ${new Date(observation.createdAt).toLocaleString()}`}
            </div>
          </div>)}
          {observations.length === 0 ? <p className="py-8 text-center text-sm text-text-muted">No observations are recorded for this organization.</p> : null}
        </div></CardContent></Card>

      {canWrite ? <Card><CardHeader><CardTitle className="text-base">Record observation</CardTitle><CardDescription>Label AI-assisted claims honestly; they are stored and counted separately.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Topic" value={observationForm.topic} onChange={(e) => setObservationForm({ ...observationForm, topic: e.target.value })} />
          <Textarea rows={3} placeholder="Claim" value={observationForm.claim} onChange={(e) => setObservationForm({ ...observationForm, claim: e.target.value })} />
          <Textarea rows={2} placeholder="Evidence (one per line)" value={observationForm.evidence} onChange={(e) => setObservationForm({ ...observationForm, evidence: e.target.value })} />
          <Input placeholder="Source" value={observationForm.source} onChange={(e) => setObservationForm({ ...observationForm, source: e.target.value })} />
          <Input type="number" min="0" max="1" step="0.05" placeholder="Confidence 0–1" value={observationForm.confidence} onChange={(e) => setObservationForm({ ...observationForm, confidence: e.target.value })} />
          <Select value={observationForm.domain} onChange={(e) => setObservationForm({ ...observationForm, domain: e.target.value as WorldModelDomain })}>{DOMAINS.map((domain) => <option key={domain} value={domain}>{domain}</option>)}</Select>
          <Select value={observationForm.origin} onChange={(e) => setObservationForm({ ...observationForm, origin: e.target.value as CogObservationOrigin })}>{ORIGINS.map((origin) => <option key={origin} value={origin}>{origin}</option>)}</Select>
          <Select value={observationForm.entityId} onChange={(e) => setObservationForm({ ...observationForm, entityId: e.target.value })}><option value="">No entity (domain-level)</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</Select>
          <Button className="w-full" onClick={() => void recordObservation()}><Plus className="h-4 w-4" />Record observation</Button>
        </CardContent></Card> : null}
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <Card><CardHeader><CardTitle>Hypotheses</CardTitle><CardDescription>A hypothesis stays open until a named human resolves it with a note.</CardDescription></CardHeader>
        <CardContent><div className="space-y-2">
          {hypotheses.map((hypothesis) => <div key={hypothesis.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 font-medium text-text-bright">{hypothesis.statement}</span>
              <Badge variant="slate">{hypothesis.domain.replace(/_/g, " ")}</Badge>
              <Badge variant="secondary">{hypothesis.horizonMonths}m horizon</Badge>
              <Badge variant={statusVariant[hypothesis.status]}>{hypothesis.status}</Badge>
            </div>
            <div className="mt-2 text-xs text-text-muted">{hypothesis.supportingObservationIds.length} supporting · {hypothesis.contradictingObservationIds.length} contradicting · opened {new Date(hypothesis.createdAt).toLocaleString()}</div>
            {hypothesis.resolvedBy ? <div className="mt-1 text-xs text-text-muted">resolved by {hypothesis.resolvedBy}{hypothesis.resolutionNote ? ` · ${hypothesis.resolutionNote}` : ""}</div> : null}
            {hypothesis.status === "open" && canWrite ? <div className="mt-3 space-y-2">
              <Input placeholder="Resolution note (required)" value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="success" onClick={() => void resolveHypothesis(hypothesis, "supported")}>Mark supported</Button>
                <Button size="sm" variant="danger" onClick={() => void resolveHypothesis(hypothesis, "refuted")}>Mark refuted</Button>
                <Button size="sm" variant="ghost" onClick={() => void resolveHypothesis(hypothesis, "inconclusive")}>Inconclusive</Button>
              </div>
            </div> : null}
          </div>)}
          {hypotheses.length === 0 ? <p className="py-8 text-center text-sm text-text-muted">No hypotheses are open for this organization.</p> : null}
        </div></CardContent></Card>

      {canWrite ? <Card><CardHeader><CardTitle className="text-base">Open hypothesis</CardTitle><CardDescription>Created as open. No score, likelihood or outcome is generated.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={3} placeholder="Statement" value={hypothesisForm.statement} onChange={(e) => setHypothesisForm({ ...hypothesisForm, statement: e.target.value })} />
          <Select value={hypothesisForm.domain} onChange={(e) => setHypothesisForm({ ...hypothesisForm, domain: e.target.value as WorldModelDomain })}>{DOMAINS.map((domain) => <option key={domain} value={domain}>{domain}</option>)}</Select>
          <Input type="number" min="1" max="120" placeholder="Horizon (months)" value={hypothesisForm.horizonMonths} onChange={(e) => setHypothesisForm({ ...hypothesisForm, horizonMonths: e.target.value })} />
          <Button className="w-full" onClick={() => void createHypothesis()}><Plus className="h-4 w-4" />Open hypothesis</Button>
        </CardContent></Card> : null}
    </div>
  </div>;
}
