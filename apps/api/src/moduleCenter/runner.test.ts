import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ModuleManifestSchema } from "@windels/shared/moduleCenter";
import { runModuleAction } from "./runner.service.js";

const original = { url: process.env.MODULE_RUNNER_URL, secret: process.env.MODULE_RUNNER_HMAC_SECRET };
afterEach(() => {
  vi.unstubAllGlobals();
  if (original.url === undefined) delete process.env.MODULE_RUNNER_URL; else process.env.MODULE_RUNNER_URL = original.url;
  if (original.secret === undefined) delete process.env.MODULE_RUNNER_HMAC_SECRET; else process.env.MODULE_RUNNER_HMAC_SECRET = original.secret;
});
function manifest() { return ModuleManifestSchema.parse({ schemaVersion: 1, id: "runner-module", name: "Runner Module", version: "1.0.0", platform: "windels-ai-os", packageType: "module", description: "A module runner protocol test manifest.", author: "WINDELS", vendor: "WINDELS", license: "Proprietary", minimumVersion: "0.1.0", apiVersion: "v1", permissions: ["ORG_READ"], tests: { categories: ["unit", "security", "health"] }, healthChecks: [{ name: "runner", type: "runner" }], resources: { memoryMb: 64, cpuMillicores: 100, storageMb: 10, networkAccess: false }, lifecycle: { reloadSupported: false, removable: true }, upgrade: { rollbackSupported: true } }); }
const input = () => ({ action: "SANDBOX_TEST" as const, moduleId: "runner-module", releaseId: "release-1", version: "1.0.0", checksum: "a".repeat(64), artifactPath: "/protected/release.wmod", manifest: manifest(), actorId: "super-admin" });

describe("signed Module Runner protocol", () => {
  it("fails closed when the isolated runner is not configured", async () => {
    delete process.env.MODULE_RUNNER_URL; delete process.env.MODULE_RUNNER_HMAC_SECRET;
    await expect(runModuleAction(input())).resolves.toMatchObject({ ok: false, status: "NOT_CONFIGURED", checks: [expect.objectContaining({ code: "MODULE_RUNNER_NOT_CONFIGURED" })] });
  });

  it("accepts a correlation-matched response only with a fresh valid HMAC", async () => {
    process.env.MODULE_RUNNER_URL = "https://runner.example"; process.env.MODULE_RUNNER_HMAC_SECRET = "runner-test-secret-that-is-long-enough";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => {
      const request = JSON.parse(init.body); const timestamp = new Date().toISOString();
      const body = JSON.stringify({ ok: true, action: "SANDBOX_TEST", correlationId: request.correlationId, checks: [], logs: ["passed"], evidence: { stages: { startup: "PASSED" } } });
      const signature = createHmac("sha256", process.env.MODULE_RUNNER_HMAC_SECRET!).update(`${timestamp}.${body}`).digest("hex");
      return new Response(body, { status: 200, headers: { "content-type": "application/json", "x-windels-timestamp": timestamp, "x-windels-signature": `v1=${signature}` } });
    }));
    await expect(runModuleAction(input())).resolves.toMatchObject({ ok: true, status: "PASSED", logs: ["passed"] });
  });

  it("rejects an unsigned or tampered runner response even over HTTP success", async () => {
    process.env.MODULE_RUNNER_URL = "https://runner.example"; process.env.MODULE_RUNNER_HMAC_SECRET = "runner-test-secret-that-is-long-enough";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, action: "SANDBOX_TEST" }), { status: 200 })));
    await expect(runModuleAction(input())).resolves.toMatchObject({ ok: false, status: "FAILED", checks: [expect.objectContaining({ code: "RUNNER_RESPONSE_SIGNATURE_INVALID" })] });
  });
});
