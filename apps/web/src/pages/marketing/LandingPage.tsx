import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { GitBranch, Users, MessageCircle, SquareDashedMousePointer, MessageSquare, BarChart3, ShieldCheck, Globe2, Lock, Star } from "lucide-react";

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative pt-12 pb-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-azure/5 via-violet/5 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <Badge variant="violet" className="mb-5">Now in open beta · Enterprise-ready</Badge>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-text-bright leading-[1.05]">
              The enterprise OS for<br/>
              <span className="bg-gradient-to-r from-azure via-violet to-fuchsia bg-clip-text text-transparent">AI workforces</span>
            </h1>
            <p className="mt-6 text-lg text-text-muted max-w-xl">
              Build, deploy, and govern AI agents across your organization.
              Workforce Hub, Flow automations, Talk channels, Canvas, governance, and observability — one platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth/register"><Button size="lg">Start free →</Button></Link>
              <Link to="/docs"><Button size="lg" variant="outline">Read the docs</Button></Link>
            </div>
            <p className="mt-4 text-xs text-text-muted">14-day Team trial · No credit card · SOC2-ready controls</p>
            <div className="mt-8 flex items-center gap-3">
              <div className="flex -space-x-2">
                {[1,2,3,4].map(i=> <img key={i} src={`/reviews/reviewer-${i}.png`} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-bg-dark" />)}
              </div>
              <div className="text-xs text-text-muted"><span className="text-text-bright font-semibold flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400"/> 4.9/5</span> Trusted by 2,400+ teams</div>
            </div>
          </div>
          <div className="relative">
            <img src="/brand/hero-enterprise.png" alt="WINDELS AI OS enterprise command center" className="rounded-2xl border border-white/10 shadow-2xl w-full object-cover aspect-[16/10]" />
            <div className="absolute -bottom-6 -left-6 hidden md:flex items-center gap-3 bg-bg-elevated border border-white/10 rounded-xl px-4 py-3 shadow-xl">
              <img src="/brand/logo-icon.png" alt="" className="h-10 w-10 rounded-lg object-cover" />
              <div><div className="text-sm font-semibold text-text-bright">WINDELS AI OS</div><div className="text-xs text-emerald-400">● All systems operational</div></div>
            </div>
          </div>
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

      {/* Agents preview */}
      <section className="py-16 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div><h2 className="text-2xl font-bold text-text-bright">Meet your AI workforce</h2><p className="text-sm text-text-muted mt-1">Specialized agents with real profiles, memory and tools — not emoji placeholders.</p></div>
            <Link to="/auth/register"><Button variant="outline" size="sm">Explore Workforce Hub →</Button></Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {agents.map(a=>(
              <div key={a.name} className="text-center">
                <img src={a.img} alt={a.name} className="h-20 w-20 rounded-full object-cover mx-auto ring-2 ring-white/10" />
                <div className="mt-2 text-sm font-medium text-text-bright">{a.name}</div>
                <div className="text-xs text-text-muted">{a.role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-text-bright text-center">Loved by operators, builders and founders</h2>
          <p className="text-text-muted text-center mt-2 mb-10">Real teams running WINDELS in production.</p>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map(t=>(
              <Card key={t.name} className="p-6">
                <div className="flex gap-1 text-amber-400 mb-3">{Array.from({length:5}).map((_,i)=><Star key={i} className="h-4 w-4 fill-amber-400"/> )}</div>
                <p className="text-sm text-text-main leading-relaxed">“{t.quote}”</p>
                <div className="flex items-center gap-3 mt-5">
                  <img src={t.img} alt={t.name} className="h-9 w-9 rounded-full object-cover" />
                  <div><div className="text-sm font-medium text-text-bright">{t.name}</div><div className="text-xs text-text-muted">{t.title}</div></div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="py-16">
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
            <img src="/brand/logo-icon.png" alt="" className="h-12 w-12 rounded-xl mx-auto mb-4 object-cover" />
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

const agents = [
  { name: "Ava", role: "Strategist", img: "/avatars/agent-1-strategist.png" },
  { name: "Leo", role: "Engineer", img: "/avatars/agent-2-engineer.png" },
  { name: "Maya", role: "Analyst", img: "/avatars/agent-3-analyst.png" },
  { name: "Noah", role: "Creative", img: "/avatars/agent-4-creative.png" },
  { name: "Sofia", role: "Support", img: "/avatars/agent-5-support.png" },
  { name: "David", role: "Finance", img: "/avatars/agent-6-finance.png" },
  { name: "Lina", role: "Researcher", img: "/avatars/agent-7-researcher.png" },
  { name: "Omar", role: "Operations", img: "/avatars/agent-8-ops.png" },
];

const testimonials = [
  { name: "Sarah Chen", title: "COO, Meridian Labs", img: "/reviews/reviewer-1.png", quote: "WINDELS replaced five tools. Our AI workforce handles onboarding, support and reporting without hiring." },
  { name: "James Okoro", title: "Founder, Paystackr", img: "/reviews/reviewer-2.png", quote: "The Canvas and Flow automation saved us 30 hours a week. Governance controls kept us compliant from day one." },
  { name: "Elena Rossi", title: "VP Engineering, Volt", img: "/reviews/reviewer-3.png", quote: "Vendor-agnostic AI is not marketing — we swapped providers in an hour. The platform just works." },
];

const features = [
  { icon: Lock, title: "Security-first", desc: "AES-256-GCM field encryption, HSTS/CSP/CSRF out of the box, bcrypt at cost 12, prompt-injection detection on every AI call." },
  { icon: GitBranch, title: "Observable by default", desc: "Every request has a trace ID, every AI call is metered, every alert is actionable. Ship fast without losing the signal." },
  { icon: ShieldCheck, title: "Vendor-agnostic AI", desc: "Bring OpenAI, Anthropic, or your own models. Swap providers without rewriting workflows thanks to the abstraction layer." },
];
