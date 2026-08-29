import { useCallback, useEffect, useState } from "react";
import { Bot, CircleAlert, ExternalLink, RefreshCw, Send, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { nativeAiStudioApi, type NativeAiConsoleStatus, type NativeAiConsoleUsage } from "@/lib/nativeAi";

// Native `costMicros` stores USD × 1e8 (millionths of a cent), matching the
// durable Developer Platform usage ledger.
function fmtMicros(value: number) {
  return `$${(value / 100_000_000).toFixed(4)}`;
}

/**
 * First-party Native AI Studio.
 *
 * This uses a member JWT and the `/api/v1/native-ai` Studio facade. It is not
 * a replacement for `/v1`: external callers must still use an API key there.
 */
export function NativeAiPage() {
  const [status, setStatus] = useState<NativeAiConsoleStatus | null>(null);
  const [usage, setUsage] = useState<NativeAiConsoleUsage | null>(null);
  const [prompt, setPrompt] = useState("Summarize the value of an honest AI availability check.");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStatus, nextUsage] = await Promise.all([
        nativeAiStudioApi.status(),
        nativeAiStudioApi.usage(),
      ]);
      setStatus(nextStatus);
      setUsage(nextUsage);
    } catch (err: any) {
      setError(err?.message ?? "Could not load Native AI Studio");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function send() {
    if (!prompt.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const output = await nativeAiStudioApi.chat({
        model: "windels-native",
        messages: [{ role: "user", content: prompt.trim() }],
        stream: false,
      });
      setResult(output.content ?? (output.toolCalls.length ? JSON.stringify(output.toolCalls, null, 2) : "The model returned no text."));
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Native AI request failed");
    } finally {
      setRunning(false);
    }
  }

  if (loading && !status) return <div className="p-6 text-sm text-text-muted">Loading Native AI Studio…</div>;

  const available = status?.availability === "available";
  const quota = usage?.quota;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Native AI Studio</h1>
          <p className="text-sm text-text-muted">Member-authenticated workspace for the same health-gated, real-provider-only WINDELS model router used by the public API.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => void load()} loading={loading}><RefreshCw className="mr-1 h-4 w-4"/>Refresh</Button>
          <Button variant="outline" onClick={() => location.assign("/app/native-ai-api")}><ExternalLink className="mr-1 h-4 w-4"/>Public API</Button>
        </div>
      </div>

      {!available && (
        <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400"/>
          <div>
            <div className="font-semibold text-text-bright">No accepted real model is available</div>
            <div className="text-text-muted">{status?.unavailableReason === "native_api_disabled" ? "An operator must set WINDELS_NATIVE_API_ENABLED=true after provider acceptance." : "The native API is enabled, but no healthy real provider currently satisfies the Native AI contract."} Demo and echo fallbacks are intentionally unavailable here.</div>
          </div>
        </div>
      )}
      {error && <div className="rounded-lg border border-crimson/30 bg-crimson/5 p-3 text-sm text-crimson">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Availability</div><div className="mt-1 flex items-center gap-2 text-lg font-bold text-text-bright"><Badge variant={available ? "emerald" : "amber"}>{status?.availability ?? "unknown"}</Badge></div><div className="mt-2 text-xs text-text-muted">{status?.models.length ?? 0} health-gated alias(es)</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Native AI requests</div><div className="mt-1 text-2xl font-bold text-text-bright">{usage?.requests ?? "—"}</div><div className="mt-2 text-xs text-text-muted">recorded for this organization</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-text-muted">Monthly product quota</div><div className="mt-1 text-2xl font-bold text-text-bright">{quota?.configured ? `${quota.used} / ${quota.limit}` : "not configured"}</div><div className="mt-2 text-xs text-text-muted">{quota?.configured ? `${quota.remaining} request(s) remaining` : "No active Native AI product subscription."}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-azure"/>Test a real completion</CardTitle>
          <CardDescription>Non-streaming Studio calls use your signed-in member context and the native-ai product quota. External applications must use an API key with <code>/v1/chat/completions</code>.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={5} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask the real WINDELS model…" disabled={!available || running}/>
          <Button onClick={() => void send()} loading={running} disabled={!available || !prompt.trim()}><Send className="mr-1 h-4 w-4"/>Run completion</Button>
          {result && <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-text-bright">{result}</pre>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-violet"/>Published model aliases</CardTitle><CardDescription>Aliases appear only when their backing real provider is healthy. Internal provider/model names are never exposed in this console.</CardDescription></CardHeader>
        <CardContent>
          {status?.models.length ? <div className="space-y-2">{status.models.map((model) => <div key={model.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/10 p-3"><div><div className="font-mono text-sm text-text-bright">{model.id}</div><div className="mt-1 text-xs text-text-muted">{model.capabilities.join(" · ") || "no published capabilities"}</div></div><Badge variant="emerald">available</Badge></div>)}</div> : <div className="text-sm text-text-muted">No aliases are currently published.</div>}
        </CardContent>
      </Card>

      <Card><CardContent className="flex flex-wrap gap-x-6 gap-y-2 p-4 text-xs text-text-muted"><span>Tokens in: {usage?.tokensIn ?? "—"}</span><span>Tokens out: {usage?.tokensOut ?? "—"}</span><span>Recorded AI cost: {usage ? fmtMicros(usage.aiCostMicros) : "—"}</span><span>Studio has no stream, file, image, speech, or transcript bypass.</span></CardContent></Card>
    </div>
  );
}
export default NativeAiPage;
