/**
 * E2E: Session 25 — AI Program Management (Platform → Program tab).
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

async function openProgram(page: import("@playwright/test").Page) {
  await page.goto("/app/platform");
  await page.waitForLoadState("domcontentloaded");
  const tab = page.getByRole("tab", { name: /Program/i });
  await tab.waitFor({ state: "visible", timeout: 20_000 });
  await tab.click();
  await expect(page.getByRole("button", { name: /Overview/i }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("AI Program Management (Session 25)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Program tab renders on Platform page with all sub-nav buttons", async ({ page }) => {
    await openProgram(page);
    await expect(page.getByRole("button", { name: /Roadmap/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Sprints/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Requirements/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Arch Review/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Risks/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Exec Report/i }).first()).toBeVisible();
  });

  test("Overview panel renders executive snapshot and KPIs", async ({ page }) => {
    await openProgram(page);
    await expect(page.getByText(/Executive Snapshot/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Sprint Velocity/i).first()).toBeVisible();
    await expect(page.getByText(/Roadmap Progress/i).first()).toBeVisible();
    await expect(page.getByText(/Highlights/i).first()).toBeVisible();
  });

  test("Roadmap sub-tab shows annual roadmap and seeded initiatives", async ({ page }) => {
    await openProgram(page);
    await page.getByRole("button", { name: /Roadmap/i }).first().click();
    await expect(page.getByText(/Annual Roadmap/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Release & Program Management/i).first()).toBeVisible();
  });

  test("Risks sub-tab renders risk matrix with critical count", async ({ page }) => {
    await openProgram(page);
    await page.getByRole("button", { name: /Risks/i }).first().click();
    await expect(page.getByText(/Total Risks/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Critical/i).first()).toBeVisible();
    await expect(page.getByText(/Risk Register/i).first()).toBeVisible();
  });
});
