/** Fail-closed Flutterwave checkout and verification adapter. */
import { randomUUID } from "node:crypto";
import { safeCompare } from "../webhook/webhookReceiver.service.js";
import { clean, publicOrigin, requireFields, providerUpstreamError, responseJson, assertHttpsUrl, type ProviderConfiguration } from "./paymentConfig.js";

export interface FLWInitResult {
  reference: string;
  checkoutUrl: string;
  provider: "flutterwave";
  amount: number;
  currency: string;
}

export interface FLWVerifyResult {
  verified: true;
  provider: "flutterwave";
  reference: string;
  status: "completed" | "pending" | "failed";
  amount: number;
  currency: string;
  providerTransactionId: string;
  flwRef?: string;
}

function secretKey(): string {
  return requireFields("flutterwave", { FLUTTERWAVE_SECRET_KEY: process.env.FLUTTERWAVE_SECRET_KEY }).FLUTTERWAVE_SECRET_KEY;
}

export const FlutterwaveService = {
  configuration(): ProviderConfiguration {
    const missing = ["FLUTTERWAVE_SECRET_KEY", "FLUTTERWAVE_SECRET_HASH"]
      .filter((name) => !clean(process.env[name]));
    return {
      configured: missing.length === 0,
      testMode: /^FLWSECK_TEST-/i.test(clean(process.env.FLUTTERWAVE_SECRET_KEY) ?? ""),
      issue: missing.length ? `Missing ${missing.join(", ")}` : undefined,
    };
  },

  async initializePayment(input: {
    amount: number;
    currency?: string;
    customerEmail?: string;
    description?: string;
    invoiceId?: string;
    redirectUrl?: string;
    reference?: string;
  }, fetchImpl: typeof fetch = fetch): Promise<FLWInitResult> {
    const key = secretKey();
    const origin = publicOrigin();
    if (!input.customerEmail) throw providerUpstreamError("flutterwave", "initialize", undefined, "customer email is required");
    const currency = (input.currency || "NGN").toUpperCase();
    const reference = input.reference ?? `FLW_WIN_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const response = await fetchImpl("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        tx_ref: reference,
        amount: input.amount,
        currency,
        redirect_url: input.redirectUrl || `${origin}/app/payments/callback?provider=flutterwave`,
        customer: { email: input.customerEmail },
        customizations: {
          title: input.description || `WINDELS AI OS Order (${currency} ${input.amount})`,
          logo: `${origin}/logo.png`,
        },
        meta: { invoiceId: input.invoiceId ?? "" },
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch((error) => { throw providerUpstreamError("flutterwave", "initialize", undefined, (error as Error).message); });
    const json = await responseJson(response);
    if (!response.ok || json.status !== "success") {
      throw providerUpstreamError("flutterwave", "initialize", response.status, json.message ?? json._text);
    }
    const checkoutUrl = assertHttpsUrl("flutterwave", "initialize", json.data?.link);
    return { reference, checkoutUrl, provider: "flutterwave", amount: input.amount, currency };
  },

  async verifyPayment(reference: string, transactionId: string | undefined, fetchImpl: typeof fetch = fetch): Promise<FLWVerifyResult> {
    const key = secretKey();
    if (!transactionId) throw providerUpstreamError("flutterwave", "verify", undefined, "transaction_id is required");
    const response = await fetchImpl(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    }).catch((error) => { throw providerUpstreamError("flutterwave", "verify", undefined, (error as Error).message); });
    const json = await responseJson(response);
    if (!response.ok || !json.data) throw providerUpstreamError("flutterwave", "verify", response.status, json.message ?? json._text);
    const data = json.data;
    if (String(data.tx_ref ?? "") !== reference) {
      throw providerUpstreamError("flutterwave", "verify", response.status, "provider reference mismatch");
    }
    const providerStatus = String(data.status ?? "").toLowerCase();
    const status = providerStatus === "successful" ? "completed" : providerStatus === "failed" ? "failed" : "pending";
    return {
      verified: true,
      provider: "flutterwave",
      reference,
      status,
      amount: Number(data.amount),
      currency: String(data.currency ?? "").toUpperCase(),
      providerTransactionId: String(data.id ?? transactionId),
      flwRef: data.flw_ref ? String(data.flw_ref) : undefined,
    };
  },

  verifyWebhookSignature(headerHash: string | undefined, secretOverride?: string): boolean {
    const expected = clean(secretOverride) ?? clean(process.env.FLUTTERWAVE_SECRET_HASH);
    if (!headerHash || !expected) return false;
    return safeCompare(headerHash, expected);
  },
};
