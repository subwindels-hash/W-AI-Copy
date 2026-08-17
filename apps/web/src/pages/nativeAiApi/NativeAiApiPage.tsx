/** Public `/v1` Native AI API reference.
 *
 * API keys are intentionally never entered into or persisted by this browser
 * page. Signed-in members can use the separate Native AI Studio; external
 * developers call `/v1` directly with their WND API key.
 */
import { Bot, Code2, ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

export function NativeAiApiPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-text-bright">Native AI API — Public /v1</h1>
        <p className="text-sm text-text-muted">OpenAI-pattern external API for accepted real providers. It is API-key authenticated and never falls back to demo Echo or hash embeddings.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-azure"/>API-key-only boundary</CardTitle><CardDescription>External callers send a WND API key in the Authorization bearer header. This page deliberately does not collect, store, or send API keys from a browser.</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-sm text-text-muted">
          <pre className="overflow-auto rounded bg-black/30 p-4 text-xs text-text-bright">{`curl https://api.windels.ai/v1/chat/completions \\
  -H 'Authorization: Bearer WND_your_key' \\
  -H 'Content-Type: application/json' \\
  -d '{"model":"windels-native","messages":[{"role":"user","content":"Hello"}]}'`}</pre>
          <div className="flex flex-wrap gap-2"><Button onClick={() => location.assign("/app/native-ai")}><Bot className="mr-1 h-4 w-4"/>Open Native AI Studio</Button><Button variant="outline" onClick={() => location.assign("/app/api-keys")}><KeyRound className="mr-1 h-4 w-4"/>Manage API keys</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Code2 className="h-5 w-5 text-violet"/>Implemented compatibility subset</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm text-text-muted sm:grid-cols-2"><code>GET /v1/models</code><code>POST /v1/chat/completions</code><code>POST /v1/responses</code><code>POST /v1/embeddings</code><code>POST /v1/files</code><code>POST /v1/images</code><code>POST /v1/audio/speech</code><code>POST /v1/audio/transcriptions</code><code>GET/POST /v1/agents/*</code><code>GET /v1/openapi.json</code></CardContent>
      </Card>

      <Card><CardContent className="flex items-start gap-3 p-4 text-xs text-text-muted"><ShieldCheck className="h-5 w-5 shrink-0 text-emerald"/><span><Badge variant="emerald">Health-gated</Badge> Aliases appear only after `WINDELS_NATIVE_API_ENABLED=true` and real-provider acceptance. See <code>docs/NATIVE_AI_API.md</code> for scopes, SSE, vision, files, tool calls, agent runs, billing, and explicit unsupported combinations.</span><ExternalLink className="ml-auto h-4 w-4 shrink-0"/></CardContent></Card>
    </div>
  );
}
export default NativeAiApiPage;
