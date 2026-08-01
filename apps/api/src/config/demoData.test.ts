/**
 * The synthetic seed gate must default to OFF.
 *
 * Session bootstraps seed randomly generated demo records that are
 * indistinguishable from real measurements once rendered. Shipping those by
 * default is what made ~70% of the platform's dashboards misleading, so the
 * default is asserted here to stop it regressing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ENV_KEY = "WINDELS_DEMO_DATA";

async function loadGate(value?: string) {
  vi.resetModules();
  if (value === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = value;
  return import("./demoData.js");
}

const original = process.env[ENV_KEY];
beforeEach(() => { delete process.env[ENV_KEY]; });
afterEach(() => {
  if (original === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = original;
});

describe("synthetic demo-data gate", () => {
  it("is disabled when the variable is unset", async () => {
    const { demoDataEnabled } = await loadGate();
    expect(demoDataEnabled()).toBe(false);
  });

  it("is disabled when explicitly false", async () => {
    const { demoDataEnabled } = await loadGate("false");
    expect(demoDataEnabled()).toBe(false);
  });

  it("is enabled only on an explicit opt-in", async () => {
    const { demoDataEnabled } = await loadGate("true");
    expect(demoDataEnabled()).toBe(true);
  });

  it("rejects an ambiguous value rather than guessing", async () => {
    // A typo like WINDELS_DEMO_DATA=1 must never silently enable fake data.
    // The env schema only accepts "true"/"false", so startup fails loudly
    // instead of quietly picking an interpretation.
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(loadGate("1")).rejects.toThrow();
      expect(exit).toHaveBeenCalledWith(1);
      expect(String(err.mock.calls[0]?.[0] ?? "")).toContain("Invalid environment variables");
    } finally {
      exit.mockRestore();
      err.mockRestore();
    }
  });

  it("skipDemoSeed reports which module was skipped", async () => {
    const { skipDemoSeed } = await loadGate();
    const info = vi.fn();
    skipDemoSeed("collaboration", { info });
    expect(info).toHaveBeenCalledOnce();
    expect(String(info.mock.calls[0][0])).toContain("collaboration");
    expect(String(info.mock.calls[0][0])).toContain("WINDELS_DEMO_DATA=true");
  });

  it("skipDemoSeed tolerates a missing logger", async () => {
    const { skipDemoSeed } = await loadGate();
    expect(() => skipDemoSeed("extensions")).not.toThrow();
  });
});
