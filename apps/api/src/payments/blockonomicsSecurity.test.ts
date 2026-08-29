import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Limits } from "../security/rateLimit.js";
import { redactSensitiveUrl } from "../http/middleware/observability.js";

const routes = readFileSync(resolve(import.meta.dirname, "../http/routes/payments.ts"), "utf8");
const adminRoutes = readFileSync(resolve(import.meta.dirname, "../http/routes/blockonomicsAdmin.ts"), "utf8");
const service = readFileSync(resolve(import.meta.dirname, "blockonomicsPayment.service.ts"), "utf8");
const rateLimitSource = readFileSync(resolve(import.meta.dirname, "../security/rateLimit.ts"), "utf8");

describe("Blockonomics payment security boundary", () => {
  it("authenticates and user-rate-limits every browser-facing payment operation", () => {
    expect(routes).toContain('payments.post("/checkout", authenticate, rateLimit("payment", paymentRateKey)');
    expect(routes).toContain('payments.get("/transactions", authenticate, rateLimit("paymentStatus", paymentRateKey)');
    expect(routes).toContain('payments.post("/blockonomics/create", authenticate, rateLimit("payment", paymentRateKey)');
    expect(routes).toContain('payments.post("/blockonomics/payments/:id/monitor", authenticate, rateLimit("payment", paymentRateKey)');
    expect(routes).toContain('payments.get("/blockonomics/payments/:id", authenticate, rateLimit("paymentStatus", paymentRateKey)');
    expect(Limits.payment.max).toBeLessThan(Limits.apiGlobal.max);
    expect(rateLimitSource).toContain("local allowed = 1");
    expect(rateLimitSource).not.toContain("return tokens < 0 and");
  });

  it("keeps the provider callback public but secret-validated, replay-safe, and IP-rate-limited", () => {
    expect(routes).toContain('payments.get("/blockonomics/webhook", rateLimit("webhookIngest"), validate({ query: BlockonomicsCallbackSchema })');
    expect(service).toContain("timingSafeEqual");
    expect(service).toContain("paymentWebhookEvent.findUnique");
    expect(service).toContain("eventKey");
    const redacted = redactSensitiveUrl("/api/v1/payments/blockonomics/webhook?secret=high-entropy-value&status=2");
    expect(redacted).not.toContain("high-entropy-value");
    expect(redacted).toContain("status=2");
  });

  it("rate-limits the existing Super Admin guard and exposes no force-complete or refund route", () => {
    expect(adminRoutes).toContain('admin.use(authenticate, requireSuperAdmin, rateLimit("admin"');
    expect(routes).not.toMatch(/payments\.(post|patch|put)\("\/blockonomics\/(complete|credit|debit|refund)/);
    expect(adminRoutes).not.toMatch(/admin\.(post|patch|put)\("\/(complete|credit|debit|refund)/);
  });
});
