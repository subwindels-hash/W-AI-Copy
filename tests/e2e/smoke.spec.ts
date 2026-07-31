/**
 * Smoke E2E: marketing landing, redirects, health endpoints.
 */
import { test, expect } from "@playwright/test";

test("root / loads (marketing or redirect)", async ({ page }) => {
  const res = await page.goto("/");
  expect(res).toBeTruthy();
  expect(res!.status()).toBeLessThan(500);
  // Either lands on marketing landing (/home) or redirects to /auth/login
  await expect(page.locator("body")).toBeAttached();
});

test("health endpoint returns ok via /api/v1/health", async ({ request }) => {
  const r = await request.get("/api/v1/health");
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  expect(body.ok).toBe(true);
  expect(body.data.status).toBe("ok");
});

test("marketing pages load", async ({ page }) => {
  for (const p of ["/home", "/pricing", "/developers", "/docs", "/support", "/legal"]) {
    const res = await page.goto(p);
    expect(res!.status()).toBe(200);
  }
});

test("desktop route returns shell HTML", async ({ page }) => {
  const res = await page.goto("/d");
  // /d requires auth, but it should serve SPA shell (200) rather than 500
  expect(res!.status()).toBeLessThan(500);
});
