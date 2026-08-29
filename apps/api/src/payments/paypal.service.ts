/** Fail-closed PayPal Orders, capture, and official webhook verification adapter. */
import { randomUUID } from "node:crypto";
import { clean, publicOrigin, requireFields, providerUpstreamError, responseJson, assertHttpsUrl, type ProviderConfiguration } from "./paymentConfig.js";

export interface PayPalOrderResult {
  orderId: string;
  clientReference: string;
  approvalUrl: string;
  provider: "paypal";
  amount: number;
  currency: string;
}

export interface PayPalCaptureResult {
  verified: true;
  provider: "paypal";
  reference: string;
  status: "completed" | "pending" | "failed";
  amount: number;
  currency: string;
  providerTransactionId: string;
  orderId: string;
  captureId?: string;
}

interface PayPalConfig { clientId: string; clientSecret: string; webhookId: string; environment: "sandbox" | "live"; baseUrl: string }

function config(): PayPalConfig {
  const values = requireFields("paypal", {
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID,
    PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT,
  });
  const environment = values.PAYPAL_ENVIRONMENT;
  if (environment !== "sandbox" && environment !== "live") {
    throw providerUpstreamError("paypal", "configuration", undefined, "PAYPAL_ENVIRONMENT must be sandbox or live");
  }
  return {
    clientId: values.PAYPAL_CLIENT_ID,
    clientSecret: values.PAYPAL_CLIENT_SECRET,
    webhookId: values.PAYPAL_WEBHOOK_ID,
    environment,
    baseUrl: environment === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com",
  };
}

async function accessToken(cfg: PayPalConfig, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(`${cfg.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => { throw providerUpstreamError("paypal", "authentication", undefined, (error as Error).message); });
  const json = await responseJson(response);
  if (!response.ok || !json.access_token) throw providerUpstreamError("paypal", "authentication", response.status, json.error_description ?? json._text);
  return String(json.access_token);
}

export const PayPalService = {
  configuration(): ProviderConfiguration {
    const missing = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "PAYPAL_ENVIRONMENT"]
      .filter((name) => !clean(process.env[name]));
    const environment = clean(process.env.PAYPAL_ENVIRONMENT);
    const invalidEnvironment = !!environment && environment !== "sandbox" && environment !== "live";
    return {
      configured: missing.length === 0 && !invalidEnvironment,
      testMode: environment === "sandbox",
      issue: missing.length ? `Missing ${missing.join(", ")}` : invalidEnvironment ? "PAYPAL_ENVIRONMENT must be sandbox or live" : undefined,
    };
  },

  async createOrder(input: {
    amount: number;
    currency?: string;
    description?: string;
    invoiceId?: string;
    returnUrl?: string;
    cancelUrl?: string;
    clientReference?: string;
  }, fetchImpl: typeof fetch = fetch): Promise<PayPalOrderResult> {
    const cfg = config();
    const origin = publicOrigin();
    const token = await accessToken(cfg, fetchImpl);
    const currency = (input.currency || "USD").toUpperCase();
    const clientReference = input.clientReference ?? `PPL_WIN_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const response = await fetchImpl(`${cfg.baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "PayPal-Request-Id": clientReference,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: clientReference,
          custom_id: clientReference,
          invoice_id: input.invoiceId,
          amount: { currency_code: currency, value: input.amount.toFixed(2) },
          description: input.description || "WINDELS AI OS payment",
        }],
        payment_source: undefined,
        application_context: {
          return_url: input.returnUrl || `${origin}/app/payments/callback?provider=paypal`,
          cancel_url: input.cancelUrl || `${origin}/app/payments`,
          user_action: "PAY_NOW",
        },
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch((error) => { throw providerUpstreamError("paypal", "create order", undefined, (error as Error).message); });
    const json = await responseJson(response);
    if (!response.ok || !json.id) throw providerUpstreamError("paypal", "create order", response.status, json.message ?? json._text);
    const approval = json.links?.find((link: any) => link.rel === "approve")?.href;
    const approvalUrl = assertHttpsUrl("paypal", "create order", approval);
    return { orderId: String(json.id), clientReference, approvalUrl, provider: "paypal", amount: input.amount, currency };
  },

  async captureOrder(orderId: string, fetchImpl: typeof fetch = fetch): Promise<PayPalCaptureResult> {
    const cfg = config();
    if (!orderId) throw providerUpstreamError("paypal", "capture", undefined, "orderId is required");
    const token = await accessToken(cfg, fetchImpl);
    const response = await fetchImpl(`${cfg.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "PayPal-Request-Id": `capture-${orderId}` },
      signal: AbortSignal.timeout(10_000),
    }).catch((error) => { throw providerUpstreamError("paypal", "capture", undefined, (error as Error).message); });
    const json = await responseJson(response);
    if (!response.ok) throw providerUpstreamError("paypal", "capture", response.status, json.message ?? json._text);
    if (String(json.id ?? "") !== orderId) throw providerUpstreamError("paypal", "capture", response.status, "provider order ID mismatch");
    const capture = json.purchase_units?.[0]?.payments?.captures?.[0];
    const amount = Number(capture?.amount?.value ?? json.purchase_units?.[0]?.amount?.value);
    const currency = String(capture?.amount?.currency_code ?? json.purchase_units?.[0]?.amount?.currency_code ?? "").toUpperCase();
    const providerStatus = String(capture?.status ?? json.status ?? "").toUpperCase();
    const status = providerStatus === "COMPLETED" ? "completed" : ["DECLINED", "VOIDED", "FAILED"].includes(providerStatus) ? "failed" : "pending";
    return {
      verified: true,
      provider: "paypal",
      reference: orderId,
      status,
      amount,
      currency,
      providerTransactionId: String(capture?.id ?? orderId),
      orderId,
      captureId: capture?.id ? String(capture.id) : undefined,
    };
  },

  async verifyWebhookSignature(headers: {
    authAlgo?: string;
    certUrl?: string;
    transmissionId?: string;
    transmissionSig?: string;
    transmissionTime?: string;
  }, webhookEvent: unknown, fetchImpl: typeof fetch = fetch): Promise<boolean> {
    const cfg = config();
    if (!headers.authAlgo || !headers.certUrl || !headers.transmissionId || !headers.transmissionSig || !headers.transmissionTime) return false;
    const token = await accessToken(cfg, fetchImpl);
    const response = await fetchImpl(`${cfg.baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        auth_algo: headers.authAlgo,
        cert_url: headers.certUrl,
        transmission_id: headers.transmissionId,
        transmission_sig: headers.transmissionSig,
        transmission_time: headers.transmissionTime,
        webhook_id: cfg.webhookId,
        webhook_event: webhookEvent,
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch((error) => { throw providerUpstreamError("paypal", "webhook verification", undefined, (error as Error).message); });
    const json = await responseJson(response);
    if (!response.ok) throw providerUpstreamError("paypal", "webhook verification", response.status, json.message ?? json._text);
    return String(json.verification_status ?? "").toUpperCase() === "SUCCESS";
  },
};
