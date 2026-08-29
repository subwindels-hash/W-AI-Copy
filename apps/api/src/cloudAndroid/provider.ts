import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { CloudAndroidProviderAction, CloudAndroidProviderResult } from "@windels/shared/cloudAndroid";

export interface CloudAndroidProvider {
  readonly id: string;
  health(): Promise<{ healthy: boolean; capabilities: string[]; regions: string[]; androidVersions: string[]; latencyMs: number; error?: string }>;
  execute(input: Omit<CloudAndroidProviderAction, "protocol" | "requestId">): Promise<CloudAndroidProviderResult>;
}

function config(): { url: string; secret: string; id: string } | null {
  if (process.env.CLOUD_ANDROID_ENABLED !== "true") return null;
  const url = process.env.CLOUD_ANDROID_PROVIDER_URL?.replace(/\/$/, "");
  const secret = process.env.CLOUD_ANDROID_PROVIDER_HMAC_SECRET;
  if (!url || !secret || secret.length < 32) return null;
  if (process.env.NODE_ENV === "production" && !url.startsWith("https://")) return null;
  return { url, secret, id: process.env.CLOUD_ANDROID_PROVIDER_ID || "windels-provider" };
}
function signature(secret: string, timestamp: string, body: string) { return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex"); }
function verifyResponse(secret: string, timestamp: string, body: string, supplied: string): boolean {
  if (!timestamp || Math.abs(Date.now() - Date.parse(timestamp)) > 5 * 60_000 || !supplied.startsWith("v1=")) return false;
  const expected = Buffer.from(signature(secret, timestamp, body)); const actual = Buffer.from(supplied.slice(3));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function unavailable(requestId: string, action: string): CloudAndroidProviderResult {
  return { ok: false, requestId, operationId: `unavailable:${action}`, status: "NOT_CONFIGURED", evidence: {}, error: { code: "CLOUD_ANDROID_PROVIDER_NOT_CONFIGURED", message: "Cloud Android provider URL and HMAC secret are required", retryable: false } };
}

/** Signed, vendor-neutral adapter. Android runtime endpoints are never public. */
export class HttpCloudAndroidProvider implements CloudAndroidProvider {
  readonly id = config()?.id ?? "not-configured";

  async health() {
    const cfg = config(); const started = Date.now();
    if (!cfg) return { healthy: false, capabilities: [], regions: [], androidVersions: [], latencyMs: 0, error: "provider not configured" };
    const requestId = randomUUID(); const body = JSON.stringify({ protocol: "windels-cloud-android-provider/v1", action: "health", requestId }); const timestamp = new Date().toISOString();
    try {
      const response = await fetch(`${cfg.url}/v1/provider/health`, { method: "POST", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/json", "x-windels-timestamp": timestamp, "x-windels-signature": `v1=${signature(cfg.secret, timestamp, body)}`, "x-request-id": requestId }, body });
      const text = await response.text();
      if (!verifyResponse(cfg.secret, response.headers.get("x-windels-timestamp") ?? "", text, response.headers.get("x-windels-signature") ?? "")) return { healthy: false, capabilities: [], regions: [], androidVersions: [], latencyMs: Date.now() - started, error: "provider response signature invalid" };
      const parsed: any = JSON.parse(text);
      return { healthy: response.ok && parsed.healthy === true, capabilities: Array.isArray(parsed.capabilities) ? parsed.capabilities.map(String) : [], regions: Array.isArray(parsed.regions) ? parsed.regions.map(String) : [], androidVersions: Array.isArray(parsed.androidVersions) ? parsed.androidVersions.map(String) : [], latencyMs: Date.now() - started, error: parsed.error ? String(parsed.error).slice(0, 500) : undefined };
    } catch (error) { return { healthy: false, capabilities: [], regions: [], androidVersions: [], latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) }; }
  }

  async execute(input: Omit<CloudAndroidProviderAction, "protocol" | "requestId">): Promise<CloudAndroidProviderResult> {
    const cfg = config(); const requestId = randomUUID(); if (!cfg) return unavailable(requestId, input.action);
    const payload: CloudAndroidProviderAction = { protocol: "windels-cloud-android-provider/v1", requestId, ...input };
    const body = JSON.stringify(payload); const timestamp = new Date().toISOString();
    try {
      const response = await fetch(`${cfg.url}/v1/provider/actions`, { method: "POST", signal: AbortSignal.timeout(Number(process.env.CLOUD_ANDROID_PROVIDER_TIMEOUT_MS ?? 120_000)), headers: { "content-type": "application/json", "x-windels-timestamp": timestamp, "x-windels-signature": `v1=${signature(cfg.secret, timestamp, body)}`, "x-request-id": requestId }, body });
      const text = await response.text();
      if (!verifyResponse(cfg.secret, response.headers.get("x-windels-timestamp") ?? "", text, response.headers.get("x-windels-signature") ?? "")) return { ok: false, requestId, operationId: "invalid-response", status: "FAILED", evidence: {}, error: { code: "PROVIDER_RESPONSE_SIGNATURE_INVALID", message: "Provider response signature is missing, stale, or invalid", retryable: false } };
      let parsed: any; try { parsed = JSON.parse(text); } catch { return { ok: false, requestId, operationId: "invalid-json", status: "FAILED", evidence: {}, error: { code: "PROVIDER_RESPONSE_INVALID", message: "Provider returned invalid JSON", retryable: false } }; }
      if (parsed.requestId !== requestId || typeof parsed.operationId !== "string") return { ok: false, requestId, operationId: "mismatch", status: "FAILED", evidence: {}, error: { code: "PROVIDER_RESPONSE_MISMATCH", message: "Provider response request ID does not match", retryable: false } };
      return { ok: response.ok && parsed.ok === true, requestId, operationId: parsed.operationId, status: String(parsed.status ?? "UNKNOWN"), providerDeviceRef: typeof parsed.providerDeviceRef === "string" ? parsed.providerDeviceRef : undefined, observation: parsed.observation, metrics: parsed.metrics && typeof parsed.metrics === "object" ? parsed.metrics : undefined, result: parsed.result && typeof parsed.result === "object" ? parsed.result : undefined, preparedAction: parsed.preparedAction, evidence: parsed.evidence && typeof parsed.evidence === "object" ? parsed.evidence : {}, error: parsed.error ? { code: String(parsed.error.code ?? "PROVIDER_ERROR"), message: String(parsed.error.message ?? "Provider error").slice(0, 1000), retryable: parsed.error.retryable === true } : undefined };
    } catch (error) { return { ok: false, requestId, operationId: "provider-unavailable", status: "FAILED", evidence: {}, error: { code: "CLOUD_ANDROID_PROVIDER_UNAVAILABLE", message: error instanceof Error ? error.message : String(error), retryable: true } }; }
  }
}

export const cloudAndroidProvider: CloudAndroidProvider = new HttpCloudAndroidProvider();
