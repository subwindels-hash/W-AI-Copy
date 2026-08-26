import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Bitcoin, Coins, KeyRound, RefreshCw, Save, ShieldCheck, TestTube2, Webhook } from "lucide-react";
import type { BlockonomicsAdminDashboard, BlockonomicsAdminPublicConfig, BlockonomicsAsset, BlockonomicsReconciliationResult, BlockonomicsReconciliationTimeframe } from "@windels/shared/payments";
import { blockonomicsAssetDisplayName, blockonomicsAssetNetworkWarning, blockonomicsNetworkLabel } from "@windels/shared/payments";
import { blockonomicsAdmin } from "@/lib/blockonomicsAdmin";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";

interface ConfigForm {
  apiKey: string;
  callbackSecret: string;
  testMode: boolean;
  matchCallback: string;
  supportedAssets: BlockonomicsAsset[];
  quoteExpiryMinutes: number;
}

function formFromConfig(config: BlockonomicsAdminPublicConfig): ConfigForm {
  return {
    apiKey: "",
    callbackSecret: "",
    testMode: config.testMode,
    matchCallback: config.matchCallback,
    supportedAssets: config.supportedAssets,
    quoteExpiryMinutes: config.quoteExpiryMinutes,
  };
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <Card><CardContent className="p-4"><div className="text-xs uppercase tracking-wide text-text-muted">{label}</div><div className="mt-1 text-2xl font-semibold text-text-bright">{value}</div><div className="mt-1 text-xs text-text-muted">{hint}</div></CardContent></Card>;
}

