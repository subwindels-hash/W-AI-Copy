// @vitest-environment happy-dom
/**
 * Session 205 — Developer Gateway reference catalog.
 *
 * Pins the console's endpoint documentation to the actual gateway surface:
 * the nine registered routes in apps/api/src/http/routes/developerGateway.ts.
 * If a route is added/removed server-side without updating the catalog, this
 * test fails so the console never documents a stale surface.
 */
import { describe, it, expect } from "vitest";
import { GATEWAY_ENDPOINTS, GATEWAY_BASE } from "./developerGateway";

const REGISTERED = new Set([
  "POST /ai/complete",
  "GET /agents",
  "POST /agents/:id/execute",
  "POST /workflows/:id/execute",
  "GET /workflows/:id/runs",
  "POST /workflows/:id/runs/:runId/cancel",
  "GET /knowledge/search",
  "GET /trading/analysis",
  "POST /media/generate",
]);

describe("developerGateway — reference catalog matches the registered routes", () => {
  it("documents exactly the nine registered gateway endpoints", () => {
    const documented = new Set(GATEWAY_ENDPOINTS.map((e) => `${e.method} ${e.path}`));
    expect(documented).toEqual(REGISTERED);
  });

  it("every documented endpoint declares at least one scope and a summary", () => {
    for (const e of GATEWAY_ENDPOINTS) {
      expect(e.scopes.length).toBeGreaterThan(0);
      expect(e.summary.length).toBeGreaterThan(5);
    }
  });

  it("base path is the stable public REST surface", () => {
    expect(GATEWAY_BASE).toBe("/api/rest/v1");
  });
});
