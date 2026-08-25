/**
 * WINDELS AI OS — Gift Cards console (WMPC).
 *
 * Issue, activate, reload, redeem, freeze/unfreeze and expire gift cards; view
 * the transaction ledger, fraud flags and loyalty programs. Balances and
 * revenue come from the real ledger — nothing is fabricated.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Gift, Plus, X, AlertTriangle, Scale } from "lucide-react";
import type {
  WmpcGiftCard, GcTransaction, GcFraudFlag, GcLoyaltyProgram, GcType, GcStatus,
} from "@windels/shared";
import { gcApi } from "@/lib/giftCards";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

const GC_TYPES: GcType[] = ["physical", "digital", "virtual", "one-time", "reloadable", "promotional", "enterprise", "corporate-reward", "employee-incentive", "educational"];

function fmtMoney(n: number) { return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function fmtDate(s?: string) { if (!s) return "—"; try { return new Date(s).toLocaleString(); } catch { return s; } }

function statusTone(status: GcStatus): any {
  switch (status) {
    case "active": return "emerald";
    case "issued": return "azure";
    case "redeemed": return "slate";
    case "expired": return "slate";
    case "frozen": return "amber";
    default: return "slate";
  }
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-sm text-text-muted">{label}</div>
    </CardContent></Card>
  );
}

export function GiftCardsPage() {
  const [dash, setDash] = useState<Awaited<ReturnType<typeof gcApi.dashboard>> | null>(null);
  const [cards, setCards] = useState<WmpcGiftCard[]>([]);
  const [txns, setTxns] = useState<GcTransaction[]>([]);
  const [fraud, setFraud] = useState<GcFraudFlag[]>([]);
  const [loyalty, setLoyalty] = useState<GcLoyaltyProgram[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // issue form
  const [type, setType] = useState<GcType>("digital");
  const [amount, setAmount] = useState("100");
  const [currency, setCurrency] = useState("USD");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, c, t, f, l] = await Promise.all([
        gcApi.dashboard(), gcApi.list(), gcApi.transactions(), gcApi.fraud(false), gcApi.loyalty(),
      ]);
      setDash(d); setCards(c); setTxns(t); setFraud(f); setLoyalty(l);
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function issue() {
    setErr(null);
    try {
      await gcApi.issue({ type, amount: Number(amount || 0), currency, pin: pin || undefined, personalMessage: msg || undefined });
      setPin(""); setMsg(""); await load();
    } catch (e: any) { setErr(e?.message ?? "Issue failed"); }
  }

  async function action(id: string, kind: "activate" | "redeem" | "freeze" | "unfreeze" | "expire") {
    setErr(null);
    try {
      if (kind === "activate") await gcApi.activate(id);
      else if (kind === "redeem") await gcApi.redeem(id, Number(amount || 0), pin || undefined);
      else if (kind === "freeze") await gcApi.freeze(id, "frozen from console");
      else if (kind === "unfreeze") await gcApi.unfreeze(id);
      else await gcApi.expire(id);
      await load();
    } catch (e: any) { setErr(e?.message ?? `Action failed (${kind})`); }
  }

  async function resolveFraud(id: string) {
    setErr(null);
    try { await gcApi.resolveFraud(id); await load(); } catch (e: any) { setErr(e?.message ?? "Resolve failed"); }
  }

  if (!dash) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading gift cards…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Gift className="h-6 w-6 text-azure" /> Gift Cards (WMPC)</h1>
          <p className="text-sm text-text-muted">Issue, manage and redeem WMPC gift cards.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2"><X className="h-4 w-4" />{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Issued" value={dash.issued} />
        <Stat label="Active" value={dash.active} />
        <Stat label="Redeemed" value={dash.redeemed} />
        <Stat label="Outstanding balance" value={fmtMoney(dash.outstandingBalance)} />
        <Stat label="Revenue (24h)" value={fmtMoney(dash.revenue24h)} />
        <Stat label="Fraud flags" value={dash.fraudFlags} />
        <Stat label="Loyalty programs" value={dash.loyaltyPrograms} />
        <Stat label="Payment method" value={dash.registeredAsPaymentMethod ? "registered" : "not registered"} />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4 text-azure"/>Issue a gift card</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Select value={type} onChange={(e) => setType(e.target.value as GcType)}>
              {GC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input placeholder="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input placeholder="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
            <Input placeholder="PIN (optional)" value={pin} onChange={(e) => setPin(e.target.value)} />
          </div>
          <Input placeholder="Personal message (optional)" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <Button onClick={() => void issue()}>Issue card</Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="cards">
        <TabsList>
          <TabsTrigger value="cards">Cards ({cards.length})</TabsTrigger>
          <TabsTrigger value="transactions">Transactions ({txns.length})</TabsTrigger>
          <TabsTrigger value="fraud">Fraud flags ({fraud.length})</TabsTrigger>
          <TabsTrigger value="loyalty">Loyalty ({loyalty.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="cards">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {cards.length === 0 ? (
                <div className="text-sm text-text-muted">No gift cards yet — issue one above.</div>
              ) : cards.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm">{c.code}</span>
                      <Badge variant="outline">{c.type}</Badge>
                      <Badge variant={statusTone(c.status)}>{c.status}</Badge>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      balance {fmtMoney(c.balance)} / {fmtMoney(c.initialBalance)} · issued {fmtDate(c.issuedAt)}
                      {c.expiresAt && <> · expires {fmtDate(c.expiresAt)}</>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {c.status === "issued" && <Button size="sm" variant="outline" onClick={() => void action(c.id, "activate")}>Activate</Button>}
                    {c.status === "active" && <Button size="sm" variant="outline" onClick={() => void action(c.id, "redeem")}>Redeem</Button>}
                    {c.status === "active" && <Button size="sm" variant="outline" onClick={() => void action(c.id, "freeze")}>Freeze</Button>}
                    {c.status === "frozen" && <Button size="sm" variant="outline" onClick={() => void action(c.id, "unfreeze")}>Unfreeze</Button>}
                    {c.status === "active" && <Button size="sm" variant="outline" onClick={() => void action(c.id, "expire")}>Expire</Button>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardContent className="space-y-1 pt-4">
              {txns.length === 0 ? (
                <div className="text-sm text-text-muted">No transactions yet.</div>
              ) : txns.slice(0, 20).map((t) => (
                <div key={t.id} className="flex items-center justify-between border-b border-border/30 py-1 text-sm">
                  <span className="flex items-center gap-2"><Badge variant="outline">{t.kind}</Badge>{t.cardId}</span>
                  <span className="text-text-muted text-xs">{fmtMoney(t.amount)} · {fmtDate(t.at)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fraud">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {fraud.length === 0 ? (
                <div className="text-sm text-text-muted flex items-center gap-2"><Scale className="h-4 w-4"/>No unresolved fraud flags.</div>
              ) : fraud.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className={`h-4 w-4 ${f.severity === "high" ? "text-crimson" : "text-amber-400"}`} />
                    <div className="min-w-0">
                      <div className="text-sm truncate">{f.reason}</div>
                      <div className="text-xs text-text-muted">{f.cardId} · {f.severity} · {fmtDate(f.flaggedAt)}</div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void resolveFraud(f.id)}>Resolve</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loyalty">
          <Card>
            <CardContent className="space-y-2 pt-4">
              {loyalty.length === 0 ? (
                <div className="text-sm text-text-muted">No loyalty programs yet.</div>
              ) : loyalty.map((l) => (
                <div key={l.id} className="flex items-center justify-between border-b border-border/30 py-2 text-sm">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-text-muted">{l.memberCount} members · {l.pointsIssued} pts issued · ×{l.multiplier}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default GiftCardsPage;
