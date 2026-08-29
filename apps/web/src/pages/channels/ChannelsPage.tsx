/**
 * WINDELS AI OS — Messaging Channels console.
 *
 * WhatsApp and Telegram channel connectivity. Status, queue depth and stats
 * come from the live channel connectors — nothing is simulated.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, MessageSquare, Send, X } from "lucide-react";
import { getStatus as whatsappStatus, listJobs as whatsappJobs } from "@/lib/whatsapp";
import { telegramApi } from "@/lib/telegram";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

function connTone(s?: string): any {
  const st = (s ?? "").toLowerCase();
  return st.includes("connect") || st.includes("active") ? "emerald"
    : st.includes("error") || st.includes("fail") ? "crimson"
    : st.includes("config") ? "amber" : "slate";
}

export function ChannelsPage() {
  const [wa, setWa] = useState<Awaited<ReturnType<typeof whatsappStatus>> | null>(null);
  const [waJobs, setWaJobs] = useState<Awaited<ReturnType<typeof whatsappJobs>> | null>(null);
  const [tgChannels, setTgChannels] = useState<Awaited<ReturnType<typeof telegramApi.channels>>>([]);
  const [tgStats, setTgStats] = useState<Awaited<ReturnType<typeof telegramApi.stats>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [w, wj, tc, ts] = await Promise.all([
        whatsappStatus(), whatsappJobs({ limit: 10 }),
        telegramApi.channels(), telegramApi.stats(),
      ]);
      setWa(w); setWaJobs(wj); setTgChannels(tc); setTgStats(ts);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><MessageSquare className="h-6 w-6 text-azure" /> Messaging Channels</h1>
          <p className="text-sm text-text-muted">WhatsApp &amp; Telegram connectivity and delivery.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-4 w-4 text-emerald-400"/> WhatsApp</CardTitle>
          <CardDescription>{wa?.connected ? "Connected" : "Not connected"} · queue depth {wa?.queueDepth ?? 0}</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant={wa?.connected ? "emerald" : "slate"}>{wa?.connected ? "connected" : "disconnected"}</Badge>
              <Badge variant={wa?.enabled ? "emerald" : "amber"}>{wa?.enabled ? "enabled" : "disabled"}</Badge>
              <Badge variant={connTone(wa?.webhookStatus)}>webhook {wa?.webhookStatus ?? "—"}</Badge>
            </div>
            <div className="text-sm text-text-muted">{wa?.displayPhoneNumber ?? wa?.phoneNumberId ?? "no phone number configured"}</div>
            {wa?.lastError && <div className="text-xs text-red-300">{wa.lastError}</div>}
            <div className="text-xs text-text-muted">Recent jobs: {waJobs?.length ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-4 w-4 text-azure"/> Telegram</CardTitle>
          <CardDescription>{tgStats?.channels ?? 0} channels · {tgStats?.connectedUsers ?? 0} connected users · {tgStats?.messages24h ?? 0} msgs (24h)</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {tgChannels.length === 0 ? (
              <div className="text-sm text-text-muted">No Telegram channels configured.</div>
            ) : tgChannels.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-border/30 py-1.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.name} {c.botUsername && <span className="text-text-muted">@{c.botUsername}</span>}</div>
                  <div className="text-xs text-text-muted">webhook {c.webhookStatus}</div>
                </div>
                <Badge variant={c.enabled ? "emerald" : "amber"}>{c.enabled ? "enabled" : "disabled"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ChannelsPage;
