import { describe, it, expect } from "vitest";
import { ProviderHealthService } from "./providerHealth.service.js";

describe("Provider Health Reporting", () => {
  it("returns truthful provider health status without inventing connection state", async () => {
    const reports = await ProviderHealthService.getAllProviderHealth("org-test");

    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBeGreaterThan(0);

    for (const r of reports) {
      expect(r.providerId).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(["payment", "ai", "messaging", "storage", "trading", "cloud"]).toContain(r.category);
      expect(["healthy", "degraded", "unavailable", "not_configured", "disabled"]).toContain(r.status);
      expect(r.lastCheckedAt).toBeTruthy();
    }
  });
});
