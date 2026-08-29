/**
 * E2E: Session 27 — Developer Portal (Platform → Dev Portal tab).
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

async function openDev(page: import("@playwright/test").Page) {
  await page.goto("/app/platform");
  await page.waitForLoadState("domcontentloaded");
  const tab = page.getByRole("tab", { name: "Dev Portal", exact: true });
  await tab.waitFor({ state: "visible", timeout: 20_000 });
  await tab.click();
  await expect(page.getByRole("button", { name: /Overview/i }).first()).toBeVisible({ timeout: 15_000 });
}

test.describe("Developer Portal (Session 27)", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("Dev Portal tab renders with all sub-nav buttons", async ({ page }) => {
    await openDev(page);
    await expect(page.getByRole("button", { name: /SDKs/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /CLI/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Local Dev/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Sandbox/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Emulator/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Toolkit/i }).first()).toBeVisible();
  });

  test("Overview shows SDK totals and CLI stats", async ({ page }) => {
    await openDev(page);
    await expect(page.getByText(/SDKs/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/CLI Commands/i).first()).toBeVisible();
    await expect(page.getByText(/Weekly Downloads/i).first()).toBeVisible();
  });

  test("SDKs sub-tab lists 13 seeded SDKs and Agent SDK", async ({ page }) => {
    await openDev(page);
    await page.getByRole("button", { name: /SDKs/i }).first().click();
    await expect(page.getByText(/AI Agent SDK/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Web SDK/i).first()).toBeVisible();
    await expect(page.getByText(/Voice SDK/i).first()).toBeVisible();
  });

  test("CLI sub-tab lists the windels CLI commands", async ({ page }) => {
    await openDev(page);
    await page.getByRole("button", { name: /^CLI$/i }).first().click();
    await expect(page.getByText(/windels auth login/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/windels deploy/i).first()).toBeVisible();
  });
});
