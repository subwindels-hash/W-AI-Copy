/**
 * E2E: Session 18 — Enterprise Engineering Framework (Enterprise Hub).
 *
 * Logs in as bootstrap admin, navigates to /app/enterprise, and verifies that
 * all four new Session 18 tabs render without errors and that the REST
 * endpoints under /api/v1/enterprise/* return expected data.
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

test.describe("Enterprise Hub (Session 18)", () => {
  test("enterprise page loads and shows Session 18 tabs", async ({ page }) => {
    await login(page);
    await page.goto("/app/enterprise");
    await page.waitForLoadState("domcontentloaded");
    // Page title
    await expect(page.locator("body")).toContainText(/Enterprise (Hub|Engineering|Framework)/i);
    // All five tab triggers should be present
    for (const label of ["Models", "Monitoring", "Plugins", "Integrations", "SSO", "Brand",
                          "Architecture", "Services", "Events", "APIs"]) {
      await expect(page.getByRole("tab", { name: new RegExp(label, "i") }).first()).toBeAttached({ timeout: 10_000 });
    }
  });

  test("architecture tab shows ADRs and standards", async ({ page }) => {
    await login(page);
    await page.goto("/app/enterprise");
    await page.getByRole("tab", { name: /Architecture/i }).click();
    await page.waitForTimeout(800);
    // Should show at least the seeded ADR
    await expect(page.locator("body")).toContainText(/ADR|Architecture Decision|Adopt Enterprise/i);
    // Standards should load (12 seeded)
    await expect(page.locator("body")).toContainText(/standard|API-[0-9]|SEC-[0-9]/i);
  });

  test("services tab shows the windels-api registration", async ({ page }) => {
    await login(page);
    await page.goto("/app/enterprise");
    await page.getByRole("tab", { name: /Services/i }).click();
    await page.waitForTimeout(800);
    await expect(page.locator("body")).toContainText(/windels-api/i);
  });

  test("events tab shows schemas and recent events", async ({ page }) => {
    await login(page);
    await page.goto("/app/enterprise");
    await page.getByRole("tab", { name: /Events/i }).click();
    await page.waitForTimeout(800);
    await expect(page.locator("body")).toContainText(/schema|event/i);
  });

  test("apis tab shows endpoint inventory and OpenAPI", async ({ page }) => {
    await login(page);
    await page.goto("/app/enterprise");
    await page.getByRole("tab", { name: /APIs/i }).click();
    await page.waitForTimeout(800);
    await expect(page.locator("body")).toContainText(/endpoint|openapi|version/i);
  });
});

test.describe("Enterprise REST endpoints (Session 18)", () => {
  let token: string;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page);
    // Read token from localStorage (the Layout stores it here after login)
    token = await page.evaluate(() => localStorage.getItem("windels:accessToken") || "");
    await ctx.close();
  });

  test("GET governance/standards returns 12 seeded standards", async ({ request }) => {
    const r = await request.get("/api/v1/enterprise/governance/standards", { headers: { Authorization: `Bearer ${token}` } });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(12);
  });

  test("GET discovery/services includes windels-api", async ({ request }) => {
    const r = await request.get("/api/v1/enterprise/discovery/services", { headers: { Authorization: `Bearer ${token}` } });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.data.some((s: any) => s.id === "windels-api")).toBe(true);
  });

  test("GET api-governance/openapi returns OpenAPI 3.1", async ({ request }) => {
    const r = await request.get("/api/v1/enterprise/api-governance/openapi", { headers: { Authorization: `Bearer ${token}` } });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.openapi).toMatch(/^3\.1/);
    expect(Object.keys(body.paths).length).toBeGreaterThan(50);
  });

  test("POST events/publish accepts and returns an event", async ({ request }) => {
    const r = await request.post("/api/v1/enterprise/events/publish", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { type: "e2e.test.event", payload: { from: "playwright" } },
    });
    expect(r.status()).toBe(202);
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(body.data.type).toBe("e2e.test.event");
    expect(body.data.id).toBeTruthy();
  });
});
