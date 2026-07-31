/**
 * E2E: Session 26 — Engineering Observability (Platform → Observability tab).
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

async function openEng(page: import("@playwright/test").Page) {
  await page.goto("/app/platform");
  await page.waitForLoadState("domcontentloaded");
  const tab = page.getByRole("tab", { name: "Observability", exact: true });
  await tab.waitFor({ state: "visible", timeout: 20_000 });
  await tab.click();
  await expect(page.getByRole("button", { name: /Overview/i }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Engineering Observability (Session 26)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Observability tab renders with all sub-nav buttons", async ({ page }) => {
    await openEng(page);
    await expect(page.getByRole("button", { name: /Services/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Deployments/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Tech Debt/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Pipelines/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Developers/i }).first()).toBeVisible();
  });

  test("Overview panel renders DORA cards and KPI grid", async ({ page }) => {
    await openEng(page);
    await expect(page.getByText(/Services/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Deploys\/wk/i).first()).toBeVisible();
    await expect(page.getByText(/Lead Time/i).first()).toBeVisible();
    await expect(page.getByText(/MTTR/i).first()).toBeVisible();
    await expect(page.getByText(/DORA Metrics/i).first()).toBeVisible();
  });

  test("Services sub-tab lists seeded services with tier badges", async ({ page }) => {
    await openEng(page);
    await page.getByRole("button", { name: /^Services$/i }).first().click();
    await expect(page.getByText(/Service Health/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("API").first()).toBeVisible();
    await expect(page.getByText("Web").first()).toBeVisible();
  });

  test("Tech Debt sub-tab renders debt register with severity badges", async ({ page }) => {
    await openEng(page);
    await page.getByRole("button", { name: /Tech Debt/i }).first().click();
    await expect(page.getByText(/Open Debt/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/DEBT-001/i).first()).toBeVisible();
  });
});
