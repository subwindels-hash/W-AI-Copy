/** Fail-closed Paystack checkout and verification adapter. */
import { randomUUID, createHmac } from "node:crypto";
import { safeCompare } from "../webhook/webhookReceiver.service.js";
import { clean, publicOrigin, requireFields, providerUpstreamError, responseJson, assertHttpsUrl, type ProviderConfiguration } from "./paymentConfig.js";

export interface PYSInitResult {
  reference: string;
  checkoutUrl: string;
  provider: "paystack";
  amount: number;
  currency: string;
  accessCode: string;
}

export interface PYSVerifyResult {
  verified: true;
  provider: "paystack";
  reference: string;
  status: "completed" | "pending" | "failed";
  amount: number;
  currency: string;
  providerTransactionId: string;
  channel?: string;
}

function key(): string {
  return requireFields("paystack", { PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY }).PAYSTACK_SECRET_KEY;
}

export const PaystackService = {
  configuration(): ProviderConfiguration {
    const value = clean(process.env.PAYSTACK_SECRET_KEY);
    return { configured: !!value, testMode: /^sk_test_/i.test(value ?? ""), issue: value ? undefined : "Missing PAYSTACK_SECRET_KEY" };
  },

  async initializePayment(input: {
    amount: number;
    currency?: string;
    customerEmail?: string;
    description?: string;
    invoiceId?: string;
    callbackUrl?: string;
    reference?: string;
  }, fetchImpl: typeof fetch = fetch): Promise<PYSInitResult> {
    const secret = key();
    const origin = publicOrigin();
    if (!input.customerEmail) throw providerUpstreamError("paystack", "initialize", undefined, "customer email is required");
    const currency = (input.currency || "NGN").toUpperCase();
    const reference = input.reference ?? `PYS_WIN_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const response = await fetchImpl("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        reference,
        amount: Math.round(input.amount * 100),
        email: input.customerEmail,
        currency,
        callback_url: input.callbackUrl || `${origin}/app/payments/callback?provider=paystack`,
        metadata: { invoiceId: input.invoiceId ?? "", description: input.description ?? "" },
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch((error) => { throw providerUpstreamError("paystack", "initialize", undefined, (error as Error).message); });
    const json = await responseJson(response);
    if (!response.ok || json.status !== true || !json.data) {
      throw providerUpstreamError("paystack", "initialize", response.status, json.message ?? json._text);
    }
    const checkoutUrl = assertHttpsUrl("paystack", "initialize", json.data.authorization_url);
    const accessCode = String(json.data.access_code ?? "");
    if (!accessCode) throw providerUpstreamError("paystack", "initialize", response.status, "provider returned no access code");
    if (json.data.reference && String(json.data.reference) !== reference) {
      throw providerUpstreamError("paystack", "initialize", response.status, "provider reference mismatch");
    }
    return { reference, checkoutUrl, provider: "paystack", amount: input.amount, currency, accessCode };
  },

  async verifyPayment(reference: string, fetchImpl: typeof fetch = fetch): Promise<PYSVerifyResult> {
    const secret = key();
    const response = await fetchImpl(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    }).catch((error) => { throw providerUpstreamError("paystack", "verify", undefined, (error as Error).message); });
    const json = await responseJson(response);
    if (!response.ok || json.status !== true || !json.data) throw providerUpstreamError("paystack", "verify", response.status, json.message ?? json._text);
    const data = json.data;
    if (String(data.reference ?? "") !== reference) throw providerUpstreamError("paystack", "verify", response.status, "provider reference mismatch");
    const providerStatus = String(data.status ?? "").toLowerCase();
    const status = providerStatus === "success" ? "completed" : providerStatus === "failed" || providerStatus === "abandoned" ? "failed" : "pending";
    return {
      verified: true,
      provider: "paystack",
      reference,
      status,
      amount: Number(data.amount) / 100,
      currency: String(data.currency ?? "").toUpperCase(),
      providerTransactionId: String(data.id ?? reference),
      channel: data.channel ? String(data.channel) : undefined,
    };
  },

  verifyWebhookSignature(signatureHeader: string | undefined, rawBody: Buffer | string, secretOverride?: string): boolean {
    const secret = clean(secretOverride) ?? clean(process.env.PAYSTACK_SECRET_KEY);
    if (!signatureHeader || !secret) return false;
    const computed = createHmac("sha512", secret).update(rawBody).digest("hex");
    return safeCompare(signatureHeader, computed);
  },
};
