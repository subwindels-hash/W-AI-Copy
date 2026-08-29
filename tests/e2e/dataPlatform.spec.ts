/**
 * E2E: Session 19 — Enterprise Data Platform (Data Catalog, KG, Memory, Sync).
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

test.describe("Enterprise Data Platform UI", () => {
  test("data catalog tab loads seeded assets", async ({ page }) => {
    await login(page);
    await page.goto("/app/enterprise");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("tab", { name: /Data Catalog/i }).click();
    await page.waitForTimeout(1200);
    // Should show at least the 10 seeded assets (e.g. users, conversations, windels-api)
    await expect(page.locator("body")).toContainText(/users/i);
  });

  test("knowledge graph tab loads entities and stats", async ({ page }) => {
    await login(page);
    await page.goto("/app/enterprise");
    await page.getByRole("tab", { name: /Knowledge Graph/i }).click();
    await page.waitForTimeout(1500);
    await expect(page.locator("body")).toContainText(/Entities/i);
    await expect(page.locator("body")).toContainText(/WINDELS AI OS/);
  });

  test("memory tab stores and recalls a memory", async ({ page }) => {
    await login(page);
    await page.goto("/app/enterprise");
    await page.getByRole("tab", { name: /Memory/i }).click();
    await page.waitForTimeout(1000);
    // Type a memory
    const text = `playwright-test-memory-${Date.now()}`;
    await page.locator('textarea').first().fill(text);
    await page.getByRole("button", { name: /Remember/i }).click();
    await page.waitForTimeout(1000);
    await expect(page.locator("body")).toContainText(text);
  });
});

test.describe("Data Platform REST endpoints", () => {
  let token: string;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page);
    token = await page.evaluate(() => localStorage.getItem("windels:accessToken") || "");
    await ctx.close();
  });

  test("GET catalog returns ≥10 seeded assets", async ({ request }) => {
    const r = await request.get("/api/v1/data/catalog", { headers: { Authorization: `Bearer ${token}` } });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(body.data.stats.total).toBeGreaterThanOrEqual(10);
  });

  test("GET kg/stats returns bootstrap KG", async ({ request }) => {
    const r = await request.get("/api/v1/data/kg/stats", { headers: { Authorization: `Bearer ${token}` } });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.data.entities).toBeGreaterThanOrEqual(6);
    expect(body.data.relations).toBeGreaterThanOrEqual(7);
  });

  test("POST memory remember + recall roundtrip", async ({ request }) => {
    const tag = `e2e-${Date.now()}`;
    const post = await request.post("/api/v1/data/memory", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { namespace: "global", scopeId: "platform", type: "fact",
              content: `e2e test memory ${tag}`, tags: ["e2e", tag], importance: 0.5 },
    });
    expect(post.ok()).toBeTruthy();
    const id = (await post.json()).data.id;
    expect(id).toBeTruthy();
    const get = await request.get(`/api/v1/data/memory?namespace=global&scopeId=platform&tag=${tag}`,
      { headers: { Authorization: `Bearer ${token}` } });
    const body = await get.json();
    expect(body.ok).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].content).toContain(tag);
  });

  test("POST sync run for catalog job returns results", async ({ request }) => {
    const r = await request.post("/api/v1/data/sync/jobs/job:catalog:sync-assets/run",
      { headers: { Authorization: `Bearer ${token}` } });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(body.data.processed).toBeGreaterThanOrEqual(0);
    expect(body.data.errors).toEqual([]);
  });
});
