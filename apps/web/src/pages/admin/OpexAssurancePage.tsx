/**
 * Session 118 — Operational-excellence assurance console.
 *
 * Session 73 shipped one screen for this module: a tab inside the platform
 * page that rendered `GET /opex/dashboard/rollup` as a wall of percentages.
 * Several of those percentages were not measurements. `alignment`,
 * `compliance`, `transparency`, `explainability` and `hallucinationRisk` were
 * the literal number `0` because nothing in the platform assesses them — and
 * on a 0-100 scale a zero is a score, not a gap. Worst of all, a
 * `hallucinationRisk` of 0% reads as "this system does not hallucinate".
 *
 * This page exists to make that class of statement impossible. Its rules:
 *
 *   - **A measure with no data prints "not assessed", never 0.** Every number
 *     carries its basis (`observed`, `operator assessed`, `not assessed`) and
 *     its sample size, on the same line as the value.
 *   - **There is no composite trust score.** The API returns `compositeScore:
 *     null` deliberately, and this page shows the reason rather than quietly
 *     averaging observed traffic statistics with dimensions nobody rated.
 *   - **Closure is not safety.** The register's closure rate is labelled as
 *     the share of findings marked closed by a human — it says nothing about
 *     whether the underlying hazard was fixed.
 *   - **Adopted records are marked.** Findings imported from the Session 73
 *     JSON blob have no acknowledgement or resolution timestamps, so they are
 *     flagged and excluded from timing statistics instead of being given an
 *     invented time.
 *   - **Expectations are advisory.** The policy sets response expectations;
 *     nothing here blocks anything, and the policy card says so.
 *
 * Reads are open to any authenticated member because the API allows them.
 * Write controls (reopen, record/clear an assessment, save the policy) are
 * hidden from non-administrators because the API refuses them, and a control
 * that always fails is worse than no control.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity, AlertTriangle, ClipboardCheck, Gauge, History, Loader2, RefreshCw,
  RotateCcw, ScrollText, ShieldQuestion, Timer, TrendingDown,
} from "lucide-react";
import {
  opexAssuranceApi,
  formatOpexMeasure,
  OPEX_ASSESSED_DIMENSIONS,
  OPEX_ALERT_STATUSES,
  OPEX_BASIS_LABELS,
  OPEX_SEVERITIES,
  OPEX_STATUS_LABELS,
  opexDimensionDirection,
  type OpexAlertPage,
  type OpexAlertRecord,
  type OpexAssessedDimension,
  type OpexAssessmentRegister,
  type OpexAssuranceSummary,
  type OpexBreachReport,
  type OpexConfigurationReport,
  type OpexEventPage,
  type OpexFailureBreakdown,
  type OpexGapReport,
  type OpexPolicy,
  type OpexProvenance,
  type OpexReliability,
  type OpexTimings,
  type OpexTrustReport,
} from "@/lib/opex";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Tab =
  | "overview" | "register" | "timings" | "reliability"
  | "assessments" | "trust" | "policy" | "gaps" | "ledger";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "register", label: "Safety register" },
  { id: "timings", label: "Response times" },
  { id: "reliability", label: "Reliability" },
  { id: "assessments", label: "Assessments" },
  { id: "trust", label: "Trust dimensions" },
  { id: "policy", label: "Policy" },
  { id: "gaps", label: "Gaps & readiness" },
  { id: "ledger", label: "Ledger" },
];

type BadgeVariant =
  "emerald" | "slate" | "amber" | "azure" | "crimson" | "violet" | "default";

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  open: "crimson",
  acknowledged: "amber",
  resolved: "emerald",
};

const SEVERITY_VARIANT: Record<string, BadgeVariant> = {
  info: "slate",
  warning: "amber",
  critical: "crimson",
};

const BASIS_VARIANT: Record<string, BadgeVariant> = {
  observed: "emerald",
  operator_assessed: "azure",
  not_assessed: "slate",
};

const CHECK_VARIANT: Record<string, BadgeVariant> = {
  pass: "emerald",
  warn: "amber",
  fail: "crimson",
};

const GAP_VARIANT: Record<string, BadgeVariant> = {
  high: "crimson",
  medium: "amber",
  low: "slate",
};

const DIMENSION_LABELS: Record<OpexAssessedDimension, string> = {
  alignment: "Alignment",
  compliance: "Compliance",
  transparency: "Transparency",
  explainability: "Explainability",
  evidence_quality: "Evidence quality",
  hallucination_risk: "Hallucination risk",
  safety: "Safety",
};

const when = (iso: string | null | undefined, fallback = "—") =>
  iso ? new Date(iso).toLocaleString() : fallback;

/** Null is an absence, not a zero. Never fall back to `?? 0` here. */
const numOr = (value: number | null | undefined, suffix = "", fallback = "not measured") =>
  value === null || value === undefined ? fallback : `${value}${suffix}`;

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-azure/20 bg-azure/5 p-3 text-xs leading-relaxed text-text-muted">
      {children}
    </div>
  );
}

