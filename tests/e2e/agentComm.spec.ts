/**
 * E2E: Session 20 — AI Workforce Communication (Chromium-only, primary browser).
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

test.describe("AI Workforce Communication (Session 20)", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("Agent Comm tab shows overview stats", async ({ page }) => {
    await page.goto("/app/enterprise");
    const tab = page.getByRole("tab", { name: /Agent Comm/i });
    await tab.waitFor({ timeout: 15_000 });
    await tab.click();
    // Wait for the overview grid to populate (network request)
    await expect(page.locator("text=Identities").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=Teams").first()).toBeVisible();
    await expect(page.locator("text=Policies").first()).toBeVisible();
  });

  test("sub-nav buttons exist for all 6 sections", async ({ page }) => {
    await page.goto("/app/enterprise");
    await page.getByRole("tab", { name: /Agent Comm/i }).click();
    for (const lbl of ["Overview", "Identities", "Messages", "Teams", "Reasoning", "Feedback", "Escalation"]) {
      await expect(page.getByRole("button", { name: new RegExp(`^${lbl}$`, "i") }).first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test("Escalation sub-tab shows default seeded policies", async ({ page }) => {
    await page.goto("/app/enterprise");
    await page.getByRole("tab", { name: /Agent Comm/i }).click();
    await page.getByRole("button", { name: /^Escalation$/i }).click();
    await expect(page.getByText(/Low-confidence/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
