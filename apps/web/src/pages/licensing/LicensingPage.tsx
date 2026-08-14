/**
 * Session 164 — Licensing & Monetization console (/app/licensing).
 *
 * Tabs: Assets · Grants · Royalties
 *
 * Honesty:
 *   - every figure is scoped to the caller's organization. Before S164 all six
 *     routes defaulted to org-windels, so one tenant's metered usage credited
 *     another tenant's revenue and pending-payout balance.
 *   - "30d revenue" is a real rolling window summed from the royalty ledger.
 *     It used to be a counter that never decayed — a lifetime total wearing a
 *     30-day label, always exactly equal to the all-time figure.
 *   - NO PAYMENT PROCESSOR IS WIRED. Settling a payout marks the ledger and
 *     moves no money; the page says so rather than implying a transfer.
 *   - the platform fee is declared (PLATFORM_FEE_PCT) and echoed on every
 *     royalty entry, so a payout can be audited without reading the source.
 *   - demo-seeded assets are labelled; nobody registered them.
 */
import { useCallback, useEffect, useState } from "react";
import { DollarSign, Package, KeyRound, Receipt, Loader2, AlertTriangle } from "lucide-react";
import {
  licensingApi, PLATFORM_FEE_PCT,
  type LicensedAsset, type LicenseGrant, type LicensingDashboard,
  type RoyaltyEntry, type LicensableAssetType, type BillingModel,
} from "@/lib/licensing";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

