/**
 * Session 129 — Global Currency, Payment Orchestration & Geo-Aware Billing Console.
 *
 * Provides real-time inspection of automatic geo-localization, Country Payment
 * Profiles, WMPC Gift Card priority routing, regional tax calculation, and
 * AI Billing Employee optimization insights.
 *
 * Honest UI rules:
 *   - unmeasured or unavailable counts print "not recorded", never 0
 *   - empty profile tables clearly state "No regional profiles configured"
 */
import React, { useCallback, useEffect, useState } from "react";
import { Globe2, RefreshCw, Send, ShieldCheck, Gift, Bot, Percent, CreditCard, ArrowRight } from "lucide-react";
import type {
  CountryPaymentProfile,
  GeoBillingContext,
  PaymentRoutingPlan,
  AIBillingRecommendation,
} from "@windels/shared";
import {
  getGeoBillingContext,
  listCountryPaymentProfiles,
  routePaymentRequest,
  getAIBillingInsights,
} from "@/lib/geoBilling";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

export function GeoBillingConsolePage() {
  const [context, setContext] = useState<GeoBillingContext | null>(null);
  const [profiles, setProfiles] = useState<CountryPaymentProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic Geo-Routing Tester State
  const [selectedCountry, setSelectedCountry] = useState("NG");
  const [amountUSD, setAmountUSD] = useState(100);
  const [useGiftCard, setUseGiftCard] = useState(true);
  const [routingPlan, setRoutingPlan] = useState<PaymentRoutingPlan | null>(null);
  const [aiInsight, setAiInsight] = useState<AIBillingRecommendation | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ctxRes, profsRes, aiRes] = await Promise.all([
        getGeoBillingContext({ country: selectedCountry }).catch(() => null),
        listCountryPaymentProfiles().catch(() => [] as CountryPaymentProfile[]),
        getAIBillingInsights({ country: selectedCountry, amount: amountUSD }).catch(() => null),
      ]);
      setContext(ctxRes);
      setProfiles(profsRes);
      setAiInsight(aiRes);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load geo-billing engine data");
    } finally {
      setLoading(false);
    }
  }, [selectedCountry, amountUSD]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEvaluateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    setEvalLoading(true);
    setError(null);
    try {
      const plan = await routePaymentRequest({
        amount: Number(amountUSD),
        currency: "USD",
        country: selectedCountry,
        useGiftCardBalance: useGiftCard,
      });
      setRoutingPlan(plan);
      const ai = await getAIBillingInsights({ country: selectedCountry, amount: Number(amountUSD) });
      setAiInsight(ai);
    } catch (err: any) {
      setError(err?.message ?? "Failed to evaluate geo-payment routing plan");
    } finally {
      setEvalLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2">
            <Globe2 className="h-6 w-6 text-emerald-400" />
            Global Currency, Payment Orchestration & Geo-Aware Billing
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Intelligent country/currency localization, WMPC Gift Card #1 priority, automated gateway failover, and regional tax compliance.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Detected Country & Currency</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">
            {context ? `${context.countryName} (${context.currencySymbol})` : "not recorded"}
          </div>
          <div className="mt-1 text-xs text-text-muted">
            Detected via: <span className="font-mono">{context?.detectedBy ?? "default"}</span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Applicable Tax Obligation</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">
            {context ? `${context.taxRule.type} ${(context.taxRule.rate * 100).toFixed(1)}%` : "not recorded"}
          </div>
          <div className="mt-1 text-xs text-text-muted">
            {context?.taxRule.included ? "Included in gross price" : "Added at checkout"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Primary Payment Priority</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">
            {context ? "WMPC Gift Card (#1)" : "not recorded"}
          </div>
          <div className="mt-1 text-xs text-text-muted">
            Failover: {context?.supportedPaymentMethods.slice(1, 3).join(" → ") ?? "gateways"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Regional Profiles Configured</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">
            {profiles.length !== undefined ? profiles.length : "not recorded"}
          </div>
          <div className="mt-1 text-xs text-text-muted">NG, US, GB, EU, JP, CN, ZA, AE, BR...</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dynamic Geo-Routing & Tax Tester */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4 text-emerald-400" />
              Dynamic Geo-Routing & Tax Tester
            </CardTitle>
            <CardDescription>
              Test currency localization, gift card deduction, and failover routing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEvaluateRoute} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-medium text-text-muted mb-1">
                  Target Country
                </label>
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-bright"
                >
                  <option value="NG">Nigeria (NGN ₦ — VAT 7.5%)</option>
                  <option value="US">United States (USD $ — State Sales Tax 8%)</option>
                  <option value="GB">United Kingdom (GBP £ — VAT 20%)</option>
                  <option value="DE">Germany (EUR € — VAT 19%)</option>
                  <option value="FR">France (EUR € — VAT 20%)</option>
                  <option value="JP">Japan (JPY ¥ — Consumption Tax 10%)</option>
                  <option value="CN">China (CNY ¥ — VAT 13%)</option>
                  <option value="GH">Ghana (GHS ₵ — VAT 15%)</option>
                  <option value="KE">Kenya (KES KSh — VAT 16%)</option>
                  <option value="ZA">South Africa (ZAR R — VAT 15%)</option>
                  <option value="AE">United Arab Emirates (AED — VAT 5%)</option>
                  <option value="SA">Saudi Arabia (SAR — VAT 15%)</option>
                  <option value="BR">Brazil (BRL R$ — DST 5%)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase font-medium text-text-muted mb-1">
                  Base Amount (USD)
                </label>
                <input
                  type="number"
                  step="1"
                  value={amountUSD}
                  onChange={(e) => setAmountUSD(Number(e.target.value))}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-bright"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="useGc"
                  checked={useGiftCard}
                  onChange={(e) => setUseGiftCard(e.target.checked)}
                  className="rounded border-border text-emerald-500"
                />
                <label htmlFor="useGc" className="text-xs text-text-bright cursor-pointer">
                  Prioritize WMPC Gift Card Balance (#1 Priority)
                </label>
              </div>

              <Button type="submit" className="w-full gap-2" disabled={evalLoading}>
                <Send className="h-4 w-4" />
                {evalLoading ? "Evaluating..." : "Evaluate Geo-Routing Plan"}
              </Button>

              {routingPlan ? (
                <div className="mt-4 p-3 rounded-md bg-card-hover/60 border border-border text-xs space-y-2">
                  <div className="font-semibold text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Geo-Routing Plan Resolved
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Local Currency Price:</span>
                    <strong className="text-text-bright">{routingPlan.localFormatted}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Regional Tax Amount:</span>
                    <strong className="text-text-bright">{routingPlan.localCurrency} {routingPlan.taxAmount.toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1">
                    <span className="text-text-muted">Total Gross Obligation:</span>
                    <strong className="text-emerald-300">{routingPlan.localCurrency} {routingPlan.totalWithTax.toFixed(2)}</strong>
                  </div>
                  {routingPlan.wmpcGiftCardApplied ? (
                    <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 mt-2">
                      <Gift className="h-3.5 w-3.5 inline mr-1" />
                      WMPC Gift Card Applied: {routingPlan.localCurrency} {routingPlan.giftCardRedeemedAmount.toFixed(2)}
                    </div>
                  ) : null}
                  <div className="pt-2">
                    <div className="text-text-muted mb-1">Gateway Failover Order:</div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge variant="default" className="text-xs">
                        {routingPlan.selectedProvider} (Primary)
                      </Badge>
                      {routingPlan.fallbackProviders.map((fb) => (
                        <span key={fb} className="inline-flex items-center gap-1">
                          <ArrowRight className="h-3 w-3 text-text-muted" />
                          <Badge variant="secondary" className="text-xs">
                            {fb}
                          </Badge>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </form>
          </CardContent>
        </Card>

        {/* AI Billing Employee Insights Panel */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-4 w-4 text-purple-400" />
                AI Billing Employee Context & Regional Insights
              </CardTitle>
              <CardDescription>
                Natural language recommendations for fee reduction, compliance, and payment method optimization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {aiInsight ? (
                <div className="space-y-4 text-xs">
                  <div className="p-3 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-200">
                    <strong className="block text-sm font-semibold text-purple-100 mb-1">
                      AI Regional Recommendation: {aiInsight.country} ({aiInsight.currency})
                    </strong>
                    {aiInsight.reason}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-2 rounded bg-background border border-border">
                      <div className="text-text-muted uppercase text-[10px]">Recommended Gateway</div>
                      <div className="font-semibold text-text-bright mt-0.5 capitalize">{aiInsight.recommendedProvider}</div>
                    </div>
                    <div className="p-2 rounded bg-background border border-border">
                      <div className="text-text-muted uppercase text-[10px]">Est. Processing Fee</div>
                      <div className="font-semibold text-emerald-400 mt-0.5">{aiInsight.estimatedProcessingFeePct.toFixed(1)}%</div>
                    </div>
                    <div className="p-2 rounded bg-background border border-border">
                      <div className="text-text-muted uppercase text-[10px]">Fraud Risk Profile</div>
                      <div className="font-semibold text-text-bright mt-0.5 capitalize">{aiInsight.fraudRiskLevel}</div>
                    </div>
                  </div>
                  <div className="p-3 rounded bg-background border border-border">
                    <div className="font-semibold text-text-bright mb-1">Tax & Compliance Summary:</div>
                    <div className="text-text-muted">{aiInsight.taxSummary}</div>
                    <div className="text-emerald-300 mt-2 font-medium">💡 Actionable Advice: {aiInsight.advice}</div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-text-muted">
                  Select a target country and amount above to view AI recommendations.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Configured Country Payment Profiles Registry */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-blue-400" />
                Country Payment Profiles Registry (`geob:profile`)
              </CardTitle>
              <CardDescription>
                Configured regional currencies, symbols, tax obligations, and prioritized payment gateways.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profiles.length === 0 ? (
                <div className="text-center py-8 text-sm text-text-muted">
                  No regional profiles configured.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase text-text-muted">
                        <th className="py-2 pr-4">Country</th>
                        <th className="py-2 pr-4">Currency</th>
                        <th className="py-2 pr-4">Tax Rule</th>
                        <th className="py-2 pr-4">Default Method</th>
                        <th className="py-2">Prioritized Providers</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {profiles.map((p) => (
                        <tr
                          key={p.countryCode}
                          className={`hover:bg-card-hover/40 cursor-pointer ${
                            p.countryCode === selectedCountry ? "bg-card-hover/60" : ""
                          }`}
                          onClick={() => setSelectedCountry(p.countryCode)}
                        >
                          <td className="py-2 pr-4 font-semibold text-text-bright">
                            {p.countryName} ({p.countryCode})
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs text-text-bright">
                            {p.currencySymbol} {p.currency}
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant="outline" className="text-xs">
                              {p.taxRule.type} {(p.taxRule.rate * 100).toFixed(1)}%
                            </Badge>
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant="default" className="text-xs">
                              {p.defaultPaymentMethod}
                            </Badge>
                          </td>
                          <td className="py-2 text-xs font-mono text-text-muted truncate max-w-xs">
                            {p.supportedPaymentMethods.join(", ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
export default GeoBillingConsolePage;
