import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const guide = readFileSync(resolve(root, "docs/BLOCKONOMICS_API_SETUP_DEPLOYMENT.md"), "utf8");
const paymentsRoutes = readFileSync(resolve(root, "apps/api/src/http/routes/payments.ts"), "utf8");
const adminRoutes = readFileSync(resolve(root, "apps/api/src/http/routes/blockonomicsAdmin.ts"), "utf8");
const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
const deployment = readFileSync(resolve(root, "docs/WINDELS-AI-OS-Deployment-Guide.md"), "utf8");

describe("Blockonomics Stage 14 documentation contract", () => {
  it("documents every implemented customer and callback route", () => {
    for (const path of [
      "/payments/providers",
      "/payments/checkout",
      "/payments/blockonomics/create",
      "/payments/blockonomics/payments/<payment-id>",
      "/payments/blockonomics/payments/<payment-id>/monitor",
      "/payments/blockonomics/webhook",
      "/payments/transactions",
    ]) expect(guide).toContain(path);
    expect(paymentsRoutes).toContain('payments.get("/blockonomics/webhook"');
    expect(paymentsRoutes).toContain('payments.post("/blockonomics/create"');
  });

  it("documents every implemented Super Admin route", () => {
    const methods: Record<string, string> = { "/config": "get", "/enabled": "patch", "/health": "post", "/dashboard": "get", "/reconcile": "post" };
    for (const [path, method] of Object.entries(methods)) {
      expect(adminRoutes).toContain(`admin.${method}("${path}"`);
      expect(guide).toContain(`/api/v1/admin/payments/blockonomics${path}`);
    }
  });

  it("documents all deployment variables and preserves capability truth", () => {
    for (const variable of [
      "BLOCKONOMICS_ENABLED",
      "BLOCKONOMICS_API_KEY",
      "BLOCKONOMICS_CALLBACK_SECRET",
      "BLOCKONOMICS_MATCH_CALLBACK",
      "BLOCKONOMICS_SUPPORTED_ASSETS",
      "BLOCKONOMICS_QUOTE_EXPIRY_MINUTES",
      "BLOCKONOMICS_TEST_MODE",
      "BLOCKONOMICS_RECONCILIATION_ENABLED",
      "BLOCKONOMICS_RECONCILIATION_INTERVAL_MINUTES",
    ]) {
      expect(envExample).toContain(variable);
      expect(guide).toContain(variable);
    }
    expect(guide).toContain("USDT | Ethereum ERC-20 only");
    expect(guide).toContain("not an automatically recurring mandate");
    expect(guide).toContain("NOT PRODUCTION COMPLETE");
    expect(deployment).toContain("BLOCKONOMICS_API_SETUP_DEPLOYMENT.md");
  });
});
