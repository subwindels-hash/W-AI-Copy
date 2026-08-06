/**
 * Session 93 — Website Builder: pure block→HTML renderer.
 *
 * A deterministic, dependency-free renderer: every block maps to a stable
 * HTML fragment with text fields escaped and structural attributes escaped
 * for quotes. The `html` block passes raw content through unchanged (an
 * explicit, labeled escape hatch). Preview and publish both use this
 * function, so the published snapshot is exactly what the renderer
 * produces — never a fabricated string.
 */
import type { WbPage, WbBlock, WbBlockProps } from "@windels/shared/websiteBuilder";

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escAttr = (s: string): string => esc(s).replace(/\n/g, " ");

/** Sanitize a URL-ish attribute: allow http(s), mailto, tel, #, / — else '#'. */
const safeHref = (href: string): string => {
  const trimmed = href.trim();
  if (/^(https?:\/\/|mailto:|tel:|\/|#|\.\/)/i.test(trimmed)) return escAttr(trimmed);
  return "#";
};

function renderBlock(block: WbBlock): string {
  const p = block.props as WbBlockProps & { type: string };
  switch (p.type) {
    case "hero": {
      const align = ("align" in p && p.align) || "center";
      return [
        `<section class="wb-hero" style="text-align:${align}">`,
        `<h1>${esc(p.headline)}</h1>`,
        p.subheadline ? `<p>${esc(p.subheadline)}</p>` : "",
        p.ctaLabel && p.ctaHref ? `<a class="wb-btn" href="${safeHref(p.ctaHref)}">${esc(p.ctaLabel)}</a>` : "",
        `</section>`,
      ].filter(Boolean).join("\n");
    }
    case "text":
      return `<section class="wb-text"><p>${esc(p.body).replace(/\n/g, "<br/>")}</p></section>`;
    case "image":
      return [
        `<figure class="wb-image">`,
        `<img src="${safeHref(p.src)}" alt="${escAttr(p.alt)}" loading="lazy"/>`,
        p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : "",
        `</figure>`,
      ].filter(Boolean).join("\n");
    case "button": {
      const variant = ("variant" in p && p.variant) || "primary";
      return `<section class="wb-button"><a class="wb-btn wb-btn--${variant}" href="${safeHref(p.href)}">${esc(p.label)}</a></section>`;
    }
    case "features": {
      const items = p.items
        .map(
          (f) =>
            `<div class="wb-feature"><h3>${esc(f.title)}</h3><p>${esc(f.description).replace(/\n/g, "<br/>")}</p></div>`
        )
        .join("\n");
      return `<section class="wb-features">${p.title ? `<h2>${esc(p.title)}</h2>` : ""}\n${items}</section>`;
    }
    case "cta":
      return [
        `<section class="wb-cta">`,
        `<h2>${esc(p.headline)}</h2>`,
        p.subheadline ? `<p>${esc(p.subheadline)}</p>` : "",
        p.buttonLabel && p.buttonHref ? `<a class="wb-btn" href="${safeHref(p.buttonHref)}">${esc(p.buttonLabel)}</a>` : "",
        `</section>`,
      ].filter(Boolean).join("\n");
    case "divider":
      return `<hr class="wb-divider"/>`;
    case "html":
      // Explicit escape hatch — raw HTML passes through unchanged.
      return p.content;
    default:
      return "";
  }
}

/** Render a full HTML document from a page's ordered blocks. Deterministic. */
export function renderPageHtml(page: Pick<WbPage, "title" | "path" | "blocks">): string {
  const body = [...page.blocks]
    .sort((a, b) => a.order - b.order)
    .map((b) => renderBlock(b))
    .filter((s) => s.length > 0)
    .join("\n\n");
  return [
    `<!DOCTYPE html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8"/>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1"/>`,
    `<title>${esc(page.title)}</title>`,
    `<style>`,
    `body{font-family:system-ui,-apple-system,sans-serif;margin:0;line-height:1.6;color:#1a202c;background:#fff}`,
    `.wb-hero{padding:4rem 1.5rem;background:#f8fafc}.wb-hero h1{font-size:2.5rem;margin:0 0 .5rem}`,
    `.wb-text,.wb-image,.wb-button,.wb-features,.wb-cta{padding:1.5rem;max-width:72rem;margin:0 auto}`,
    `.wb-features{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}`,
    `.wb-feature{border:1px solid #e2e8f0;border-radius:8px;padding:1rem}`,
    `.wb-cta{background:#0ea5e9;color:#fff;text-align:center;border-radius:8px}`,
    `.wb-btn{display:inline-block;background:#0ea5e9;color:#fff;padding:.6rem 1.2rem;border-radius:6px;text-decoration:none;font-weight:600}`,
    `.wb-btn--secondary{background:#64748b}.wb-btn--outline{background:transparent;border:1px solid #0ea5e9;color:#0ea5e9}`,
    `img{max-width:100%;height:auto}`,
    `</style>`,
    `</head>`,
    `<body>`,
    body,
    `</body>`,
    `</html>`,
    ``,
  ].join("\n");
}
