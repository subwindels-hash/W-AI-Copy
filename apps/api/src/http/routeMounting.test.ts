/**
 * S213 — every route module that exports `register*Routes` must be mounted.
 *
 * Five complete route files (`notifications`, `audit`, `permissions`,
 * `voiceFoundry`, `voiceStudio`) shipped with working services, shared schemas
 * and web clients — but `server.ts` never called their `register*Routes`
 * function, so every request 404'd. `apps/web/src/lib/notifications.ts` was
 * calling four dead endpoints against a shipped UI.
 *
 * Nothing caught this because a route file that is never imported is simply
 * absent from the module graph: it does not fail to compile, it does not fail a
 * test, it just silently does not exist at runtime. This test closes that gap
 * by comparing the exports on disk against the mounts in `server.ts`.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HTTP = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const ROUTES = join(HTTP, "routes");
const server = readFileSync(join(HTTP, "server.ts"), "utf8");

/** Route files that intentionally are not mounted on the v1 router. */
const NOT_MOUNTED_BY_DESIGN = new Set<string>([
  // Mounted on dedicated app-level routers, not v1 (see server.ts).
  "sitePlatformPublic.ts",
]);

function exportedRegistrars(): Array<{ file: string; fn: string }> {
  const out: Array<{ file: string; fn: string }> = [];
  for (const f of readdirSync(ROUTES)) {
    if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
    const src = readFileSync(join(ROUTES, f), "utf8");
    for (const m of src.matchAll(/export\s+function\s+(register\w*Routes)\s*\(/g)) {
      out.push({ file: f, fn: m[1]! });
    }
  }
  return out;
}

describe("route mounting", () => {
  it("every exported register*Routes is called in server.ts", () => {
    const unmounted = exportedRegistrars()
      .filter(({ file }) => !NOT_MOUNTED_BY_DESIGN.has(file))
      .filter(({ fn }) => !new RegExp(`\\b${fn}\\s*\\(`).test(server))
      .map(({ file, fn }) => `${file}: ${fn}`);

    // An unmounted registrar means the endpoints do not exist at runtime, no
    // matter how complete the handlers are.
    expect(unmounted).toEqual([]);
  });

  it("mounts the API-key Cloud Android surface on the gateway, not on v1", () => {
    // routes/cloudAndroidPublic.ts uses `requireScope` and reads
    // `req.apiOrganization`, which only apiKeyAuth populates. Mounting it on the
    // JWT v1 router would shadow routes/cloudAndroid.ts with handlers whose auth
    // context never exists there.
    expect(server).toMatch(/registerCloudAndroidPublicRoutes\(publicRouter\)/);
    expect(server).not.toMatch(/registerCloudAndroidPublicRoutes\(v1\)/);
  });

  it("mounts infrastructure on the platform router that supplies its auth", () => {
    expect(server).toMatch(/registerInfrastructureRoutes\(platformRouter\)/);
  });

  it("mounts the five routers that were dead before S213", () => {
    for (const prefix of ["/notifications", "/audit", "/permissions", "/voice-foundry", "/voice-studio"]) {
      expect(server, `${prefix} is not mounted`).toContain(`v1.use("${prefix}"`);
    }
  });

  it("serves every path the notifications web client calls", () => {
    // apps/web/src/lib/notifications.ts hits these; all four 404'd before S213.
    const src = readFileSync(join(ROUTES, "notifications.ts"), "utf8");
    expect(src).toMatch(/router\.get\(\s*["']\/["']/);           // GET /notifications
    expect(src).toContain('"/unread-count"');                     // GET /unread-count
    expect(src).toContain('"/:id/read"');                         // POST /:id/read
    expect(src).toContain('"/read-all"');                         // POST /read-all
  });

  it("authenticates the two voice routers, which never applied auth themselves", () => {
    // Both import `authenticate` as `_authenticate` and never use it, while
    // voiceStudio.ts dereferences `req.user!.id` — anonymous access would throw.
    for (const f of ["voiceFoundry.ts", "voiceStudio.ts"]) {
      const src = readFileSync(join(ROUTES, f), "utf8");
      expect(src, `${f} unexpectedly applies its own auth`).not.toMatch(/router\.use\(\s*authenticate/);
    }
    for (const name of ["voiceFoundryRouter", "voiceStudioRouter"]) {
      expect(server).toMatch(new RegExp(`${name}\\.use\\(authenticate\\)`));
    }
  });
});
