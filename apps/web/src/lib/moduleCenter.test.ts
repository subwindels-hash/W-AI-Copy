/**
 * Module Center client — request contract for the PHP/cPanel build.
 *
 * `api` is mocked, so what is asserted is the path, verb and body each control
 * sends. Two details matter more than they look:
 *
 *   1. Every action POST carries a freshly generated `idempotencyKey`. The PHP
 *      build rejects anything outside 12..180 characters and treats a repeat of
 *      the same key as "already done", so a key that is too short or reused
 *      between two different actions would silently no-op.
 *   2. Uploads are multipart with a field literally named `package` — the PHP
 *      intake reads $_FILES['package'], not a JSON body.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiRaw = vi.fn();
vi.mock("./api", () => ({
  api: { get: (...a: unknown[]) => apiGet(...a), post: (...a: unknown[]) => apiPost(...a) },
  apiRaw: (...a: unknown[]) => apiRaw(...a),
}));

import { moduleCenterApi, moduleRuntimeApi } from "./moduleCenter";
import { moduleRuntimeApi as aliasedRuntimeApi } from "./moduleRuntime";

beforeEach(() => { apiGet.mockReset(); apiPost.mockReset(); apiRaw.mockReset(); apiRaw.mockResolvedValue({ data: { upload: {}, release: {}, module: {}, nextAction: "VERIFY" } }); });

describe("read endpoints", () => {
  it("requests the dashboard", async () => {
    await moduleCenterApi.dashboard();
    expect(apiGet).toHaveBeenCalledWith("/super-admin/module-center/dashboard");
  });

  it("requests the module registry", async () => {
    await moduleCenterApi.modules();
    expect(apiGet).toHaveBeenCalledWith("/super-admin/module-center/modules");
  });

  it("requests one module by id", async () => {
    await moduleCenterApi.module("abc");
    expect(apiGet).toHaveBeenCalledWith("/super-admin/module-center/modules/abc");
  });

  it("requests uploads and operations", async () => {
    await moduleCenterApi.uploads();
    await moduleCenterApi.operations();
    expect(apiGet.mock.calls.map((c) => c[0])).toEqual([
      "/super-admin/module-center/uploads",
      "/super-admin/module-center/operations",
    ]);
  });

  it("requests the runtime registrations the module gateway proxies", async () => {
    await moduleRuntimeApi.registrations();
    expect(apiGet).toHaveBeenCalledWith("/module-runtime/registrations");
  });
});

describe("package upload", () => {
  it("posts multipart with a field named package plus the detached signature", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "demo.wmod");
    await moduleCenterApi.upload(file, "publisher-1", "c2lnbmF0dXJl");
    const [path, init] = apiRaw.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/super-admin/module-center/uploads");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("package")).toBeTruthy();
    expect(body.get("signatureKeyId")).toBe("publisher-1");
    expect(body.get("signature")).toBe("c2lnbmF0dXJl");
  });
});

describe("idempotency keys", () => {
  it("sends a key inside the PHP 12..180 character window", async () => {
    await moduleCenterApi.releaseAction("rel-1", "verify");
    const [, body] = apiPost.mock.calls[0] as [string, { idempotencyKey: string }];
    expect(body.idempotencyKey.length).toBeGreaterThanOrEqual(12);
    expect(body.idempotencyKey.length).toBeLessThanOrEqual(180);
  });

  it("never reuses a key between two calls — a reused key is treated as a duplicate", async () => {
    await moduleCenterApi.releaseAction("rel-1", "verify");
    await moduleCenterApi.releaseAction("rel-1", "verify");
    const [first, second] = apiPost.mock.calls.map((c) => (c[1] as { idempotencyKey: string }).idempotencyKey);
    expect(first).not.toBe(second);
  });

  it("posts release actions to the release sub-path", async () => {
    for (const action of ["verify", "sandbox-test", "approve", "install"] as const) {
      await moduleCenterApi.releaseAction("rel-9", action);
    }
    expect(apiPost.mock.calls.map((c) => c[0])).toEqual([
      "/super-admin/module-center/releases/rel-9/verify",
      "/super-admin/module-center/releases/rel-9/sandbox-test",
      "/super-admin/module-center/releases/rel-9/approve",
      "/super-admin/module-center/releases/rel-9/install",
    ]);
  });

  it("posts lifecycle actions to the module sub-path", async () => {
    for (const action of ["enable", "disable", "restart", "health-check", "rollback", "remove"] as const) {
      await moduleCenterApi.moduleAction("mod-9", action);
    }
    expect(apiPost.mock.calls.map((c) => c[0])).toEqual([
      "/super-admin/module-center/modules/mod-9/enable",
      "/super-admin/module-center/modules/mod-9/disable",
      "/super-admin/module-center/modules/mod-9/restart",
      "/super-admin/module-center/modules/mod-9/health-check",
      "/super-admin/module-center/modules/mod-9/rollback",
      "/super-admin/module-center/modules/mod-9/remove",
    ]);
  });

  it("tags every key with the action it belongs to", async () => {
    await moduleCenterApi.moduleAction("mod-9", "disable");
    const [, body] = apiPost.mock.calls[0] as [string, { idempotencyKey: string }];
    expect(body.idempotencyKey).toContain("module-disable-");
  });
});

describe("module runtime client alias", () => {
  // apps/web/src/lib/moduleRuntime.ts exists so the module inventory finds a
  // client for the `moduleRuntime` key. It must re-export the *runtime* client,
  // not the control-plane one: the two share a module but not an API surface.
  it("re-exports the runtime client, not the control-plane client", () => {
    expect(aliasedRuntimeApi).toBe(moduleRuntimeApi);
    expect(aliasedRuntimeApi).not.toBe(moduleCenterApi);
  });

  it("keeps registrations on the role-scoped gateway endpoint", async () => {
    await aliasedRuntimeApi.registrations();
    expect(apiGet).toHaveBeenCalledWith("/module-runtime/registrations");
  });
});
