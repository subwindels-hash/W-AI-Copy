/**
 * Session 114 — Google Identity governance.
 *
 * The OAuth flow already worked; what an operator could not do was see or
 * govern it. This page answers four questions and refuses to answer them with
 * anything it did not measure:
 *
 *   - **Who signs in with Google here?** The register of linked identities,
 *     with the domain, the last recorded sign-in and whether the platform
 *     account itself was created by Google.
 *   - **Who is allowed to?** The policy — open, a domain allowlist, linked
 *     accounts only, or disabled — with a dry-run box that evaluates an address
 *     and states plainly that it applied nothing.
 *   - **What happened?** The ledger, which says in its own payload that it only
 *     covers events recorded since it existed and is trimmed to a retention
 *     limit shown on screen.
 *   - **Is it configured?** A checklist read from the API process's
 *     environment. It never calls Google, so it reports "configured", never
 *     "working", and the banner says so.
 *
 * Figures that were never measured render as "none recorded" or "never", never
 * as a confident zero.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, Globe2, KeyRound, RefreshCw, RotateCcw,
  ScrollText, ShieldCheck, ShieldOff, Trash2, UserCheck,
} from "lucide-react";
import {
  googleAuthApi,
  googleSignIn,
  GOOGLE_MAX_ALLOWED_DOMAINS,
  GOOGLE_SIGNIN_MODES,
  GOOGLE_SIGNIN_MODE_LABELS,
  type GoogleAuthPolicy,
  type GoogleAuthSummary,
  type GoogleEventList,
  type GoogleIdentityList,
  type GoogleLinkedIdentity,
  type GooglePolicyDryRun,
  type GoogleSignInMode,
} from "@/lib/googleAuth";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

type Tab = "overview" | "identities" | "policy" | "ledger" | "configuration";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "identities", label: "Linked identities" },
  { id: "policy", label: "Policy" },
  { id: "ledger", label: "Ledger" },
  { id: "configuration", label: "Configuration" },
];

const when = (iso: string | null, fallback = "never") =>
  iso ? new Date(iso).toLocaleString() : fallback;

/** A count that may legitimately be "nothing was recorded", not zero activity. */
function Recorded({ value, unit }: { value: number; unit: string }) {
  if (value === 0) return <span className="italic text-text-muted">none recorded</span>;
  return <span className="text-text-bright">{value.toLocaleString()} {unit}</span>;
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

function StatusBadge({ status }: { status: GoogleLinkedIdentity["status"] }) {
  return status === "active"
    ? <Badge variant="emerald">active</Badge>
    : <Badge variant="crimson">revoked</Badge>;
}

function CheckRow({ status, label, detail }: { status: "pass" | "warn" | "fail"; label: string; detail: string }) {
  const icon = status === "pass"
    ? <CheckCircle2 size={16} className="text-emerald" />
    : status === "warn"
      ? <AlertTriangle size={16} className="text-amber" />
      : <ShieldOff size={16} className="text-crimson" />;
  return (
    <div className="flex items-start gap-3 border-b border-white/5 py-2 last:border-0">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-text-bright">{label}</div>
        <div className="text-xs text-text-muted">{detail}</div>
      </div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-azure/20 bg-azure/5 p-3 text-xs leading-relaxed text-text-muted">
      {children}
    </div>
  );
}

export function GoogleIdentityPage() {
  const user = useAuthStore((state) => state.user);
  const canAdminister = user?.role === "admin" || user?.role === "super_admin";

  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [summary, setSummary] = useState<GoogleAuthSummary | null>(null);
  const [identities, setIdentities] = useState<GoogleIdentityList | null>(null);
  const [ledger, setLedger] = useState<GoogleEventList | null>(null);
  const [policy, setPolicy] = useState<GoogleAuthPolicy | null>(null);

  const [statusFilter, setStatusFilter] = useState<"" | "active" | "revoked">("");
  const [search, setSearch] = useState("");

  const [mode, setMode] = useState<GoogleSignInMode>("open");
  const [domains, setDomains] = useState("");
  const [blockRevoked, setBlockRevoked] = useState(true);
  const [policyNote, setPolicyNote] = useState("");

  const [dryRunEmail, setDryRunEmail] = useState("");
  const [dryRun, setDryRun] = useState<GooglePolicyDryRun | null>(null);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Request failed.");
  }, []);

  const loadPolicyInto = useCallback((next: GoogleAuthPolicy) => {
    setPolicy(next);
    setMode(next.mode);
    setDomains(next.allowedDomains.join("\n"));
    setBlockRevoked(next.blockRevokedIdentities);
    setPolicyNote(next.note ?? "");
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [nextSummary, nextIdentities, nextPolicy] = await Promise.all([
        googleAuthApi.summary(),
        googleAuthApi.identities({
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(search.trim() ? { q: search.trim() } : {}),
        }),
        googleAuthApi.policy(),
      ]);
      setSummary(nextSummary);
      setIdentities(nextIdentities);
      loadPolicyInto(nextPolicy);
      if (canAdminister) {
        try {
          setLedger(await googleAuthApi.events({ limit: 100 }));
        } catch {
          // The ledger is administrator-only; a member simply does not see it.
          setLedger(null);
        }
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [canAdminister, fail, loadPolicyInto, search, statusFilter]);

  useEffect(() => { void refresh(); }, [refresh]);

  const savePolicy = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const list = domains.split(/[\s,]+/).map((d) => d.trim()).filter(Boolean);
      const saved = await googleAuthApi.savePolicy({
        mode,
        allowedDomains: list,
        blockRevokedIdentities: blockRevoked,
        note: policyNote.trim() ? policyNote.trim() : null,
      });
      loadPolicyInto(saved);
      setNotice("Policy saved. It applies to the next Google sign-in; sessions already issued are unaffected.");
      void refresh();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const resetPolicy = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      loadPolicyInto(await googleAuthApi.resetPolicy());
      setNotice("Stored policy removed. The platform default (open) applies again.");
      void refresh();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const runDryRun = async () => {
    setBusy(true); setError(null);
    try {
      setDryRun(await googleAuthApi.evaluate({ email: dryRunEmail.trim(), emailVerified: true }));
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await fn();
      setNotice(message);
      void refresh();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const modeBadge = useMemo(() => {
    if (!policy) return null;
    const variant = policy.mode === "disabled" ? "crimson"
      : policy.mode === "open" ? "azure"
        : "amber";
    return <Badge variant={variant as never}>{policy.mode}{policy.isDefault ? " (platform default)" : ""}</Badge>;
  }, [policy]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-text-bright">
            <KeyRound size={22} className="text-azure" /> Google Identity
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            Who may sign in to this organization with a Google account, which accounts are linked,
            and what was recorded. Google sign-in is separate from email/password sign-in, API keys
            and enterprise SSO — this page governs the Google path only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {modeBadge}
          <Button variant="secondary" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw size={15} className={busy ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-crimson/30 bg-crimson/10 p-3 text-sm text-crimson">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald/30 bg-emerald/10 p-3 text-sm text-emerald">{notice}</div>
      ) : null}

      <nav className="flex flex-wrap gap-2">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              tab === entry.id
                ? "border-azure/40 bg-azure/15 text-azure"
                : "border-white/10 bg-white/5 text-text-muted hover:text-text-bright"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {/* ── Overview ─────────────────────────────────────────────────── */}
      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              icon={<UserCheck size={18} />}
              label="Linked identities"
              value={summary ? summary.identities.total.toLocaleString() : "—"}
              detail={summary ? `${summary.identities.active} active · ${summary.identities.revoked} revoked` : undefined}
            />
            <Stat
              icon={<Clock size={18} />}
              label="Sign-ins recorded (30 days)"
              value={summary ? <Recorded value={summary.signIns.last30d} unit="" /> : "—"}
              detail={summary ? `last: ${when(summary.signIns.lastAt)}` : undefined}
            />
            <Stat
              icon={<ShieldOff size={18} />}
              label="Refusals recorded (30 days)"
              value={summary ? <Recorded value={summary.signIns.blocked30d} unit="" /> : "—"}
              detail="Attempts the policy turned away."
            />
            <Stat
              icon={<ShieldCheck size={18} />}
              label="Configuration"
              value={summary ? (summary.config.ready ? "ready" : summary.config.enabled ? "check needed" : "not configured") : "—"}
              detail={summary ? `${summary.config.checks.filter((c) => c.status === "pass").length}/${summary.config.checks.length} checks pass` : undefined}
            />
          </div>

          {summary ? <Note>{summary.ledgerNote}</Note> : null}

          <Card>
            <CardHeader>
              <CardTitle>Domains observed</CardTitle>
              <CardDescription>
                Derived from the linked identities in this organization — not from a directory listing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary && summary.domains.length ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-text-muted">
                    <tr><th className="py-1">Domain</th><th>Identities</th><th>Active</th><th>Last recorded sign-in</th></tr>
                  </thead>
                  <tbody>
                    {summary.domains.map((d) => (
                      <tr key={d.domain} className="border-t border-white/5">
                        <td className="py-2 text-text-bright">{d.domain}</td>
                        <td>{d.identities}</td>
                        <td>{d.activeIdentities}</td>
                        <td className="text-text-muted">{when(d.lastSignInAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm italic text-text-muted">
                  No Google identity has been recorded for this organization yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ── Linked identities ────────────────────────────────────────── */}
      {tab === "identities" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-text-muted">Status</label>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as never)}>
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="revoked">Revoked</option>
              </Select>
            </div>
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs text-text-muted">Search email or name</label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="person@windels.ai" />
            </div>
          </div>

          {identities ? <Note>{identities.privacyNote}</Note> : null}

          <Card>
            <CardContent className="p-0">
              {identities && identities.identities.length ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-text-muted">
                    <tr>
                      <th className="p-3">Account</th><th>Status</th><th>Recorded sign-ins</th>
                      <th>Last sign-in</th><th>Origin</th><th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {identities.identities.map((identity) => (
                      <tr key={identity.id} className="border-t border-white/5 align-top">
                        <td className="p-3">
                          <div className="font-semibold text-text-bright">{identity.email}</div>
                          <div className="text-xs text-text-muted">
                            {identity.displayName ?? "no display name recorded"} · fingerprint {identity.subjectFingerprint.slice(0, 12)}…
                          </div>
                          {identity.revokeReason ? (
                            <div className="text-xs text-crimson">revoked: {identity.revokeReason}</div>
                          ) : null}
                        </td>
                        <td><StatusBadge status={identity.status} /></td>
                        <td><Recorded value={identity.recordedSignIns} unit="" /></td>
                        <td className="text-text-muted">{when(identity.lastSignInAt)}</td>
                        <td className="text-xs text-text-muted">
                          {identity.provisionedByGoogle ? "account created by Google sign-in" : "linked to an existing account"}
                        </td>
                        <td className="p-3 text-right">
                          {canAdminister ? (
                            <div className="flex justify-end gap-2">
                              {identity.status === "active" ? (
                                <Button
                                  variant="secondary"
                                  onClick={() => void act(
                                    () => googleAuthApi.revoke(identity.id, "Revoked from the Google Identity console."),
                                    "Identity revoked. Future Google sign-ins for that account are refused.",
                                  )}
                                  disabled={busy}
                                >
                                  <ShieldOff size={14} /> Revoke
                                </Button>
                              ) : (
                                <Button
                                  variant="secondary"
                                  onClick={() => void act(() => googleAuthApi.restore(identity.id), "Identity restored to active.")}
                                  disabled={busy}
                                >
                                  <RotateCcw size={14} /> Restore
                                </Button>
                              )}
                              <Button
                                variant="secondary"
                                onClick={() => void act(
                                  () => googleAuthApi.unlink(identity.id),
                                  "Register entry removed. The platform user and its sessions are unchanged.",
                                )}
                                disabled={busy}
                              >
                                <Trash2 size={14} /> Unlink
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs italic text-text-muted">administrator only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="p-6 text-sm italic text-text-muted">
                  No linked Google identity matches this filter. An identity is recorded the first
                  time an account completes a Google sign-in.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ── Policy ───────────────────────────────────────────────────── */}
      {tab === "policy" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Sign-in policy</CardTitle>
              <CardDescription>
                {policy?.isDefault
                  ? "No policy is stored; the platform default is in force."
                  : `Last changed ${when(policy?.updatedAt ?? null, "unknown")}${policy?.updatedBy ? ` by ${policy.updatedBy}` : ""}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-text-muted">Mode</label>
                <Select value={mode} onChange={(e) => setMode(e.target.value as GoogleSignInMode)} disabled={!canAdminister}>
                  {GOOGLE_SIGNIN_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
                <p className="mt-1 text-xs text-text-muted">{GOOGLE_SIGNIN_MODE_LABELS[mode]}</p>
              </div>

              {mode === "domain_allowlist" ? (
                <div>
                  <label className="mb-1 block text-xs text-text-muted">
                    Allowed domains (one per line, up to {GOOGLE_MAX_ALLOWED_DOMAINS})
                  </label>
                  <Textarea
                    rows={5}
                    value={domains}
                    onChange={(e) => setDomains(e.target.value)}
                    placeholder={"windels.ai\nexample.com"}
                    disabled={!canAdminister}
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    Matched exactly against the address domain. Wildcards are rejected, and a
                    subdomain is not a match for its parent.
                  </p>
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm text-text-main">
                <input
                  type="checkbox"
                  checked={blockRevoked}
                  onChange={(e) => setBlockRevoked(e.target.checked)}
                  disabled={!canAdminister}
                />
                Refuse revoked identities regardless of mode
              </label>

              <div>
                <label className="mb-1 block text-xs text-text-muted">Operator note</label>
                <Textarea
                  rows={2}
                  value={policyNote}
                  onChange={(e) => setPolicyNote(e.target.value)}
                  placeholder="Why this policy is set this way"
                  disabled={!canAdminister}
                />
              </div>

              {canAdminister ? (
                <div className="flex gap-2">
                  <Button onClick={() => void savePolicy()} disabled={busy}>Save policy</Button>
                  <Button variant="secondary" onClick={() => void resetPolicy()} disabled={busy || policy?.isDefault}>
                    Reset to default
                  </Button>
                </div>
              ) : (
                <p className="text-xs italic text-text-muted">Only an administrator can change this policy.</p>
              )}

              {policy ? <Note>{policy.policyNote}</Note> : null}
              {policy ? <Note>{policy.provisioningNote}</Note> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dry run</CardTitle>
              <CardDescription>
                Evaluates an address against the stored policy. Nothing is signed in and nothing is
                written to the ledger.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={dryRunEmail}
                  onChange={(e) => setDryRunEmail(e.target.value)}
                  placeholder="person@example.com"
                />
                <Button onClick={() => void runDryRun()} disabled={busy || !dryRunEmail.trim() || !canAdminister}>
                  Evaluate
                </Button>
              </div>
              {!canAdminister ? (
                <p className="text-xs italic text-text-muted">Dry runs are administrator-only.</p>
              ) : null}
              {dryRun ? (
                <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center gap-2">
                    {dryRun.allowed
                      ? <Badge variant="emerald">would be allowed</Badge>
                      : <Badge variant="crimson">would be refused</Badge>}
                    <Badge variant="slate">{dryRun.outcome}</Badge>
                    <Badge variant="secondary">applied: no</Badge>
                  </div>
                  <p className="text-sm text-text-main">{dryRun.reason}</p>
                  <p className="text-xs text-text-muted">{dryRun.note}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ── Ledger ───────────────────────────────────────────────────── */}
      {tab === "ledger" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ScrollText size={16} /> Recorded events</CardTitle>
            <CardDescription>
              {ledger
                ? `${ledger.stored} entr${ledger.stored === 1 ? "y" : "ies"} held, retention limit ${ledger.retentionLimit}. Oldest: ${when(ledger.oldestAt, "none")}.`
                : "Administrator access is required to read the ledger."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ledger ? <Note>{ledger.ledgerNote}</Note> : null}
            {ledger && ledger.events.length ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-text-muted">
                  <tr><th className="py-1">When</th><th>Kind</th><th>Account</th><th>What happened</th></tr>
                </thead>
                <tbody>
                  {ledger.events.map((event) => (
                    <tr key={event.id} className="border-t border-white/5 align-top">
                      <td className="py-2 pr-3 text-text-muted">{when(event.at)}</td>
                      <td className="pr-3"><Badge variant={event.kind === "blocked" ? "crimson" : "slate"}>{event.kind}</Badge></td>
                      <td className="pr-3 text-text-bright">{event.email ?? <span className="italic text-text-muted">n/a</span>}</td>
                      <td className="text-text-main">{event.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : ledger ? (
              <p className="text-sm italic text-text-muted">No events have been recorded for this organization yet.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Configuration ────────────────────────────────────────────── */}
      {tab === "configuration" ? (
        <div className="space-y-4">
          {summary ? <Note>{summary.config.note}</Note> : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Readiness checks</CardTitle>
                <CardDescription>
                  {summary
                    ? summary.config.ready
                      ? "Every check passes. Only a real sign-in proves Google accepts these values."
                      : "At least one check does not pass."
                    : "—"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summary?.config.checks.map((check) => (
                  <CheckRow key={check.id} status={check.status} label={check.label} detail={check.detail} />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Globe2 size={16} /> Endpoints and scopes</CardTitle>
                <CardDescription>Fixed by Google; shown so a redirect URI can be checked against them.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-text-muted">
                <div><span className="text-text-bright">Client ID:</span> {summary?.config.clientIdMasked ?? "not set"}</div>
                <div><span className="text-text-bright">Client secret:</span> {summary?.config.clientSecretPresent ? "present (never returned)" : "not set"}</div>
                <div><span className="text-text-bright">Redirect URI:</span> {summary?.config.redirectUri ?? "not set"}</div>
                <div><span className="text-text-bright">Callback served at:</span> {summary?.config.expectedCallbackPath}</div>
                <div><span className="text-text-bright">Scopes:</span> {summary?.config.scopes.join(" ")}</div>
                <div><span className="text-text-bright">Authorization:</span> {summary?.config.authorizationEndpoint}</div>
                <div><span className="text-text-bright">Token:</span> {summary?.config.tokenEndpoint}</div>
                <div><span className="text-text-bright">JWKS:</span> {summary?.config.jwksEndpoint}</div>
                <div className="pt-2">
                  <a className="text-azure hover:underline" href={googleSignIn.startUrl("/app/google-identity")}>
                    Start a Google sign-in from this deployment
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default GoogleIdentityPage;
