/**
 * Public "Contact WINDELS AI OS" page.
 *
 * Two panes: an AI Contact Assistant chat and the standard contact form. When
 * the AI assistant collects enough information it can pre-fill the form. Both
 * submit through the real /contact endpoints.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, MessageSquare, Send, CheckCircle2 } from "lucide-react";
import { contactApi, type ContactAiReply, type ContactRequestRow } from "@/lib/contact";
import { CONTACT_CATEGORIES, CONTACT_CATEGORY_LABELS, type ContactCategory } from "@windels/shared/contactCenter";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

interface ChatMsg { role: "user" | "ai"; content: string }

export function ContactPage() {
  const user = useAuthStore((s) => s.user);
  const [mode, setMode] = useState<"chat" | "form">("chat");

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [aiReply, setAiReply] = useState<ContactAiReply | null>(null);

  // Form
  const [form, setForm] = useState({
    name: user?.displayName ?? "",
    email: user?.email ?? "",
    phone: "",
    country: "",
    company: "",
    category: "general" as ContactCategory,
    subject: "",
    message: "",
    preferredContactMethod: "email",
    website: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<ContactRequestRow | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [chatMessages]);

  const sendChat = useCallback(async (text: string) => {
    if (!text.trim() || chatBusy) return;
    const t = text.trim();
    setChatMessages((m) => [...m, { role: "user", content: t }]);
    setChatInput("");
    setChatBusy(true);
    try {
      let reply: ContactAiReply;
      if (conversationId) {
        reply = await contactApi.assistantMessage(conversationId, t);
      } else {
        reply = await contactApi.assistantStart(t, user?.email ? { email: user.email, name: user.displayName ?? undefined } : undefined);
        setConversationId(reply.conversationId);
      }
      setAiReply(reply);
      setChatMessages((m) => [...m, { role: "ai", content: reply.reply }]);
      // Pre-fill form from collected data when available.
      if (reply.collected) {
        setForm((f) => ({
          ...f,
          name: reply.collected.name ?? f.name,
          email: reply.collected.email ?? f.email,
          phone: reply.collected.phone ?? f.phone,
          subject: reply.collected.subject ?? f.subject,
          category: reply.category ?? f.category,
        }));
      }
    } catch (e: any) {
      setChatMessages((m) => [...m, { role: "ai", content: "I couldn't process that just now. Please try again or use the contact form." }]);
    } finally {
      setChatBusy(false);
    }
  }, [chatBusy, conversationId, user]);

  async function submitForm() {
    setFormError(null);
    if (form.name.trim().length < 2) { setFormError("Please enter your full name."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) { setFormError("Please enter a valid email address."); return; }
    if (form.subject.trim().length < 2) { setFormError("Please enter a subject."); return; }
    if (form.message.trim().length < 10) { setFormError("Please describe your issue in a little more detail (at least 10 characters)."); return; }
    setFormBusy(true);
    try {
      const data = await contactApi.submitForm({
        ...form,
        preferredContactMethod: form.preferredContactMethod as "email" | "phone" | "chat",
        website: form.website, // honeypot (empty for humans)
        userId: user?.id,
        aiConversationId: conversationId,
        aiSummary: aiReply ? (aiReply.reply ?? null) : null,
      });
      setSubmitted(data);
    } catch (e: any) {
      setFormError(e?.message ?? "Submission failed. Please try again.");
    } finally {
      setFormBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-emerald/20 text-emerald grid place-items-center"><CheckCircle2 className="h-8 w-8" /></div>
        <h1 className="text-3xl font-bold text-text-bright">Request received</h1>
        <p className="mt-3 text-text-muted">
          Thank you for contacting WINDELS AI OS. We received your request and created
          support request <span className="font-mono text-text-bright">{submitted.requestNumber}</span>.
        </p>
        <p className="mt-2 text-sm text-text-muted">Our team will review your request and respond through the available contact channel.</p>
        <div className="mt-8 flex gap-3 justify-center">
          {user ? <Link to="/app/my-support"><Button>View my requests</Button></Link> : null}
          <Link to="/"><Button variant="outline">Back to home</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="text-center mb-10">
        <Badge variant="teal" className="mb-4"><MessageSquare className="h-3.5 w-3.5 mr-1"/>Contact WINDELS AI OS</Badge>
        <h1 className="text-4xl font-bold text-text-bright">How can we help?</h1>
        <p className="mt-3 text-text-muted max-w-xl mx-auto">Ask our AI assistant to explain your issue, or fill out the contact form directly. We'll route your request to the right team.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* AI Assistant */}
        <Card className="h-[600px] flex flex-col">
          <CardHeader className="border-b border-white/5">
            <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-azure"/>AI Contact Assistant</CardTitle>
            <CardDescription>Describe your issue and the assistant will help explain it before you submit.</CardDescription>
          </CardHeader>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-sm text-text-muted text-center py-10">
                Start by describing what you need help with — for example:
                <div className="mt-3 space-y-1 text-text-main">
                  <button className="block w-full text-left rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10" onClick={() => sendChat("I can't connect to the API - I get an authentication error.")}>"I can't connect to the API — authentication error."</button>
                  <button className="block w-full text-left rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10" onClick={() => sendChat("I was charged twice for my subscription.")}>"I was charged twice for my subscription."</button>
                </div>
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <div className={`inline-block max-w-[85%] rounded-2xl px-4 py-2 text-sm text-left ${m.role === "user" ? "bg-azure/20 text-text-bright" : "bg-white/5 text-text-main"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatBusy && <div className="text-xs text-text-muted animate-pulse">Assistant is typing…</div>}
            {aiReply?.readyToSubmit && (
              <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-3 py-2 text-xs text-emerald">
                <button onClick={() => { setMode("form"); }} className="hover:underline">Ready to submit a request — fill in the form →</button>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-white/5 flex gap-2">
            <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void sendChat(chatInput); }}
              placeholder="Type your message…" />
            <Button onClick={() => void sendChat(chatInput)} disabled={chatBusy}><Send className="h-4 w-4"/></Button>
          </div>
        </Card>

        {/* Contact Form */}
        <Card>
          <CardHeader className="border-b border-white/5">
            <CardTitle>Contact form</CardTitle>
            <CardDescription>Fill this out directly, or let the AI assistant pre-fill it for you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="text-[11px] text-text-muted">Full Name *</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" /></div>
              <div><label className="text-[11px] text-text-muted">Email *</label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" /></div>
              <div><label className="text-[11px] text-text-muted">Phone</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+234..." /></div>
              <div><label className="text-[11px] text-text-muted">Country</label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Nigeria" /></div>
            </div>
            <div><label className="text-[11px] text-text-muted">Company / Organization</label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Example Ltd" /></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-text-muted">Category *</label>
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ContactCategory })}>
                  {CONTACT_CATEGORIES.map((c) => <option key={c} value={c}>{CONTACT_CATEGORY_LABELS[c]}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-text-muted">Preferred contact</label>
                <Select value={form.preferredContactMethod} onChange={(e) => setForm({ ...form, preferredContactMethod: e.target.value })}>
                  <option value="email">Email</option><option value="phone">Phone</option><option value="chat">Chat</option>
                </Select>
              </div>
            </div>
            <div><label className="text-[11px] text-text-muted">Subject *</label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Unable to connect API" /></div>
            <div><label className="text-[11px] text-text-muted">Message *</label><Textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Describe your issue…" /></div>
            {/* Honeypot */}
            <input type="text" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            {formError && <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-3 py-2 text-sm text-crimson">{formError}</div>}
            <Button onClick={() => void submitForm()} loading={formBusy} className="w-full">Submit request</Button>
            {user && <p className="text-[11px] text-text-muted">Signed in as {user.email} — your account will be linked to this request.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
