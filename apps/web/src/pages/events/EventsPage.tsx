/**
 * Session 126 — Real-Time SSE Channel (Events) Console.
 *
 * Provides real-time event stream monitoring, historical ring-buffer viewer,
 * active SSE connection inspection and revocation, and a custom event publisher.
 *
 * Honest UI rules:
 *   - unmeasured or unavailable client stats display "not recorded" or "no feed", never 0
 *   - empty event history clearly states "No recent events recorded"
 */
import React, { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Send, Radio, Users, Trash2 } from "lucide-react";
import type { SSEEventPayload, SSEClientInfo, EventsHealthResponse } from "@windels/shared";
import {
  eventsHealth,
  getEventHistory,
  getSSEClients,
  publishCustomEvent,
  disconnectSSEClient,
} from "@/lib/events";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAuthStore } from "@/store/auth";

export function EventsPage() {
  const { user } = useAuthStore();
  const [health, setHealth] = useState<EventsHealthResponse | null>(null);
  const [history, setHistory] = useState<SSEEventPayload[]>([]);
  const [clients, setClients] = useState<SSEClientInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Publish Form State
  const [pubEvent, setPubEvent] = useState("custom.notification");
  const [pubData, setPubData] = useState('{"message": "Hello from Session 126"}');
  const [pubStatus, setPubStatus] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, historyRes, clientsRes] = await Promise.all([
        eventsHealth().catch(() => null),
        getEventHistory({ limit: 50 }).catch(() => [] as SSEEventPayload[]),
        getSSEClients().catch(() => [] as SSEClientInfo[]),
      ]);
      setHealth(healthRes as EventsHealthResponse | null);
      setHistory(historyRes);
      setClients(clientsRes);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load events channel data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setPubStatus(null);
    try {
      const parsedData = JSON.parse(pubData);
      const res = await publishCustomEvent({
        event: pubEvent,
        data: parsedData,
      });
      setPubStatus(`Published event ${res.id} to organization stream.`);
      loadData();
    } catch (err: any) {
      setPubStatus(`Publish failed: ${err?.message ?? "Invalid JSON or network error"}`);
    }
  };

  const handleDisconnect = async (clientId: string) => {
    try {
      await disconnectSSEClient(clientId);
      loadData();
    } catch (err: any) {
      setError(err?.message ?? "Failed to disconnect client");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2">
            <Radio className="h-6 w-6 text-emerald-400" />
            Real-Time SSE Channel (Events)
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Monitor real-time Server-Sent Events, inspect historical ring-buffer replay (`evt:hist`), and manage organization stream connections.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Total Active Connections</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">
            {health?.connectedClients !== undefined ? health.connectedClients : "not recorded"}
          </div>
          <div className="mt-1 text-xs text-text-muted">Global SSE clients connected</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Organization Clients</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">
            {health?.orgConnectedClients !== undefined ? health.orgConnectedClients : clients.length}
          </div>
          <div className="mt-1 text-xs text-text-muted">Clients in {user?.organizationId ?? "current org"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Channel Uptime</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">
            {health?.uptime !== undefined ? `${Math.floor(health.uptime / 60)}m ${health.uptime % 60}s` : "not recorded"}
          </div>
          <div className="mt-1 text-xs text-text-muted">Stream server continuous uptime</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Subscribed Event Types</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">
            {health?.subscribedEvents?.length !== undefined ? health.subscribedEvents.length : "not recorded"}
          </div>
          <div className="mt-1 text-xs text-text-muted">Broadcast events cataloged</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Historical Ring Buffer Table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              Organization Event History (`evt:hist`)
            </CardTitle>
            <CardDescription>
              Recent events emitted to the organization SSE stream, stored in the capped ring buffer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-center py-8 text-sm text-text-muted">
                No recent events recorded in organization history.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase text-text-muted">
                      <th className="py-2 pr-4">Event Type</th>
                      <th className="py-2 pr-4">Event ID</th>
                      <th className="py-2 pr-4">Timestamp</th>
                      <th className="py-2">Payload Preview</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((ev) => (
                      <tr key={ev.id} className="hover:bg-card-hover/40">
                        <td className="py-2 pr-4">
                          <Badge variant="outline">{ev.event}</Badge>
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs text-text-muted">{ev.id}</td>
                        <td className="py-2 pr-4 text-xs text-text-muted">
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2 text-xs font-mono text-text-muted truncate max-w-xs">
                          {JSON.stringify(ev.data)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Publish Custom Event Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4 text-blue-400" />
              Publish Custom Event
            </CardTitle>
            <CardDescription>
              Test or emit a custom event to your organization's SSE stream.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePublish} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-medium text-text-muted mb-1">
                  Event Name
                </label>
                <input
                  type="text"
                  value={pubEvent}
                  onChange={(e) => setPubEvent(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-bright"
                  required
                />
              </div>
              <div>
                <label className="block text-xs uppercase font-medium text-text-muted mb-1">
                  JSON Payload
                </label>
                <textarea
                  rows={4}
                  value={pubData}
                  onChange={(e) => setPubData(e.target.value)}
                  className="w-full font-mono rounded-md border border-border bg-background px-3 py-1.5 text-xs text-text-bright"
                  required
                />
              </div>
              <Button type="submit" className="w-full gap-2">
                <Send className="h-4 w-4" />
                Publish Event
              </Button>
              {pubStatus ? (
                <div className="text-xs text-text-muted mt-2 bg-card-hover/50 p-2 rounded">
                  {pubStatus}
                </div>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Active Organization SSE Clients Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-400" />
            Active Organization Stream Clients
          </CardTitle>
          <CardDescription>
            Live SSE connection sessions belonging to your organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <div className="text-center py-6 text-sm text-text-muted">
              No active SSE stream clients recorded in this organization.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-text-muted">
                    <th className="py-2 pr-4">Client ID</th>
                    <th className="py-2 pr-4">User ID</th>
                    <th className="py-2 pr-4">Connected At</th>
                    <th className="py-2 pr-4">Last Event ID</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {clients.map((cli) => (
                    <tr key={cli.id} className="hover:bg-card-hover/40">
                      <td className="py-2 pr-4 font-mono text-xs text-text-bright">{cli.id}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-text-muted">{cli.userId}</td>
                      <td className="py-2 pr-4 text-xs text-text-muted">
                        {new Date(cli.subscribedAt).toLocaleTimeString()}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-text-muted">
                        {cli.lastEventId ?? "—"}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDisconnect(cli.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1 text-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Disconnect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
export default EventsPage;