function Stat({
  icon, label, value, detail,
}: { icon: ReactNode; label: string; value: ReactNode; detail?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg border border-azure/20 bg-azure/10 p-2 text-azure">{icon}</div>
        <div className="min-w-0">
          <div className="truncate text-xl font-black text-text-bright">{value}</div>
          <div className="text-xs text-text-muted">{label}</div>
          {detail ? <div className="text-[11px] text-text-muted">{detail}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** A rate that is genuinely undefined when nothing has been filed or recorded. */
function Rate({ percent, absent }: { percent: number | null; absent: string }) {
  if (percent === null) return <span className="italic text-text-muted">{absent}</span>;
  return <span>{percent}%</span>;
}

export function OpexAssurancePage() {
  const user = useAuthStore((state) => state.user);
  const canAdminister = user?.role === "admin" || user?.role === "super_admin";

  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [summary, setSummary] = useState<OpexAssuranceSummary | null>(null);
  const [page, setPage] = useState<OpexAlertPage | null>(null);
  const [timings, setTimings] = useState<OpexTimings | null>(null);
  const [breaches, setBreaches] = useState<OpexBreachReport | null>(null);
  const [reliability, setReliability] = useState<OpexReliability | null>(null);
  const [failures, setFailures] = useState<OpexFailureBreakdown | null>(null);
  const [assessments, setAssessments] = useState<OpexAssessmentRegister | null>(null);
  const [trust, setTrust] = useState<OpexTrustReport | null>(null);
  const [policy, setPolicy] = useState<OpexPolicy | null>(null);
  const [gaps, setGaps] = useState<OpexGapReport | null>(null);
  const [config, setConfig] = useState<OpexConfigurationReport | null>(null);
  const [provenance, setProvenance] = useState<OpexProvenance | null>(null);
  const [events, setEvents] = useState<OpexEventPage | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [windowDays, setWindowDays] = useState(30);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  const [assessDimension, setAssessDimension] =
    useState<OpexAssessedDimension>(OPEX_ASSESSED_DIMENSIONS[0]);
  const [assessScore, setAssessScore] = useState(70);
  const [assessMethod, setAssessMethod] = useState("");
  const [assessNote, setAssessNote] = useState("");

  const run = useCallback(async (action: string, fn: () => Promise<string | void>) => {
    setBusy(action); setErr(null); setNotice(null);
    try {
      const message = await fn();
      if (typeof message === "string") setNotice(message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    await run("refresh", async () => {
      const [s, a, t, b, r, f, asr, tr, p, g, c, pv, ev] = await Promise.all([
        opexAssuranceApi.summary(),
        opexAssuranceApi.listAlerts({ limit: 100 }),
        opexAssuranceApi.timings(),
        opexAssuranceApi.breaches(),
        opexAssuranceApi.reliability(),
        opexAssuranceApi.failures(),
        opexAssuranceApi.assessments(),
        opexAssuranceApi.trust(),
        opexAssuranceApi.policy(),
        opexAssuranceApi.gaps(),
        opexAssuranceApi.configuration(),
        opexAssuranceApi.provenance(),
        opexAssuranceApi.events({ limit: 60 }),
      ]);
      setSummary(s); setPage(a); setTimings(t); setBreaches(b);
      setReliability(r); setFailures(f); setAssessments(asr); setTrust(tr);
      setPolicy(p); setGaps(g); setConfig(c); setProvenance(pv); setEvents(ev);
      setWindowDays(r.windowDays);
    });
  }, [run]);

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const reloadRegister = (status: string, severity: string) =>
    run("register", async () => {
      setStatusFilter(status); setSeverityFilter(severity);
      setPage(await opexAssuranceApi.listAlerts({
        status: status || undefined,
        severity: severity || undefined,
        limit: 100,
      }));
    });

  const reloadReliability = (days: number) =>
    run("reliability", async () => {
      setWindowDays(days);
      const [r, f] = await Promise.all([
        opexAssuranceApi.reliability(days),
        opexAssuranceApi.failures(days),
      ]);
      setReliability(r); setFailures(f);
    });

  const reopen = (alertId: string) =>
    run(`reopen:${alertId}`, async () => {
      await opexAssuranceApi.reopen(alertId, reopenReason.trim());
      setReopenReason(""); setExpanded(null);
      await reloadRegister(statusFilter, severityFilter);
      return "Finding reopened. The resolution it undoes stays in the transition history — nothing was erased.";
    });

  const recordAssessment = () =>
    run("assess", async () => {
      await opexAssuranceApi.recordAssessment(assessDimension, {
        score: assessScore,
        method: assessMethod.trim(),
        note: assessNote.trim() || undefined,
      });
      setAssessMethod(""); setAssessNote("");
      const [asr, tr] = await Promise.all([
        opexAssuranceApi.assessments(),
        opexAssuranceApi.trust(),
      ]);
      setAssessments(asr); setTrust(tr);
      return "Assessment recorded. It is published as operator assessed, never as an observed measurement.";
    });

  const clearAssessment = (dimension: OpexAssessedDimension) =>
    run(`clear:${dimension}`, async () => {
      const res = await opexAssuranceApi.clearAssessment(dimension);
      const [asr, tr] = await Promise.all([
        opexAssuranceApi.assessments(),
        opexAssuranceApi.trust(),
      ]);
      setAssessments(asr); setTrust(tr);
      return res.note;
    });

  const savePolicy = (patch: Parameters<typeof opexAssuranceApi.updatePolicy>[0]) =>
    run("policy", async () => {
      setPolicy(await opexAssuranceApi.updatePolicy(patch));
      return "Policy saved. These are response expectations for reporting; nothing in the platform is blocked by them.";
    });

  const openHistory = (alertId: string) => {
    setExpanded((current) => (current === alertId ? null : alertId));
    setReopenReason("");
  };

  const alerts: OpexAlertRecord[] = page?.alerts ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-text-bright">
            <Gauge className="h-6 w-6 text-azure" /> Operational excellence
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            The safety register, AI reliability measured from recorded traffic, and the responsible-AI
            dimensions this platform cannot observe. Anything nobody has assessed is reported as
            <span className="text-text-bright"> not assessed</span> — never as zero.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()} disabled={busy === "refresh"}>
          {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </header>

      {err ? (
        <div className="flex items-start gap-2 rounded-lg border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{err}</span>
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald/30 bg-emerald/10 p-3 text-sm text-emerald">{notice}</div>
      ) : null}

      <nav className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              tab === t.id
                ? "border-azure/40 bg-azure/10 text-text-bright"
                : "border-white/10 text-text-muted hover:text-text-bright"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── Overview ───────────────────────────────────────────────────── */}
      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Findings open now"
              value={summary?.register.open ?? "—"}
              detail={summary ? `${summary.register.openCritical} critical · ${summary.register.total} filed in total` : undefined}
            />
            <Stat
              icon={<ClipboardCheck className="h-4 w-4" />}
              label="Marked closed by a human"
              value={<Rate percent={summary?.register.closureRatePercent ?? null} absent="nothing filed" />}
              detail={summary ? `${summary.register.resolvedLast24h} closed in the last 24 h` : undefined}
            />
            <Stat
              icon={<Activity className="h-4 w-4" />}
              label="AI request success rate"
              value={<Rate percent={summary?.reliability.successRatePercent ?? null} absent="no traffic recorded" />}
              detail={summary ? `${summary.reliability.total} request(s) in ${summary.reliability.windowDays} days` : undefined}
            />
            <Stat
              icon={<Timer className="h-4 w-4" />}
              label="Response expectations missed"
              value={summary?.breaches.breaches.length ?? "—"}
              detail={
                summary?.breaches.excludedImported
                  ? `${summary.breaches.excludedImported} adopted record(s) excluded — no times recorded`
                  : undefined
              }
            />
          </div>

          {summary ? (
            <Card>
              <CardHeader>
                <CardTitle>What is actually measured</CardTitle>
                <CardDescription>
                  {summary.trust.observed} observed · {summary.trust.assessed} operator assessed ·{" "}
                  {summary.trust.notAssessed} not assessed
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {summary.trust.measures.map((m) => (
                    <Badge key={m.key} variant={BASIS_VARIANT[m.basis] ?? "default"}>
                      {m.label}: {formatOpexMeasure(m.value, m.unit)}
                    </Badge>
                  ))}
                </div>
                <Note>{summary.trust.compositeNote}</Note>
                <Note>{summary.note}</Note>
              </CardContent>
            </Card>
          ) : null}

          {summary ? (
            <Card>
              <CardHeader>
                <CardTitle>Register at a glance</CardTitle>
                <CardDescription>{summary.register.closureNote}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  {OPEX_ALERT_STATUSES.map((s) => (
                    <Badge key={s} variant={STATUS_VARIANT[s] ?? "default"}>
                      {OPEX_STATUS_LABELS[s] ?? s}: {summary.register.byStatus[s]}
                    </Badge>
                  ))}
                  {OPEX_SEVERITIES.map((s) => (
                    <Badge key={s} variant={SEVERITY_VARIANT[s] ?? "default"}>
                      {s}: {summary.register.bySeverity[s]}
                    </Badge>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>Oldest open finding: {when(summary.register.oldestOpenAt, "none open")}</div>
                  <div>
                    Open for: {numOr(summary.register.oldestOpenAgeHours, " h", "nothing open")}
                  </div>
                  <div>Adopted from the Session 73 blob: {summary.register.imported}</div>
                  <div>
                    Closed but with no closing time recorded: {summary.register.resolvedTimeUnknown}
                  </div>
                </div>
                <Note>{summary.register.note}</Note>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ── Safety register ────────────────────────────────────────────── */}
      {tab === "register" ? (
        <Card>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Safety register</CardTitle>
              <CardDescription>
                {page
                  ? `${page.returned} of ${page.total} finding(s)${page.truncated ? " — truncated" : ""}`
                  : "Not loaded."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                className="max-w-[11rem]"
                value={statusFilter}
                onChange={(e) => void reloadRegister(e.target.value, severityFilter)}
              >
                <option value="">Any status</option>
                {OPEX_ALERT_STATUSES.map((s) => (
                  <option key={s} value={s}>{OPEX_STATUS_LABELS[s] ?? s}</option>
                ))}
              </Select>
              <Select
                className="max-w-[11rem]"
                value={severityFilter}
                onChange={(e) => void reloadRegister(statusFilter, e.target.value)}
              >
                <option value="">Any severity</option>
                {OPEX_SEVERITIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length ? alerts.map((a) => (
              <div key={a.id} className="rounded-lg border border-white/10 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={SEVERITY_VARIANT[a.severity] ?? "default"}>{a.severity}</Badge>
                      <Badge variant={STATUS_VARIANT[a.status] ?? "default"}>
                        {OPEX_STATUS_LABELS[a.status] ?? a.status}
                      </Badge>
                      <span className="text-sm text-text-bright">{a.category}</span>
                      {a.importedFromLegacyRegister ? (
                        <Badge variant="violet">adopted — no transition times</Badge>
                      ) : null}
                      {a.reopenCount > 0 ? (
                        <Badge variant="amber">reopened ×{a.reopenCount}</Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-text-main">{a.message}</div>
                    <div className="text-[11px] text-text-muted">
                      filed {when(a.filedAt)} by {a.source}
                      {a.model ? ` · ${a.model}` : ""}
                      {" · acknowledged "}{when(a.acknowledgedAt, a.status === "open" ? "not yet" : "time not recorded")}
                      {" · closed "}{when(a.resolvedAt, a.status === "resolved" ? "time not recorded" : "not yet")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openHistory(a.id)}>
                      <History className="h-4 w-4" /> History
                    </Button>
                  </div>
                </div>

                {expanded === a.id ? (
                  <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
                    <div className="space-y-1">
                      {a.transitions.length ? a.transitions.map((t, i) => (
                        <div key={`${a.id}-${i}`} className="flex flex-wrap items-baseline gap-2 text-xs">
                          <Badge variant="slate">{t.from ?? "filed"} → {t.to}</Badge>
                          <span className="text-text-muted">{when(t.at)}</span>
                          <span className="text-text-muted">by {t.actorId}</span>
                          {t.reason ? <span className="text-text-main">· {t.reason}</span> : null}
                        </div>
                      )) : (
                        <p className="text-xs text-text-muted">
                          No transitions recorded. This finding predates the durable register.
                        </p>
                      )}
                    </div>

                    {canAdminister && a.status === "resolved" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="max-w-md"
                          placeholder="Why reopen (at least 10 characters — this becomes the audit record)"
                          value={reopenReason}
                          onChange={(e) => setReopenReason(e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy === `reopen:${a.id}` || reopenReason.trim().length < 10}
                          onClick={() => void reopen(a.id)}
                        >
                          <RotateCcw className="h-4 w-4" /> Reopen
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )) : (
              <p className="text-sm text-text-muted">
                {page ? "No findings match this filter." : "Not loaded."}
              </p>
            )}
            {page ? <Note>{page.note}</Note> : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Response times ─────────────────────────────────────────────── */}
      {tab === "timings" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>How long findings take</CardTitle>
              <CardDescription>
                Computed from recorded transition times only. A record with no recorded time is
                excluded and counted, not estimated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {timings ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["Time to acknowledge", timings.timeToAcknowledgeHours],
                    ["Time to close", timings.timeToResolveHours],
                  ] as const).map(([label, stat]) => (
                    <div key={label} className="rounded-lg border border-white/10 p-3">
                      <div className="text-xs uppercase text-text-muted">{label}</div>
                      <div className="mt-1 text-lg font-black text-text-bright">
                        {numOr(stat.median, " h", "no completed sample")}
                      </div>
                      <div className="text-xs text-text-muted">
                        p90 {numOr(stat.p90, " h", "—")} · sample {stat.sampleSize}
                      </div>
                      {stat.excluded > 0 ? (
                        <div className="mt-1 text-[11px] text-amber">
                          {stat.excluded} excluded — {stat.excludedReason}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : <p className="text-text-muted">Not loaded.</p>}
              {timings ? <Note>{timings.note}</Note> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Findings past their expectation</CardTitle>
              <CardDescription>
                {breaches
                  ? `${breaches.counts.acknowledgement_overdue} unacknowledged · ${breaches.counts.resolution_overdue} unresolved past the window`
                  : "Not loaded."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {breaches && breaches.breaches.length ? breaches.breaches.map((b) => (
                <div key={`${b.alertId}-${b.kind}`} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-white/10 p-3">
                  <div className="min-w-0">
                    <div className="text-sm text-text-bright">{b.message}</div>
                    <div className="text-[11px] text-text-muted">
                      filed {when(b.filedAt)} · open {b.ageHours} h against a {b.expectationHours} h expectation
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={SEVERITY_VARIANT[b.severity] ?? "default"}>{b.severity}</Badge>
                    <Badge variant="amber">{b.kind.replace(/_/g, " ")}</Badge>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-text-muted">
                  {breaches ? "Nothing is past its response expectation." : "Not loaded."}
                </p>
              )}
              {breaches ? <Note>{breaches.note}</Note> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ── Reliability ────────────────────────────────────────────────── */}
      {tab === "reliability" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>AI request reliability</CardTitle>
                <CardDescription>
                  Derived from recorded AI requests for this organization. Not a model-quality score.
                </CardDescription>
              </div>
              <Select
                className="max-w-[10rem]"
                value={String(windowDays)}
                onChange={(e) => void reloadReliability(Number(e.target.value))}
              >
                {[7, 30, 90, 365].map((d) => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </Select>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {reliability ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Stat
                      icon={<Activity className="h-4 w-4" />}
                      label="Success rate (floored)"
                      value={<Rate percent={reliability.successRatePercent} absent="no requests" />}
                      detail={`${reliability.succeeded} of ${reliability.total} succeeded`}
                    />
                    <Stat
                      icon={<TrendingDown className="h-4 w-4" />}
                      label="Failures in window"
                      value={reliability.failed}
                    />
                    <Stat
                      icon={<Timer className="h-4 w-4" />}
                      label="Latency p50 / p95"
                      value={`${numOr(reliability.latency.p50Ms, " ms", "—")} / ${numOr(reliability.latency.p95Ms, " ms", "—")}`}
                      detail={
                        reliability.latency.sampled
                          ? `sampled from ${reliability.latency.sampleSize} record(s)`
                          : `${reliability.latency.sampleSize} record(s)`
                      }
                    />
                    <Stat
                      icon={<ShieldQuestion className="h-4 w-4" />}
                      label="Data freshness"
                      value={numOr(reliability.dataFreshnessHours, " h", "never")}
                      detail={`last request ${when(reliability.lastRequestAt, "never")}`}
                    />
                  </div>
                  <Note>{reliability.note}</Note>
                  <Note>{reliability.freshnessNote}</Note>
                </>
              ) : <p className="text-text-muted">Not loaded.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Where the failures are</CardTitle>
              <CardDescription>
                {failures
                  ? `${failures.sampleSize} record(s)${failures.sampled ? " — sampled" : ""}`
                  : "Not loaded."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {failures ? (
                <>
                  {([
                    ["By provider", failures.byProvider],
                    ["By model", failures.byModel],
                    ["By channel", failures.byChannel],
                  ] as const).map(([label, groups]) => (
                    <div key={label} className="space-y-1">
                      <div className="text-xs uppercase text-text-muted">{label}</div>
                      {groups.length ? groups.map((g) => (
                        <div key={`${label}-${g.key}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2">
                          <span className="truncate text-text-bright">{g.key}</span>
                          <span className="shrink-0 text-text-muted">
                            {g.failed} / {g.total} failed ·{" "}
                            <Rate percent={g.failureRatePercent} absent="no traffic" />
                          </span>
                        </div>
                      )) : <p className="text-text-muted">Nothing recorded.</p>}
                    </div>
                  ))}
                  <Note>{failures.note}</Note>
                </>
              ) : <p className="text-text-muted">Not loaded.</p>}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ── Assessments ────────────────────────────────────────────────── */}
      {tab === "assessments" ? (
        <div className="space-y-4">
          {canAdminister ? (
            <Card>
              <CardHeader>
                <CardTitle>Record an assessment</CardTitle>
                <CardDescription>
                  These dimensions have no signal in this platform. A score is only meaningful with the
                  method that produced it, so the method is required.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-xs uppercase text-text-muted">Dimension</span>
                    <Select
                      value={assessDimension}
                      onChange={(e) => setAssessDimension(e.target.value as OpexAssessedDimension)}
                    >
                      {OPEX_ASSESSED_DIMENSIONS.map((d) => (
                        <option key={d} value={d}>
                          {DIMENSION_LABELS[d]}
                          {opexDimensionDirection(d) === "lower_is_better" ? " (lower is better)" : ""}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs uppercase text-text-muted">Score (0–100)</span>
                    <Input
                      type="number" min={0} max={100}
                      value={assessScore}
                      onChange={(e) => setAssessScore(Number(e.target.value))}
                    />
                  </label>
                </div>
                <Input
                  placeholder="How was this assessed? (at least 10 characters)"
                  value={assessMethod}
                  onChange={(e) => setAssessMethod(e.target.value)}
                />
                <Input
                  placeholder="Note (optional)"
                  value={assessNote}
                  onChange={(e) => setAssessNote(e.target.value)}
                />
                <Button
                  onClick={() => void recordAssessment()}
                  disabled={busy === "assess" || assessMethod.trim().length < 10}
                >
                  <ClipboardCheck className="h-4 w-4" /> Record assessment
                </Button>
                {opexDimensionDirection(assessDimension) === "lower_is_better" ? (
                  <Note>
                    {DIMENSION_LABELS[assessDimension]} is a risk dimension: a lower score is the better
                    result. It is reported as not assessed until you record something, precisely because a
                    zero here would read as "no risk".
                  </Note>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Assessment register</CardTitle>
              <CardDescription>
                {assessments
                  ? `${assessments.assessed} assessed · ${assessments.stale} stale · ${assessments.notAssessed.length} never assessed`
                  : "Not loaded."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(assessments?.assessments ?? []).map((a) => (
                <div key={a.dimension} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-white/10 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-bright">{DIMENSION_LABELS[a.dimension]}</span>
                      <Badge variant="azure">{a.score}</Badge>
                      {a.stale ? <Badge variant="amber">stale</Badge> : null}
                      {opexDimensionDirection(a.dimension) === "lower_is_better" ? (
                        <Badge variant="slate">lower is better</Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-text-muted">{a.method}</div>
                    {a.note ? <div className="text-xs text-text-main">{a.note}</div> : null}
                    <div className="text-[11px] text-text-muted">
                      recorded {when(a.assessedAt)} by {a.assessedBy} · expires {when(a.expiresAt, "never")}
                    </div>
                  </div>
                  {canAdminister ? (
                    <Button
                      size="sm" variant="secondary"
                      onClick={() => void clearAssessment(a.dimension)}
                      disabled={busy === `clear:${a.dimension}`}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
              ))}
              {assessments && assessments.notAssessed.length ? (
                <div className="rounded-lg border border-white/10 p-3">
                  <div className="text-xs uppercase text-text-muted">Never assessed</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {assessments.notAssessed.map((d) => (
                      <Badge key={d} variant="slate">{DIMENSION_LABELS[d]}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {assessments ? <Note>{assessments.note}</Note> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ── Trust dimensions ───────────────────────────────────────────── */}
      {tab === "trust" ? (
        <Card>
          <CardHeader>
            <CardTitle>Trust dimensions</CardTitle>
            <CardDescription>
              {trust
                ? `${trust.observed} observed · ${trust.assessed} operator assessed · ${trust.notAssessed} not assessed · generated ${when(trust.generatedAt)}`
                : "Not loaded."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-text-muted">
                  <tr>
                    <th className="py-2 pr-3">Dimension</th>
                    <th className="py-2 pr-3">Value</th>
                    <th className="py-2 pr-3">Basis</th>
                    <th className="py-2 pr-3">Sample</th>
                    <th className="py-2 pr-3">Direction</th>
                    <th className="py-2 pr-3">As of</th>
                  </tr>
                </thead>
                <tbody>
                  {(trust?.measures ?? []).map((m) => (
                    <tr key={m.key} className="border-t border-white/5">
                      <td className="py-2 pr-3 text-text-bright">
                        {m.label}
                        <div className="text-[11px] text-text-muted">{m.detail}</div>
                      </td>
                      <td className="py-2 pr-3">
                        {m.value === null ? (
                          <span className="italic text-text-muted">not assessed</span>
                        ) : (
                          <span className="text-text-bright">{formatOpexMeasure(m.value, m.unit)}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={BASIS_VARIANT[m.basis] ?? "default"}>
                          {OPEX_BASIS_LABELS[m.basis] ?? m.basis}
                        </Badge>
                        {m.stale ? <Badge variant="amber">stale</Badge> : null}
                      </td>
                      <td className="py-2 pr-3 text-text-muted">{m.sampleSize}</td>
                      <td className="py-2 pr-3 text-text-muted">
                        {m.direction === "lower_is_better" ? "lower is better" : "higher is better"}
                      </td>
                      <td className="py-2 pr-3 text-text-muted">{when(m.asOf, "never")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {trust ? (
              <>
                <Note>{trust.compositeNote}</Note>
                <Note>{trust.note}</Note>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Policy ─────────────────────────────────────────────────────── */}
      {tab === "policy" && policy ? (
        <Card>
          <CardHeader>
            <CardTitle>Policy</CardTitle>
            <CardDescription>
              {policy.isDefault
                ? "Never saved — these are the defaults, which reproduce the module's historical behaviour."
                : `Last saved ${when(policy.updatedAt)} by ${policy.updatedBy ?? "unknown"}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canAdminister ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs uppercase text-text-muted">Reliability window (days)</span>
                  <Input
                    type="number" min={1} max={365} defaultValue={policy.reliabilityWindowDays}
                    onBlur={(e) => {
                      const reliabilityWindowDays = Number(e.target.value);
                      if (reliabilityWindowDays !== policy.reliabilityWindowDays) {
                        void savePolicy({ reliabilityWindowDays });
                      }
                    }}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs uppercase text-text-muted">Register retention (findings)</span>
                  <Input
                    type="number" min={1} max={2000} defaultValue={policy.registerRetention}
                    onBlur={(e) => {
                      const registerRetention = Number(e.target.value);
                      if (registerRetention !== policy.registerRetention) {
                        void savePolicy({ registerRetention });
                      }
                    }}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs uppercase text-text-muted">Acknowledge a critical within (h)</span>
                  <Input
                    type="number" min={1} max={720} defaultValue={policy.criticalAckHours}
                    onBlur={(e) => {
                      const criticalAckHours = Number(e.target.value);
                      if (criticalAckHours !== policy.criticalAckHours) {
                        void savePolicy({ criticalAckHours });
                      }
                    }}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs uppercase text-text-muted">Close a critical within (h)</span>
                  <Input
                    type="number" min={1} max={8760} defaultValue={policy.criticalResolveHours}
                    onBlur={(e) => {
                      const criticalResolveHours = Number(e.target.value);
                      if (criticalResolveHours !== policy.criticalResolveHours) {
                        void savePolicy({ criticalResolveHours });
                      }
                    }}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs uppercase text-text-muted">
                    Assessment validity (days, blank = never expires)
                  </span>
                  <Input
                    type="number" min={1} max={3650}
                    defaultValue={policy.assessmentValidityDays ?? ""}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const assessmentValidityDays = raw === "" ? null : Number(raw);
                      if (assessmentValidityDays !== policy.assessmentValidityDays) {
                        void savePolicy({ assessmentValidityDays });
                      }
                    }}
                  />
                </label>
                <label className="flex items-center gap-2 self-end text-sm text-text-main">
                  <input
                    type="checkbox"
                    checked={policy.requireReopenReason}
                    onChange={(e) => void savePolicy({ requireReopenReason: e.target.checked })}
                  />
                  Require a written reason to reopen a finding
                </label>
              </div>
            ) : (
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>Reliability window: {policy.reliabilityWindowDays} days</div>
                <div>Register retention: {policy.registerRetention} findings</div>
                <div>Acknowledge a critical within: {policy.criticalAckHours} h</div>
                <div>Close a critical within: {policy.criticalResolveHours} h</div>
                <div>Assessment validity: {numOr(policy.assessmentValidityDays, " days", "never expires")}</div>
                <div>Reopen reason required: {policy.requireReopenReason ? "yes" : "no"}</div>
              </div>
            )}
            <Note>{policy.note}</Note>
            {!canAdminister ? (
              <Note>Only an administrator can change these values, so the controls are not shown.</Note>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Gaps & readiness ───────────────────────────────────────────── */}
      {tab === "gaps" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gaps</CardTitle>
              <CardDescription>
                {gaps
                  ? `${gaps.counts.high} high · ${gaps.counts.medium} medium · ${gaps.counts.low} low — individually addressable, not a score.`
                  : "Not loaded."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {gaps && gaps.gaps.length ? gaps.gaps.map((g) => (
                <div key={g.key} className="flex items-start gap-3 rounded-lg border border-white/10 p-3">
                  <Badge variant={GAP_VARIANT[g.severity] ?? "default"}>{g.severity}</Badge>
                  <div className="min-w-0 text-sm text-text-main">{g.detail}</div>
                </div>
              )) : (
                <p className="text-sm text-text-muted">
                  {gaps ? "No gaps found in what this report can see." : "Not loaded."}
                </p>
              )}
              {gaps ? <Note>{gaps.note}</Note> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Readiness checks</CardTitle>
              <CardDescription>
                {config
                  ? config.ready
                    ? "Every check passes. A warning is never rounded up to a pass."
                    : "At least one check is not a pass."
                  : "Not loaded."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(config?.checks ?? []).map((c) => (
                <div key={c.key} className="flex items-start gap-3 rounded-lg border border-white/10 p-3">
                  <Badge variant={CHECK_VARIANT[c.state] ?? "default"}>{c.state}</Badge>
                  <div className="min-w-0">
                    <div className="text-sm text-text-bright">{c.label}</div>
                    <div className="text-xs text-text-muted">{c.detail}</div>
                  </div>
                </div>
              ))}
              {config && config.unimplementedSections.length ? (
                <div className="rounded-lg border border-white/10 p-3">
                  <div className="text-xs uppercase text-text-muted">
                    Contract sections nothing implements
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {config.unimplementedSections.map((s) => (
                      <Badge key={s} variant="slate">{s}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {config ? <Note>{config.note}</Note> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Where the Session 73 rollup's numbers come from</CardTitle>
              <CardDescription>
                {provenance
                  ? `${provenance.observedFields} observed · ${provenance.structuralZeroFields} structural zero(s)`
                  : "Not loaded."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(provenance?.entries ?? []).map((e) => (
                <div key={e.field} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-white/10 p-3">
                  <div className="min-w-0">
                    <div className="text-sm text-text-bright">{e.field}</div>
                    <div className="text-xs text-text-muted">{e.detail}</div>
                  </div>
                  <Badge variant={BASIS_VARIANT[e.basis] ?? "default"}>
                    {OPEX_BASIS_LABELS[e.basis] ?? e.basis}
                  </Badge>
                </div>
              ))}
              {provenance ? <Note>{provenance.note}</Note> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ── Ledger ─────────────────────────────────────────────────────── */}
      {tab === "ledger" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" /> Operational-excellence ledger
            </CardTitle>
            <CardDescription>
              {events
                ? `${events.events.length} shown · ${events.stored} stored of ${events.retentionLimit} kept · oldest ${when(events.oldestAt, "none")}`
                : "Not loaded."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(events?.events ?? []).map((e) => (
              <div key={e.id} className="flex flex-wrap items-baseline gap-2 rounded-lg border border-white/10 p-2 text-xs">
                <Badge variant="slate">{e.kind}</Badge>
                <span className="text-text-muted">{when(e.at)}</span>
                {e.actorId ? <span className="text-text-main">by {e.actorId}</span> : null}
                {e.alertId ? <span className="text-text-muted">· {e.alertId}</span> : null}
                <span className="text-text-muted">· {e.detail}</span>
              </div>
            ))}
            {events && events.events.length === 0 ? (
              <p className="text-sm text-text-muted">
                Nothing recorded since this ledger was introduced.
              </p>
            ) : null}
            {events ? <Note>{events.note}</Note> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default OpexAssurancePage;
