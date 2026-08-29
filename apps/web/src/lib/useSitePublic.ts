import { useEffect, useState } from "react";
import {
  SP_DEFAULT_BRAND,
  SP_DEFAULT_IMAGES,
  SP_DEFAULT_MAP,
  SP_DEFAULT_PAGES,
  SP_DEFAULT_REVIEWS,
} from "@windels/shared/sitePlatform";
import { siteApi, type SpPublicSite } from "./sitePlatform";

const FALLBACK: SpPublicSite = {
  brand: { ...SP_DEFAULT_BRAND, updatedAt: "1970-01-01T00:00:00.000Z" },
  images: { ...SP_DEFAULT_IMAGES },
  pages: SP_DEFAULT_PAGES,
  reviews: SP_DEFAULT_REVIEWS,
  map: { ...SP_DEFAULT_MAP, updatedAt: "1970-01-01T00:00:00.000Z" },
};

let cache: SpPublicSite | null = null;
let inflight: Promise<SpPublicSite> | null = null;

export function useSitePublic(): SpPublicSite {
  const [site, setSite] = useState<SpPublicSite>(cache ?? FALLBACK);

  useEffect(() => {
    if (cache) {
      setSite(cache);
      return;
    }
    inflight ??= siteApi.publicSite().then((s) => {
      cache = s;
      return s;
    });
    void inflight.then(setSite).catch(() => setSite(FALLBACK));
  }, []);

  return site;
}

export function pageCopy(site: SpPublicSite, path: string) {
  return site.pages.find((p) => p.path === path) ?? SP_DEFAULT_PAGES.find((p) => p.path === path) ?? {
    path, title: "WINDELS", lead: "", body: "", image: null, enabled: true,
  };
}

export function siteImage(site: SpPublicSite, slot: string, fallback?: string) {
  return site.images[slot] || fallback || SP_DEFAULT_IMAGES[slot as keyof typeof SP_DEFAULT_IMAGES] || fallback || "";
}
