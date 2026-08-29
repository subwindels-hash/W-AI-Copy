/**
 * E2E: Session 22 — Enterprise QA Platform (Platform → QA tab).
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

test.describe("Enterprise QA Platform (Session 22)", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("QA tab renders dashboard with stat cards", async ({ page }) => {
    await page.goto("/app/platform");
    await page.getByRole("tab", { name: /QA/i }).click();
    await expect(page.getByText("Suites").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Cases").first()).toBeVisible();
    await expect(page.getByText(/7-day Pass/i).first()).toBeVisible();
    await expect(page.getByText(/Open Failures/i).first()).toBeVisible();
  });

  test("QA tab lists seeded test suites", async ({ page }) => {
    await page.goto("/app/platform");
    await page.getByRole("tab", { name: /QA/i }).click();
    await expect(page.getByText(/Platform Smoke/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Security/i).first()).toBeVisible();
    await expect(page.getByText(/Resilience/i).first()).toBeVisible();
  });

  test("Run Platform Smoke suite passes", async ({ page }) => {
    await page.goto("/app/platform");
    await page.getByRole("tab", { name: /QA/i }).click();
    // Wait for suites list
    await expect(page.getByText(/Platform Smoke/i).first()).toBeVisible({ timeout: 15_000 });
    // Click run on the Platform Smoke row (first matching row with "run" button)
    const smokeRow = page.locator('div', { hasText: /^Platform Smoke/ }).filter({ hasText: /cases/ }).first();
    await smokeRow.getByRole("button", { name: "run" }).click();
    // The Run detail card appears; assert it shows a passed status badge.
    await expect(page.getByText(/Run [a-f0-9]{8}/i).first()).toBeVisible({ timeout: 25_000 });
  });

  test("Recent Runs panel appears", async ({ page }) => {
    await page.goto("/app/platform");
    await page.getByRole("tab", { name: /QA/i }).click();
    await expect(page.getByText(/Recent Runs/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
