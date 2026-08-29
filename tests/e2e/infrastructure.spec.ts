/**
 * E2E: Session 21 — Enterprise Infrastructure (Platform → Infrastructure tab).
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

test.describe("Enterprise Infrastructure (Session 21)", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("Infrastructure tab renders overview", async ({ page }) => {
    await page.goto("/app/platform");
    await page.getByRole("tab", { name: /Infrastructure/i }).click();
    await expect(page.getByText("Clusters").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Regions").first()).toBeVisible();
    await expect(page.getByText("Est. Savings").first()).toBeVisible();
  });

  test("Cluster sub-tab shows nodes table", async ({ page }) => {
    await page.goto("/app/platform");
    await page.getByRole("tab", { name: /Infrastructure/i }).click();
    await page.getByRole("button", { name: /^Cluster$/i }).click();
    await expect(page.getByText("windels-cp-1")).toBeVisible({ timeout: 15_000 });
  });

  test("Blue/Green controls show active color", async ({ page }) => {
    await page.goto("/app/platform");
    await page.getByRole("tab", { name: /Infrastructure/i }).click();
    await page.getByRole("button", { name: /^Blue\/Green$/i }).click();
    await expect(page.getByText(/active/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("IaC sub-tab lists stacks", async ({ page }) => {
    await page.goto("/app/platform");
    await page.getByRole("tab", { name: /Infrastructure/i }).click();
    await page.getByRole("button", { name: /^IaC$/i }).click();
    await expect(page.getByText(/windels-na-east-prod/i)).toBeVisible({ timeout: 15_000 });
  });
});
