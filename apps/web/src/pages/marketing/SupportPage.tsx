import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/lib/toast";
import { Link } from "react-router-dom";
import { LifeBuoy, Book, MessageCircle, Mail, FileQuestion } from "lucide-react";

const FAQS = [
  { q: "How do I reset my password?", a: "Click 'Forgot password' on the sign-in page or ask an organization admin to send a reset link from Settings → Members." },
  { q: "Can I bring my own OpenAI/Anthropic key?", a: "Yes. Add model credentials from Enterprise → Models. Your keys are encrypted at rest using AES-256-GCM." },
  { q: "How do I invite my team?", a: "From Settings → Members, invite by email. Each seat adds per-user billing on paid plans." },
  { q: "Where is my data stored?", a: "Data stays in the region your workspace was created. Enterprise customers can choose region and bring their own encryption keys." },
  { q: "What's the SLA?", a: "Team and Enterprise plans offer a 99.9% uptime SLA with status-page credits. Check status.windels.ai for live status." },
];

const CHANNELS = [
  { icon: Book, title: "Documentation", desc: "Guides, API reference, and tutorials.", cta: "Read docs", to: "/docs" },
  { icon: MessageCircle, title: "Community Discord", desc: "Chat with the team and other builders.", cta: "Join", href: "https://discord.gg/windels" },
  { icon: Mail, title: "Email support", desc: "24-hour response on paid plans, 72h on free.", cta: "Email us", href: "mailto:support@windels.ai" },
  { icon: FileQuestion, title: "Status page", desc: "Uptime, incidents, and scheduled maintenance.", cta: "View status", href: "https://status.windels.ai" },
];

export default function SupportPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSent(true);
    toast.success("Support request received — we'll reply within 24 hours.");
  }
  return (
    <div className="py-16">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <LifeBuoy className="mx-auto h-10 w-10 text-azure mb-4"/>
          <h1 className="text-4xl font-bold text-text-bright">How can we help?</h1>
          <p className="mt-3 text-text-muted">Find answers quickly, or get in touch with our team.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {CHANNELS.map(c => (
            <Card key={c.title}>
              <CardContent className="pt-6">
                <c.icon className="h-8 w-8 text-azure mb-3"/>
                <div className="font-semibold text-text-bright">{c.title}</div>
                <p className="text-sm text-text-muted mt-1">{c.desc}</p>
                <div className="mt-4">
                  {c.to
                    ? <Link to={c.to}><Button size="sm" variant="outline">{c.cta}</Button></Link>
                    : <a href={c.href} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">{c.cta}</Button></a>
                  }
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Frequently asked</CardTitle><CardDescription>Quick answers to common questions.</CardDescription></CardHeader>
            <CardContent>
              <div className="divide-y divide-white/5">
                {FAQS.map(f => (
                  <details key={f.q} className="group py-3">
                    <summary className="cursor-pointer list-none flex justify-between items-center text-text-bright font-medium">
                      {f.q}<span className="text-text-muted transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <p className="text-sm text-text-muted mt-2">{f.a}</p>
                  </details>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Send us a message</CardTitle><CardDescription>{sent?"Thanks — we've received your message.":"We typically reply within one business day."}</CardDescription></CardHeader>
            <CardContent>
              {sent ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Badge variant="emerald">Sent</Badge>
                  <Button variant="outline" onClick={()=>{setSent(false);setForm({name:"",email:"",subject:"",message:""})}}>Send another</Button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input placeholder="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/>
                    <Input placeholder="Email" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required/>
                  </div>
                  <Input placeholder="Subject" value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} required/>
                  <Textarea placeholder="How can we help?" rows={5} value={form.message} onChange={e=>setForm({...form,message:e.target.value})} required/>
                  <Button type="submit" className="w-full">Send message</Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
