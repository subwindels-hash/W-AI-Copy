import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Bot, BookOpen, GitBranch, Lock, MessageCircle, ShieldCheck, Users, Workflow } from "lucide-react";
import { pageCopy, siteImage, useSitePublic } from "@/lib/useSitePublic";

function Page({ eyebrow, title, lead, children, cta }: { eyebrow: string; title: string; lead: string; children: React.ReactNode; cta?: boolean }) {
  return (
    <div className="py-16">
      <div className="mx-auto max-w-5xl px-6">
        <Badge variant="azure" className="mb-4">{eyebrow}</Badge>
        <h1 className="text-4xl font-bold text-text-bright md:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-lg text-text-muted">{lead}</p>
        <div className="mt-10 space-y-8">{children}</div>
        {cta ? (
          <div className="mt-12 flex flex-wrap gap-3">
            <Link to="/auth/register"><Button size="lg">Start free</Button></Link>
            <Link to="/contact"><Button size="lg" variant="outline">Contact</Button></Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AboutPage() {
  const site = useSitePublic();
  const p = pageCopy(site, "/about");
  return (
    <Page eyebrow="About" title={p.title} lead={p.lead} cta>
      {p.body ? <p className="text-text-main whitespace-pre-wrap">{p.body}</p> : <p className="text-text-main">The product already includes Workforce Hub, Chat, Talk, Flow, Canvas, Language Learning, billing, audit, and organization-scoped data isolation. This public site is the front door to that same system.</p>}
      <img src={p.image || site.brand.workforceHero} alt="WINDELS AI Workforce command environment" className="w-full rounded-2xl border border-white/10 object-cover aspect-[16/8]" />
    </Page>
  );
}

export function FeaturesPage() {
  const p = pageCopy(useSitePublic(), "/features");
  const items = [
    { icon: Users, title: "AI Workforce", desc: "Deploy agents with prompts, memory, tools, and an audit trail." },
    { icon: MessageCircle, title: "Chat & Talk", desc: "Multi-model conversations and team channels on the same identity system." },
    { icon: Workflow, title: "Flow", desc: "Visual automations with approvals and retries." },
    { icon: BookOpen, title: "Language Learning", desc: "A real teacher pipeline: assessment, lessons, vocabulary SRS, and honest scores." },
    { icon: ShieldCheck, title: "Governance", desc: "RBAC, audit logs, tenant isolation, and admin consoles enforced on the API." },
    { icon: Lock, title: "Security", desc: "JWT auth, encrypted secrets, CSRF on cookie sessions, rate limits." },
  ];
  return (
    <Page eyebrow="Features" title={p.title} lead={p.lead} cta>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((it) => (
          <Card key={it.title}><CardContent className="p-5">
            <it.icon className="mb-3 h-6 w-6 text-azure" />
            <div className="font-semibold text-text-bright">{it.title}</div>
            <p className="mt-1 text-sm text-text-muted">{it.desc}</p>
          </CardContent></Card>
        ))}
      </div>
    </Page>
  );
}

export function WorkforcePage() {
  const site = useSitePublic();
  const p = pageCopy(site, "/workforce");
  return (
    <Page eyebrow="AI Workforce" title={p.title} lead={p.lead} cta>
      {p.body ? <p className="text-text-main whitespace-pre-wrap">{p.body}</p> : <p className="text-text-main">After you register, open Workforce Hub at /app/workforce. Agents are organization-scoped. They do not share another tenant’s conversations or files.</p>}
      {p.image ? <img src={p.image} alt="" className="w-full rounded-2xl border border-white/10 object-cover aspect-[16/8]" /> : null}
    </Page>
  );
}

export function AgentsPage() {
  const site = useSitePublic();
  const p = pageCopy(site, "/agents");
  const roles = [
    { name: "Ava", role: "Strategist", img: siteImage(site, "agent-1") },
    { name: "Leo", role: "Engineer", img: siteImage(site, "agent-2") },
    { name: "Maya", role: "Analyst", img: siteImage(site, "agent-3") },
    { name: "Sofia", role: "Support", img: siteImage(site, "agent-5") },
  ];
  return (
    <Page eyebrow="AI Agents" title={p.title} lead={p.lead} cta>
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        {roles.map((a) => (
          <div key={a.name} className="text-center">
            <img src={a.img} alt="" className="mx-auto h-24 w-24 rounded-full object-cover ring-2 ring-white/10" />
            <div className="mt-2 font-medium text-text-bright">{a.name}</div>
            <div className="text-xs text-text-muted">{a.role}</div>
          </div>
        ))}
      </div>
    </Page>
  );
}

export function SolutionsPage() {
  const p = pageCopy(useSitePublic(), "/solutions");
  return (
    <Page eyebrow="Solutions" title={p.title} lead={p.lead} cta>
      <ul className="list-disc space-y-2 pl-5 text-text-main">
        <li>Operations: workflows, helpdesk, CRM, and audit in one org.</li>
        <li>Support: Talk, contact center, and the public assistant that routes to /contact.</li>
        <li>Learning: Language Learning profiles that stay isolated per user and language.</li>
      </ul>
    </Page>
  );
}

export function HowItWorksPage() {
  const p = pageCopy(useSitePublic(), "/how-it-works");
  const steps = [
    { n: "1", t: "Create an organization", d: "Register at /auth/register. The first user on a fresh install is Super Admin." },
    { n: "2", t: "Sign in", d: "JWT sessions, optional MFA, password reset through the centralized email service." },
    { n: "3", t: "Deploy agents and learn", d: "Use Workforce Hub, Chat, and Language Learning from /app." },
    { n: "4", t: "Govern", d: "Admins manage users in their org. Super Admins manage roles, SEO, SMTP, and announcements." },
  ];
  return (
    <Page eyebrow="How it works" title={p.title} lead={p.lead} cta>
      <div className="grid gap-4 md:grid-cols-2">
        {steps.map((s) => (
          <Card key={s.n}><CardContent className="p-5">
            <div className="text-azure font-black">{s.n}</div>
            <div className="font-semibold text-text-bright">{s.t}</div>
            <p className="mt-1 text-sm text-text-muted">{s.d}</p>
          </CardContent></Card>
        ))}
      </div>
    </Page>
  );
}

export function FaqPage() {
  const faqs = [
    { q: "Is the website chatbot a script?", a: "No. It calls /api/v1/site/chat, which uses the same AI provider registry as the rest of WINDELS. If no provider is configured, it answers from the public site knowledge base and says so." },
    { q: "Can a user become Super Admin from the browser?", a: "No. Role changes are enforced by requireSuperAdmin on the API." },
    { q: "Where is Language Learning?", a: "After sign-in: /app/languages. The public Features page explains it." },
    { q: "How do I contact you?", a: "Use /contact or the assistant. Support email is sent through the active SMTP provider." },
  ];
  return (
    <Page eyebrow="FAQ" title={pageCopy(useSitePublic(), "/faq").title} lead={pageCopy(useSitePublic(), "/faq").lead}>
      <div className="divide-y divide-white/10 rounded-xl border border-white/10">
        {faqs.map((f) => (
          <details key={f.q} className="p-5">
            <summary className="cursor-pointer font-medium text-text-bright">{f.q}</summary>
            <p className="mt-2 text-sm text-text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </Page>
  );
}

export function HelpPage() {
  return (
    <Page eyebrow="Help" title={pageCopy(useSitePublic(), "/help").title} lead={pageCopy(useSitePublic(), "/help").lead}>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-5"><Bot className="mb-2 h-5 w-5 text-azure" /><div className="font-semibold text-text-bright">Ask the assistant</div><p className="text-sm text-text-muted">Use the chat button on the right of public pages.</p></CardContent></Card>
        <Card><CardContent className="p-5"><GitBranch className="mb-2 h-5 w-5 text-azure" /><div className="font-semibold text-text-bright">Docs</div><p className="text-sm text-text-muted"><Link to="/docs" className="text-azure">Product documentation</Link></p></CardContent></Card>
        <Card><CardContent className="p-5"><MessageCircle className="mb-2 h-5 w-5 text-azure" /><div className="font-semibold text-text-bright">Contact</div><p className="text-sm text-text-muted"><Link to="/contact" className="text-azure">Open a request</Link></p></CardContent></Card>
      </div>
    </Page>
  );
}
