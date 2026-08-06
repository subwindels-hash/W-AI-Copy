/**
 * Session 116 — MFA assurance console.
 *
 * The platform could enrol a user in TOTP and could challenge them at login,
 * and that was the whole of it: no screen ever answered "who here has a second
 * factor?", "is anyone locked out?", or "what does this deployment actually
 * enforce?". This page is that screen, and it is built to avoid four
 * comfortable lies:
 *
 *   - **"MFA is on."** On for whom? The overview shows coverage against the
 *     policy, with `not_required` counted separately from `covered` so a
 *     permissive policy cannot masquerade as a protected organization.
 *   - **"Enrolled means confirmed."** A secret issued and never verified is
 *     shown as `enrollment_pending`, and a secret that predates the ledger is
 *     shown as `unrecorded` — the API does not know whether it was ever
 *     confirmed, and neither does this page.
 *   - **"The policy is enforced."** In `report_only` nothing is blocked, and
 *     the enforcement selector says that on the control itself.
 *   - **"Exempt is fine."** Exemptions are listed with their reason, their
 *     author and their expiry, never folded into the covered count.
 *
 * Administrative controls (policy, coverage, locks, exemptions, the
 * organization ledger) are hidden from non-administrators because the API
 * refuses them, and a button that always fails is worse than no button. Every
 * member still sees their own standing, their own recovery-code health and
 * their own ledger.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle, KeyRound, Loader2, LockKeyhole, RefreshCw, ScrollText,
  ShieldCheck, ShieldQuestion, Timer, UserMinus, Users,
} from "lucide-react";
import {
  mfaAssuranceApi,
  MFA_COMPLIANCE_LABELS,
  MFA_ENFORCEMENT_LABELS,
  MFA_POLICY_MODE_LABELS,
  type MfaAssuranceSummary,
  type MfaComplianceState,
  type MfaConfigurationReport,
  type MfaCoverageReport,
  type MfaEventPage,
  type MfaExemption,
  type MfaGapReport,
  type MfaLockState,
  type MfaOrgPolicy,
  type MfaSelfView,
} from "@/lib/mfa";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Tab = "overview" | "coverage" | "policy" | "locks" | "exemptions" | "ledger" | "me";

const TABS: Array<{ id: Tab; label: string; adminOnly: boolean }> = [
  { id: "overview", label: "Overview", adminOnly: true },
  { id: "coverage", label: "Coverage", adminOnly: true },
  { id: "policy", label: "Policy", adminOnly: true },
  { id: "locks", label: "Lockouts", adminOnly: true },
  { id: "exemptions", label: "Exemptions", adminOnly: true },
  { id: "ledger", label: "Ledger", adminOnly: true },
  { id: "me", label: "My second factor", adminOnly: false },
];

const COMPLIANCE_VARIANT: Record<MfaComplianceState, "emerald" | "slate" | "amber" | "azure" | "crimson" | "violet"> = {
  covered: "emerald",
  not_required: "slate",
  enrollment_pending: "azure",
  in_grace: "amber",
  not_enrolled: "crimson",
  exempt: "violet",
};

const when = (iso: string | null | undefined, fallback = "never") =>
  iso ? new Date(iso).toLocaleString() : fallback;

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-azure/20 bg-azure/5 p-3 text-xs leading-relaxed text-text-muted">
      {children}
    </div>
  );
}

function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: ReactNode; detail?: string }) {
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

/** A ratio that is genuinely undefined when the policy asks nobody to enrol. */
function CoverageRatio({ ratio }: { ratio: number | null }) {
  if (ratio === null) {
    return <span className="italic text-text-muted">no one is required</span>;
  }
  return <span>{Math.round(ratio * 100)}%</span>;
}

