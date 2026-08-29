/**
 * E2E: Session 24 — Release Management (Platform → Releases tab).
 */
import { test, expect } from "@playwright/test";

const EMAIL = "admin@windels.ai";
const PASSWORD = "W1ndels!Admin#2026";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/auth/login");
  await page.waitForLoadState("domcontentloaded");
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
  await page
    .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")')
    .first()
    .click();
  await page
    .waitForURL(/(\/app|\/d|\/m)/, { waitUntil: "domcontentloaded", timeout: 15_000 })
    .catch(() => {});
}

async function openReleases(page: import("@playwright/test").Page) {
  await page.goto("/app/platform");
  await page.waitForLoadState("domcontentloaded");
  const tab = page.getByRole("tab", { name: /Releases/i });
  await tab.waitFor({ state: "visible", timeout: 20_000 });
  await tab.click();
  await expect(page.getByRole("button", { name: /Overview/i }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Release Management (Session 24)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Releases tab renders on Platform page", async ({ page }) => {
    await openReleases(page);
    await expect(page.getByRole("button", { name: /Pipeline/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Approvals/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /AI Validation/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Staging/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Production/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Improvement/i }).first()).toBeVisible();
  });

  test("Overview panel shows DORA stat cards", async ({ page }) => {
    await openReleases(page);
    await expect(page.getByText(/Total Releases/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Success Rate/i).first()).toBeVisible();
    await expect(page.getByText(/Lead Time/i).first()).toBeVisible();
    await expect(page.getByText(/MTTR/i).first()).toBeVisible();
  });

  test("Pipeline lists seeded R-0001 release", async ({ page }) => {
    await openReleases(page);
    await page.getByRole("button", { name: /Pipeline/i }).first().click();
    await expect(page.getByText(/R-0001/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Initial GA rollout/i).first()).toBeVisible();
  });

  test("AI validation tab shows run button after selecting a release", async ({ page }) => {
    await openReleases(page);
    await page.getByRole("button", { name: /Pipeline/i }).first().click();
    await page.getByText(/Session 24/i).first().waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText(/Session 24/i).first().click({ force: true });
    await page.getByRole("button", { name: /AI Validation/i }).first().click();
    await expect(page.getByRole("button", { name: /run validation/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
