import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { GitBranch, Users, MessageCircle, SquareDashedMousePointer, MessageSquare, BarChart3, ShieldCheck, Globe2, Lock } from "lucide-react";

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative pt-20 pb-24">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <Badge variant="violet" className="mb-5">Now in open beta · Session 13 shipped</Badge>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-text-bright leading-[1.05]">
            The enterprise OS for<br/>
            <span className="bg-gradient-to-r from-azure via-violet to-fuchsia bg-clip-text text-transparent">AI workforces</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-text-muted max-w-2xl mx-auto">
            Build, deploy, and govern AI agents across your organization.
            Workforce Hub, Flow automations, Talk channels, Canvas, governance, and observability — one platform.
          </p>
          <div className="mt-10 flex flex-wrap gap-3 justify-center">
            <Link to="/auth/register"><Button size="lg">Start free →</Button></Link>
            <Link to="/docs"><Button size="lg" variant="outline">Read the docs</Button></Link>
          </div>
          <p className="mt-4 text-xs text-text-muted">14-day Team trial · No credit card · SOC2-ready controls</p>
        </div>
      </section>

      {/* Product grid */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-text-bright text-center mb-3">One platform, seven surfaces</h2>
          <p className="text-text-muted text-center mb-12 max-w-2xl mx-auto">Every module composes with the others. Agents talk to each other, workflows trigger from messages, canvas writes trigger governance audits — out of the box.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {products.map(p => (
              <Card key={p.title} className="group hover:border-azure/40 transition-colors">
                <CardContent className="pt-6">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-azure/30 to-violet/30 grid place-items-center mb-4 text-azure group-hover:text-white transition-colors"><p.icon/></div>
                  <div className="font-semibold text-text-bright">{p.title}</div>
                  <p className="text-sm text-text-muted mt-1">{p.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 gap-8">
          {features.map(f => (
            <div key={f.title}>
              <div className="h-10 w-10 rounded-lg bg-white/5 grid place-items-center mb-3 text-teal"><f.icon/></div>
              <div className="text-lg font-semibold text-text-bright">{f.title}</div>
              <p className="text-sm text-text-muted mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6">
          <Card className="p-10 md:p-16 text-center bg-gradient-to-br from-azure/10 via-violet/10 to-fuchsia/10 border-white/10">
            <h2 className="text-3xl md:text-4xl font-bold text-text-bright">Ready to deploy your AI workforce?</h2>
            <p className="mt-3 text-text-muted">Spin up your organization in under a minute. Bring your own model keys or start with the built-in echo assistant.</p>
            <div className="mt-8 flex flex-wrap gap-3 justify-center">
              <Link to="/auth/register"><Button size="lg">Start free</Button></Link>
              <Link to="/enterprise"><Button size="lg" variant="outline">Talk to sales</Button></Link>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}

const products = [
  { icon: Users, title: "Workforce Hub", desc: "Deploy agents with role-specific prompts, memory, and tools." },
  { icon: SquareDashedMousePointer, title: "Canvas", desc: "Infinite shared workspace with AI-powered blocks." },
  { icon: MessageCircle, title: "AI Chat", desc: "Multi-model conversations with context and artifacts." },
  { icon: MessageSquare, title: "Talk", desc: "Team messaging with @mention AI replies and meeting notes." },
  { icon: GitBranch, title: "Flow", desc: "Visual workflow automation with approvals and retries." },
  { icon: BarChart3, title: "Analytics", desc: "Usage, success rates, cost forecasts, model comparison." },
  { icon: ShieldCheck, title: "Governance", desc: "RBAC, audit logs, retention, compliance, GDPR exports." },
  { icon: Globe2, title: "Platform", desc: "Metrics, logs, traces, regions, CDN, DR, circuit breakers." },
];

const features = [
  { icon: Lock, title: "Security-first", desc: "AES-256-GCM field encryption, HSTS/CSP/CSRF out of the box, bcrypt at cost 12, prompt-injection detection on every AI call." },
  { icon: GitBranch, title: "Observable by default", desc: "Every request has a trace ID, every AI call is metered, every alert is actionable. Ship fast without losing the signal." },
  { icon: ShieldCheck, title: "Vendor-agnostic AI", desc: "Bring OpenAI, Anthropic, or your own models. Swap providers without rewriting workflows thanks to the abstraction layer." },
];
