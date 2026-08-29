/**
 * E2E: Session 23 — Engineering Governance (Platform → Governance tab).
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

async function openGovernance(page: import("@playwright/test").Page) {
  await page.goto("/app/platform");
  await page.waitForLoadState("domcontentloaded");
  const tab = page.getByRole("tab", { name: /Governance/i });
  await tab.waitFor({ state: "visible", timeout: 20_000 });
  await tab.click();
  // Wait for governance panel to render
  await expect(page.getByRole("button", { name: /Overview/i }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Engineering Governance (Session 23)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Governance tab renders on Platform page", async ({ page }) => {
    await openGovernance(page);
    await expect(page.getByRole("button", { name: /Overview/i }).first()).toBeVisible();
  });

  test("Overview panel shows security and review cards", async ({ page }) => {
    await openGovernance(page);
    await expect(page.getByText(/Security Posture/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Review Metrics/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Coding Stds/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Dependencies/i }).first()).toBeVisible();
  });

  test("ADRs list shows seeded records", async ({ page }) => {
    await openGovernance(page);
    await page.getByRole("button", { name: /ADRs/i }).first().click();
    await expect(page.getByText(/monorepo/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("Security posture shows a numeric score", async ({ page }) => {
    await openGovernance(page);
    await page.getByRole("button", { name: /Security/i }).first().click();
    await expect(page.getByText(/83/).first()).toBeVisible({ timeout: 15_000 });
  });
});
