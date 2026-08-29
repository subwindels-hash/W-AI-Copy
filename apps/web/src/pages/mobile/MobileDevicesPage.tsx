/**
 * Session 117 — Mobile devices & offline queue console.
 *
 * The PWA could register a device, set a PIN, subscribe to push and queue
 * writes while offline — and no screen anywhere showed any of it. The queue in
 * particular was invisible *and* lossy: the client handed its actions to a
 * server that stored none of them, then deleted them from the phone. This page
 * is the screen that makes the queue real, and it is built to avoid four
 * comfortable lies:
 *
 *   - **"Everything synced."** A queued action is shown as *stored*, which
 *     means the server is holding it, not that it has been applied. Only an
 *     action the device replayed and reported on is shown as applied.
 *   - **"Nothing pending."** Rejected actions are listed with the reason they
 *     were refused, because they are still sitting on the device.
 *   - **"Push is working."** The push panel reports deliveries *recorded*, and
 *     says in the panel that acceptance by a push service is not display on a
 *     handset.
 *   - **"This build is current."** A version that cannot be compared is shown
 *     as "not comparable", never as up to date.
 *
 * The policy tab is hidden from non-administrators because the API refuses the
 * write, and a control that always fails is worse than no control.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle, BellRing, Fingerprint, Loader2, RefreshCw, ScrollText,
  Settings2, Smartphone, Trash2, UploadCloud,
} from "lucide-react";
import {
  mobileSyncApi,
  MOBILE_ACTION_STATUS_LABELS,
  MOBILE_UPDATE_STANDING_LABELS,
  type MobileActionStatus,
  type MobileActionSummary,
  type MobileConfigurationReport,
  type MobileDeviceInventory,
  type MobileEventPage,
  type MobileGapReport,
  type MobileOfflineSummary,
  type MobilePolicy,
  type MobilePushHealth,
  type MobileSelfAssurance,
} from "@/lib/mobile/sync";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Tab = "overview" | "devices" | "queue" | "push" | "policy" | "ledger";

const TABS: Array<{ id: Tab; label: string; adminOnly: boolean }> = [
  { id: "overview", label: "Overview", adminOnly: false },
  { id: "devices", label: "Devices", adminOnly: false },
  { id: "queue", label: "Offline queue", adminOnly: false },
  { id: "push", label: "Push", adminOnly: false },
  { id: "policy", label: "Policy", adminOnly: true },
  { id: "ledger", label: "Activity", adminOnly: false },
];

const STATUS_VARIANT: Record<MobileActionStatus, "azure" | "emerald" | "crimson" | "slate" | "amber"> = {
  stored: "azure",
  applied: "emerald",
  failed: "crimson",
  discarded: "slate",
  expired: "amber",
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

export function MobileDevicesPage() {
  const user = useAuthStore((state) => state.user);
  const canAdminister = user?.role === "admin" || user?.role === "super_admin";

  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [self, setSelf] = useState<MobileSelfAssurance | null>(null);
  const [devices, setDevices] = useState<MobileDeviceInventory | null>(null);
  const [summary, setSummary] = useState<MobileOfflineSummary | null>(null);
  const [actions, setActions] = useState<MobileActionSummary[]>([]);
  const [pushHealth, setPushHealth] = useState<MobilePushHealth | null>(null);
  const [policy, setPolicy] = useState<MobilePolicy | null>(null);
  const [config, setConfig] = useState<MobileConfigurationReport | null>(null);
  const [gaps, setGaps] = useState<MobileGapReport | null>(null);
  const [events, setEvents] = useState<MobileEventPage | null>(null);

  const [statusFilter, setStatusFilter] = useState<"" | MobileActionStatus>("");
  const [minVersion, setMinVersion] = useState("");
  const [requirement, setRequirement] = useState<"none" | "advisory" | "required">("none");
  const [retentionDays, setRetentionDays] = useState(14);

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
      const [s, d, sum, ph, cfg, g, ev] = await Promise.all([
        mobileSyncApi.self(),
        mobileSyncApi.devices(),
        mobileSyncApi.summary(),
        mobileSyncApi.pushHealth(),
        mobileSyncApi.configuration(),
        mobileSyncApi.gaps(),
        mobileSyncApi.events({ limit: 40 }),
      ]);
      setSelf(s); setDevices(d); setSummary(sum); setPushHealth(ph);
      setConfig(cfg); setGaps(g); setEvents(ev);

      const list = await mobileSyncApi.listActions({ limit: 100 });
      setActions(list.actions);

      const p = await mobileSyncApi.policy().catch(() => null);
      if (p) {
        setPolicy(p);
        setMinVersion(p.minAppVersion ?? "");
        setRequirement(p.updateRequirement);
        setRetentionDays(p.actionRetentionDays);
      }
    });
  }, [run]);

  useEffect(() => { void refresh(); }, [refresh]);

  const reloadActions = useCallback(
    async (status: "" | MobileActionStatus) => {
      await run("actions", async () => {
        const list = await mobileSyncApi.listActions({
          limit: 100,
          ...(status ? { status } : {}),
        });
        setActions(list.actions);
      });
    },
    [run],
  );

  const busyIcon = (id: string) =>
    busy === id ? <Loader2 className="h-4 w-4 animate-spin" /> : null;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-text-bright">
            <Smartphone className="h-6 w-6 text-azure" /> Mobile devices &amp; offline queue
          </h1>
          <p className="max-w-3xl text-sm text-text-muted">
            The handsets registered to your account, the writes they made while offline, and what
            this deployment is configured to do with them. A queued write shown as <em>stored</em>{" "}
            has been kept safe — it has not been applied.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()} disabled={busy === "refresh"}>
          {busy === "refresh" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
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

      <nav className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
        {TABS.filter((t) => !t.adminOnly || canAdminister).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              tab === t.id ? "bg-azure/15 text-azure" : "text-text-muted hover:text-text-bright"
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
            <Stat icon={<Smartphone className="h-4 w-4" />} label="Registered devices" value={self?.devices ?? "—"}
              detail={self && self.staleDevices > 0 ? `${self.staleDevices} not seen recently` : undefined} />
            <Stat icon={<UploadCloud className="h-4 w-4" />} label="Writes waiting to replay"
              value={self?.pendingActions ?? "—"}
              detail={self?.oldestPendingAt ? `oldest ${when(self.oldestPendingAt)}` : "none pending"} />
            <Stat icon={<Fingerprint className="h-4 w-4" />} label="Devices with biometrics"
              value={self?.devicesWithBiometrics ?? "—"} detail={`${self?.devicesWithPin ?? 0} with a PIN`} />
            <Stat icon={<BellRing className="h-4 w-4" />} label="Push subscriptions"
              value={self?.pushSubscriptions ?? "—"}
              detail={pushHealth ? `${pushHealth.recordedDeliveries} deliveries recorded` : undefined} />
          </div>

          {summary ? (
            <Card>
              <CardHeader>
                <CardTitle>Offline queue</CardTitle>
                <CardDescription>
                  Retention {summary.retentionDays} days · up to {summary.queueLimitPerDevice} pending per device
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(summary.byStatus) as MobileActionStatus[]).map((status) => (
                    <Badge key={status} variant={STATUS_VARIANT[status]}>
                      {MOBILE_ACTION_STATUS_LABELS[status]}: {summary.byStatus[status]}
                    </Badge>
                  ))}
                </div>
                <Note>{summary.storageNote}</Note>
                <Note>{summary.retentionNote}</Note>
              </CardContent>
            </Card>
          ) : null}

          {config ? (
            <Card>
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
                <CardDescription>
                  Read from this server's environment — no push was sent to produce it
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {config.checks.map((check) => (
                  <div key={check.key} className="flex items-start gap-3 rounded-lg border border-white/5 p-2">
                    <Badge variant={check.state === "pass" ? "emerald" : check.state === "warn" ? "amber" : "crimson"}>
                      {check.state}
                    </Badge>
                    <div className="min-w-0">
                      <div className="text-sm text-text-bright">{check.label}</div>
                      <div className="text-xs text-text-muted">{check.detail}</div>
                    </div>
                  </div>
                ))}
                <Note>{config.note}</Note>
              </CardContent>
            </Card>
          ) : null}

          {gaps ? (
            <Card>
              <CardHeader>
                <CardTitle>What this does not do</CardTitle>
                <CardDescription>{gaps.note}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {gaps.gaps.map((gap) => (
                  <div key={gap.area} className="rounded-lg border border-white/5 p-3">
                    <div className="text-sm font-semibold text-text-bright">{gap.area}</div>
                    <div className="text-xs text-text-muted">{gap.gap}</div>
                    <div className="mt-1 text-xs text-amber">{gap.consequence}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ── Devices ────────────────────────────────────────────────────── */}
      {tab === "devices" ? (
        <div className="space-y-3">
          {devices?.devices.length ? (
            devices.devices.map((device) => (
              <Card key={device.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-text-bright">
                          {device.deviceName ?? "Unnamed device"}
                        </span>
                        <Badge variant="secondary">{device.platform}</Badge>
                        {device.stale ? <Badge variant="amber">not seen in {device.daysSinceLastSeen} days</Badge> : null}
                        <Badge variant={device.updateStanding === "current" ? "emerald" : device.updateStanding === "outdated_required" ? "crimson" : "slate"}>
                          {MOBILE_UPDATE_STANDING_LABELS[device.updateStanding] ?? device.updateStanding}
                        </Badge>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-text-muted">{device.id}</div>
                      <div className="text-xs text-text-muted">
                        app {device.appVersion ?? "unknown"} · OS {device.osVersion ?? "unknown"} · last seen{" "}
                        {when(device.lastSeenAt)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={device.biometricEnabled ? "emerald" : "slate"}>
                        biometrics {device.biometricEnabled ? "on" : "off"}
                      </Badge>
                      <Badge variant={device.pinConfigured ? "emerald" : "slate"}>
                        PIN {device.pinConfigured ? "set" : "not set"}
                      </Badge>
                      <Badge variant={device.pushSubscriptions > 0 ? "emerald" : "slate"}>
                        {device.pushSubscriptions} push
                      </Badge>
                    </div>
                  </div>

                  {device.pinLock?.locked ? (
                    <div className="rounded-lg border border-amber/30 bg-amber/10 p-2 text-xs text-amber">
                      PIN locked after {device.pinLock.failedAttempts} incorrect attempts. Unlocks{" "}
                      {when(device.pinLock.unlocksAt)}.
                    </div>
                  ) : null}

                  {device.pinConfigured ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void run(`pin-${device.id}`, async () => {
                          await mobileSyncApi.clearPin(device.id);
                          await refresh();
                          return "PIN removed from that device.";
                        })
                      }
                      disabled={busy === `pin-${device.id}`}
                    >
                      {busyIcon(`pin-${device.id}`) ?? <Trash2 className="mr-2 h-4 w-4" />}
                      Remove PIN
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card><CardContent className="p-6 text-sm text-text-muted">No devices registered.</CardContent></Card>
          )}
          {devices ? <Note>{devices.note}</Note> : null}
        </div>
      ) : null}

      {/* ── Offline queue ──────────────────────────────────────────────── */}
      {tab === "queue" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={statusFilter}
              onChange={(e) => {
                const value = e.target.value as "" | MobileActionStatus;
                setStatusFilter(value);
                void reloadActions(value);
              }}
              className="max-w-xs"
            >
              <option value="">All statuses</option>
              {(Object.keys(MOBILE_ACTION_STATUS_LABELS) as MobileActionStatus[]).map((s) => (
                <option key={s} value={s}>{MOBILE_ACTION_STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </div>

          {actions.length ? (
            actions.map((a) => (
              <Card key={a.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{a.method}</Badge>
                        <span className="truncate font-mono text-xs text-text-bright">{a.path}</span>
                      </div>
                      <div className="text-[11px] text-text-muted">
                        received {when(a.receivedAt)} · device {a.deviceId} ·{" "}
                        {a.bodyStored ? `${a.bodyBytes} bytes stored` : "no body"}
                        {a.queuedAt ? ` · device clock said ${when(a.queuedAt)}` : ""}
                      </div>
                      {a.outcomeError ? (
                        <div className="text-[11px] text-crimson">{a.outcomeError}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[a.status]}>{MOBILE_ACTION_STATUS_LABELS[a.status]}</Badge>
                      {a.status === "stored" || a.status === "failed" ? (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            void run(`discard-${a.id}`, async () => {
                              await mobileSyncApi.discard(a.id, "Discarded from the console");
                              await reloadActions(statusFilter);
                              return "Recorded as discarded. It was never applied.";
                            })
                          }
                          disabled={busy === `discard-${a.id}`}
                        >
                          {busyIcon(`discard-${a.id}`) ?? <Trash2 className="mr-2 h-4 w-4" />}
                          Discard
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-text-muted">
                No queued writes recorded. Actions appear here after a device that worked offline
                reconnects.
              </CardContent>
            </Card>
          )}
          {summary ? <Note>{summary.storageNote}</Note> : null}
        </div>
      ) : null}

      {/* ── Push ───────────────────────────────────────────────────────── */}
      {tab === "push" ? (
        <div className="space-y-3">
          {pushHealth ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat icon={<BellRing className="h-4 w-4" />} label="Active subscriptions" value={pushHealth.activeSubscriptions} />
                <Stat icon={<AlertTriangle className="h-4 w-4" />} label="One failure from retirement" value={pushHealth.atRiskSubscriptions}
                  detail={`retired after ${pushHealth.retirementThreshold} failures`} />
                <Stat icon={<UploadCloud className="h-4 w-4" />} label="Deliveries recorded" value={pushHealth.recordedDeliveries}
                  detail={pushHealth.lastDeliveryAt ? `last ${when(pushHealth.lastDeliveryAt)}` : "none recorded"} />
                <Stat icon={<Trash2 className="h-4 w-4" />} label="Subscriptions retired" value={pushHealth.retiredSubscriptions} />
              </div>

              {pushHealth.subscriptions.map((sub) => (
                <Card key={sub.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                    <div>
                      <div className="text-sm text-text-bright">{sub.endpointHost}</div>
                      <div className="text-[11px] text-text-muted">
                        device {sub.deviceId} · last delivered {when(sub.lastDeliveredAt)}
                      </div>
                    </div>
                    <Badge variant={sub.atRisk ? "amber" : sub.failures > 0 ? "slate" : "emerald"}>
                      {sub.failures} consecutive failures
                    </Badge>
                  </CardContent>
                </Card>
              ))}

              <Note>{pushHealth.note}</Note>
              <Note>{pushHealth.ledgerNote}</Note>
            </>
          ) : null}
        </div>
      ) : null}

      {/* ── Policy ─────────────────────────────────────────────────────── */}
      {tab === "policy" && canAdminister ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Mobile policy
            </CardTitle>
            <CardDescription>
              {policy?.isDefault
                ? "Nothing has been stored — these are the platform defaults."
                : `Last changed ${when(policy?.updatedAt)} by ${policy?.updatedBy ?? "unknown"}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-xs text-text-muted">
                Minimum app version
                <Input value={minVersion} onChange={(e) => setMinVersion(e.target.value)} placeholder="e.g. 1.4.0" />
              </label>
              <label className="space-y-1 text-xs text-text-muted">
                Update requirement
                <Select value={requirement} onChange={(e) => setRequirement(e.target.value as typeof requirement)}>
                  <option value="none">None — do not check</option>
                  <option value="advisory">Advisory — tell the user</option>
                  <option value="required">Required — the client should block</option>
                </Select>
              </label>
              <label className="space-y-1 text-xs text-text-muted">
                Queue retention (days)
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                />
              </label>
            </div>

            <Note>{policy?.updateNote}</Note>
            <Note>{policy?.note}</Note>

            <Button
              onClick={() =>
                void run("policy", async () => {
                  const updated = await mobileSyncApi.updatePolicy({
                    minAppVersion: minVersion.trim() ? minVersion.trim() : null,
                    updateRequirement: requirement,
                    actionRetentionDays: retentionDays,
                  });
                  setPolicy(updated);
                  return "Policy saved.";
                })
              }
              disabled={busy === "policy"}
            >
              {busyIcon("policy")}
              Save policy
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Ledger ─────────────────────────────────────────────────────── */}
      {tab === "ledger" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" /> Device activity
            </CardTitle>
            <CardDescription>
              {events ? `${events.stored} entries held, newest first` : "—"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {events?.events.length ? (
              events.events.map((event) => (
                <div key={event.id} className="flex items-start gap-3 rounded-lg border border-white/5 p-2">
                  <Badge variant="secondary">{event.kind.replace(/_/g, " ")}</Badge>
                  <div className="min-w-0">
                    <div className="text-sm text-text-bright">{event.detail}</div>
                    <div className="text-[11px] text-text-muted">
                      {when(event.at)}
                      {event.deviceId ? ` · device ${event.deviceId}` : ""}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-text-muted">Nothing recorded yet.</div>
            )}
            {events ? <Note>{events.note}</Note> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default MobileDevicesPage;
