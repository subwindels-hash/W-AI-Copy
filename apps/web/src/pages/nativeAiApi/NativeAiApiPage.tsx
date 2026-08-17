/** Session 181 — Native AI API console (public /v1 surface)
 * The Native AI API (`/v1/chat/completions`, `/v1/embeddings`, etc.) is
 * health/acceptance-gated and API-key authenticated. This console mirrors
 * the Developer Platform playground (`pages/developerPortal/`) but is
 * mounted at `/app/native-ai-api` so the inventory sees a page for the
 * `nativeAiApi` module key.
 */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { nativeAiApi } from "@/lib/nativeAiApi";

export function NativeAiApiPage() {
  const [model, setModel] = useState("windels-native");
  const [input, setInput] = useState("Hello from WINDELS");
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function chat() {
    setBusy(true);
    try {
      const res: any = await nativeAiApi.chat({ model, messages: [{ role: "user", content: input }] } as any);
      setOut(JSON.stringify(res, null, 2));
    } catch (e: any) { setOut(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-text-bright">Native AI API — Public /v1</h1>
        <p className="text-sm text-text-muted">Health/acceptance-gated `windels-native` provider. Real provider required for production; demo echo is never exposed via `/v1`.</p>
      </div>
      <Card><CardHeader><CardTitle>Chat Completions (OpenAI-compatible)</CardTitle><CardDescription>POST /v1/chat/completions — requires `Authorization: Bearer <api-key>` with `native-ai:chat` scope.</CardDescription></CardHeader><CardContent className="space-y-3"><Input value={model} onChange={e=>setModel(e.target.value)} placeholder="model" /><Textarea rows={3} value={input} onChange={e=>setInput(e.target.value)} placeholder="messages[0].content" /><Button onClick={chat} loading={busy}>Send</Button>{out && <pre className="rounded bg-black/40 p-3 text-xs overflow-auto max-h-96">{out}</pre>}</CardContent></Card>
      <Card><CardContent className="p-4 text-xs text-text-muted flex items-start gap-2"><Badge variant="emerald">OpenAPI 3.1</Badge><span>See `docs/NATIVE_AI_API.md` and Developer Platform → Models/Keys/Playground for scopes, SSE, vision, files, and five-language examples. `WINDELS_NATIVE_API_ENABLED=true` required to publish models.</span></CardContent></Card>
    </div>
  );
}
export default NativeAiApiPage;
