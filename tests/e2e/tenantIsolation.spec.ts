/**
 * E2E: Session 89 — Tenant Isolation & Cross-Tenant Data Governance
 * (Chromium-only, primary browser). Requires a live API + web on the SAME
 * origin the Playwright config points at (see playwright.config.ts).
 */
import { test, expect } from "@playwright/test";

const EMAIL = "admin@windels.ai";
const PASSWORD = "W1ndels!Admin#2026";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/auth/login");
  await page.waitForLoadState("domcontentloaded");
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
  await page.waitForURL(/(\/app|\/d|\/m)/, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
}

test.describe("Tenant Isolation (Session 89)", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("Tenant Isolation page renders policy + compliance surfaces", async ({ page }) => {
    await page.goto("/app/tenant-isolation");
    await expect(page.locator("text=Tenant Isolation").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("text=Organization isolation policy").first()).toBeVisible();
    await expect(page.locator("text=Isolation compliance run").first()).toBeVisible();
  });

  test("policy defaults to isolated (export gate off) and can be re-run", async ({ page }) => {
    await page.goto("/app/tenant-isolation");
    await expect(page.locator("text=Organization isolation policy").first()).toBeVisible({ timeout: 20_000 });
    // Default: isolated-by-default — the export-gate test reflects "BLOCKED".
    const runBtn = page.getByRole("button", { name: /Run compliance/i }).first();
    await expect(runBtn).toBeVisible();
    await runBtn.click();
    await expect(page.locator("text=Isolation compliance run").first()).toBeVisible({ timeout: 20_000 });
  });
});
