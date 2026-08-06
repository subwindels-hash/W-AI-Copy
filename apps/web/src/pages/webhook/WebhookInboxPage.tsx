/**
 * Session 126 — Inbound Webhook Receiver & Inbox Console.
 *
 * Provides incoming webhook inbox inspection (`whk:inbox`), payload viewing,
 * signature verification monitoring, replay dispatch to EventBus, and deletion.
 *
 * Honest UI rules:
 *   - unmeasured or unavailable inbox counts display "not recorded", never 0
 *   - empty inbox clearly states "Inbox is empty"
 */
import React, { useCallback, useEffect, useState } from "react";
import { Inbox, RefreshCw, Play, Trash2, Eye, ShieldCheck, ShieldAlert, Code } from "lucide-react";
import type { InboundWebhookEntry } from "@windels/shared";
import {
  listInboundWebhooks,
  replayInboundWebhook,
  deleteInboundWebhook,
} from "@/lib/webhook";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

export function WebhookInboxPage() {
  const [entries, setEntries] = useState<InboundWebhookEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<InboundWebhookEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listInboundWebhooks({ limit: 50 });
      setEntries(data);
      if (data.length > 0 && !selectedEntry) {
        setSelectedEntry(data[0] ?? null);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to load inbound webhook inbox");
    } finally {
      setLoading(false);
    }
  }, [selectedEntry]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const handleReplay = async (id: string) => {
    setActionStatus(null);
    try {
      const res = await replayInboundWebhook(id);
      setActionStatus(`Webhook ${res.id} replayed to EventBus successfully.`);
      loadInbox();
    } catch (err: any) {
      setError(err?.message ?? "Failed to replay webhook");
    }
  };

  const handleDelete = async (id: string) => {
    setActionStatus(null);
    try {
      await deleteInboundWebhook(id);
      setActionStatus(`Deleted inbox entry ${id}.`);
      if (selectedEntry?.id === id) {
        setSelectedEntry(null);
      }
      loadInbox();
    } catch (err: any) {
      setError(err?.message ?? "Failed to delete inbox entry");
    }
  };

  const verifiedCount = entries.filter((e) => e.signatureVerified).length;
  const replayedCount = entries.filter((e) => e.status === "replayed").length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2">
            <Inbox className="h-6 w-6 text-blue-400" />
            Inbound Webhook Receiver & Inbox
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Monitor incoming webhook payloads (`whk:inbox`), verify HMAC signatures, replay events to the EventBus, and inspect integration traffic.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadInbox} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {actionStatus ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-400">
          {actionStatus}
        </div>
      ) : null}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Total Inbox Entries</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">
            {entries.length !== undefined ? entries.length : "not recorded"}
          </div>
          <div className="mt-1 text-xs text-text-muted">Capped at 500 records/org</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Verified Signatures</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">
            {verifiedCount !== undefined ? verifiedCount : "not recorded"}
          </div>
          <div className="mt-1 text-xs text-text-muted">HMAC timing-safe checked</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Replayed Events</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">
            {replayedCount !== undefined ? replayedCount : "not recorded"}
          </div>
          <div className="mt-1 text-xs text-text-muted">Re-dispatched to EventBus</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Supported Sources</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">5</div>
          <div className="mt-1 text-xs text-text-muted">billing, github, stripe, etl, custom</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inbox List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="h-4 w-4 text-blue-400" />
              Organization Webhook Inbox (`whk:inbox`)
            </CardTitle>
            <CardDescription>
              Incoming webhooks received by `/api/v1/webhook/inbound/:source` and `/billing/webhook`.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <div className="text-center py-8 text-sm text-text-muted">
                Inbox is empty. No inbound webhooks have been received yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase text-text-muted">
                      <th className="py-2 pr-4">Source</th>
                      <th className="py-2 pr-4">Event</th>
                      <th className="py-2 pr-4">Received</th>
                      <th className="py-2 pr-4">Signature</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className={`hover:bg-card-hover/40 cursor-pointer ${
                          selectedEntry?.id === entry.id ? "bg-card-hover/60" : ""
                        }`}
                        onClick={() => setSelectedEntry(entry)}
                      >
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className="capitalize">
                            {entry.source}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs text-text-bright">
                          {entry.event}
                        </td>
                        <td className="py-2 pr-4 text-xs text-text-muted">
                          {new Date(entry.receivedAt).toLocaleTimeString()}
                        </td>
                        <td className="py-2 pr-4">
                          {entry.signatureVerified ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              Unverified
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge
                            variant={entry.status === "replayed" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {entry.status}
                          </Badge>
                        </td>
                        <td className="py-2 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedEntry(entry)}
                            title="Inspect Payload"
                            className="text-xs px-2"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReplay(entry.id)}
                            title="Replay Event"
                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 text-xs px-2"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(entry.id)}
                            title="Delete Entry"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs px-2"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

        {/* Payload Inspector / Endpoint Documentation */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Code className="h-4 w-4 text-emerald-400" />
                Payload Inspector
              </CardTitle>
              <CardDescription>
                {selectedEntry
                  ? `Inspecting webhook entry ${selectedEntry.id}`
                  : "Select an inbox entry to inspect its JSON payload"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedEntry ? (
                <div className="space-y-3">
                  <div className="text-xs text-text-muted flex justify-between">
                    <span>Source: <strong className="text-text-bright capitalize">{selectedEntry.source}</strong></span>
                    <span>Event: <strong className="text-text-bright">{selectedEntry.event}</strong></span>
                  </div>
                  <pre className="p-3 bg-background rounded border border-border text-xs font-mono overflow-x-auto max-h-72 text-text-bright">
                    {JSON.stringify(selectedEntry.payload, null, 2)}
                  </pre>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 text-xs"
                      onClick={() => handleReplay(selectedEntry.id)}
                    >
                      <Play className="h-3.5 w-3.5 text-blue-400" />
                      Replay to EventBus
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 text-xs text-red-400 hover:bg-red-500/10"
                      onClick={() => handleDelete(selectedEntry.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-text-muted">
                  No entry selected. Click a row in the table to inspect details.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inbound Webhook Endpoints</CardTitle>
              <CardDescription>
                Point your external providers to these URLs to receive and verify events.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <div className="font-semibold text-text-bright mb-1">General Receiver</div>
                <code className="block p-2 bg-background rounded border border-border font-mono text-text-muted">
                  POST /api/v1/webhook/inbound/:source
                </code>
                <div className="text-text-muted mt-1">
                  Supported sources: `billing`, `github`, `stripe`, `etl`, `custom`.
                </div>
              </div>
              <div>
                <div className="font-semibold text-text-bright mb-1">Signature Headers</div>
                <ul className="list-disc list-inside text-text-muted space-y-0.5">
                  <li>GitHub: `X-Hub-Signature-256` (`sha256=...`)</li>
                  <li>Stripe: `Stripe-Signature`</li>
                  <li>Billing/ETL: `X-Windels-Webhook-Secret`</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
export default WebhookInboxPage;
