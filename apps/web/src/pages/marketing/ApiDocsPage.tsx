/**
 * WINDELS AI OS API Documentation.
 *
 * Developer reference for the real `/api/rest/v1` gateway: getting started,
 * authentication, endpoints, errors, rate limits, webhooks, versioning,
 * billing and multi-language copyable examples. Every endpoint listed here is
 * implemented by the actual backend — nothing is a placeholder.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Copy, Check } from "lucide-react";

interface Example { lang: string; code: string }
interface Endpoint {
  method: string; path: string; scope: string; desc: string; examples: Example[];
}
interface DocSection { id: string; title: string; body: string[]; endpoints?: Endpoint[] }

const AGENT_EXAMPLES: Example[] = [
  { lang: "JavaScript", code: `const result = await windels.agents.execute({
  agentId: "agent_id",
  input: { message: "Analyze this business data" }
});` },
  { lang: "Python", code: `result = windels.agents.execute(
    agent_id="agent_id",
    input={"message": "Analyze this business data"}
)` },
  { lang: "cURL", code: `curl -X POST https://api.windels.ai/api/rest/v1/agents/agent_id/execute \\
  -H "Authorization: Bearer wnd_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Analyze this business data"}'` },
  { lang: "TypeScript", code: `const result = await windels.agents.execute<string>({
  agentId: "agent_id",
  input: { message: "Analyze this business data" }
});` },
];

const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/api/rest/v1", scope: "any key", desc: "Gateway identity + organization.", examples: [
    { lang: "cURL", code: `curl https://api.windels.ai/api/rest/v1 -H "Authorization: Bearer wnd_your_key"` },
  ]},
  { method: "GET", path: "/api/rest/v1/agents", scope: "agents:read", desc: "List AI agents in your organization.", examples: [
    { lang: "cURL", code: `curl https://api.windels.ai/api/rest/v1/agents -H "Authorization: Bearer wnd_your_key"` },
  ]},
  { method: "POST", path: "/api/rest/v1/agents/:id/execute", scope: "agents:execute", desc: "Execute an AI agent with structured input.", examples: AGENT_EXAMPLES },
  { method: "POST", path: "/api/rest/v1/ai/complete", scope: "ai:execute", desc: "Run an AI completion.", examples: [
    { lang: "cURL", code: `curl -X POST https://api.windels.ai/api/rest/v1/ai/complete \\
  -H "Authorization: Bearer wnd_your_key" -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Hello"}]}'` },
  ]},
  { method: "GET", path: "/api/rest/v1/workflows", scope: "workflows:read", desc: "List workflows.", examples: [
    { lang: "cURL", code: `curl https://api.windels.ai/api/rest/v1/workflows -H "Authorization: Bearer wnd_your_key"` },
  ]},
  { method: "POST", path: "/api/rest/v1/workflows/:id/execute", scope: "workflows:execute", desc: "Trigger a workflow execution.", examples: [
    { lang: "cURL", code: `curl -X POST https://api.windels.ai/api/rest/v1/workflows/wf_1/execute \\
  -H "Authorization: Bearer wnd_your_key" -H "Content-Type: application/json" \\
  -d '{"input":{"customerId":"cus_42"}}'` },
  ]},
  { method: "GET", path: "/api/rest/v1/knowledge/search", scope: "knowledge:read", desc: "Search approved knowledge.", examples: [
    { lang: "cURL", code: `curl "https://api.windels.ai/api/rest/v1/knowledge/search?q=growth" -H "Authorization: Bearer wnd_your_key"` },
  ]},
  { method: "GET", path: "/api/rest/v1/trading/analysis", scope: "trading:read", desc: "Market & technical analysis (analysis only).", examples: [
    { lang: "cURL", code: `curl "https://api.windels.ai/api/rest/v1/trading/analysis?symbol=BTCUSDT&timeframe=1d" -H "Authorization: Bearer wnd_your_key"` },
  ]},
  { method: "POST", path: "/api/rest/v1/media/generate", scope: "media:generate", desc: "Generate image, audio or video.", examples: [
    { lang: "cURL", code: `curl -X POST https://api.windels.ai/api/rest/v1/media/generate \\
  -H "Authorization: Bearer wnd_your_key" -H "Content-Type: application/json" \\
  -d '{"modality":"image","op":"text2image","prompt":"a serene mountain lake"}'` },
  ]},
];

const SECTIONS: DocSection[] = [
  { id: "start", title: "Getting Started", body: [
    "Create an account, then generate an API key in the Developer Dashboard (API Keys page).",
    "Authenticate every request with the key in the Authorization header: `Authorization: Bearer wnd_...`.",
    "Restrict keys by environment (development / test / production), optional IP CIDRs, and granular scopes.",
    "Your first call: GET /api/rest/v1 returns the gateway identity and your organization name.",
  ]},
  { id: "auth", title: "Authentication", body: [
    "All API requests use API-key authentication via the Authorization header (Bearer).",
    "Keys are scoped to your organization and to the granular capabilities you grant (e.g. agents:execute).",
    "Plaintext keys are shown exactly once at creation and stored as SHA-256 hashes — never recoverable.",
    "OAuth 2.0 is supported for applications that need delegated authorization; configure redirect URLs on your application.",
  ]},
  { id: "endpoints", title: "API Reference", body: [
    "The stable public surface lives at /api/rest/v1. Endpoints below are implemented and enforced by the live gateway.",
  ], endpoints: ENDPOINTS },
  { id: "errors", title: "Errors", body: [
    "401 Unauthorized — missing or invalid API key.",
    "403 Forbidden — missing scope, or IP not allowed by the key's restrictions.",
    "404 Not Found — resource not found in your organization.",
    "429 Too Many Requests — rate limit exceeded (see X-RateLimit-* headers).",
    "500 Internal — a WINDELS service error.",
  ]},
  { id: "limits", title: "Rate Limits", body: [
    "The gateway emits X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset on every response.",
    "Per-key sliding-window limits apply; keys with granular scopes get a higher default allowance.",
    "Enterprise plans can request higher limits.",
  ]},
  { id: "webhooks", title: "Webhooks", body: [
    "Subscribe to events via the Developers page. Payloads are HMAC-SHA256 signed with a per-endpoint secret (`X-Windels-Signature: v1=...`).",
    "Failed deliveries are retried with exponential backoff and recorded for replay.",
    "Supported events include workflow.*, agent.*, ai.job.*, media.*, payment.*, subscription.*, trading.*, market.* and more.",
  ]},
  { id: "versioning", title: "Versioning", body: [
    "The current stable version is v1 (/api/rest/v1).",
    "Breaking changes require a new major version; deprecated versions keep a deprecation window and migration guide.",
    "Backward-compatible additions are additive within a version.",
  ]},
  { id: "billing", title: "Billing & Usage", body: [
    "Every gateway call is recorded to a persistent usage ledger.",
    "The Developer Dashboard shows request volume, success/failure, token usage and an estimated cost.",
    "Usage is metered through the existing WINDELS billing architecture (subscriptions, wallet, WMPC gift cards).",
  ]},
  { id: "security", title: "Security", body: [
    "All access is subject to IAM, RBAC/ABAC, scope enforcement, rate limiting, audit logging and the existing security controls.",
    "Sensitive capabilities require explicit scopes; production access for an application is gated by Super Admin approval.",
    "Never expose secrets in client code — keys are returned once and stored hashed.",
  ]},
];

export default function ApiDocsPage() {
  const [active, setActive] = useState("start");
  const [copied, setCopied] = useState<string | null>(null);
  const section = SECTIONS.find((s) => s.id === active)!;

  async function copy(text: string, id: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); window.setTimeout(() => setCopied(null), 1500); } catch { /* optional */ }
  }

  return (
    <div className="py-10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-bright">API Documentation</h1>
          <p className="text-sm text-text-muted mt-1">The WINDELS AI OS API reference. Every endpoint is live — try the playground in the Developer Dashboard.</p>
        </div>
        <div className="grid md:grid-cols-[220px_1fr] gap-8">
          <nav className="space-y-1">
            {SECTIONS.map((s) => (
              <button key={s.id} onClick={() => setActive(s.id)}
                className={`block w-full text-left px-3 py-2 rounded-lg text-sm ${s.id === active ? "bg-azure/15 text-azure" : "text-text-muted hover:bg-white/5"}`}>
                {s.title}
              </button>
            ))}
          </nav>
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-text-bright">{section.title}</h2>
            {section.body.map((b, i) => <p key={i} className="text-sm text-text-main leading-relaxed">{b}</p>)}

            {section.endpoints?.map((ep) => (
              <div key={ep.method + ep.path} className="rounded-xl border border-white/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center gap-2 flex-wrap">
                  <Badge variant={ep.method === "GET" ? "success" : "azure"} className="font-mono">{ep.method}</Badge>
                  <code className="text-sm text-text-main">{ep.path}</code>
                  <span className="ml-auto text-[11px] text-text-muted">scope: {ep.scope}</span>
                </div>
                <div className="px-4 py-2 text-sm text-text-muted">{ep.desc}</div>
                <div className="space-y-2 px-4 pb-4">
                  {ep.examples.map((ex) => (
                    <div key={ex.lang} className="relative rounded-lg border border-white/10 bg-bg-deep/60 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
                        <span className="text-[11px] uppercase tracking-wide text-text-muted">{ex.lang}</span>
                        <button onClick={() => copy(ex.code, ex.lang + ep.path)} className="text-text-muted hover:text-text-bright" aria-label={`Copy ${ex.lang} example`}>
                          {copied === ex.lang + ep.path ? <Check className="h-3.5 w-3.5 text-emerald"/> : <Copy className="h-3.5 w-3.5"/>}
                        </button>
                      </div>
                      <pre className="p-3 text-xs leading-relaxed overflow-x-auto text-slate-200">{ex.code}</pre>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
