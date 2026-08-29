/**
 * Settings → Channels → Telegram.
 *
 * Admin surface for the Telegram Bot channel: connect via bot token, live
 * webhook/bot status, traffic counters, secure account-linking deep link, and
 * connected accounts. Never fabricates a "connected" state; the API reports
 * configuration honestly.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { telegramApi, type TelegramChannel, type TelegramStats, type LinkToken } from "@/lib/telegram";
import { useAuthStore } from "@/store/auth";
import { Send, Link2, Power, RotateCcw, Copy, Trash2 } from "lucide-react";

export default function TelegramChannelPanel() {
  const user = useAuthStore((s) => s.user);
  const [channels, setChannels] = useState<TelegramChannel[]>([]);
  const [stats, setStats] = useState<TelegramStats | null>(null);
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [link, setLink] = useState<LinkToken | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([telegramApi.channels(), telegramApi.stats()]);
    setChannels(c); setStats(s);
  }, []);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const connect = async () => {
    setBusy(true); setErr(null);
    try {
      await telegramApi.setup({ botToken: token.trim(), webhookBaseUrl: origin, name: name || undefined });
      setToken(""); setName(""); await load();
    } catch (e: any) { setErr(e?.message ?? "Could not connect"); }
    finally { setBusy(false); }
  };

  const toggle = async (c: TelegramChannel, enabled: boolean) => {
    await telegramApi.setEnabled(c.id, enabled); await load();
  };

  const disconnect = async (c: TelegramChannel) => {
    if (!confirm("Disconnect the Telegram bot? The webhook will be removed.")) return;
    await telegramApi.disconnect(c.id); await load();
  };

  const issueLink = async () => {
    const l = await telegramApi.linkToken(channels[0]?.id);
    setLink(l);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Send className="w-4 h-4" /> Telegram Bot</CardTitle>
          <CardDescription>Connect WINDELS AI to Telegram. Messages are processed by the same AI brain, agents, memory and permissions as the web app.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {channels.length === 0 ? (
            <div className="grid gap-3">
              <Input placeholder="Bot name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
              <Input type="password" placeholder="Telegram bot token (123456:ABC-...)" value={token} onChange={(e) => setToken(e.target.value)} />
              {err && <p className="text-sm text-crimson">{err}</p>}
              <Button onClick={connect} loading={busy} disabled={!token.trim()}><Link2 className="w-4 h-4 mr-1" /> Connect & set webhook</Button>
              <p className="text-xs text-text-muted">WINDELS validates the token against Telegram, configures the webhook at <code>{origin}/api/v1/channels/telegram/webhook</code>, and stores the token encrypted.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {channels.map((c) => (
                <div key={c.id} className="rounded-lg border border-white/10 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{c.name} {c.botUsername ? <span className="text-text-muted">@{c.botUsername}</span> : null}</div>
                      <div className="text-xs text-text-muted">Bot ID {c.telegramBotId ?? "—"} · webhook {c.webhookStatus}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={c.enabled ? "emerald" : "slate"}>{c.status}</Badge>
                      <Switch checked={c.enabled} onChange={(v: boolean) => toggle(c, v)} aria-label="enabled" />
                      <Button size="sm" variant="outline" onClick={() => telegramApi.rotateWebhook(c.id, origin).then(load)}><RotateCcw className="w-3 h-3" /></Button>
                      <Button size="sm" variant="outline" onClick={() => disconnect(c)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {stats && (
        <Card>
          <CardHeader><CardTitle>Traffic (24h)</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-sm">
            <Stat label="Connected users" value={stats.connectedUsers} />
            <Stat label="Messages" value={stats.messages24h} />
            <Stat label="Failed" value={stats.failed24h} tone={stats.failed24h > 0 ? "warn" : undefined} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Account linking</CardTitle>
          <CardDescription>Users connect their Telegram by opening a secure, single-use, 10-minute link.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Button variant="secondary" onClick={issueLink} disabled={channels.length === 0}><Power className="w-4 h-4 mr-1" /> Generate linking link</Button>
          {link && (
            <div className="rounded-lg border border-white/10 p-3 space-y-2">
              <div className="text-xs text-text-muted">Send this to yourself, then open it:</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs break-all bg-black/30 rounded p-2">{link.deepLink}</code>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(link.deepLink); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy className="w-3 h-3" />{copied ? " Copied" : ""}</Button>
              </div>
              <div className="text-xs text-text-muted">Expires in {Math.round(link.expiresInSeconds / 60)} minutes.</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" | "danger" }) {
  return (
    <div className="rounded-lg border border-white/5 p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`text-xl font-semibold ${tone === "warn" ? "text-amber" : tone === "danger" ? "text-crimson" : ""}`}>{value}</div>
    </div>
  );
}
