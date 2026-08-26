// @vitest-environment happy-dom
/**
 * Session 202 — public-site helper tests.
 *
 * pageCopy() and siteImage() are pure resolvers used by every public marketing
 * page, with layered fallbacks that are easy to get subtly wrong:
 *   - pageCopy: site page -> shared default page -> hard-coded stub
 *   - siteImage: site slot -> caller fallback -> shared default -> ""
 *
 * The api-backed hook itself is not exercised here (it needs a DOM + network);
 * the pure resolvers carry the interesting branching.
 */
import { describe, it, expect } from "vitest";
import { pageCopy, siteImage } from "./useSitePublic";
import { SP_DEFAULT_PAGES, SP_DEFAULT_IMAGES } from "@windels/shared/sitePlatform";
import type { SpPublicSite } from "./sitePlatform";

const defaultPath = SP_DEFAULT_PAGES[0]!.path;
const defaultSlot = Object.keys(SP_DEFAULT_IMAGES)[0]!;

const site: SpPublicSite = {
  brand: {} as SpPublicSite["brand"],
  images: { hero: "https://cdn/x.png" } as SpPublicSite["images"],
  pages: [{ path: "/custom", title: "Custom", lead: "L", body: "B", image: null, enabled: true }],
  reviews: [] as SpPublicSite["reviews"],
  map: {} as SpPublicSite["map"],
};

describe("pageCopy", () => {
  it("returns the site's own page when the path matches", () => {
    expect(pageCopy(site, "/custom").title).toBe("Custom");
  });

  it("falls back to the shared default page for a known default path", () => {
    const copy = pageCopy(site, defaultPath);
    expect(copy.path).toBe(defaultPath);
    expect(copy).toEqual(SP_DEFAULT_PAGES.find((p) => p.path === defaultPath));
  });

  it("returns a WINDELS stub for a completely unknown path", () => {
    const copy = pageCopy(site, "/nowhere");
    expect(copy).toMatchObject({ path: "/nowhere", title: "WINDELS", enabled: true });
  });
});

describe("siteImage", () => {
  it("prefers the site's configured slot value", () => {
    expect(siteImage(site, "hero")).toBe("https://cdn/x.png");
  });

  it("uses the caller fallback when the slot is empty and not a default", () => {
    expect(siteImage(site, "unknown-slot", "fallback.png")).toBe("fallback.png");
  });

  it("falls back to the shared default image for a known slot", () => {
    expect(siteImage(site, defaultSlot)).toBe(
      SP_DEFAULT_IMAGES[defaultSlot as keyof typeof SP_DEFAULT_IMAGES]
    );
  });

  it("returns an empty string when nothing resolves", () => {
    expect(siteImage(site, "definitely-missing")).toBe("");
  });
});
