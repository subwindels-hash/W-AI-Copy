/**
 * Session 121 — Sustainability & ESG console.
 *
 * Session 64 shipped the API and a 9-LOC client but no console page. This
 * page is the module's first UI.
 *
 * Honesty rules the page is built around:
 *   - an ESG score requires an attested assessment; none exists, so the score
 *     cards print "not attested" (never a number) with the API's note;
 *   - a year-on-year change without a same-period baseline prints "no
 *     baseline", never 0% (0 would read as "no change");
 *   - unmeasured quantities (`gpuHours`, `optimizedPct`, renewables share,
 *     water, waste, offsets, net-zero year) print "not recorded" / "no
 *     feed" — never 0 — and the provenance card names them field by field;
 *   - the record form discloses that the emission factor is caller-supplied
 *     and tCO2e is arithmetic over it;
 *   - delete is hidden from non-administrators because the API refuses them.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Leaf, Plus, RefreshCw, Trash2, X } from "lucide-react";
import type {
  EsgRecordRow,
  EsgScore,
  SustainabilityDashboard,
} from "@windels/shared/sustainability";
import { SUSTAINABILITY_CATEGORIES } from "@windels/shared/sustainability";
import { esgApi } from "@/lib/sustainability";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useAuthStore } from "@/store/auth";

const CATEGORY_VARIANT: Record<string, "azure" | "violet" | "emerald" | "amber" | "default"> = {
  scope1: "amber",
  scope2: "azure",
  scope3: "violet",
  compute: "emerald",
};

/** Null-aware rendering: a missing measure is "not recorded", never 0. */
function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "not recorded" : String(n);
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-text-bright">{value}</div>
      {hint ? <div className="mt-1 text-xs text-text-muted">{hint}</div> : null}
    </Card>
  );
}

function ScoreCard({ label, value, note }: { label: string; value: number | null; note: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-text-bright">
        {value === null ? <span className="text-text-muted">not attested</span> : value}
      </div>
      <div className="mt-1 text-xs text-text-muted">{note}</div>
    </Card>
  );
}

interface ActivityForm {
  category: string;
  activity: string;
  quantity: string;
  unit: string;
  emissionFactorKg: string;
  occurredAt: string;
  source: string;
  kwh: string;
}

const emptyForm: ActivityForm = {
  category: "scope1", activity: "", quantity: "", unit: "kg", emissionFactorKg: "",
  occurredAt: "", source: "", kwh: "",
};