function CountRows({ rows, empty }: { rows: Array<{ status: string; count: number }>; empty: string }) {
  if (!rows.length) return <p className="text-sm text-text-muted">{empty}</p>;
  return <div className="space-y-2">{rows.map((row) => <div key={row.status} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"><span className="text-text-main">{row.status.replace("_", " ")}</span><Badge variant="outline">{row.count}</Badge></div>)}</div>;
}

export function BlockonomicsAdminPage() {
  const [dashboard, setDashboard] = useState<BlockonomicsAdminDashboard | null>(null);
  const [form, setForm] = useState<ConfigForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [assetSaving, setAssetSaving] = useState<BlockonomicsAsset | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconciliationTimeframe, setReconciliationTimeframe] = useState<BlockonomicsReconciliationTimeframe>("1M");
  const [reconciliationResult, setReconciliationResult] = useState<BlockonomicsReconciliationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await blockonomicsAdmin.dashboard();
      setDashboard(next);
      setForm((current) => current ?? formFromConfig(next.configuration));
      setError(null);
    } catch (cause: any) {
      setError(cause?.message ?? "Unable to load the Blockonomics control plane");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!dashboard || !form) return;
    setSaving(true);
    try {
      const updated = await blockonomicsAdmin.updateConfig({
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
        ...(form.callbackSecret.trim() ? { callbackSecret: form.callbackSecret.trim() } : {}),
        settings: {
          enabled: dashboard.configuration.enabled,
          testMode: form.testMode,
          matchCallback: form.matchCallback.trim(),
          supportedAssets: form.supportedAssets,
          quoteExpiryMinutes: form.quoteExpiryMinutes,
          requiredConfirmations: 2,
        },
      });
      setForm(formFromConfig(updated));
      toast.success("Encrypted Blockonomics configuration updated.");
      await load();
    } catch (cause: any) {
      toast.error(cause?.message ?? "Configuration update failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async () => {
    if (!dashboard) return;
    setToggling(true);
    try {
      const next = await blockonomicsAdmin.setEnabled(!dashboard.configuration.enabled);
      toast.success(`Blockonomics ${next.enabled ? "enabled" : "disabled"}.`);
      setForm(formFromConfig(next));
      await load();
    } catch (cause: any) {
      toast.error(cause?.message ?? "Provider state update failed");
    } finally {
      setToggling(false);
    }
  };

  const checkHealth = async () => {
    setProbing(true);
    try {
      const result = await blockonomicsAdmin.checkHealth();
      result.healthy ? toast.success(`Provider healthy (${result.latencyMs}ms).`) : toast.error(result.error ?? "Provider health check failed");
      await load();
    } catch (cause: any) {
      toast.error(cause?.message ?? "Provider health check failed");
    } finally {
      setProbing(false);
    }
  };

  const reconcile = async () => {
    setReconciling(true);
    try {
      const result = await blockonomicsAdmin.reconcile(reconciliationTimeframe);
      setReconciliationResult(result);
      result.issues.length
        ? toast.error(`Reconciliation completed with ${result.issues.length} review issue(s).`)
        : toast.success(`Reconciliation matched ${result.matched} payment(s).`);
      await load();
    } catch (cause: any) {
      toast.error(cause?.message ?? "Reconciliation failed");
    } finally {
      setReconciling(false);
    }
  };

  // Per-method ON/OFF switch. BTC and USDT are controlled independently and the
  // change is persisted immediately (audit-logged server-side), so the user
  // payment page reflects it without a separate "Save". Turning both off is a
  // valid state — cryptocurrency payments simply become unavailable.
  const toggleAsset = async (asset: BlockonomicsAsset, enabled: boolean) => {
    setAssetSaving(asset);
    try {
      const next = await blockonomicsAdmin.setAssetEnabled(asset, enabled);
      setForm((current) => (current ? { ...current, supportedAssets: next.supportedAssets } : current));
      toast.success(`${asset} payments ${enabled ? "enabled" : "disabled"}.`);
      await load();
    } catch (cause: any) {
      toast.error(cause?.message ?? `Could not update ${asset} availability`);
    } finally {
      setAssetSaving(null);
    }
  };

  const config = dashboard?.configuration;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Bitcoin className="h-7 w-7 text-amber-400" />
            <h1 className="text-2xl font-black text-text-bright">Blockonomics Payment Control</h1>
            <Badge variant="danger">Super Admin only</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">Encrypted provider credentials, enablement, read-only health probes, payment posture, callback failures, and reconciliation visibility.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={reconciliationTimeframe} onChange={(event) => setReconciliationTimeframe(event.target.value as BlockonomicsReconciliationTimeframe)} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-text-bright" aria-label="Reconciliation timeframe">
            {(["1W", "2W", "1M", "3M", "6M", "1Y"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={() => void reconcile()} loading={reconciling}><RefreshCw className="h-4 w-4" />Run reconciliation</Button>
          <Button variant="outline" size="sm" onClick={() => void checkHealth()} loading={probing}><Activity className="h-4 w-4" />Check provider health</Button>
          <Button variant="outline" size="sm" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
        </div>
      </header>

      {error ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div> : null}

      {dashboard && config ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Provider" value={config.enabled ? "Enabled" : "Disabled"} hint={config.configured ? `${config.source} configuration` : "credentials missing"} />
            <Stat label="Health" value={config.healthStatus.replaceAll("_", " ")} hint={config.lastHealthAt ? new Date(config.lastHealthAt).toLocaleString() : "not checked"} />
            <Stat label="Payments" value={dashboard.totals.payments.toLocaleString()} hint="durable PostgreSQL records" />
            <Stat label="Callback failures" value={dashboard.totals.failedWebhookEvents.toLocaleString()} hint={`${dashboard.totals.webhookEvents} callback events`} />
          </div>

          {config.lastError ? <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200"><AlertTriangle className="h-5 w-5 shrink-0" /><span>{config.lastError}</span></div> : null}

          {reconciliationResult ? (
            <Card>
              <CardHeader><CardTitle>Latest manual reconciliation</CardTitle><CardDescription>Run {reconciliationResult.runId} · {reconciliationResult.timeframe} · completed {new Date(reconciliationResult.completedAt).toLocaleString()}</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Stat label="Local scanned" value={String(reconciliationResult.localPaymentsScanned)} hint="durable records" />
                  <Stat label="Provider scanned" value={String(reconciliationResult.providerPaymentsScanned)} hint="authenticated history" />
                  <Stat label="Matched" value={String(reconciliationResult.matched)} hint="exact evidence" />
                  <Stat label="Settled" value={String(reconciliationResult.settled)} hint="atomic billing" />
                  <Stat label="Issues" value={String(reconciliationResult.issues.length)} hint="manual review" />
                </div>
                {reconciliationResult.issues.length ? <div className="max-h-64 space-y-2 overflow-auto">{reconciliationResult.issues.map((issue, index) => <div key={`${issue.kind}:${issue.paymentId ?? issue.providerTransactionId ?? index}`} className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs"><div className="font-medium text-amber-300">{issue.kind.replaceAll("_", " ")}</div><div className="mt-1 text-text-main">{issue.detail}</div>{issue.paymentId ? <div className="mt-1 font-mono text-text-muted">Payment {issue.paymentId}</div> : null}{issue.providerTransactionId ? <div className="mt-1 break-all font-mono text-text-muted">Transaction {issue.providerTransactionId}</div> : null}</div>)}</div> : <p className="text-sm text-emerald-300">No discrepancies were found.</p>}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" />Encrypted configuration</CardTitle><CardDescription>Secret fields are write-only. Leave them blank to retain the encrypted values already stored.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                {form ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label className="mb-1 block text-xs uppercase text-text-muted">API key</label><Input type="password" autoComplete="new-password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={config.apiKeyConfigured ? "Encrypted key configured" : "Enter provider API key"} /></div>
                      <div><label className="mb-1 block text-xs uppercase text-text-muted">Callback secret</label><Input type="password" autoComplete="new-password" value={form.callbackSecret} onChange={(event) => setForm({ ...form, callbackSecret: event.target.value })} placeholder={config.callbackSecretConfigured ? "Encrypted secret configured" : "Minimum 32 characters"} /></div>
                    </div>
                    <div><label className="mb-1 block text-xs uppercase text-text-muted">Callback match host</label><Input value={form.matchCallback} onChange={(event) => setForm({ ...form, matchCallback: event.target.value })} placeholder="payments.example.com" /></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label className="mb-1 block text-xs uppercase text-text-muted">Quote timer (minutes)</label><Input type="number" min={5} max={60} value={form.quoteExpiryMinutes} onChange={(event) => setForm({ ...form, quoteExpiryMinutes: Number(event.target.value) })} /></div>
                      <label className="flex items-center gap-2 self-end rounded-md border border-border p-3 text-sm text-text-main"><input type="checkbox" checked={form.testMode} onChange={(event) => setForm({ ...form, testMode: event.target.checked })} /><TestTube2 className="h-4 w-4" />Blockonomics Test Mode</label>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs uppercase text-text-muted">Cryptocurrency payment methods</div>
                      <p className="text-xs text-text-muted">Enable each method independently. Both can be off — cryptocurrency payments are then unavailable to users. Changes save immediately.</p>
                      {(["BTC", "USDT"] as const).map((asset) => {
                        const on = form.supportedAssets.includes(asset);
                        const warning = blockonomicsAssetNetworkWarning(asset);
                        return (
                          <div key={asset} className="rounded-md border border-border bg-background/40 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                {asset === "BTC" ? <Bitcoin className="h-4 w-4 text-amber-400" /> : <Coins className="h-4 w-4 text-emerald-400" />}
                                <div>
                                  <div className="text-sm font-medium text-text-bright">{blockonomicsAssetDisplayName(asset)}</div>
                                  <div className="text-[11px] text-text-muted">Network: {blockonomicsNetworkLabel(asset)}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={on ? "success" : "secondary"}>{on ? "ON" : "OFF"}</Badge>
                                <Switch
                                  checked={on}
                                  disabled={assetSaving !== null}
                                  onChange={(next) => void toggleAsset(asset, next)}
                                  aria-label={`Enable ${asset} payments`}
                                />
                              </div>
                            </div>
                            {asset === "USDT" && warning ? (
                              <div className="mt-2 flex gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{warning}</span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                      <div className="text-xs text-text-muted">Required final provider status: 2 confirmations · fixed by backend policy</div>
                      <div className="flex gap-2">
                        <Button variant={config.enabled ? "danger" : "secondary"} onClick={() => void toggleEnabled()} loading={toggling}>{config.enabled ? "Disable provider" : "Enable provider"}</Button>
                        <Button onClick={() => void save()} loading={saving}><Save className="h-4 w-4" />Save encrypted settings</Button>
                      </div>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>

            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1">
              <Card><CardHeader><CardTitle>Payment states</CardTitle></CardHeader><CardContent><CountRows rows={dashboard.paymentsByStatus} empty="No Blockonomics payments recorded." /></CardContent></Card>
              <Card><CardHeader><CardTitle>Reconciliation posture</CardTitle></CardHeader><CardContent><CountRows rows={dashboard.reconciliationByStatus} empty="No reconciliation data recorded." /></CardContent></Card>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><Webhook className="h-4 w-4" />Callback processing</CardTitle></CardHeader><CardContent><CountRows rows={dashboard.webhooksByStatus} empty="No callback events recorded." /></CardContent></Card>
            <Card><CardHeader><CardTitle>Payments by asset</CardTitle></CardHeader><CardContent><CountRows rows={dashboard.paymentsByAsset.map((row) => ({ status: row.asset, count: row.count }))} empty="No asset usage recorded." /></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Reconciliation run history</CardTitle><CardDescription>Durable audit evidence for manual and scheduled comparisons. No run silently adjusts balances.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {dashboard.recentReconciliationRuns.length ? dashboard.recentReconciliationRuns.map((run) => <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-xs"><div><span className="font-medium text-text-bright">{run.trigger} · {run.timeframe}</span><div className="text-text-muted">{new Date(run.createdAt).toLocaleString()}</div></div><div className="flex gap-2"><Badge variant="outline">{run.matched} matched</Badge><Badge variant="outline">{run.settled} settled</Badge><Badge variant={run.issueCount ? "danger" : "default"}>{run.issueCount} issues</Badge></div></div>) : <p className="text-sm text-text-muted">No reconciliation runs recorded.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent durable payments</CardTitle><CardDescription>Read-only platform view. Organization IDs are shown for operational triage; customer email and provider secrets are omitted.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              {dashboard.recentPayments.length ? <table className="w-full text-left text-xs"><thead><tr className="border-b border-border uppercase text-text-muted"><th className="py-2 pr-3">Reference</th><th className="py-2 pr-3">Organization</th><th className="py-2 pr-3">Amount</th><th className="py-2 pr-3">Asset</th><th className="py-2 pr-3">Status</th><th className="py-2">Reconciliation</th></tr></thead><tbody className="divide-y divide-border">{dashboard.recentPayments.map((payment) => <tr key={payment.id}><td className="py-2 pr-3 font-mono text-text-bright">{payment.reference}</td><td className="py-2 pr-3 font-mono text-text-muted">{payment.organizationId}</td><td className="py-2 pr-3">{payment.currency} {(payment.amountCents / 100).toFixed(2)}</td><td className="py-2 pr-3">{payment.cryptoCurrency ?? "—"}</td><td className="py-2 pr-3"><Badge variant={payment.status === "completed" ? "default" : payment.status === "under_review" || payment.status === "failed" ? "danger" : "secondary"}>{payment.status}</Badge></td><td className="py-2">{payment.reconciliationStatus}</td></tr>)}</tbody></table> : <p className="text-sm text-text-muted">No durable Blockonomics payments recorded.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-red-400" />Recent callback errors</CardTitle><CardDescription>Sanitized processing errors only; callback secrets and raw payloads are never returned.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {dashboard.recentWebhookErrors.length ? dashboard.recentWebhookErrors.map((event) => <div key={event.id} className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><span className="font-mono text-red-300">{event.errorCode ?? "PROCESSING_ERROR"}</span><span className="text-text-muted">{new Date(event.receivedAt).toLocaleString()} · attempt {event.attempts}</span></div><div className="mt-1 text-text-main">{event.errorMessage ?? "No error message recorded"}</div></div>) : <p className="text-sm text-text-muted">No callback processing errors recorded.</p>}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default BlockonomicsAdminPage;