const ASSET_TYPES: LicensableAssetType[] = [
  "ai_model", "ai_employee", "ai_agent", "ai_skill", "ai_workflow", "voice_pack",
  "prompt_library", "knowledge_pack", "industry_template", "connector", "plugin", "digital_human",
];
const MODELS: BillingModel[] = ["subscription", "usage", "revenue_share", "enterprise_license", "royalty"];

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const label = (s: string) => s.replace(/_/g, " ");

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-slate-400">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
        {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function LicensingPage() {
  const [dash, setDash] = useState<LicensingDashboard | null>(null);
  const [assets, setAssets] = useState<LicensedAsset[]>([]);
  const [grants, setGrants] = useState<LicenseGrant[]>([]);
  const [royalties, setRoyalties] = useState<RoyaltyEntry[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // register form
  const [aType, setAType] = useState<LicensableAssetType>("ai_skill");
  const [aExtId, setAExtId] = useState("");
  const [aName, setAName] = useState("");
  const [aModel, setAModel] = useState<BillingModel>("subscription");
  const [aPrice, setAPrice] = useState(0);
  const [aShare, setAShare] = useState("");

  // grant + usage forms
  const [gAsset, setGAsset] = useState("");
  const [gLessee, setGLessee] = useState("");
  const [gExpires, setGExpires] = useState("");
  const [uGrant, setUGrant] = useState("");
  const [uCents, setUCents] = useState(100);

  const load = useCallback(async () => {
    const [d, a, g, r] = await Promise.all([
      licensingApi.dashboard(), licensingApi.assets(),
      licensingApi.grants(), licensingApi.royalties(),
    ]);
    setDash(d); setAssets(a); setGrants(g); setRoyalties(r);
  }, []);

  useEffect(() => { load().catch((e) => setMsg(String(e))); }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); await load(); setMsg(ok); }
    catch (e) { setMsg(String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Licensing &amp; Monetization</h1>
      </div>

      {/* No payment processor is connected. Say so before showing dollars. */}
      <div className="flex items-start gap-2 rounded-md border border-amber-800 bg-amber-950/40 p-3 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-400 shrink-0" />
        <div>
          <div className="font-medium text-amber-300">Ledger only — no money moves</div>
          <div className="text-slate-400 text-xs">
            No payment processor is connected. Recording usage accrues a balance and settling a
            payout marks the ledger; neither transfers funds. The platform fee is {PLATFORM_FEE_PCT}%.
          </div>
        </div>
      </div>

      {msg && <div className="text-xs rounded border border-slate-700 bg-slate-900 p-2">{msg}</div>}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Stat label="Assets" value={dash?.totalAssets ?? "—"} hint={dash ? `${dash.listedAssets} listed` : undefined} />
        <Stat label="Active licences" value={dash?.activeLicenses ?? "—"} hint="excludes expired" />
        <Stat label="Revenue 30d" value={dash ? usd(dash.revenueCents30d) : "—"} hint="rolling window" />
        <Stat label="Revenue all-time" value={dash ? usd(dash.revenueCentsAllTime) : "—"} />
        <Stat label="Payouts pending" value={dash ? usd(dash.payoutsPendingCents) : "—"} hint="unpaid ledger" />
        <Stat label="Payouts settled" value={dash ? usd(dash.payoutsPaidCents) : "—"} />
      </div>

      <Tabs defaultValue="assets">
        <TabsList>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="grants">Grants</TabsTrigger>
          <TabsTrigger value="royalties">Royalties</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4" /> Register an asset</CardTitle>
              <CardDescription className="text-xs">
                An asset with no revenue share uses 0% — no default share is invented on your behalf.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-3">
              <Select value={aType} onChange={(e) => setAType(e.target.value as LicensableAssetType)}>
                {ASSET_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </Select>
              <Select value={aModel} onChange={(e) => setAModel(e.target.value as BillingModel)}>
                {MODELS.map((m) => <option key={m} value={m}>{label(m)}</option>)}
              </Select>
              <Input placeholder="External asset id" value={aExtId} onChange={(e) => setAExtId(e.target.value)} />
              <Input placeholder="Name" value={aName} onChange={(e) => setAName(e.target.value)} />
              <Input type="number" placeholder="Price (cents)" value={aPrice} onChange={(e) => setAPrice(Number(e.target.value))} />
              <Input placeholder="Revenue share % (optional)" value={aShare} onChange={(e) => setAShare(e.target.value)} />
              <div>
                <Button
                  disabled={busy || !aName || !aExtId}
                  onClick={() => run(() => licensingApi.register({
                    type: aType, externalAssetId: aExtId, name: aName, description: aName,
                    billingModel: aModel, priceCents: aPrice, currency: "USD",
                    ...(aShare.trim() ? { revenueSharePct: Number(aShare) } : {}),
                  } as any), "Asset registered.")}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {assets.length === 0 && (
            <div className="text-sm text-slate-400 border border-slate-800 rounded p-4">
              No assets registered. This organization starts empty — no catalogue is published on your behalf.
            </div>
          )}
          {assets.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{a.name}</span>
                    <Badge>{label(a.type)}</Badge>
                    <Badge>{label(a.billingModel)}</Badge>
                    <Badge>{a.status}</Badge>
                    {a.source === "demo_seed" && (
                      <Badge className="bg-amber-900 text-amber-200">demo seed</Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {a.externalAssetId} · list {usd(a.priceCents)} · share {a.revenueSharePct ?? 0}% · {a.listings} grants
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-mono text-emerald-400">{usd(a.revenueCents30d)}</div>
                  <div className="text-[10px] text-slate-500">30d · {usd(a.revenueCentsAllTime)} total</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="grants" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><KeyRound className="h-4 w-4" /> Grant &amp; meter</CardTitle>
              <CardDescription className="text-xs">
                An expired or cancelled grant stops counting as active and cannot be billed.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-3">
              <Select value={gAsset} onChange={(e) => setGAsset(e.target.value)}>
                <option value="">Select asset…</option>
                {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
              <Input placeholder="Licensee org id" value={gLessee} onChange={(e) => setGLessee(e.target.value)} />
              <Input placeholder="Expires (ISO, optional)" value={gExpires} onChange={(e) => setGExpires(e.target.value)} />
              <div>
                <Button
                  disabled={busy || !gAsset || !gLessee}
                  onClick={() => run(() => licensingApi.grant({
                    assetId: gAsset, licenseeOrgId: gLessee,
                    ...(gExpires.trim() ? { expiresAt: gExpires } : {}),
                  }), "Grant created.")}
                >Grant</Button>
              </div>
              <Select value={uGrant} onChange={(e) => setUGrant(e.target.value)}>
                <option value="">Select grant…</option>
                {grants.map((g) => <option key={g.id} value={g.id}>{g.id} ({g.status})</option>)}
              </Select>
              <Input type="number" placeholder="Usage (cents)" value={uCents} onChange={(e) => setUCents(Number(e.target.value))} />
              <div>
                <Button
                  disabled={busy || !uGrant}
                  onClick={() => run(() => licensingApi.recordUsage({ grantId: uGrant, usageCents: uCents }), "Usage recorded.")}
                >Record usage</Button>
              </div>
            </CardContent>
          </Card>

          {grants.length === 0 && (
            <div className="text-sm text-slate-400 border border-slate-800 rounded p-4">No grants.</div>
          )}
          {grants.map((g) => (
            <Card key={g.id}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs">{g.id}</span>
                    <Badge className={g.status === "active" ? "" : "bg-slate-800 text-slate-300"}>{g.status}</Badge>
                    <Badge>{label(g.billingModel)}</Badge>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    licensee {g.licenseeOrgId} · {g.usageCount} events · {usd(g.spendCents)} spend
                    {g.expiresAt && ` · expires ${g.expiresAt.slice(0, 10)}`}
                  </div>
                </div>
                {g.status === "active" && (
                  <Button
                    disabled={busy}
                    onClick={() => run(() => licensingApi.cancelGrant({ grantId: g.id }), "Grant cancelled.")}
                  >Cancel</Button>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="royalties" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Receipt className="h-4 w-4" /> Settle payouts</CardTitle>
              <CardDescription className="text-xs">
                Marks every unpaid entry as settled and stamps the time. This updates the ledger
                only — it does not transfer money.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                disabled={busy || !royalties.some((r) => !r.paid)}
                onClick={() => run(async () => {
                  const r = await licensingApi.settlePayouts({});
                  setMsg(`Marked ${r.settled} entries paid (${usd(r.centsSettled)}). No money moved.`);
                }, "Ledger settled.")}
              >Settle all unpaid</Button>
            </CardContent>
          </Card>

          {royalties.length === 0 && (
            <div className="text-sm text-slate-400 border border-slate-800 rounded p-4">
              No royalty entries. Record usage against a grant to create one.
            </div>
          )}
          {royalties.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs">{r.period}</span>
                  <Badge className={r.paid ? "bg-emerald-900 text-emerald-200" : "bg-amber-900 text-amber-200"}>
                    {r.paid ? "settled" : "pending"}
                  </Badge>
                  <span className="text-[10px] text-slate-500">{r.at.slice(0, 19).replace("T", " ")}</span>
                </div>
                <div className="text-xs text-slate-400 mt-1 font-mono">
                  gross {usd(r.grossCents)} − fee {usd(r.platformFeeCents)} ({r.platformFeePct}%)
                  {" "}− share {usd(r.revenueShareCents)} ({r.revenueSharePct}%)
                  {" "}= owner {usd(r.ownerPayoutCents)}
                </div>
                {r.paidAt && (
                  <div className="text-[10px] text-slate-500 mt-1">settled {r.paidAt.slice(0, 19).replace("T", " ")}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default LicensingPage;
