import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ShieldCheck, Server, KeyRound, LifeBuoy, Boxes, LineChart, Building2 } from "lucide-react";

const CAPS = [
  { icon: ShieldCheck, title: "SSO & Identity", desc: "SAML, OIDC, Google, Microsoft. Domain-level enforcement, SCIM provisioning on enterprise plans." },
  { icon: Server, title: "Deployment flexibility", desc: "Multi-tenant SaaS, single-tenant cloud, or on-premises. Air-gapped options for classified environments." },
  { icon: KeyRound, title: "Bring your own models", desc: "Point at OpenAI, Anthropic, Azure OpenAI, AWS Bedrock, or your own hosted weights." },
  { icon: LifeBuoy, title: "24/7 support", desc: "Named customer success manager, 1-hour SLA for P1 incidents, dedicated Slack/Teams channel." },
  { icon: Boxes, title: "Custom integrations", desc: "White-glove integration work for your existing stack: Slack, Teams, Salesforce, ServiceNow, Jira, Linear, GitHub." },
  { icon: LineChart, title: "FinOps & cost controls", desc: "Per-team budgets, cost-per-agent dashboards, approval workflows for model spend, and rate limits per integration." },
];

const TRUST = ["SOC 2 Type II (in progress)", "GDPR & CCPA", "HIPAA BAA available", "ISO 27001 aligned", "99.9% uptime SLA", "DPA upon signup"];

export default function EnterprisePage() {
  return (
    <div>
      <section className="py-20 text-center">
        <div className="max-w-4xl mx-auto px-6">
          <Badge variant="violet" className="mb-5">Enterprise</Badge>
          <h1 className="text-5xl md:text-6xl font-bold text-text-bright">AI workforces for the <span className="bg-gradient-to-r from-azure to-violet bg-clip-text text-transparent">regulated enterprise</span></h1>
          <p className="mt-5 text-lg text-text-muted max-w-2xl mx-auto">WINDELS AI OS brings governance, security, and reliability to the same platform your builders already love. Deploy in your VPC, behind your identity provider, audited end-to-end.</p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <a href="mailto:sales@windels.ai"><Button size="lg">Talk to sales</Button></a>
            <Link to="/auth/register"><Button size="lg" variant="outline">Start with a trial</Button></Link>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-text-bright text-center mb-10">Built for the enterprise checklist</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAPS.map(c => (
              <Card key={c.title}>
                <CardContent className="pt-6">
                  <div className="h-10 w-10 rounded-lg bg-violet/20 text-violet grid place-items-center mb-3"><c.icon/></div>
                  <div className="font-semibold text-text-bright">{c.title}</div>
                  <p className="text-sm text-text-muted mt-1">{c.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-5xl mx-auto px-6">
          <Card className="p-10 bg-gradient-to-br from-azure/10 via-violet/10 to-fuchsia/10 border-white/10">
            <h2 className="text-2xl font-bold text-text-bright">Trust &amp; compliance</h2>
            <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-3">
              {TRUST.map(t => (
                <div key={t} className="flex items-center gap-2 text-sm"><span className="h-2 w-2 rounded-full bg-emerald"/>{t}</div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Building2 className="mx-auto h-10 w-10 text-azure mb-4"/>
          <h2 className="text-3xl font-bold text-text-bright">Let's architect your deployment</h2>
          <p className="mt-3 text-text-muted">A solutions engineer will walk you through identity, networking, model routing, and rollout in a 30-minute call.</p>
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <a href="mailto:sales@windels.ai"><Button size="lg">Book a demo</Button></a>
            <Link to="/docs"><Button size="lg" variant="outline">Read the docs</Button></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
