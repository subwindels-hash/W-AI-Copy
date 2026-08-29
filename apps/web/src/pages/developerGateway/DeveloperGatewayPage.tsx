/**
 * Session 205 — Developer Gateway reference console (/app/developer-gateway)
 *
 * The developer gateway (mounted at /api/rest/v1) is API-key authenticated —
 * a browser JWT session cannot and should not drive it. This console is the
 * gateway's documentation surface (the Session 120/197 pattern): the endpoint
 * catalog with required scopes, auth instructions, and a link to API-key
 * management. The catalog is pinned to the real routes by unit test.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, KeyRound, Plug, ShieldCheck } from "lucide-react";
import { GATEWAY_BASE, GATEWAY_ENDPOINTS } from "@/lib/developerGateway";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

function methodVariant(m: string): any { return m === "GET" ? "azure" : "emerald"; }

export function DeveloperGatewayPage() {
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-100">Developer Gateway</h1>
          <Badge variant="emerald" className="text-xs">API-key authenticated</Badge>
          <Badge variant="outline" className="text-xs">Reference</Badge>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          The machine-to-machine REST surface extending the public API with agent execution, workflow runs,
          knowledge search, trading analysis and media generation. Every call is recorded to the persistent
          usage ledger for billing, audit and the Developer Dashboard — there is no duplicate orchestration
          or mock surface.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-slate-800 bg-slate-900/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100"><KeyRound className="h-4 w-4 text-amber-400" />Authentication</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-400">
            <p>Send your API key with every request:</p>
            <pre className="overflow-x-auto rounded border border-slate-800 bg-slate-950/70 p-2 font-mono text-xs text-slate-300">X-Api-Key: wk_…</pre>
            <p className="text-xs text-slate-500">Keys are org-scoped and carry granular scopes; every listed scope below authorizes its endpoint (any-of).</p>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100"><Plug className="h-4 w-4 text-sky-400" />Base URL</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-400">
            <pre className="overflow-x-auto rounded border border-slate-800 bg-slate-950/70 p-2 font-mono text-xs text-slate-300">{origin || "(app origin)"}{GATEWAY_BASE}</pre>
            <p className="text-xs text-slate-500">Stable versioned surface — paths here are authoritative and never silently changed.</p>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100"><ShieldCheck className="h-4 w-4 text-emerald-400" />Get a key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-400">
            <p>Create a key with the scopes you need in API Keys management, then call the gateway from your integration.</p>
            <Link to="/app/api-keys"><Button variant="outline" className="mt-1"><KeyRound className="mr-1 h-4 w-4" />Manage API keys</Button></Link>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-800 bg-slate-900/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100"><BookOpen className="h-4 w-4 text-violet-400" />Endpoints ({GATEWAY_ENDPOINTS.length})</CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Reference documentation of the registered gateway routes — pinned to the live route table by unit test.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {GATEWAY_ENDPOINTS.map((e) => (
            <div key={`${e.method} ${e.path}`} className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/50 px-3 py-2">
              <Badge variant={methodVariant(e.method)} className="w-14 justify-center font-mono text-[10px]">{e.method}</Badge>
              <span className="font-mono text-sm text-slate-200">{GATEWAY_BASE}{e.path}</span>
              <span className="flex-1 text-xs text-slate-400">{e.summary}</span>
              <span className="flex gap-1">
                {e.scopes.map((s) => <Badge key={s} variant="slate" className="font-mono text-[10px]">{s}</Badge>)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