export function MfaAssurancePage() {
  const user = useAuthStore((state) => state.user);
  const canAdminister = user?.role === "admin" || user?.role === "super_admin";

  const [tab, setTab] = useState<Tab>(canAdminister ? "overview" : "me");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [summary, setSummary] = useState<MfaAssuranceSummary | null>(null);
  const [coverage, setCoverage] = useState<MfaCoverageReport | null>(null);
  const [gaps, setGaps] = useState<MfaGapReport | null>(null);
  const [policy, setPolicy] = useState<MfaOrgPolicy | null>(null);
  const [locks, setLocks] = useState<Array<MfaLockState & { email: string | null }>>([]);
  const [exemptions, setExemptions] = useState<MfaExemption[]>([]);
  const [events, setEvents] = useState<MfaEventPage | null>(null);
  const [mine, setMine] = useState<MfaSelfView | null>(null);
  const [myEvents, setMyEvents] = useState<MfaEventPage | null>(null);
  const [config, setConfig] = useState<MfaConfigurationReport | null>(null);

  const [complianceFilter, setComplianceFilter] = useState<"" | MfaComplianceState>("");
  const [exemptUser, setExemptUser] = useState("");
  const [exemptReason, setExemptReason] = useState("");
  const [exemptDays, setExemptDays] = useState(30);

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
      const [self, selfEvents, configuration] = await Promise.all([
        mfaAssuranceApi.me(),
        mfaAssuranceApi.myEvents({ limit: 25 }),
        mfaAssuranceApi.configuration(),
      ]);
      setMine(self); setMyEvents(selfEvents); setConfig(configuration);
      if (!canAdminister) return;
      const [s, c, g, p, l, x, e] = await Promise.all([
        mfaAssuranceApi.summary(),
        mfaAssuranceApi.coverage(),
        mfaAssuranceApi.gaps(),
        mfaAssuranceApi.policy(),
        mfaAssuranceApi.locks(),
        mfaAssuranceApi.exemptions(),
        mfaAssuranceApi.events({ limit: 50 }),
      ]);
      setSummary(s); setCoverage(c); setGaps(g); setPolicy(p);
      setLocks(l.locks); setExemptions(x.exemptions); setEvents(e);
    });
  }, [run, canAdminister]);

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const reloadCoverage = (compliance: "" | MfaComplianceState) =>
    run("coverage", async () => {
      setComplianceFilter(compliance);
      setCoverage(await mfaAssuranceApi.coverage(compliance ? { compliance } : undefined));
    });

  const savePolicy = (patch: Parameters<typeof mfaAssuranceApi.savePolicy>[0]) =>
    run("policy", async () => {
      const saved = await mfaAssuranceApi.savePolicy(patch);
      setPolicy(saved);
      await refresh();
      return "Policy saved. It applies to this platform's own login and verification paths only.";
    });

  const clearLock = (userId: string) =>
    run(`lock:${userId}`, async () => {
      await mfaAssuranceApi.clearLock(userId);
      const l = await mfaAssuranceApi.locks();
      setLocks(l.locks);
      return "Lock lifted. The lift itself is recorded in the ledger.";
    });

  const grantExemption = () =>
    run("exempt", async () => {
      await mfaAssuranceApi.grantExemption({ userId: exemptUser.trim(), reason: exemptReason.trim(), days: exemptDays });
      setExemptUser(""); setExemptReason("");
      const x = await mfaAssuranceApi.exemptions();
      setExemptions(x.exemptions);
      return "Exemption recorded. It shows as 'exempt' in coverage, never as covered, and expires on its own.";
    });

  const revokeExemption = (userId: string) =>
    run(`revoke:${userId}`, async () => {
      await mfaAssuranceApi.revokeExemption(userId);
      const x = await mfaAssuranceApi.exemptions();
      setExemptions(x.exemptions);
      return "Exemption revoked.";
    });

  const abandonEnrollment = () =>
    run("abandon", async () => {
      const res = await mfaAssuranceApi.abandonEnrollment();
      await refresh();
      return res.reason;
    });

  const visibleTabs = TABS.filter((t) => canAdminister || !t.adminOnly);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-text-bright">
            <ShieldCheck className="h-6 w-6 text-azure" /> MFA assurance
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            Second-factor coverage, policy, throttling and audit for this organization. Enrolment itself still
            happens on the account screen; this page is about what the platform can prove afterwards.
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
        {visibleTabs.map((t) => (
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

      {/* ── Overview ─────────────────────────────────────────────────── */}
      {tab === "overview" && canAdminister ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={<Users className="h-4 w-4" />}
              label="Members considered"
              value={summary?.membersConsidered ?? "—"}
              detail={summary?.truncated ? `of ${summary.membersTotal} — list truncated` : undefined}
            />
            <Stat
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Required members covered"
              value={<CoverageRatio ratio={summary?.requiredCoverageRatio ?? null} />}
              detail={summary ? `${summary.counts.covered} covered · ${summary.counts.not_required} not required` : undefined}
            />
            <Stat
              icon={<LockKeyhole className="h-4 w-4" />}
              label="Accounts throttled now"
              value={summary?.activeLocks ?? "—"}
            />
            <Stat
              icon={<ShieldQuestion className="h-4 w-4" />}
              label="Enrolments pending"
              value={summary?.pendingEnrollments ?? "—"}
              detail={summary?.staleEnrollments ? `${summary.staleEnrollments} older than a day` : undefined}
            />
          </div>

          {summary ? (
            <Card>
              <CardHeader>
                <CardTitle>Standing against the policy</CardTitle>
                <CardDescription>{MFA_POLICY_MODE_LABELS[summary.policy.mode]} · {MFA_ENFORCEMENT_LABELS[summary.policy.enforcement]}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(summary.counts) as MfaComplianceState[]).map((state) => (
                    <Badge key={state} variant={COMPLIANCE_VARIANT[state]}>
                      {MFA_COMPLIANCE_LABELS[state]}: {summary.counts[state]}
                    </Badge>
                  ))}
                </div>
                <Note>{summary.coverageNote}</Note>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Gaps</CardTitle>
              <CardDescription>Individually addressable, not a score.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {gaps && gaps.gaps.length ? (
                gaps.gaps.map((g, i) => (
                  <div key={`${g.kind}-${g.userId}-${i}`} className="flex items-start gap-3 rounded-lg border border-white/10 p-3">
                    <Badge variant={g.severity === "high" ? "crimson" : g.severity === "medium" ? "amber" : "slate"}>
                      {g.severity}
                    </Badge>
                    <div className="min-w-0">
                      <div className="truncate text-sm text-text-bright">{g.email ?? g.userId}</div>
                      <div className="text-xs text-text-muted">{g.detail}</div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-text-muted">
                  {gaps ? "No gaps visible in the members this report considered." : "Not loaded."}
                </p>
              )}
              {gaps ? <Note>{gaps.note}</Note> : null}
            </CardContent>
          </Card>

          {config ? (
            <Card>
              <CardHeader>
                <CardTitle>What this deployment is configured to do</CardTitle>
                <CardDescription>Configured — not verified.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>TOTP: {config.totp.algorithm}, {config.totp.digits} digits, {config.totp.periodSeconds}s period, ±{config.totp.driftWindows} window</div>
                  <div>Secret at rest: {config.secretStorage.encryption} · key from {config.secretStorage.keySource.replace("_", " ")}</div>
                  <div>Throttle: {config.throttle.maxFailedAttempts} failures / {config.throttle.windowSeconds}s → {config.throttle.lockoutSeconds}s lock</div>
                  <div>Replay guard: {config.replayGuard.enabled ? `${config.replayGuard.seconds}s` : "off"}</div>
                </div>
                <Note>{config.configNote}</Note>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ── Coverage ─────────────────────────────────────────────────── */}
      {tab === "coverage" && canAdminister ? (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Coverage</CardTitle>
              <CardDescription>
                {coverage ? `${coverage.membersConsidered} of ${coverage.membersTotal} members` : "Not loaded."}
                {coverage?.truncated ? " · truncated" : ""}
              </CardDescription>
            </div>
            <Select
              className="max-w-xs"
              value={complianceFilter}
              onChange={(e) => void reloadCoverage(e.target.value as "" | MfaComplianceState)}
            >
              <option value="">All standings</option>
              {(Object.keys(MFA_COMPLIANCE_LABELS) as MfaComplianceState[]).map((s) => (
                <option key={s} value={s}>{MFA_COMPLIANCE_LABELS[s]}</option>
              ))}
            </Select>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-text-muted">
                  <tr>
                    <th className="py-2 pr-3">Member</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Standing</th>
                    <th className="py-2 pr-3">Enrolment</th>
                    <th className="py-2 pr-3">Recovery</th>
                    <th className="py-2 pr-3">Grace ends</th>
                  </tr>
                </thead>
                <tbody>
                  {(coverage?.members ?? []).map((m) => (
                    <tr key={m.userId} className="border-t border-white/5">
                      <td className="py-2 pr-3 text-text-bright">{m.email ?? m.userId}</td>
                      <td className="py-2 pr-3 text-text-muted">{m.membershipRole}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={COMPLIANCE_VARIANT[m.compliance]}>{MFA_COMPLIANCE_LABELS[m.compliance]}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-text-muted">{m.enrollmentState}</td>
                      <td className="py-2 pr-3 text-text-muted">
                        {m.enrolled ? `${m.recoveryCodesRemaining} left${m.recoveryLow ? " ⚠" : ""}` : "—"}
                      </td>
                      <td className="py-2 pr-3 text-text-muted">{m.graceEndsAt ? when(m.graceEndsAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {coverage ? <Note>{coverage.enrollmentNote}</Note> : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Policy ───────────────────────────────────────────────────── */}
      {tab === "policy" && canAdminister && policy ? (
        <Card>
          <CardHeader>
            <CardTitle>Policy</CardTitle>
            <CardDescription>
              {policy.source === "default"
                ? "Never saved — these are the defaults, which reproduce the platform's historical behaviour."
                : `Last saved ${when(policy.updatedAt)} by ${policy.updatedBy ?? "unknown"}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block space-y-1">
              <span className="text-xs uppercase text-text-muted">Who must enrol</span>
              <Select
                value={policy.mode}
                onChange={(e) => void savePolicy({ mode: e.target.value as MfaOrgPolicy["mode"] })}
                disabled={busy === "policy"}
              >
                {Object.entries(MFA_POLICY_MODE_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </Select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs uppercase text-text-muted">What happens to someone who has not</span>
              <Select
                value={policy.enforcement}
                onChange={(e) => void savePolicy({ enforcement: e.target.value as MfaOrgPolicy["enforcement"] })}
                disabled={busy === "policy"}
              >
                {Object.entries(MFA_ENFORCEMENT_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </Select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs uppercase text-text-muted">Grace (days)</span>
                <Input
                  type="number" min={0} max={90} defaultValue={policy.graceDays}
                  onBlur={(e) => {
                    const graceDays = Number(e.target.value);
                    if (graceDays !== policy.graceDays) void savePolicy({ graceDays });
                  }}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase text-text-muted">Recovery-code floor</span>
                <Input
                  type="number" min={0} max={10} defaultValue={policy.recoveryCodeFloor}
                  onBlur={(e) => {
                    const recoveryCodeFloor = Number(e.target.value);
                    if (recoveryCodeFloor !== policy.recoveryCodeFloor) void savePolicy({ recoveryCodeFloor });
                  }}
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-text-main">
              <input
                type="checkbox"
                checked={policy.allowRecoveryCodes}
                onChange={(e) => void savePolicy({ allowRecoveryCodes: e.target.checked })}
              />
              Accept recovery codes as a second factor
            </label>

            <Note>{policy.enforcementNote}</Note>
            <Note>{policy.note}</Note>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Lockouts ─────────────────────────────────────────────────── */}
      {tab === "locks" && canAdminister ? (
        <Card>
          <CardHeader>
            <CardTitle>Lockouts and failed attempts</CardTitle>
            <CardDescription>Only members with a live failure count appear here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {locks.length ? locks.map((l) => (
              <div key={l.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-text-bright">{l.email ?? l.userId}</div>
                  <div className="text-xs text-text-muted">
                    {l.failedAttempts} failure(s) in the last {Math.round(l.windowSeconds / 60)} min
                    {l.locked ? ` · locked for another ${l.retryAfterSeconds}s` : " · not locked"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {l.locked ? <Badge variant="crimson">locked</Badge> : <Badge variant="amber">failing</Badge>}
                  <Button size="sm" variant="secondary" onClick={() => void clearLock(l.userId)} disabled={busy === `lock:${l.userId}`}>
                    <Timer className="h-4 w-4" /> Lift
                  </Button>
                </div>
              </div>
            )) : <p className="text-sm text-text-muted">Nobody in this organization is currently failing verification.</p>}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Exemptions ───────────────────────────────────────────────── */}
      {tab === "exemptions" && canAdminister ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Record an exemption</CardTitle>
              <CardDescription>A documented decision to accept the risk for one account, with an expiry.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="User id" value={exemptUser} onChange={(e) => setExemptUser(e.target.value)} />
              <Input
                placeholder="Why (at least 10 characters — this is the audit record)"
                value={exemptReason}
                onChange={(e) => setExemptReason(e.target.value)}
              />
              <div className="flex items-center gap-3">
                <Input
                  type="number" min={1} max={180} className="max-w-[8rem]"
                  value={exemptDays} onChange={(e) => setExemptDays(Number(e.target.value))}
                />
                <span className="text-xs text-text-muted">days</span>
                <Button
                  onClick={() => void grantExemption()}
                  disabled={busy === "exempt" || exemptUser.trim().length === 0 || exemptReason.trim().length < 10}
                >
                  <UserMinus className="h-4 w-4" /> Record
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recorded exemptions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {exemptions.length ? exemptions.map((x) => (
                <div key={x.userId} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-white/10 p-3">
                  <div className="min-w-0">
                    <div className="text-sm text-text-bright">{x.userId}</div>
                    <div className="text-xs text-text-muted">{x.reason}</div>
                    <div className="text-[11px] text-text-muted">
                      granted {when(x.grantedAt)} by {x.grantedBy ?? "unknown"} · expires {when(x.expiresAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={x.active ? "violet" : "slate"}>{x.active ? "active" : "expired"}</Badge>
                    <Button size="sm" variant="secondary" onClick={() => void revokeExemption(x.userId)} disabled={busy === `revoke:${x.userId}`}>
                      Revoke
                    </Button>
                  </div>
                </div>
              )) : <p className="text-sm text-text-muted">No exemptions recorded.</p>}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ── Ledger ───────────────────────────────────────────────────── */}
      {tab === "ledger" && canAdminister ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ScrollText className="h-4 w-4" /> Organization ledger</CardTitle>
            <CardDescription>{events ? `${events.returned} event(s)` : "Not loaded."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(events?.events ?? []).map((e) => (
              <div key={e.id} className="flex flex-wrap items-baseline gap-2 rounded-lg border border-white/10 p-2 text-xs">
                <Badge variant="slate">{e.kind}</Badge>
                <span className="text-text-muted">{when(e.at)}</span>
                {e.userId ? <span className="text-text-main">user {e.userId}</span> : null}
                {e.reason ? <span className="text-text-muted">· {e.reason}</span> : null}
              </div>
            ))}
            {events ? <Note>{events.note}</Note> : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ── My second factor ─────────────────────────────────────────── */}
      {tab === "me" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> My standing</CardTitle>
              <CardDescription>
                {mine ? MFA_COMPLIANCE_LABELS[mine.compliance] : "Not loaded."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {mine ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>Second factor: {mine.enabled ? "enrolled" : "not enrolled"}</div>
                    <div>Enrolment state: {mine.enrollment.state}</div>
                    <div>Confirmed: {when(mine.enrollment.confirmedAt)}</div>
                    <div>Last verified: {when(mine.enrollment.lastVerifiedAt)}</div>
                    <div>Recovery codes left: {mine.recovery.remaining} of {mine.recovery.issued}</div>
                    <div>Grace ends: {mine.graceEndsAt ? when(mine.graceEndsAt) : "—"}</div>
                  </div>
                  {mine.lock.locked ? (
                    <div className="rounded-lg border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">
                      Verification is throttled for another {mine.lock.retryAfterSeconds}s after {mine.lock.failedAttempts} failed attempts.
                    </div>
                  ) : null}
                  {mine.recovery.exhausted ? <Note>{mine.recovery.note}</Note> : null}
                  {mine.enrollment.state === "pending" ? (
                    <div className="space-y-2">
                      <Note>
                        A secret was issued but no verification has ever succeeded against it. If you never finished
                        scanning it, clear it here rather than being challenged for a code you cannot produce.
                      </Note>
                      <Button variant="secondary" onClick={() => void abandonEnrollment()} disabled={busy === "abandon"}>
                        Clear pending enrolment
                      </Button>
                    </div>
                  ) : null}
                  {mine.enrollment.state === "unrecorded" ? <Note>{mine.enrollment.note}</Note> : null}
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>My recent second-factor events</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(myEvents?.events ?? []).map((e) => (
                <div key={e.id} className="flex flex-wrap items-baseline gap-2 rounded-lg border border-white/10 p-2 text-xs">
                  <Badge variant="slate">{e.kind}</Badge>
                  <span className="text-text-muted">{when(e.at)}</span>
                  {e.reason ? <span className="text-text-muted">· {e.reason}</span> : null}
                </div>
              ))}
              {myEvents && myEvents.events.length === 0 ? (
                <p className="text-sm text-text-muted">Nothing recorded since this ledger was introduced.</p>
              ) : null}
              {myEvents ? <Note>{myEvents.note}</Note> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
