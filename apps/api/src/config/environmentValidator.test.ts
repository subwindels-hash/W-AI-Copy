import { describe, it, expect } from "vitest";
import { validateEnvironment } from "./environmentValidator.js";

describe("Centralized Environment Validator", () => {
  it("validates all required subsystems without leaking secret values", () => {
    const report = validateEnvironment();

    expect(report.timestamp).toBeTruthy();
    expect(report.runtimeMode).toBeTruthy();
    expect(report.subsystems).toHaveProperty("database");
    expect(report.subsystems).toHaveProperty("redis");
    expect(report.subsystems).toHaveProperty("jwt");
    expect(report.subsystems).toHaveProperty("encryption");
    expect(report.subsystems).toHaveProperty("storage");
    expect(report.subsystems).toHaveProperty("paymentProviders");
    expect(report.subsystems).toHaveProperty("aiProviders");
    expect(report.subsystems).toHaveProperty("oauthProviders");
    expect(report.subsystems).toHaveProperty("messagingProviders");
    expect(report.subsystems).toHaveProperty("smtp");
    expect(report.subsystems).toHaveProperty("webhookSecrets");

    // Convert report to JSON string and verify no secret keywords appear in plaintext
    const str = JSON.stringify(report);
    expect(str).not.toContain("ChangeMe");
    expect(str).not.toContain("supersecret");
    expect(["HEALTHY", "DEGRADED", "CRITICAL"]).toContain(report.overallStatus);
  });
});
