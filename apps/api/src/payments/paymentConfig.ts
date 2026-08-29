import { AppError } from "../utils/result.js";
import type { PaymentProvider } from "@windels/shared";

export interface ProviderConfiguration {
  configured: boolean;
  testMode: boolean;
  issue?: string;
}

const PROVIDER_LABEL: Record<PaymentProvider, string> = {
  flutterwave: "Flutterwave",
  paystack: "Paystack",
  stripe: "Stripe",
  paypal: "PayPal",
  crypto: "Crypto payments",
  blockonomics: "Blockonomics",
};

export function clean(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

export function publicOrigin(): string {
  const configured = clean(process.env.WINDELS_PUBLIC_API_ORIGIN);
  if (!configured) {
    throw AppError.serviceUnavailable("Payment callback origin is not configured");
  }
  let url: URL;
  try { url = new URL(configured); }
  catch { throw AppError.serviceUnavailable("WINDELS_PUBLIC_API_ORIGIN must be a valid URL"); }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw AppError.serviceUnavailable("WINDELS_PUBLIC_API_ORIGIN must use HTTPS in production");
  }
  return url.origin;
}

export function providerNotConfigured(provider: PaymentProvider, missing: string[] | string): AppError {
  const fields = Array.isArray(missing) ? missing : [missing];
  return new AppError(
    "SERVICE_UNAVAILABLE",
    `${PROVIDER_LABEL[provider]} is not configured`,
    503,
    { provider, code: "PAYMENT_PROVIDER_NOT_CONFIGURED", missing: fields },
  );
}

export function providerUpstreamError(provider: PaymentProvider, operation: string, status?: number, detail?: string): AppError {
  return AppError.upstream(
    `${PROVIDER_LABEL[provider]} ${operation} failed${status ? ` (HTTP ${status})` : ""}`,
    { provider, operation, upstreamStatus: status, detail: detail?.slice(0, 300) },
  );
}

export function requireFields(provider: PaymentProvider, values: Record<string, string | undefined>): Record<string, string> {
  const missing = Object.entries(values).filter(([, value]) => !clean(value)).map(([name]) => name);
  if (missing.length) throw providerNotConfigured(provider, missing);
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, clean(value)!]));
}

export async function responseJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { _invalidJson: true, _text: text.slice(0, 300) }; }
}

export function assertHttpsUrl(provider: PaymentProvider, operation: string, value: unknown): string {
  if (typeof value !== "string") throw providerUpstreamError(provider, operation, undefined, "provider returned no checkout URL");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("not HTTPS");
    return url.toString();
  } catch {
    throw providerUpstreamError(provider, operation, undefined, "provider returned an invalid checkout URL");
  }
}

export function sameMoney(actual: number, expected: number): boolean {
  return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= 0.000001;
}
