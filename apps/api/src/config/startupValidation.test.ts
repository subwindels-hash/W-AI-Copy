import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateStartupEnvironment } from "./startupValidation.js";
import { env } from "./env.js";

describe("Production Startup Validation", () => {
  const origRuntime = env.WINDELS_RUNTIME_MODE;
  const origNodeEnv = env.NODE_ENV;
  const origDemo = env.WINDELS_DEMO_DATA;
  const origMockDb = env.WINDELS_ALLOW_MOCK_DB_FALLBACK;
  const origPass = env.BOOTSTRAP_SUPERADMIN_PASSWORD;

  afterEach(() => {
    env.WINDELS_RUNTIME_MODE = origRuntime;
    env.NODE_ENV = origNodeEnv;
    env.WINDELS_DEMO_DATA = origDemo;
    env.WINDELS_ALLOW_MOCK_DB_FALLBACK = origMockDb;
    env.BOOTSTRAP_SUPERADMIN_PASSWORD = origPass;
  });

  it("passes cleanly in development mode", () => {
    env.WINDELS_RUNTIME_MODE = "development";
    env.NODE_ENV = "development";
    const res = validateStartupEnvironment();
    expect(res.ok).toBe(true);
  });

  it("fails startup when WINDELS_RUNTIME_MODE=production and WINDELS_DEMO_DATA=true", () => {
    env.WINDELS_RUNTIME_MODE = "production";
    env.NODE_ENV = "production";
    env.WINDELS_DEMO_DATA = true;
    expect(() => validateStartupEnvironment()).toThrow(/FATAL_CONFIG_ERROR/);
  });

  it("fails startup when production uses default superadmin password", () => {
    env.WINDELS_RUNTIME_MODE = "production";
    env.NODE_ENV = "production";
    env.WINDELS_DEMO_DATA = false;
    env.BOOTSTRAP_SUPERADMIN_PASSWORD = "ChangeMe!234";
    expect(() => validateStartupEnvironment()).toThrow(/ChangeMe!234/);
  });

  it("fails startup when production allows mock DB fallback", () => {
    env.WINDELS_RUNTIME_MODE = "production";
    env.NODE_ENV = "production";
    env.WINDELS_DEMO_DATA = false;
    env.BOOTSTRAP_SUPERADMIN_PASSWORD = "SecurePassword#991823";
    env.WINDELS_ALLOW_MOCK_DB_FALLBACK = true;
    expect(() => validateStartupEnvironment()).toThrow(/WINDELS_ALLOW_MOCK_DB_FALLBACK/);
  });
});
