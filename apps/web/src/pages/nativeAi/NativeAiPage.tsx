/** Session 181 — nativeAi (STUB) console
 * The legacy `nativeAi` module (0 routes, 508 LOC) was superseded by
 * `nativeAiApi` (Session 172, 16 routes, `/v1`). This page notes the
 * supersession and links to the current surface.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
export function NativeAiPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-black text-text-bright">Native AI — Legacy Stub</h1>
      <Card><CardHeader><CardTitle>Superseded by Native AI API</CardTitle><CardDescription>Session 172 moved the Native AI surface to `/v1` (`nativeAiApi`, 16 routes, health/acceptance-gated `windels-native`). The `nativeAi` key (0 routes) is retained for backward compatibility and now aliases the current client.</CardDescription></CardHeader><CardContent className="flex items-center gap-2"><Badge variant="slate">STUB</Badge><span className="text-sm text-text-muted">Use <code>/v1/chat/completions</code> via `lib/nativeAiApi.ts` and Developer Platform → Native AI.</span><Button size="sm" variant="outline" onClick={()=>location.assign("/app/native-ai-api")}>Open Native AI API</Button></CardContent></Card>
    </div>
  );
}
export default NativeAiPage;
