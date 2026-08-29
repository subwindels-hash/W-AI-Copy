/** Session 107 — dedicated Billing & Subscription page. */
import { useCallback, useEffect, useState } from "react";
import { BadgeDollarSign, CalendarClock, Check, CreditCard, FileText, RefreshCw, ShieldCheck, X } from "lucide-react";
import * as billing from "@/lib/billing";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";

function dollars(cents: number) { return `$${(cents / 100).toFixed(2)}`; }
function statusVariant(status: string): "emerald" | "amber" | "crimson" | "slate" { return status === "paid" || status === "active" ? "emerald" : status === "past_due" || status === "open" ? "amber" : status === "void" || status === "failed" ? "crimson" : "slate"; }

export function BillingPage() {
  const user = useAuthStore((state) => state.user);
  const canManage = user?.role === "admin" || user?.role === "super_admin";
  const [data, setData] = useState<billing.BillingOverview | null>(null);
  const [plan, setPlan] = useState("");
  const [cycle, setCycle] = useState<billing.BillingCycle>("monthly");
  const [seats, setSeats] = useState("5");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const value = await billing.getBilling(); setData(value); setPlan(value.subscription.plan); setCycle(value.subscription.cycle); setSeats(String(value.subscription.seats)); setEmail(value.subscription.customerEmail ?? ""); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(null), 3500); };

  async function save() {
    try { const result = await billing.updateSubscription({ plan: plan as any, cycle, seats: Number(seats), customerEmail: email || undefined }); flash(result.invoice ? `Subscription updated. Invoice ${result.invoice.number} is open.` : "Subscription updated."); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function markPaid(id: string) { setBusy(id); try { await billing.markInvoicePaid(id); flash("Invoice marked paid."); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); } }
  async function voidOne(id: string) { setBusy(id); try { await billing.voidInvoice(id, "Voided from billing console"); flash("Invoice voided."); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); } }

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><BadgeDollarSign className="h-6 w-6 text-emerald" /><h1 className="text-2xl font-black text-text-bright">Billing & Subscriptions</h1><Badge variant="emerald">Session 107</Badge></div><p className="mt-1 text-sm text-text-muted">Organization subscription, seats and invoice ledger. Payment confirmation is provider/webhook or audited administrator action.</p></div><Button size="sm" variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button></div>
    {error ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{error}<button className="float-right" onClick={() => setError(null)}>✕</button></div> : null}{notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}
    {!canManage ? <Card><CardContent className="flex items-center gap-2 p-5 text-sm text-text-muted"><ShieldCheck className="h-4 w-4 text-emerald" />Billing management requires organization administrator access.</CardContent></Card> : null}
    {data ? <><div className="grid grid-cols-1 gap-3 md:grid-cols-3"><Card><CardContent className="p-4"><div className="text-xs text-text-muted">Current plan</div><div className="mt-1 text-2xl font-black text-text-bright">{data.subscription.planName}</div><Badge variant={statusVariant(data.subscription.status)}>{data.subscription.status}</Badge></CardContent></Card><Card><CardContent className="p-4"><div className="text-xs text-text-muted">Renewal rate</div><div className="mt-1 text-2xl font-black text-text-bright">{dollars(data.subscription.renewalCents)}</div><div className="text-xs text-text-muted">{data.subscription.cycle} · {data.subscription.seats} seats</div></CardContent></Card><Card><CardContent className="p-4"><div className="text-xs text-text-muted">Accounts receivable</div><div className="mt-1 text-2xl font-black text-text-bright">{dollars(data.accountsReceivable.openInvoiceTotal)}</div><div className="text-xs text-text-muted">{data.accountsReceivable.openInvoiceCount} open invoices</div></CardContent></Card></div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]"><Card><CardHeader><CardTitle>Plan catalog</CardTitle><CardDescription>Prices are integer cents from the server plan catalog.</CardDescription></CardHeader><CardContent><div className="grid grid-cols-1 gap-2 md:grid-cols-2">{data.plans.map((item) => <button key={item.id} onClick={() => canManage && setPlan(item.id)} className={`rounded-lg border p-4 text-left ${plan === item.id ? "border-azure/50 bg-azure/10" : "border-white/10 bg-white/5"}`}><div className="flex items-center justify-between"><span className="font-semibold text-text-bright">{item.name}</span>{plan === item.id ? <Check className="h-4 w-4 text-azure" /> : null}</div><div className="mt-1 text-xl font-black text-text-bright">{dollars(item.monthly)}<span className="text-xs font-normal text-text-muted">/month</span></div><div className="text-xs text-text-muted">{item.seatIncluded} included seats · {dollars(item.perSeatMonthly)} extra seat</div></button>)}</div></CardContent></Card>{canManage ? <Card><CardHeader><CardTitle className="text-base">Subscription settings</CardTitle><CardDescription>Changing to a paid plan creates an open invoice; no payment is fabricated.</CardDescription></CardHeader><CardContent className="space-y-2"><Select value={cycle} onChange={(e) => setCycle(e.target.value as billing.BillingCycle)}><option value="monthly">Monthly</option><option value="annual">Annual</option></Select><Input type="number" min="1" max="10000" value={seats} onChange={(e) => setSeats(e.target.value)} placeholder="Seats" /><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Billing email" /><Button className="w-full" onClick={() => void save()} disabled={!plan}>Save subscription</Button></CardContent></Card> : null}</div>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-azure" />Invoice ledger</CardTitle><CardDescription>Real invoices and audited status transitions.</CardDescription></CardHeader><CardContent><div className="space-y-2">{data.invoices.map((invoice) => <div key={invoice.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3"><div className="min-w-40 flex-1"><div className="font-medium text-text-bright">{invoice.number}</div><div className="text-xs text-text-muted">{new Date(invoice.createdAt).toLocaleDateString()} · {invoice.currency}</div></div><span className="font-mono text-sm text-text-bright">{dollars(invoice.amountCents)}</span><Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>{canManage && invoice.status !== "paid" && invoice.status !== "void" ? <div className="flex gap-1"><Button size="sm" variant="success" disabled={busy === invoice.id} onClick={() => void markPaid(invoice.id)}><Check className="h-3 w-3" />Paid</Button><Button size="sm" variant="ghost" disabled={busy === invoice.id} onClick={() => void voidOne(invoice.id)}><X className="h-3 w-3" />Void</Button></div> : null}</div>)}{data.invoices.length === 0 ? <p className="py-8 text-center text-sm text-text-muted">No invoices recorded.</p> : null}</div></CardContent></Card></> : <Card><CardContent className="p-8 text-center text-sm text-text-muted">Loading billing data…</CardContent></Card>}
  </div>;
}