export function SustainabilityPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const canAdminister = user?.role === "admin" || user?.role === "super_admin";

  const [dash, setDash] = useState<SustainabilityDashboard | null>(null);
  const [records, setRecords] = useState<EsgRecordRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ActivityForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, r] = await Promise.all([esgApi.dashboard(), esgApi.records()]);
      setDash(d);
      setRecords(r);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, accessToken]);

  const scores: EsgScore | null = dash?.scores ?? null;

  const maxKwh = useMemo(
    () => Math.max(1, ...(dash?.energySeries.map((m) => m.kwh) ?? [1])),
    [dash],
  );

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await esgApi.recordActivity({
        category: form.category as any,
        activity: form.activity,
        quantity: Number(form.quantity),
        unit: form.unit,
        emissionFactorKg: Number(form.emissionFactorKg),
        occurredAt: new Date(form.occurredAt).toISOString(),
        source: form.source,
        ...(form.kwh ? { kwh: Number(form.kwh) } : {}),
      });
      setFormOpen(false);
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this activity record? This cannot be undone.")) return;
    setBusyId(id);
    setError(null);
    try {
      await esgApi.removeRecord(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-bright">
            <Leaf className="h-6 w-6 text-emerald" />Sustainability &amp; ESG
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Emissions arithmetic over recorded activity. Every figure states what measured it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canAdminister ? (
            <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />Record activity</Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Refresh</Button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-2 text-sm text-crimson">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      ) : null}

      {dash ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total emissions" value={`${fmt(dash.emissionsTotalTCO2e)} tCO2e`} hint="sum over all recorded activity" />
            <StatCard
              label="YTD change (same period)"
              value={dash.emissionsYtdChangePct === null ? "no baseline" : `${dash.emissionsYtdChangePct} %`}
              hint="this year vs the same period last year"
            />
            <StatCard label="Energy (12 mo)" value={`${dash.energySeries.reduce((a, m) => a + m.kwh, 0)} kWh`} hint="recorded kWh readings only" />
            <StatCard label="Compute emissions" value={dash.greenAi.length > 0 ? `${fmt(dash.greenAi[0]!.co2eKg)} kgCO2e` : "no compute records"} hint="compute-category records only" />
          </div>

          <div className="mt-4">
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-text-muted">ESG scores</div>
              <p className="mt-1 text-xs text-text-muted">{scores?.note}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ScoreCard label="Environmental" value={scores?.environmental ?? null} note="requires an attested assessment" />
                <ScoreCard label="Social" value={scores?.social ?? null} note="requires an attested assessment" />
                <ScoreCard label="Governance" value={scores?.governance ?? null} note="requires an attested assessment" />
                <ScoreCard label="Overall" value={scores?.overall ?? null} note={scores?.trend ? `trend: ${scores.trend}` : "no baseline for a trend"} />
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Emissions by source</CardTitle>
                <CardDescription>all-time tCO2e per activity; change is same-period YTD</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {dash.emissionsBySource.length === 0 ? (
                  <p className="text-sm text-text-muted">No activity recorded yet.</p>
                ) : (
                  dash.emissionsBySource.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Badge variant={CATEGORY_VARIANT[s.category] ?? "default"}>{s.category}</Badge>
                        <span className="truncate">{s.source}</span>
                      </span>
                      <span className="shrink-0 text-xs text-text-muted">
                        {s.tCO2e} tCO2e ·{" "}
                        {s.changePct === null ? "no baseline" : `${s.changePct} % YTD`}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Energy — last 12 months</CardTitle>
                <CardDescription>kWh from recorded readings; renewables share has no feed</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1.5">
                {dash.energySeries.every((m) => m.kwh === 0) ? (
                  <p className="text-sm text-text-muted">No kWh readings recorded.</p>
                ) : (
                  dash.energySeries.map((m) => (
                    <div key={m.period} className="flex items-center gap-2 text-xs">
                      <span className="w-14 shrink-0 text-text-muted">{m.period}</span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-white/5">
                        <div className="h-full rounded bg-emerald/60" style={{ width: `${Math.max(2, (m.kwh / maxKwh) * 100)}%` }} />
                      </div>
                      <span className="w-20 shrink-0 text-right text-text-muted">{m.kwh} kWh</span>
                    </div>
                  ))
                )}
                <p className="mt-1 text-xs text-text-muted">
                  renewable share / cost: no utility feed — see provenance.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm">Activity records</CardTitle>
              <CardDescription>the raw ledger the dashboard is computed from, newest first</CardDescription>
            </CardHeader>
            <CardContent>
              {!records || records.length === 0 ? (
                <p className="text-sm text-text-muted">No activity recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-text-muted">
                        <th className="py-2 pr-3">Activity</th>
                        <th className="py-2 pr-3">Scope</th>
                        <th className="py-2 pr-3 text-right">Quantity</th>
                        <th className="py-2 pr-3 text-right">tCO2e</th>
                        <th className="py-2 pr-3">Occurred</th>
                        <th className="py-2 pr-3">Source</th>
                        {canAdminister ? <th className="py-2" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r) => (
                        <tr key={r.id} className="border-b border-white/5">
                          <td className="py-2 pr-3 font-medium text-text-bright">{r.activity}</td>
                          <td className="py-2 pr-3"><Badge variant={CATEGORY_VARIANT[r.category] ?? "default"}>{r.category}</Badge></td>
                          <td className="py-2 pr-3 text-right">{r.quantity} {r.unit}</td>
                          <td className="py-2 pr-3 text-right">{r.tCO2e}</td>
                          <td className="py-2 pr-3 text-xs text-text-muted">{new Date(r.occurredAt).toLocaleString()}</td>
                          <td className="py-2 pr-3 text-xs text-text-muted">{r.source}{r.kwh ? ` · ${r.kwh} kWh` : ""}</td>
                          {canAdminister ? (
                            <td className="py-2 text-right">
                              <Button size="sm" variant="ghost" className="text-crimson" onClick={() => void remove(r.id)} disabled={busyId === r.id}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {dash.provenance ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Provenance</CardTitle>
                <CardDescription>{dash.provenance.note}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1">
                {dash.provenance.entries.map((e) => (
                  <div key={e.field} className="flex items-start gap-2 text-xs">
                    <Badge variant={e.basis === "measured" ? "emerald" : e.basis === "structural_zero" ? "slate" : "amber"}>
                      {e.basis}
                    </Badge>
                    <code className="rounded bg-white/5 px-1.5 py-0.5">{e.field}</code>
                    <span className="text-text-muted">{e.detail}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : !error ? (
        <Card className="mt-4 p-6 text-center text-sm text-text-muted">Loading…</Card>
      ) : null}

      {/* Record activity modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Record activity"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void submit()}
              loading={saving}
              disabled={!form.activity.trim() || !form.quantity || !form.unit.trim() || form.emissionFactorKg === "" || !form.occurredAt || !form.source.trim()}
            >
              Record
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <p className="text-xs text-text-muted">
            tCO2e = quantity × emission factor ÷ 1000. The factor is disclosed by you, never inferred.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-text-muted">Activity</span>
              <Input value={form.activity} maxLength={200} onChange={(e) => setForm({ ...form, activity: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-text-muted">Category</span>
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {SUSTAINABILITY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </label>
            <label className="text-sm">
              <span className="text-text-muted">Quantity</span>
              <Input type="number" min="0" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-text-muted">Unit</span>
              <Input value={form.unit} maxLength={32} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-text-muted">Emission factor (kg CO2e/unit)</span>
              <Input type="number" min="0" step="any" value={form.emissionFactorKg} onChange={(e) => setForm({ ...form, emissionFactorKg: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-text-muted">Occurred at</span>
              <Input type="datetime-local" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-text-muted">Source</span>
              <Input value={form.source} maxLength={300} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-text-muted">kWh (optional energy reading)</span>
              <Input type="number" min="0" step="any" value={form.kwh} onChange={(e) => setForm({ ...form, kwh: e.target.value })} />
            </label>
          </div>
        </div>
      </Modal>

      {/* Dismissible footnote anchor */}
      <div className="mt-8 flex items-center gap-2 text-xs text-text-muted">
        <Leaf className="h-3.5 w-3.5" />
        Sustainability · Session 64 ledger completed by Session 121 (durable per-record storage, same-period changes, no invented scores)
        <button className="ml-auto text-text-muted hover:text-text-bright" onClick={() => setFormOpen(false)} aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Re-export so lazy imports can use `.then(m => m.SustainabilityPage)` uniformly.
export default SustainabilityPage;
