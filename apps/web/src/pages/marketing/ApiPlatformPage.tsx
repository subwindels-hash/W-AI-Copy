/**
 * Public API Platform landing page ("Build with WINDELS AI OS").
 *
 * A public-facing page (no auth) introducing the WINDELS AI OS API platform:
 * what developers can build, AI/business/specialized capabilities, SDKs,
 * security, pricing and how to get started. Everything links to the real
 * surfaces — the Developer Portal, API docs and registration.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  ArrowRight, BookOpen, Bot, Cpu, Key, Layers, Rocket, ShieldCheck,
  Terminal, Webhook, Zap, Brain, Search, Globe, FileText, Music, Video,
  TrendingUp, LineChart, Factory,
} from "lucide-react";

const AI_CAPABILITIES = [
  { icon: Brain, title: "AI Reasoning & Agents", desc: "Execute WINDELS AI agents, orchestrate the AI workforce, and run completions." },
  { icon: Search, title: "AI Search & Knowledge", desc: "Search approved organization knowledge and the Knowledge Graph." },
  { icon: FileText, title: "Document Intelligence", desc: "Summarization, classification and document-driven automation." },
  { icon: Bot, title: "Workflow Automation", desc: "Create, trigger and monitor multi-step AI workflows." },
  { icon: Video, title: "Media Generation", desc: "Image, video, music and document generation." },
  { icon: Music, title: "Voice AI", desc: "Text-to-speech, speech-to-text and voice generation." },
];

const BUSINESS_CAPABILITIES = [
  { icon: LineChart, title: "Analytics & Usage", desc: "Read platform analytics, usage and billing metrics." },
  { icon: Webhook, title: "Webhooks & Events", desc: "Subscribe to AI, workflow, payment and trading events." },
  { icon: Factory, title: "Enterprise", desc: "CRM, helpdesk, ERP and business-intelligence integrations." },
  { icon: Globe, title: "Marketplace", desc: "Discover and manage API products and marketplace capabilities." },
];

const SPECIALIZED = [
  { icon: TrendingUp, title: "Trading Intelligence", desc: "Market analysis and trading signals (analysis only, not a brokerage)." },
  { icon: ShieldCheck, title: "Security & Governance", desc: "Granular scopes, rate limiting, IP restrictions, audit logging." },
];

const SDK_LANGS = ["JavaScript", "TypeScript", "Python", "cURL", "PHP", "Java", "Go"];

export default function ApiPlatformPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden py-20 md:py-28">
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "radial-gradient(60% 50% at 50% 0%, rgba(59,130,246,0.25), transparent)" }} />
        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <Badge variant="teal" className="mb-5"><Zap className="inline h-3.5 w-3.5 mr-1"/> WINDELS AI OS API Platform</Badge>
          <h1 className="text-5xl md:text-7xl font-black text-text-bright">Build with <span className="bg-gradient-to-r from-azure to-violet bg-clip-text text-transparent">WINDELS AI OS</span></h1>
          <p className="mt-6 text-lg md:text-xl text-text-muted max-w-3xl mx-auto">
            Integrate powerful AI agents, automation, intelligence, media, business, and enterprise capabilities directly into your applications.
          </p>
          <div className="mt-9 flex flex-wrap gap-3 justify-center">
            <Link to="/auth/register"><Button size="lg">Get Started <ArrowRight className="h-4 w-4 ml-1" /></Button></Link>
            <Link to="/docs/api"><Button size="lg" variant="outline"><BookOpen className="h-4 w-4 mr-2" />Read Documentation</Button></Link>
            <Link to="/app/developer-portal"><Button size="lg" variant="ghost"><Key className="h-4 w-4 mr-2" />Create API Key</Button></Link>
          </div>
          <p className="mt-5 text-sm text-text-muted">Free to start · Pay as you go · Enterprise plans available</p>
        </div>
      </section>

      {/* Code example */}
      <section className="py-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="rounded-2xl border border-white/10 bg-bg-dark/60 overflow-hidden">
            <div className="border-b border-white/5 px-4 py-2 flex items-center gap-2 text-xs text-text-muted">
              <span className="h-2.5 w-2.5 rounded-full bg-crimson"/><span className="h-2.5 w-2.5 rounded-full bg-amber"/><span className="h-2.5 w-2.5 rounded-full bg-emerald"/>
              <span className="ml-2 font-mono">JavaScript</span>
              <span className="ml-auto"><Terminal className="h-3.5 w-3.5"/></span>
            </div>
            <pre className="p-5 font-mono text-sm leading-relaxed overflow-x-auto text-slate-200">
{`import { Windels } from "@windels/sdk";

const windels = new Windels({ apiKey: "wnd_your_key_here" });

// Execute an AI agent
const result = await windels.agents.execute({
  agentId: "agent_id",
  input: { message: "Analyze this business data" }
});

console.log(result.content);`}
            </pre>
          </div>
        </div>
      </section>

      {/* AI capabilities */}
      <section className="py-14">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-text-bright">AI capabilities</h2>
          <p className="mt-2 text-text-muted">Powerful, production-ready AI building blocks.</p>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AI_CAPABILITIES.map((c) => (
              <div key={c.title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="h-10 w-10 rounded-lg bg-azure/20 text-azure grid place-items-center mb-3"><c.icon/></div>
                <div className="font-semibold text-text-bright">{c.title}</div>
                <p className="text-sm text-text-muted mt-1">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Business + specialized */}
      <section className="py-14">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-8">
          <div>
            <h3 className="text-2xl font-bold text-text-bright">Business APIs</h3>
            <div className="mt-5 space-y-3">
              {BUSINESS_CAPABILITIES.map((c) => (
                <div key={c.title} className="flex items-start gap-3 rounded-xl border border-white/10 p-4">
                  <div className="h-9 w-9 rounded-lg bg-violet/20 text-violet grid place-items-center shrink-0"><c.icon/></div>
                  <div><div className="font-medium text-text-bright">{c.title}</div><p className="text-sm text-text-muted">{c.desc}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-text-bright">Specialized & Enterprise</h3>
            <div className="mt-5 space-y-3">
              {SPECIALIZED.map((c) => (
                <div key={c.title} className="flex items-start gap-3 rounded-xl border border-white/10 p-4">
                  <div className="h-9 w-9 rounded-lg bg-emerald/20 text-emerald grid place-items-center shrink-0"><c.icon/></div>
                  <div><div className="font-medium text-text-bright">{c.title}</div><p className="text-sm text-text-muted">{c.desc}</p></div>
                </div>
              ))}
              <div className="rounded-xl border border-azure/30 bg-azure/10 p-4 text-sm text-text-main">
                <div className="font-semibold text-azure mb-1">One authenticated surface</div>
                Every endpoint is API-key authenticated, scope-enforced, rate-limited, metered and audited through the existing WINDELS security & governance stack.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SDKs */}
      <section className="py-14">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-text-bright">Official SDKs & tools</h2>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {SDK_LANGS.map((l) => <Badge key={l} variant="secondary" className="px-4 py-2 text-sm">{l}</Badge>)}
          </div>
          <div className="mt-8 grid sm:grid-cols-3 gap-4 text-left">
            <div className="rounded-2xl border border-white/10 p-5"><Cpu className="h-6 w-6 text-azure mb-2"/><div className="font-semibold">REST API</div><p className="text-sm text-text-muted mt-1">Stable /api/rest/v1 surface with versioning.</p></div>
            <div className="rounded-2xl border border-white/10 p-5"><Layers className="h-6 w-6 text-azure mb-2"/><div className="font-semibold">Typed SDKs</div><p className="text-sm text-text-muted mt-1">Generated clients for 7+ languages.</p></div>
            <div className="rounded-2xl border border-white/10 p-5"><Webhook className="h-6 w-6 text-azure mb-2"/><div className="font-semibold">Webhooks</div><p className="text-sm text-text-muted mt-1">HMAC-signed events with retries & replay.</p></div>
          </div>
        </div>
      </section>

      {/* Security / pricing / enterprise */}
      <section className="py-14">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/10 p-6">
            <ShieldCheck className="h-7 w-7 text-emerald mb-3"/>
            <h3 className="text-lg font-bold text-text-bright">Security first</h3>
            <p className="text-sm text-text-muted mt-2">Keys hashed at rest, returned once. Granular scopes, IP restrictions, environment separation, and full audit logging.</p>
          </div>
          <div className="rounded-2xl border border-white/10 p-6">
            <Rocket className="h-7 w-7 text-azure mb-3"/>
            <h3 className="text-lg font-bold text-text-bright">Usage-based pricing</h3>
            <p className="text-sm text-text-muted mt-2">Track calls, tokens, agent runtime and generation. Metered through the existing WINDELS billing architecture.</p>
          </div>
          <div className="rounded-2xl border border-white/10 p-6">
            <Factory className="h-7 w-7 text-violet mb-3"/>
            <h3 className="text-lg font-bold text-text-bright">Enterprise</h3>
            <p className="text-sm text-text-muted mt-2">Higher rate limits, dedicated environments, org-level management, service accounts and advanced audit controls.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-text-bright">Start building today</h2>
          <p className="mt-3 text-lg text-text-muted">Create an account, generate credentials, and make your first API call in minutes.</p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/auth/register"><Button size="lg">Create an account</Button></Link>
            <Link to="/docs/api"><Button size="lg" variant="outline">Explore the API</Button></Link>
            <Link to="/app/developer-portal"><Button size="lg" variant="ghost">Developer Dashboard</Button></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
