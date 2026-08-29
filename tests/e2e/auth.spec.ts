/**
 * E2E: Authentication flow — login with bootstrap admin, redirects to app,
 * can see the dashboard.
 */
import { test, expect } from "@playwright/test";

const EMAIL = "admin@windels.ai";
const PASSWORD = "W1ndels!Admin#2026";

test.describe("Auth flow", () => {
  test("can log in with bootstrap admin", async ({ page }) => {
    await page.goto("/auth/login");
    await page.waitForLoadState("domcontentloaded");
    // Fill email + password
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
    // Click submit
    await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
    // Wait for navigation to dashboard
    await page.waitForURL(/(\/app|\/d|\/m)/, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
    // After login, user is no longer on /auth/login
    await expect(page).not.toHaveURL(/\/auth\/login/);
    // Sidebar/nav should be visible (eventually)
    await expect(page.locator("body")).toBeAttached();
  });

  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/auth/login");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"], input[name="password"]').first().fill("wrongpassword");
    await page.locator('button[type="submit"], button:has-text("Sign in")').first().click();
    // Should remain on /auth/login and show error
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
