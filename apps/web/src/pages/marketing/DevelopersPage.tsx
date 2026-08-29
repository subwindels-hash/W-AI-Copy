import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Code2, Webhook, Key, BookOpen, Terminal, Cpu } from "lucide-react";

const FEATURES = [
  { icon: Key, title: "API keys", desc: "Scoped keys with READ/WRITE/ADMIN permissions. Hashed at rest, returned once on creation." },
  { icon: Webhook, title: "Webhooks", desc: "HMAC-signed deliveries, exponential backoff, 5 retries, 7 event types." },
  { icon: Terminal, title: "REST API", desc: "Live public REST API at /api/rest/v1 — list workflows, trigger runs, list agents, and send channel messages with a scoped key." },
  { icon: Cpu, title: "Model-agnostic", desc: "Route between OpenAI, Anthropic, Azure, Bedrock, or local — one API to call." },
];

export default function DevelopersPage() {
  return (
    <div>
      <section className="py-16 text-center">
        <div className="max-w-4xl mx-auto px-6">
          <Badge variant="teal" className="mb-5"><Code2 className="inline h-3.5 w-3.5 mr-1"/> Developers</Badge>
          <h1 className="text-5xl md:text-6xl font-bold text-text-bright">Build on WINDELS</h1>
          <p className="mt-5 text-lg text-text-muted max-w-2xl mx-auto">Everything you need to integrate AI workforces into your product. Stable APIs, typed SDKs, signed webhooks, and docs that don't lie.</p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/auth/register"><Button size="lg">Get an API key</Button></Link>
            <Link to="/docs"><Button size="lg" variant="outline"><BookOpen className="inline h-4 w-4 mr-2"/>Read the docs</Button></Link>
          </div>
        </div>
      </section>

      <section className="py-10">
        <div className="max-w-6xl mx-auto px-6">
          <Card className="bg-black/40 border-white/10 overflow-hidden">
            <CardContent className="p-0">
              <div className="border-b border-white/5 px-4 py-2 flex items-center gap-2 text-xs text-text-muted">
                <span className="h-2.5 w-2.5 rounded-full bg-crimson"/>
                <span className="h-2.5 w-2.5 rounded-full bg-amber"/>
                <span className="h-2.5 w-2.5 rounded-full bg-emerald"/>
                <span className="ml-2 font-mono">bash</span>
              </div>
              <pre className="p-5 font-mono text-sm leading-relaxed overflow-x-auto text-slate-200">
{`# The REST API is live today — no SDK install required.
# Create a scoped API key in Dashboard -> API Keys, then call it directly:

# Trigger a workflow run with curl
curl -X POST https://api.windels.ai/api/rest/v1/workflows/wf_abc123/run \\
  -H "Authorization: Bearer WND_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"input": {"customerId": "cus_42", "tier": "pro"}}'

# Response
# { "ok": true, "data": { "runId": "run_xyz", "status": "RUNNING" } }`}
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-14">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map(f => (
              <Card key={f.title}><CardContent className="pt-6">
                <div className="h-10 w-10 rounded-lg bg-azure/20 text-azure grid place-items-center mb-3"><f.icon/></div>
                <div className="font-semibold text-text-bright">{f.title}</div>
                <p className="text-sm text-text-muted mt-1">{f.desc}</p>
              </CardContent></Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-4">
          <Card><CardHeader><CardTitle>REST endpoint index</CardTitle><CardDescription>All at /api/rest/v1</CardDescription></CardHeader>
            <CardContent>
              <ul className="font-mono text-xs space-y-1">
                <li><span className="text-emerald">GET</span>  / — API identity</li>
                <li><span className="text-emerald">GET</span>  /workflows</li>
                <li><span className="text-azure">POST</span> /workflows/:id/run</li>
                <li><span className="text-emerald">GET</span>  /agents</li>
                <li><span className="text-emerald">GET</span>  /talk/channels</li>
                <li><span className="text-azure">POST</span> /talk/channels/:id/messages</li>
              </ul>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle>Webhook events</CardTitle><CardDescription>Signed HMAC-SHA256 with v1= prefix</CardDescription></CardHeader>
            <CardContent>
              <ul className="font-mono text-xs space-y-1">
                <li>workflow.run.started</li>
                <li>workflow.run.succeeded</li>
                <li>workflow.run.failed</li>
                <li>message.created</li>
                <li>ai.request / ai.error</li>
                <li>webhook.delivery_failed</li>
                <li>integration.connected</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
