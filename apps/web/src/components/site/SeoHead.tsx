import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { siteApi } from "@/lib/sitePlatform";

function upsertMeta(attr: "name" | "property", key: string, content: string | null | undefined) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function SeoHead() {
  const loc = useLocation();
  useEffect(() => {
    void siteApi.seo(loc.pathname).then((meta) => {
      if (meta.title) document.title = meta.title;
      upsertMeta("name", "description", meta.description);
      upsertMeta("name", "keywords", meta.keywords);
      upsertMeta("name", "robots", meta.robots);
      if (meta.googleVerification) upsertMeta("name", "google-site-verification", meta.googleVerification);
      if (meta.bingVerification) upsertMeta("name", "msvalidate.01", meta.bingVerification);
      upsertMeta("property", "og:title", meta.ogTitle);
      upsertMeta("property", "og:description", meta.ogDescription);
      upsertMeta("property", "og:image", meta.ogImage);
      upsertMeta("name", "twitter:title", meta.twitterTitle);
      upsertMeta("name", "twitter:description", meta.twitterDescription);
      upsertMeta("name", "twitter:image", meta.twitterImage);
      let link = document.head.querySelector("link[rel=canonical]") as HTMLLinkElement | null;
      if (meta.canonical) {
        if (!link) {
          link = document.createElement("link");
          link.rel = "canonical";
          document.head.appendChild(link);
        }
        link.href = meta.canonical;
      }
      if (meta.favicon) {
        const icon = document.head.querySelector("link[rel='icon'][type='image/svg+xml']") as HTMLLinkElement | null;
        if (icon) icon.href = meta.favicon;
      }
    }).catch(() => {});
  }, [loc.pathname]);
  return null;
}
