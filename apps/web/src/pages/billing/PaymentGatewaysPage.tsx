/**
 * Session 128 — Multi-Provider Payment Gateways & Crypto Checkout Console.
 *
 * Provides real-time inspection of configured payment gateways (Flutterwave,
 * Paystack, PayPal, Blockonomics/Crypto), universal checkout testing,
 * and organization transaction ledger monitoring.
 *
 * Honest UI rules:
 *   - unmeasured or unavailable counts print "not recorded", never 0
 *   - empty transaction ledgers state "No transactions recorded"
 */
import React, { useCallback, useEffect, useState } from "react";
import { CreditCard, RefreshCw, Send, ShieldCheck, ExternalLink, Coins, Eye, CheckCircle2 } from "lucide-react";
import type {
  BlockonomicsAsset,
  PaymentProviderConfig,
  PaymentTransaction,
  PaymentProvider,
  CryptoNetwork,
} from "@windels/shared";
import {
  listPaymentProviders,
  listPaymentTransactions,
  initiatePaymentCheckout,
} from "@/lib/payments";
import { getBilling, type BillingInvoice } from "@/lib/billing";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAuthStore } from "@/store/auth";
import { BlockonomicsCheckoutPanel } from "./BlockonomicsCheckoutPanel";

export function PaymentGatewaysPage() {
  const { user } = useAuthStore();
  const [providers, setProviders] = useState<PaymentProviderConfig[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [selectedTx, setSelectedTx] = useState<PaymentTransaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Universal Checkout Form State
  const [provider, setProvider] = useState<PaymentProvider>("flutterwave");
  const [amount, setAmount] = useState(99);
  const [currency, setCurrency] = useState("USD");
  const [cryptoNetwork, setCryptoNetwork] = useState<CryptoNetwork>("tron_trc20");
  const [blockonomicsAsset, setBlockonomicsAsset] = useState<BlockonomicsAsset>("BTC");
  const [invoiceId, setInvoiceId] = useState("");
  const [description, setDescription] = useState("WINDELS AI OS Enterprise Plan");
  const [checkoutResult, setCheckoutResult] = useState<PaymentTransaction | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [provRes, txsRes, invoiceRes] = await Promise.all([
        listPaymentProviders().catch(() => [] as PaymentProviderConfig[]),
        listPaymentTransactions({ limit: 50 }).catch(() => [] as PaymentTransaction[]),
        getBilling().then((overview) => overview.invoices).catch(() => [] as BillingInvoice[]),
      ]);
      setProviders(provRes);
      setTransactions(txsRes);
      setInvoices(invoiceRes);
      if (txsRes.length > 0 && !selectedTx) {
        setSelectedTx(txsRes[0] ?? null);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to load payment gateways data");
    } finally {
      setLoading(false);
    }
  }, [selectedTx]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!providers.length) return;
    const current = providers.find((item) => item.provider === provider);
    if (!current?.active) {
      const firstReady = providers.find((item) => item.active);
      if (firstReady) setProvider(firstReady.provider);
    }
  }, [providers, provider]);

  useEffect(() => {
    const selected = providers.find((item) => item.provider === provider);
    if (!invoiceId && selected?.supportedCurrencies.length && !selected.supportedCurrencies.includes(currency)) {
      setCurrency(selected.supportedCurrencies[0]!);
    }
    if (provider === "blockonomics" && selected?.supportedAssets?.length && !selected.supportedAssets.includes(blockonomicsAsset)) {
      setBlockonomicsAsset(selected.supportedAssets[0]!);
    }
  }, [blockonomicsAsset, currency, invoiceId, provider, providers]);

  useEffect(() => {
    if (!invoiceId) return;
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;
    setAmount((invoice.remainingCents ?? invoice.amountCents) / 100);
    setCurrency(invoice.currency);
    setDescription(`Payment for invoice ${invoice.number}`);
  }, [invoiceId, invoices]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);
    setCheckoutResult(null);
    setCheckoutLoading(true);
    try {
      const res = await initiatePaymentCheckout({
        provider,
        amount: Number(amount),
        currency,
        description,
        invoiceId: invoiceId || undefined,
        cryptoNetwork: provider === "crypto" ? cryptoNetwork : undefined,
        cryptoCurrency: provider === "blockonomics" ? blockonomicsAsset : undefined,
        customerEmail: user?.email,
      });
      setCheckoutResult(res);
      setSelectedTx(res);
      if (res.provider === "blockonomics") {
        setTransactions((current) => current.some((item) => item.id === res.id) ? current : [res, ...current]);
      } else {
        void loadData();
      }
    } catch (err: any) {
      setCheckoutError(err?.message ?? "Failed to initiate payment checkout");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleBlockonomicsPaymentChange = useCallback((updated: PaymentTransaction) => {
    setCheckoutResult(updated);
    setSelectedTx((current) => current?.id === updated.id ? updated : current);
    setTransactions((current) => {
      const index = current.findIndex((item) => item.id === updated.id);
      if (index === -1) return [updated, ...current];
      return current.map((item) => item.id === updated.id ? updated : item);
    });
  }, []);

  const completedCount = transactions.filter((t) => t.status === "completed").length;
  const configuredCount = providers.filter((item) => item.active).length;
  const selectedProvider = providers.find((item) => item.provider === provider);
  const cryptoProvider = providers.find((item) => item.provider === "crypto");
  const blockonomicsProvider = providers.find((item) => item.provider === "blockonomics");
  const openInvoices = invoices.filter((invoice) => ["open", "past_due"].includes(invoice.status) && (invoice.remainingCents ?? invoice.amountCents) > 0);
  const selectedInvoice = openInvoices.find((invoice) => invoice.id === invoiceId);
  const currencyOptions = selectedProvider?.supportedCurrencies.length ? selectedProvider.supportedCurrencies : ["USD"];
  const invoiceCurrencyUnsupported = !!selectedInvoice && !!selectedProvider && !selectedProvider.supportedCurrencies.includes(selectedInvoice.currency);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-bright flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-emerald-400" />
            Multi-Provider Payment Gateways & Crypto Checkout
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Manage existing fiat gateways plus provider-verified Blockonomics checkout for Bitcoin and USDT on Ethereum ERC-20. Generic crypto remains fail-closed.
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
          <div className="text-xs uppercase tracking-wide text-text-muted">Configured Gateways</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">
            {configuredCount}
          </div>
          <div className="mt-1 text-xs text-text-muted">Ready and fully configured; unavailable providers are not counted</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Total Transactions</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">
            {transactions.length !== undefined ? transactions.length : "not recorded"}
          </div>
          <div className="mt-1 text-xs text-text-muted">In organization ledger (`pay:tx`)</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Completed Transactions</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">
            {completedCount !== undefined ? completedCount : "not recorded"}
          </div>
          <div className="mt-1 text-xs text-text-muted">Verified & settled to billing</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-text-muted">Crypto Networks</div>
          <div className="mt-1 text-2xl font-semibold text-text-bright">{blockonomicsProvider?.active ? blockonomicsProvider.supportedNetworks?.length ?? 0 : 0}</div>
          <div className="mt-1 text-xs text-text-muted">Blockonomics BTC and USDT ERC-20; generic crypto safety gate: {cryptoProvider?.status ?? "not configured"}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Universal Checkout Tester */}
        <Card className={checkoutResult?.provider === "blockonomics" ? "lg:col-span-3" : "lg:col-span-1"}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4 text-emerald-400" />
              Universal Checkout Initiator
            </CardTitle>
            <CardDescription>
              Initiate checkout through the backend. Payment completion always comes from provider verification, never this browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCheckout} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-medium text-text-muted mb-1">
                  Payment Gateway
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as PaymentProvider)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-bright"
                >
                  {providers.map((item) => (
                    <option key={item.provider} value={item.provider} disabled={!item.active}>
                      {item.displayName}{item.active ? "" : ` — ${item.status.replace("_", " ")}`}
                    </option>
                  ))}
                </select>
                {selectedProvider && !selectedProvider.active ? (
                  <p className="mt-1 text-xs text-amber-400">{selectedProvider.configurationIssue ?? "This provider is unavailable."}</p>
                ) : null}
              </div>

              {provider === "crypto" ? (
                <div>
                  <label className="block text-xs uppercase font-medium text-text-muted mb-1">
                    On-Chain Network
                  </label>
                  <select
                    value={cryptoNetwork}
                    onChange={(e) => setCryptoNetwork(e.target.value as CryptoNetwork)}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-bright"
                  >
                    <option value="btc">Bitcoin (BTC)</option>
                    <option value="tron_trc20">Tron (blocked)</option>
                    <option value="eth_erc20">Ethereum (blocked)</option>
                    <option value="bnb_chain">BNB Chain (blocked)</option>
                  </select>
                  <p className="mt-1 text-xs text-amber-400">The generic crypto provider is intentionally unavailable.</p>
                </div>
              ) : null}

              {provider === "blockonomics" ? (
                <div>
                  <label className="block text-xs uppercase font-medium text-text-muted mb-1">
                    Settlement Asset
                  </label>
                  <select
                    value={blockonomicsAsset}
                    onChange={(event) => setBlockonomicsAsset(event.target.value as BlockonomicsAsset)}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-bright"
                  >
                    <option value="BTC" disabled={blockonomicsProvider?.supportedAssets ? !blockonomicsProvider.supportedAssets.includes("BTC") : false}>Bitcoin (BTC)</option>
                    <option value="USDT" disabled={blockonomicsProvider?.supportedAssets ? !blockonomicsProvider.supportedAssets.includes("USDT") : false}>USDT — Ethereum ERC-20 only</option>
                  </select>
                  <p className="mt-1 text-xs text-text-muted">Asset availability is also enforced by encrypted server configuration.</p>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs uppercase font-medium text-text-muted mb-1">
                    Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    readOnly={!!selectedInvoice}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-bright read-only:cursor-not-allowed read-only:opacity-70"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase font-medium text-text-muted mb-1">
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    disabled={!!selectedInvoice}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-bright disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {currencyOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase font-medium text-text-muted mb-1">
                  Billing Invoice
                </label>
                <select
                  value={invoiceId}
                  onChange={(event) => setInvoiceId(event.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-bright"
                >
                  <option value="">No invoice selected</option>
                  {openInvoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.number} · {invoice.currency} {((invoice.remainingCents ?? invoice.amountCents) / 100).toFixed(2)} remaining
                    </option>
                  ))}
                </select>
                {provider === "blockonomics" && !invoiceId ? (
                  <p className="mt-1 text-xs text-amber-400">Without an invoice, confirmed funds are held for billing review and cannot activate a subscription automatically.</p>
                ) : null}
                {invoiceCurrencyUnsupported ? (
                  <p className="mt-1 text-xs text-red-400">The selected provider does not support this invoice currency.</p>
                ) : null}
              </div>

              <div>
                <label className="block text-xs uppercase font-medium text-text-muted mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-bright"
                  required
                />
              </div>

              <Button type="submit" className="w-full gap-2" disabled={checkoutLoading || !selectedProvider?.active || invoiceCurrencyUnsupported || amount <= 0}>
                <Send className="h-4 w-4" />
                {checkoutLoading ? "Initiating..." : "Initiate Checkout"}
              </Button>

              {checkoutError ? (
                <div className="text-xs text-red-400 mt-2 bg-red-500/10 p-2 rounded">
                  {checkoutError}
                </div>
              ) : null}

            </form>

            {checkoutResult?.provider === "blockonomics" ? (
              <BlockonomicsCheckoutPanel
                payment={checkoutResult}
                testMode={blockonomicsProvider?.testMode}
                onPaymentChange={handleBlockonomicsPaymentChange}
              />
            ) : checkoutResult ? (
              <div className="mt-4 p-3 rounded-md bg-card-hover/60 border border-border text-xs space-y-2">
                <div className="font-semibold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Transaction initiated — awaiting provider verification
                </div>
                <div>Reference: <code className="text-text-bright">{checkoutResult.reference}</code></div>
                {checkoutResult.checkoutUrl ? (
                  <a
                    href={checkoutResult.checkoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-400 hover:underline pt-1"
                  >
                    Open Provider Checkout <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Provider Registry Table */}
        <Card className={checkoutResult?.provider === "blockonomics" ? "lg:col-span-3" : "lg:col-span-2"}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-400" />
              Configured Payment Gateways Registry
            </CardTitle>
            <CardDescription>
              Status of Flutterwave, Paystack, PayPal, and Blockonomics / Crypto gateways.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-text-muted">
                    <th className="py-2 pr-4">Provider</th>
                    <th className="py-2 pr-4">Mode</th>
                    <th className="py-2 pr-4">Supported Currencies</th>
                    <th className="py-2">Crypto Networks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {providers.map((p) => (
                    <tr key={p.provider} className="hover:bg-card-hover/40">
                      <td className="py-3 pr-4 font-semibold text-text-bright">
                        {p.displayName}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={p.status === "ready" ? (p.testMode ? "secondary" : "default") : p.status === "blocked" ? "danger" : "outline"}>
                          {p.status === "ready" ? (p.testMode ? "Ready · Sandbox" : "Ready · Production") : p.status.replace("_", " ")}
                        </Badge>
                        {p.configurationIssue ? <div className="mt-1 max-w-xs text-[11px] text-text-muted">{p.configurationIssue}</div> : null}
                      </td>
                      <td className="py-3 pr-4 text-xs font-mono text-text-muted">
                        {p.supportedCurrencies.join(", ")}
                      </td>
                      <td className="py-3 text-xs font-mono text-text-muted">
                        {p.supportedNetworks ? p.supportedNetworks.join(", ") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Organization Transactions Ledger Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-400" />
            Organization Payment Transactions Ledger (`pay:tx`)
          </CardTitle>
          <CardDescription>
            Audit ledger of checkouts and verifications across Flutterwave, Paystack, PayPal, and Crypto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-sm text-text-muted">
              No payment transactions recorded in organization ledger.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-text-muted">
                    <th className="py-2 pr-4">Provider</th>
                    <th className="py-2 pr-4">Reference / ID</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Network / Confirmations</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Created At</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((t) => (
                    <tr
                      key={t.id}
                      className="hover:bg-card-hover/40 cursor-pointer"
                      onClick={() => setSelectedTx(t)}
                    >
                      <td className="py-3 pr-4">
                        <Badge variant="outline" className="capitalize">
                          {t.provider}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-text-bright">
                        {t.reference}
                      </td>
                      <td className="py-3 pr-4 font-semibold text-text-bright">
                        {t.currency} {t.amount.toFixed(2)}
                        {t.cryptoAmount ? (
                          <div className="text-xs text-text-muted font-normal">
                            ({t.cryptoAmount} {t.cryptoNetwork?.toUpperCase()})
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-xs text-text-muted">
                        {t.cryptoNetwork ? (
                          <span>
                            {t.cryptoNetwork} ({t.confirmations ?? 0}/{t.requiredConfirmations ?? 1} confs)
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          variant={t.status === "completed" ? "default" : t.status === "failed" ? "danger" : "secondary"}
                        >
                          {t.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-xs text-text-muted">
                        {new Date(t.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedTx(t)}
                          title="Inspect Receipt"
                          className="text-xs px-2"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
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
  );
}
export default PaymentGatewaysPage;
