import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
const original = { enabled: process.env.CLOUD_ANDROID_ENABLED, url: process.env.CLOUD_ANDROID_PROVIDER_URL, secret: process.env.CLOUD_ANDROID_PROVIDER_HMAC_SECRET };
afterEach(() => { vi.unstubAllGlobals(); for (const [key, value] of Object.entries(original)) { const envKey = key === "enabled" ? "CLOUD_ANDROID_ENABLED" : key === "url" ? "CLOUD_ANDROID_PROVIDER_URL" : "CLOUD_ANDROID_PROVIDER_HMAC_SECRET"; if (value === undefined) delete process.env[envKey]; else process.env[envKey] = value; } });
function sign(timestamp: string, body: string) { return createHmac("sha256", process.env.CLOUD_ANDROID_PROVIDER_HMAC_SECRET!).update(`${timestamp}.${body}`).digest("hex"); }
async function load() { vi.resetModules(); return import("./provider.js"); }

describe("CloudAndroidProvider signed adapter", () => {
  it("fails closed when the provider is not enabled/configured", async () => {
    process.env.CLOUD_ANDROID_ENABLED = "false"; delete process.env.CLOUD_ANDROID_PROVIDER_URL; delete process.env.CLOUD_ANDROID_PROVIDER_HMAC_SECRET;
    const { cloudAndroidProvider } = await load();
    expect((await cloudAndroidProvider.health()).healthy).toBe(false);
    await expect(cloudAndroidProvider.execute({ action: "DEVICE_START", organizationId: "org", device: { id: "d" }, payload: {}, policy: { permissions: [], networkPolicy: {} } })).resolves.toMatchObject({ ok: false, status: "NOT_CONFIGURED" });
  });

  it("accepts only fresh HMAC-signed, request-correlated provider results", async () => {
    process.env.CLOUD_ANDROID_ENABLED = "true"; process.env.CLOUD_ANDROID_PROVIDER_URL = "https://android-provider.example"; process.env.CLOUD_ANDROID_PROVIDER_HMAC_SECRET = "provider-test-secret-that-is-at-least-32";
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      const request = JSON.parse(init.body); const timestamp = new Date().toISOString();
      const body = JSON.stringify(url.endsWith("/health") ? { healthy: true, capabilities: ["device.provision"], regions: ["ng-central-1"], androidVersions: ["15"] } : { ok: true, requestId: request.requestId, operationId: "op-1", status: "RUNNING", providerDeviceRef: "private-ref", evidence: { verificationPassed: true } });
      return new Response(body, { status: 200, headers: { "x-windels-timestamp": timestamp, "x-windels-signature": `v1=${sign(timestamp, body)}` } });
    }));
    const { cloudAndroidProvider } = await load();
    expect(await cloudAndroidProvider.health()).toMatchObject({ healthy: true, capabilities: ["device.provision"] });
    expect(await cloudAndroidProvider.execute({ action: "DEVICE_START", organizationId: "org", device: { id: "d" }, payload: {}, policy: { permissions: [], networkPolicy: {} } })).toMatchObject({ ok: true, operationId: "op-1", providerDeviceRef: "private-ref" });
  });

  it("rejects unsigned provider success responses", async () => {
    process.env.CLOUD_ANDROID_ENABLED = "true"; process.env.CLOUD_ANDROID_PROVIDER_URL = "https://android-provider.example"; process.env.CLOUD_ANDROID_PROVIDER_HMAC_SECRET = "provider-test-secret-that-is-at-least-32";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => new Response(JSON.stringify({ ok: true, requestId: JSON.parse(init.body).requestId, operationId: "fake", status: "RUNNING" }), { status: 200 })));
    const { cloudAndroidProvider } = await load();
    await expect(cloudAndroidProvider.execute({ action: "DEVICE_START", organizationId: "org", device: { id: "d" }, payload: {}, policy: { permissions: [], networkPolicy: {} } })).resolves.toMatchObject({ ok: false, error: { code: "PROVIDER_RESPONSE_SIGNATURE_INVALID" } });
  });
});
