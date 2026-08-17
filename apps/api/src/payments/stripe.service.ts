/** Fail-closed Stripe Checkout and verification adapter. */
import { randomUUID, createHmac } from "node:crypto";
import { safeCompare } from "../webhook/webhookReceiver.service.js";
import { clean, publicOrigin, requireFields, providerUpstreamError, responseJson, assertHttpsUrl, type ProviderConfiguration } from "./paymentConfig.js";

const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
const toMinor = (amount: number, currency: string) => ZERO_DECIMAL.has(currency) ? Math.round(amount) : Math.round(amount * 100);
const fromMinor = (amount: number, currency: string) => ZERO_DECIMAL.has(currency) ? amount : amount / 100;

export interface STRInitResult {
  reference: string;
  checkoutUrl: string;
  provider: "stripe";
  amount: number;
  currency: string;
  sessionId: string;
}

export interface STRVerifyResult {
  verified: true;
  provider: "stripe";
  reference: string;
  status: "completed" | "pending" | "failed";
  amount: number;
  currency: string;
  providerTransactionId: string;
  sessionId: string;
}

function key(): string {
  return requireFields("stripe", { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY }).STRIPE_SECRET_KEY;
}

export const StripeService = {
  configuration(): ProviderConfiguration {
    const missing = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"].filter((name) => !clean(process.env[name]));
    const value = clean(process.env.STRIPE_SECRET_KEY);
    return { configured: missing.length === 0, testMode: /^sk_test_/i.test(value ?? ""), issue: missing.length ? `Missing ${missing.join(", ")}` : undefined };
  },

  async createCheckoutSession(input: {
    amount: number;
    currency?: string;
    customerEmail?: string;
    description?: string;
    invoiceId?: string;
    successUrl?: string;
    cancelUrl?: string;
    reference?: string;
  }, fetchImpl: typeof fetch = fetch): Promise<STRInitResult> {
    const secret = key();
    const origin = publicOrigin();
    if (!input.customerEmail) throw providerUpstreamError("stripe", "initialize", undefined, "customer email is required");
    const currency = (input.currency || "USD").toUpperCase();
    const reference = input.reference ?? `STR_WIN_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("success_url", input.successUrl || `${origin}/app/payments/callback?provider=stripe&session_id={CHECKOUT_SESSION_ID}`);
    params.append("cancel_url", input.cancelUrl || `${origin}/app/payments`);
    params.append("customer_email", input.customerEmail);
    params.append("client_reference_id", reference);
    params.append("line_items[0][price_data][currency]", currency.toLowerCase());
    params.append("line_items[0][price_data][product_data][name]", input.description || `WINDELS AI OS Order (${currency} ${input.amount})`);
    params.append("line_items[0][price_data][unit_amount]", String(toMinor(input.amount, currency)));
    params.append("line_items[0][quantity]", "1");
    params.append("metadata[organizationReference]", reference);
    if (input.invoiceId) params.append("metadata[invoiceId]", input.invoiceId);

    const response = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Bearer ${secret}` },
      body: params.toString(),
      signal: AbortSignal.timeout(10_000),
    }).catch((error) => { throw providerUpstreamError("stripe", "initialize", undefined, (error as Error).message); });
    const json = await responseJson(response);
    if (!response.ok) throw providerUpstreamError("stripe", "initialize", response.status, json.error?.message ?? json._text);
    const checkoutUrl = assertHttpsUrl("stripe", "initialize", json.url);
    const sessionId = String(json.id ?? "");
    if (!sessionId || String(json.client_reference_id ?? "") !== reference) {
      throw providerUpstreamError("stripe", "initialize", response.status, "provider session/reference missing or mismatched");
    }
    return { reference, checkoutUrl, provider: "stripe", amount: input.amount, currency, sessionId };
  },

  async verifyPayment(reference: string, sessionId: string | undefined, fetchImpl: typeof fetch = fetch): Promise<STRVerifyResult> {
    const secret = key();
    if (!sessionId) throw providerUpstreamError("stripe", "verify", undefined, "session_id is required");
    const response = await fetchImpl(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    }).catch((error) => { throw providerUpstreamError("stripe", "verify", undefined, (error as Error).message); });
    const json = await responseJson(response);
    if (!response.ok) throw providerUpstreamError("stripe", "verify", response.status, json.error?.message ?? json._text);
    if (String(json.client_reference_id ?? "") !== reference) throw providerUpstreamError("stripe", "verify", response.status, "provider reference mismatch");
    const currency = String(json.currency ?? "").toUpperCase();
    const status = json.payment_status === "paid" ? "completed" : json.status === "expired" ? "failed" : "pending";
    return {
      verified: true,
      provider: "stripe",
      reference,
      status,
      amount: fromMinor(Number(json.amount_total), currency),
      currency,
      providerTransactionId: String(json.payment_intent ?? json.id ?? sessionId),
      sessionId: String(json.id ?? sessionId),
    };
  },

  verifyWebhookSignature(signatureHeader: string | undefined, rawBody: Buffer | string, secretOverride?: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
    const secret = clean(secretOverride) ?? clean(process.env.STRIPE_WEBHOOK_SECRET);
    if (!signatureHeader || !secret) return false;
    const values = signatureHeader.split(",").map((part) => part.trim().split("=", 2));
    const timestamp = Number(values.find(([name]) => name === "t")?.[1]);
    const signatures = values.filter(([name]) => name === "v1").map(([, value]) => value).filter(Boolean) as string[];
    if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 300 || !signatures.length) return false;
    const computed = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
    return signatures.some((signature) => safeCompare(signature, computed));
  },
};
