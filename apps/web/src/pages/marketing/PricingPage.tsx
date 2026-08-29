import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

const PLANS = [
  {
    name: "Starter", price: "$0", cadence: "forever",
    description: "For individuals exploring AI workforces.",
    cta: "Start free", ctaVariant: "outline" as const, popular: false, ctaTo: "/auth/register",
    features: ["1 workspace", "Up to 3 agents", "100 AI messages/day", "Community support", "Core Chat & Talk"],
  },
  {
    name: "Pro", price: "$29", cadence: "per user / month",
    description: "For teams shipping AI into production.",
    cta: "Start Pro trial", ctaVariant: "primary" as const, popular: true, ctaTo: "/auth/register",
    features: ["Unlimited agents", "Unlimited workflows", "Flow automation", "Canvas builder", "Analytics dashboard", "API keys & webhooks", "Priority support"],
  },
  {
    name: "Team", price: "$49", cadence: "per user / month",
    description: "For departments with governance needs.",
    cta: "Start Team trial", ctaVariant: "outline" as const, popular: false, ctaTo: "/auth/register",
    features: ["Everything in Pro", "SSO (SAML/OIDC)", "Role-based access", "Audit logs", "Data retention controls", "GDPR exports", "99.9% SLA"],
  },
  {
    name: "Enterprise", price: "Custom", cadence: "annual",
    description: "For regulated industries and large organizations.",
    cta: "Contact sales", ctaVariant: "outline" as const, popular: false, ctaTo: "/enterprise",
    features: ["Everything in Team", "On-prem deployment", "Dedicated VPC", "Custom models", "White labeling", "24/7 support", "SOC 2 / HIPAA / DPA", "Named CSM"],
  },
];

const FAQS = [
  { q: "Can I switch plans at any time?", a: "Yes. Upgrade or downgrade from Settings → Billing. Downgrades take effect at the end of your current billing cycle." },
  { q: "Do you offer education or startup discounts?", a: "Yes — email startups@windels.ai with your information for 50% off for the first year." },
  { q: "Is there a free trial for paid plans?", a: "14 days on Team and Pro, no credit card required. Enterprise trials are scoped with your account team." },
  { q: "What counts as a user?", a: "Any registered seat in your organization. Agents and API keys do not consume seats." },
  { q: "How does billing work for annual plans?", a: "Annual plans receive a 20% discount and are invoiced upfront." },
];

export default function PricingPage() {
  return (
    <div className="py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <Badge variant="azure" className="mb-4">Pricing</Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-text-bright">Simple pricing that scales with you</h1>
          <p className="mt-4 text-text-muted">Start free. Pay as you grow. Every plan includes the full platform surface — no capability gating inside products.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map(p => (
            <Card key={p.name} className={cn("relative flex flex-col", p.popular && "border-azure/60 shadow-[0_0_0_1px_rgba(59,130,246,0.4)]")}>
              {p.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2"><Badge variant="azure">Most popular</Badge></div>}
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <CardDescription>{p.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-text-bright">{p.price}</span>
                  <span className="text-sm text-text-muted ml-2">{p.cadence}</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-2 text-sm flex-1">
                  {p.features.map(f => (
                    <li key={f} className="flex gap-2"><span className="text-emerald shrink-0">✓</span><span className="text-text-main">{f}</span></li>
                  ))}
                </ul>
                <Link to={p.ctaTo} className="mt-6 block"><Button className="w-full" variant={p.ctaVariant}>{p.cta}</Button></Link>
              </CardContent>
            </Card>
          ))}
        </div>

        <h2 className="text-2xl font-bold text-text-bright mt-20 mb-6 text-center">Frequently asked questions</h2>
        <div className="max-w-3xl mx-auto divide-y divide-white/5 border border-white/10 rounded-lg bg-bg-card/60">
          {FAQS.map(f => (
            <details key={f.q} className="group p-5">
              <summary className="cursor-pointer text-text-bright font-medium list-none flex justify-between items-center">
                {f.q}<span className="text-text-muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm text-text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
