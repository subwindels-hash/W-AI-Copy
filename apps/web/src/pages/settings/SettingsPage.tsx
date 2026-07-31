import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import * as billing from "@/lib/billing";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/store/auth";

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<billing.BillingOverview | null>(null);
  const [insights, setInsights] = useState<billing.PredictiveInsights | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("starter");
  const [seats, setSeats] = useState(5);
  const [cycle, setCycle] = useState<"monthly"|"annual">("monthly");

  async function load() {
    const [b, i] = await Promise.all([billing.getBilling(), billing.getInsights()]);
    setData(b); setInsights(i);
    setSelectedPlan(b.subscription.plan); setSeats(b.subscription.seats); setCycle(b.subscription.cycle as any);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    try {
      await billing.updateSubscription({ plan: selectedPlan as any, seats, cycle });
      toast.success("Subscription updated");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 h-[calc(100vh-56px)] overflow-y-auto">
      <div>
        <h1 className="text-2xl font-semibold text-text-bright">Settings</h1>
        <p className="text-sm text-text-muted mt-1">Account, organization, billing.</p>
      </div>

      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="billing">Billing & Plans</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="account">
          <Card>
            <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><div className="text-xs text-text-muted">Email</div><div className="text-text-bright">{user?.email}</div></div>
              <div><div className="text-xs text-text-muted">Role</div><div><Badge variant="violet">{user?.role}</Badge></div></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          {data && (
            <>
              <div className="grid md:grid-cols-4 gap-3">
                {data.plans.map((p) => (
                  <button key={p.id} onClick={() => setSelectedPlan(p.id)} className={cn(
                    "text-left rounded-xl border p-4 transition",
                    selectedPlan === p.id ? "border-azure/60 bg-azure/5 ring-1 ring-azure/30" : "border-white/10 bg-white/[0.02] hover:bg-white/5"
                  )}>
                    <div className="text-sm font-semibold text-text-bright">{p.name}</div>
                    <div className="text-xl font-bold text-text-bright mt-2">{fmtMoney(cycle === "annual" ? p.annual/12 : p.monthly)}<span className="text-xs font-normal text-text-muted">/user/mo</span></div>
                    <div className="text-[11px] text-text-muted mt-1">{cycle === "annual" ? `billed ${fmtMoney(p.annual)}/yr` : "monthly"}</div>
                  </button>
                ))}
              </div>
              <Card>
                <CardHeader><CardTitle>Subscription</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="text-xs text-text-muted">Cycle</div>
                      <div className="flex gap-2 mt-1">
                        {(["monthly","annual"] as const).map((c) => (
                          <button key={c} onClick={()=>setCycle(c)} className={cn("px-3 py-1 rounded border text-sm", cycle===c?"bg-white/10 border-white/20":"border-white/10 text-text-muted")}>{c}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-muted">Seats</div>
                      <Input type="number" min={1} max={1000} value={seats} onChange={(e)=>setSeats(Number(e.target.value))} className="mt-1 w-24" />
                    </div>
                    <div>
                      <div className="text-xs text-text-muted">Current plan</div>
                      <div className="mt-1"><Badge variant="emerald">{data.subscription.planName}</Badge></div>
                    </div>
                  </div>
                  <Button onClick={save} disabled={selectedPlan === data.subscription.plan && seats === data.subscription.seats && cycle === data.subscription.cycle}>Save changes</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
                <CardContent>
                  {data.invoices.length === 0 ? (
                    <p className="text-sm text-text-muted">No invoices yet.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead><tr className="text-xs text-text-muted text-left"><th className="py-2">Number</th><th>Date</th><th>Amount</th><th>Status</th><th/></tr></thead>
                      <tbody>
                        {data.invoices.map((inv) => (
                          <tr key={inv.id} className="border-t border-white/5">
                            <td className="py-2 font-mono text-text-bright">{inv.number}</td>
                            <td className="text-text-muted">{new Date(inv.createdAt).toLocaleDateString()}</td>
                            <td className="text-text-bright">{fmtMoney(inv.amountCents)} {inv.currency}</td>
                            <td><Badge variant={inv.status === "paid" ? "emerald" : inv.status === "open" ? "amber" : "slate"}>{inv.status}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="insights">
          {insights && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>Last 30 days</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  {Object.entries(insights.usage).map(([k,v]) => (
                    <div key={k} className="rounded-lg border border-white/5 p-3">
                      <div className="text-xs text-text-muted">{k.replace("30d","")}</div>
                      <div className="text-xl font-semibold text-text-bright">{v}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>30-day forecast</CardTitle><CardDescription>Simple projection based on recent usage.</CardDescription></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  {Object.entries(insights.forecast30d).map(([k,v]) => (
                    <div key={k} className="rounded-lg border border-white/5 p-3">
                      <div className="text-xs text-text-muted">{k}</div>
                      <div className="text-xl font-semibold text-azure">~{v}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="md:col-span-2">
                <CardHeader><CardTitle>Insights</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {insights.insights.map((ins, i) => (
                      <li key={i} className="flex gap-2"><span className="text-amber">💡</span><span className="text-text-main">{ins}</span></li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
