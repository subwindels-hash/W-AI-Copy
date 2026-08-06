/**
 * Session 120 — Public API Gateway console.
 *
 * The public surface itself is an external-consumer API authenticated with
 * organization keys, so this page is the *internal* management view: the
 * per-key call ledger, recent calls, and a static reference of the stable
 * endpoint surface.
 *
 * Honesty rules:
 *   - every number comes from `GET /api/v1/apikeys/usage`; a missing measure
 *     prints "not recorded", never 0;
 *   - `ledgerAvailable: false` is shown as a banner — an unreadable ledger is
 *     not an empty one;
 *   - the ledger-start line is displayed so days before it are not read as
 *     zero-call days;
 *   - the endpoint list is labelled as documentation, not as measured data.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BookOpen, KeyRound, RefreshCw } from "lucide-react";
import type { PubUsageReport } from "@windels/shared/publicApi";
import { publicApiUsageApi } from "@/lib/publicApi";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useAuthStore } from "@/store/auth";

/** Null-aware rendering: a missing measure is "not recorded", never 0. */
function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "not recorded" : String(n);
}

const ENDPOINT_REFERENCE: Array<{ method: string; path: string; scope: string; note: string }> = [
  { method: "GET", path: "/api/rest/v1", scope: "any key", note: "gateway identity + organization" },
  { method: "GET", path: "/api/rest/v1/workflows", scope: "READ", note: "list workflows (?limit=1..200)" },
  { method: "GET", path: "/api/rest/v1/workflows/:id", scope: "READ", note: "workflow detail incl. node graph" },
  { method: "POST", path: "/api/rest/v1/workflows/:id/run", scope: "WRITE|ADMIN", note: "trigger a workflow run (201)" },
  { method: "GET", path: "/api/rest/v1/agents", scope: "READ", note: "list agents (?limit=1..200)" },
  { method: "GET", path: "/api/rest/v1/talk/channels", scope: "READ", note: "list channels (?limit=1..200)" },
  { method: "POST", path: "/api/rest/v1/talk/channels/:id/messages", scope: "WRITE|ADMIN", note: "send a channel message (201)" },
  { method: "GET", path: "/api/rest/v1/usage", scope: "READ", note: "per-key call ledger report" },
];

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-text-bright">{value}</div>
      {hint ? <div className="mt-1 text-xs text-text-muted">{hint}</div> : null}
    </Card>
  );
}

export function PublicApiPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [windowDays, setWindowDays] = useState(7);
  const [report, setReport] = useState<PubUsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await publicApiUsageApi.usage(windowDays);
      setReport(data);
    } catch (e) {
      setError((e as Error).message);
      setReport(null);
    }
  }, [windowDays]);

  useEffect(() => {
    void load();
  }, [load, accessToken]);

  const nameOf = (keyId: string): string =>
    report?.perKey.find((k) => k.keyId === keyId)?.name ?? "deleted key";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-bright">Public API</h1>
          <p className="mt-1 text-sm text-text-muted">
            External REST surface at <code className="rounded bg-white/10 px-1">{"/api/rest/v1"}</code>,
            authenticated with organization API keys (<code className="rounded bg-white/10 px-1">Authorization: Bearer wnd_…</code>).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(windowDays)} onChange={(e) => setWindowDays(Number(e.target.value))} className="w-40">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="mt-4 flex items-center gap-2 p-4 text-sm text-crimson">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </Card>
      ) : null}

      {report ? (
        <>
          {!report.ledgerAvailable ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              The call ledger could not be read. Usage numbers below are empty, not zero.
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total calls" value={fmt(report.totalCalls)} hint="lifetime, from the ledger" />
            <StatCard label={`Calls in ${report.windowDays}d`} value={fmt(report.callsInWindow)} hint={`${report.distinctUseDays} day(s) with recorded calls`} />
            <StatCard label="Calls today" value={fmt(report.callsToday)} hint="current UTC day" />
            <StatCard
              label="Avg calls / covered day"
              value={fmt(report.avgCallsPerDay)}
              hint={report.ledgerCoveredDays > 0 ? `over ${report.ledgerCoveredDays} covered day(s)` : "no covered day in window"}
            />
          </div>

          <p className="mt-3 text-xs text-text-muted">
            Ledger began{" "}
            {report.ledgerStart ? new Date(report.ledgerStart).toLocaleString() : "… never (no call recorded yet)"}
            {" — "}
            days before that are not reported as zero-call days.
          </p>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <KeyRound className="h-4 w-4" />Keys &amp; usage
              </CardTitle>
              <CardDescription>
                counts come from the call ledger; identifiers from the database. A deleted key keeps its counts with
                no name.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.perKey.length === 0 ? (
                <p className="text-sm text-text-muted">No API keys exist for this organization.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-text-muted">
                        <th className="py-2 pr-3">Key</th>
                        <th className="py-2 pr-3">Prefix</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3 text-right">Calls</th>
                        <th className="py-2 pr-3 text-right">In window</th>
                        <th className="py-2 pr-3 text-right">Today</th>
                        <th className="py-2 pr-3">Last used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.perKey.map((k) => (
                        <tr key={k.keyId} className="border-b border-white/5">
                          <td className="py-2 pr-3 font-medium text-text-bright">
                            {k.name ?? <em className="text-text-muted">deleted key</em>}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs text-text-muted">{k.keyPrefix ?? "—"}</td>
                          <td className="py-2 pr-3">
                            {k.revoked ? <Badge variant="crimson">revoked</Badge> : <Badge variant="emerald">active</Badge>}
                          </td>
                          <td className="py-2 pr-3 text-right">{fmt(k.calls)}</td>
                          <td className="py-2 pr-3 text-right">{fmt(k.callsInWindow)}</td>
                          <td className="py-2 pr-3 text-right">{fmt(k.callsToday)}</td>
                          <td className="py-2 pr-3 text-xs text-text-muted">
                            {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "never"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent calls</CardTitle>
                <CardDescription>the last {report.recentCalls.length > 0 ? report.recentCalls.length : ""} recorded requests</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1.5">
                {report.recentCalls.length === 0 ? (
                  <p className="text-sm text-text-muted">No calls have been recorded.</p>
                ) : (
                  report.recentCalls.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Badge variant="slate" className="font-mono">{c.method}</Badge>
                      <code className="flex-1 truncate rounded bg-white/5 px-1.5 py-0.5">{c.path}</code>
                      <span className="shrink-0 text-text-muted">{nameOf(c.keyId)}</span>
                      <span className="shrink-0 text-text-muted">{new Date(c.at).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BookOpen className="h-4 w-4" />Endpoint reference
                </CardTitle>
                <CardDescription>documentation of the stable surface — not measured data</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1">
                {ENDPOINT_REFERENCE.map((e) => (
                  <div key={`${e.method} ${e.path}`} className="flex items-center gap-2 text-xs">
                    <Badge variant="slate" className="w-12 justify-center font-mono">{e.method}</Badge>
                    <code className="flex-1 truncate rounded bg-white/5 px-1.5 py-0.5">{e.path}</code>
                    <span className="shrink-0 text-text-muted">{e.scope}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <p className="mt-3 text-xs text-text-muted">{report.note}</p>
        </>
      ) : !error ? (
        <Card className="mt-4 p-6 text-center text-sm text-text-muted">Loading usage…</Card>
      ) : null}
    </div>
  );
}

// Re-export so lazy imports can use `.then(m => m.PublicApiPage)` uniformly.
export default PublicApiPage;
