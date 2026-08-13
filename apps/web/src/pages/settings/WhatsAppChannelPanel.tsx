/**
 * Settings → Channels → WhatsApp (Phase 1 §12/§13).
 *
 * Admin surface for the WhatsApp channel: live connection/webhook status,
 * traffic and usage counters, recent failures, and the channel settings.
 *
 * This panel never fabricates a "connected" state. When credentials are
 * missing the API says so, and the UI shows exactly what is still required.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Skeleton } from "@/components/ui/Skeleton";
import * as wa from "@/lib/whatsapp";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/store/auth";
import WhatsAppOperationsPanel from "./WhatsAppOperationsPanel";

const ADMIN_ROLES = ["owner", "admin", "superadmin"];

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return "Just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const STATUS_VARIANT: Record<string, "emerald" | "amber" | "crimson" | "slate"> = {
  connected: "emerald",
  verified: "emerald",
  pending: "amber",
  unverified: "amber",
  disabled: "slate",
  disconnected: "slate",
  error: "crimson",
  failed: "crimson",
};

function StatusBadge({ value }: { value: string | null | undefined }) {
  const key = (value ?? "unknown").toLowerCase();
  return <Badge variant={STATUS_VARIANT[key] ?? "slate"}>{key.replace(/_/g, " ")}</Badge>;
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "danger" | "warn" }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div
        className={cn(
          "text-xl font-semibold",
          tone === "danger" ? "text-crimson" : tone === "warn" ? "text-amber" : "text-text-bright",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default function WhatsAppChannelPanel() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = ADMIN_ROLES.includes(String(user?.role ?? "").toLowerCase());

  const [data, setData] = useState<wa.WhatsAppDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [settings, setSettings] = useState<wa.WhatsAppChannelSettings | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await wa.getDashboard();
      setData(next);
      setSettings(next.channel?.settings ?? null);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message ?? "Could not load the WhatsApp channel");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Status is live data; refresh while the tab is open.
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      await load();
    } catch (e: any) {
      // Surface the real reason — including "configuration required".
      toast.error(e?.message ?? "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp</CardTitle>
          <CardDescription>The channel status could not be loaded.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-crimson">{loadError}</p>
          <Button variant="outline" size="sm" onClick={load}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const channel = data?.channel ?? null;
  const stats = data?.stats;
  const required = data?.configurationRequired ?? null;

  return (
    <div className="space-y-4">
      {/* ── Connection ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              WhatsApp Business
              {channel && <StatusBadge value={channel.enabled ? channel.status : "disabled"} />}
            </CardTitle>
            <CardDescription>
              {channel
                ? `${channel.name} · ${channel.displayPhoneNumber ?? `Phone number ID ${channel.phoneNumberId}`}`
                : "Connect a WhatsApp Cloud API number to this workspace."}
            </CardDescription>
          </div>
          {channel && isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={channel.enabled ? "secondary" : "primary"}
                loading={busy === "toggle"}
                onClick={() =>
                  run("toggle", () => wa.updateChannel(channel.id, { enabled: !channel.enabled }),
                    channel.enabled ? "Channel disabled" : "Channel enabled")
                }
              >
                {channel.enabled ? "Disable" : "Enable"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={busy === "reconnect"}
                onClick={() => run("reconnect", () => wa.reconnect(channel.id), "Reconnected to the WhatsApp Cloud API")}
              >
                Reconnect
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={busy === "disconnect"}
                onClick={() => {
                  if (!confirm("Disconnect WhatsApp? Stored credentials are erased. Conversation history is kept.")) return;
                  run("disconnect", () => wa.disconnect(channel.id), "Channel disconnected");
                }}
              >
                Disconnect
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Honest configuration reporting — never a fake "connected". */}
          {required && required.length > 0 && (
            <div className="rounded-lg border border-amber/30 bg-amber/5 p-3">
              <div className="text-sm font-medium text-amber">Configuration required</div>
              <ul className="mt-2 space-y-1 text-sm text-text-main">
                {required.map((item) => <li key={item}>• {item}</li>)}
              </ul>
              <p className="mt-2 text-xs text-text-muted">
                Until these are set, WhatsApp messages cannot be sent or verified. Nothing is simulated.
              </p>
            </div>
          )}

          {channel && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-xs text-text-muted">Webhook</div>
                <div className="mt-1"><StatusBadge value={channel.webhookStatus} /></div>
              </div>
              <div>
                <div className="text-xs text-text-muted">Last webhook</div>
                <div className="text-sm text-text-bright">{fmtWhen(stats?.lastWebhookAt ?? channel.lastWebhookAt)}</div>
              </div>
              <div>
                <div className="text-xs text-text-muted">Access token</div>
                <div className="text-sm text-text-bright">{channel.hasAccessToken ? "Stored" : "Not set"}</div>
              </div>
              <div>
                <div className="text-xs text-text-muted">App secret</div>
                <div className="text-sm text-text-bright">{channel.hasAppSecret ? "Stored" : "Not set"}</div>
              </div>
              <div>
                <div className="text-xs text-text-muted">Graph API</div>
                <div className="text-sm text-text-bright">{channel.apiVersion}</div>
              </div>
              <div>
                <div className="text-xs text-text-muted">Business account</div>
                <div className="text-sm text-text-bright">{channel.businessAccountId}</div>
              </div>
            </div>
          )}

          {!channel && (
            <p className="text-sm text-text-muted">
              No WhatsApp channel is registered for this organization yet. An administrator can register one
              with the phone number ID and business account ID from Meta Business Manager.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Activity ───────────────────────────────────────────────── */}
      {channel && stats && (
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Last 30 days.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Received" value={stats.messagesReceived} />
            <Stat label="Sent" value={stats.messagesSent} />
            <Stat label="Failed" value={stats.messagesFailed} tone={stats.messagesFailed > 0 ? "danger" : undefined} />
            <Stat label="AI responses" value={stats.aiResponses} />
            <Stat label="Active conversations" value={stats.activeConversations} />
            <Stat label="Connected users" value={stats.connectedUsers} />
            <Stat label="Contacts" value={stats.contacts} />
            <Stat label="Media messages" value={stats.mediaMessages} />
            <Stat label="Queue depth" value={stats.queueDepth} tone={stats.queueDepth > 50 ? "warn" : undefined} />
            <Stat
              label="Dead letter"
              value={stats.dlqDepth ?? 0}
              tone={(stats.dlqDepth ?? 0) > 0 ? "danger" : undefined}
            />
            <Stat label="AI calls this hour" value={stats.orgHourlyUsage ?? 0} />
          </CardContent>
        </Card>
      )}

      {/* ── Operations: conversations, messages, jobs, test (§16) ──── */}
      {channel && <WhatsAppOperationsPanel isAdmin={isAdmin} />}

      {/* ── Errors ─────────────────────────────────────────────────── */}
      {channel && data && data.recentErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent errors</CardTitle>
            <CardDescription>Delivery and provider failures, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.recentErrors.slice(0, 10).map((err, i) => (
                <li key={`${err.at}-${i}`} className="rounded-lg border border-crimson/20 bg-crimson/5 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-crimson">{err.code ?? "ERROR"}</span>
                    <span className="text-xs text-text-muted">{fmtWhen(err.at)}</span>
                  </div>
                  <p className="mt-1 text-text-main">{err.message}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── Settings (§13, admin only) ─────────────────────────────── */}
      {channel && settings && (
        <Card>
          <CardHeader>
            <CardTitle>Channel settings</CardTitle>
            <CardDescription>
              {isAdmin
                ? "How the AI workforce answers on this channel."
                : "Read-only. Only an administrator can change these."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs text-text-muted" htmlFor="wa-response-mode">Response mode</label>
                <Select
                  id="wa-response-mode"
                  className="mt-1"
                  disabled={!isAdmin}
                  value={settings.responseMode}
                  onChange={(e) => setSettings({ ...settings, responseMode: e.target.value as any })}
                >
                  <option value="ai">AI responds automatically</option>
                  <option value="human">Route to a human</option>
                  <option value="off">No automatic response</option>
                </Select>
              </div>
              <div>
                <label className="text-xs text-text-muted" htmlFor="wa-retention">Conversation retention (days, 0 = keep)</label>
                <Input
                  id="wa-retention"
                  className="mt-1"
                  type="number"
                  min={0}
                  max={3650}
                  disabled={!isAdmin}
                  value={settings.conversationRetentionDays}
                  onChange={(e) => setSettings({ ...settings, conversationRetentionDays: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs text-text-muted" htmlFor="wa-contact-limit">Messages per contact per hour (0 = unlimited)</label>
                <Input
                  id="wa-contact-limit"
                  className="mt-1"
                  type="number"
                  min={0}
                  disabled={!isAdmin}
                  value={settings.perContactHourlyLimit}
                  onChange={(e) => setSettings({ ...settings, perContactHourlyLimit: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs text-text-muted" htmlFor="wa-org-limit">Organization messages per hour (0 = unlimited)</label>
                <Input
                  id="wa-org-limit"
                  className="mt-1"
                  type="number"
                  min={0}
                  disabled={!isAdmin}
                  value={settings.orgHourlyLimit}
                  onChange={(e) => setSettings({ ...settings, orgHourlyLimit: Number(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted" htmlFor="wa-auto-response">
                Auto-response outside working hours
              </label>
              <Input
                id="wa-auto-response"
                className="mt-1"
                disabled={!isAdmin}
                placeholder="Thanks for your message — we'll reply during business hours."
                value={settings.autoResponseText ?? ""}
                onChange={(e) => setSettings({ ...settings, autoResponseText: e.target.value || null })}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Switch
                checked={settings.workingHours.enabled}
                disabled={!isAdmin}
                onChange={(v) => setSettings({ ...settings, workingHours: { ...settings.workingHours, enabled: v } })}
                label="Only respond during working hours"
              />
              <Switch
                checked={settings.humanEscalationEnabled}
                disabled={!isAdmin}
                onChange={(v) => setSettings({ ...settings, humanEscalationEnabled: v })}
                label="Allow escalation to a human"
              />
              <Switch
                checked={settings.mediaEnabled}
                disabled={!isAdmin}
                onChange={(v) => setSettings({ ...settings, mediaEnabled: v })}
                label="Accept images, documents and video"
              />
              <Switch
                checked={settings.voiceEnabled}
                disabled={!isAdmin}
                onChange={(v) => setSettings({ ...settings, voiceEnabled: v })}
                label="Accept voice notes"
              />
              <Switch
                checked={settings.memoryWriteEnabled}
                disabled={!isAdmin}
                onChange={(v) => setSettings({ ...settings, memoryWriteEnabled: v })}
                label="Save WhatsApp conversations to long-term memory"
              />
            </div>

            <p className="text-xs text-text-muted">
              Memory saving is off by default. When enabled, only verified linked accounts contribute to a
              user's personal memory — an unverified number never reads or writes private WINDELS data.
            </p>

            {isAdmin && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  loading={busy === "settings"}
                  onClick={() =>
                    run("settings", () => wa.updateSettings(channel.id, {
                      responseMode: settings.responseMode,
                      conversationRetentionDays: settings.conversationRetentionDays,
                      perContactHourlyLimit: settings.perContactHourlyLimit,
                      orgHourlyLimit: settings.orgHourlyLimit,
                      autoResponseText: settings.autoResponseText,
                      workingHours: settings.workingHours,
                      humanEscalationEnabled: settings.humanEscalationEnabled,
                      mediaEnabled: settings.mediaEnabled,
                      voiceEnabled: settings.voiceEnabled,
                      memoryWriteEnabled: settings.memoryWriteEnabled,
                    }), "Settings saved")
                  }
                >
                  Save settings
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
