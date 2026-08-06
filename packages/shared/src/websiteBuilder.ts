// Session 93 — Website Builder (Enterprise Site & Page Builder).
//
// The master spec's Phase-3 Enterprise Applications list includes Website
// Builder; after Sessions 90–92 it is the next named application still
// missing. This module ships org-scoped sites, pages built from typed,
// validated blocks, a pure deterministic block→HTML renderer (with output
// escaping), an honest publish pipeline that snapshots rendered output, and
// AI copy assistance with explicit provider labeling.
//
// Types are prefixed `Wb`. Single source of truth shared by the API service,
// the HTTP routes and the web client.

import { z } from "zod";

// ─── Enums ──────────────────────────────────────────────────────────────

export const WB_SITE_STATUSES = ["draft", "published", "archived"] as const;
export type WbSiteStatus = (typeof WB_SITE_STATUSES)[number];

export const WB_PAGE_STATUSES = ["draft", "published"] as const;
export type WbPageStatus = (typeof WB_PAGE_STATUSES)[number];

export const WB_BLOCK_TYPES = ["hero", "text", "image", "button", "features", "cta", "divider", "html"] as const;
export type WbBlockType = (typeof WB_BLOCK_TYPES)[number];

export const WB_BUTTON_VARIANTS = ["primary", "secondary", "outline"] as const;
export type WbButtonVariant = (typeof WB_BUTTON_VARIANTS)[number];

// ─── Block props (typed per block) ──────────────────────────────────────

export const WbBlockPropsSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hero"),
    headline: z.string().trim().min(1).max(200),
    subheadline: z.string().trim().max(500).optional(),
    ctaLabel: z.string().trim().max(80).optional(),
    ctaHref: z.string().trim().max(500).optional(),
    align: z.enum(["left", "center", "right"]).default("center"),
  }),
  z.object({
    type: z.literal("text"),
    body: z.string().trim().min(1).max(20_000),
  }),
  z.object({
    type: z.literal("image"),
    src: z.string().trim().url().max(1000),
    alt: z.string().trim().max(300),
    caption: z.string().trim().max(300).optional(),
  }),
  z.object({
    type: z.literal("button"),
    label: z.string().trim().min(1).max(80),
    href: z.string().trim().min(1).max(500),
    variant: z.enum(WB_BUTTON_VARIANTS).default("primary"),
  }),
  z.object({
    type: z.literal("features"),
    title: z.string().trim().max(200).optional(),
    items: z.array(z.object({
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().max(1000),
    })).min(1).max(6),
  }),
  z.object({
    type: z.literal("cta"),
    headline: z.string().trim().min(1).max(200),
    subheadline: z.string().trim().max(500).optional(),
    buttonLabel: z.string().trim().max(80).optional(),
    buttonHref: z.string().trim().max(500).optional(),
  }),
  z.object({
    type: z.literal("divider"),
  }),
  z.object({
    type: z.literal("html"),
    // Raw HTML is rendered as-is (explicitly labeled in the UI). This is an
    // intentional escape hatch for power users, not default content.
    content: z.string().min(1).max(50_000),
  }),
]);
export type WbBlockProps = z.infer<typeof WbBlockPropsSchema>;

// ─── Records ────────────────────────────────────────────────────────────

export interface WbSite {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  domain: string | null;
  description: string | null;
  themeColor: string;
  status: WbSiteStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WbBlock {
  id: string;
  type: WbBlockType;
  props: WbBlockProps;
  order: number;
}

export interface WbPage {
  id: string;
  organizationId: string;
  siteId: string;
  path: string;
  title: string;
  seoDescription: string | null;
  isHome: boolean;
  status: WbPageStatus;
  publishedAt: string | null;
  /** Snapshot produced by the real renderer at publish/preview time. */
  renderedHtml: string | null;
  blocks: WbBlock[];
  createdAt: string;
  updatedAt: string;
}

export interface WbSiteDetail extends WbSite {
  pages: WbPage[];
  blocksTotal: number;
}

export interface WbRollup {
  counts: {
    sites: number;
    publishedSites: number;
    archivedSites: number;
    pages: number;
    publishedPages: number;
    blocks: number;
  };
  recentSites: WbSite[];
  totalRenderedBytes: number;
  lastUpdatedAt: string | null;
}

// ─── Input schemas (validated at the API boundary) ──────────────────────

export const WbSiteUpsertSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,60}$/, "slug must be lowercase alphanumeric with dashes"),
  domain: z.string().trim().max(250).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  themeColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default("#0ea5e9"),
  status: z.enum(WB_SITE_STATUSES).default("draft"),
});
export type WbSiteUpsertInput = z.infer<typeof WbSiteUpsertSchema>;
export type WbSiteCreateInput = z.input<typeof WbSiteUpsertSchema>;

export const WbPageUpsertSchema = z.object({
  path: z.string().trim().regex(/^\/([a-z0-9-]+\/?)*$/, "path must start with / and use lowercase alphanumerics and dashes").max(200),
  title: z.string().trim().min(1).max(200),
  seoDescription: z.string().max(500).nullable().optional(),
  status: z.enum(WB_PAGE_STATUSES).default("draft"),
});
export type WbPageUpsertInput = z.infer<typeof WbPageUpsertSchema>;
export type WbPageCreateInput = z.input<typeof WbPageUpsertSchema>;

export const WbBlockAddSchema = WbBlockPropsSchema;
/** Pre-parse input (defaulted fields optional) — used by the service directly. */
export type WbBlockAddInput = z.input<typeof WbBlockPropsSchema>;

/** Loose patch for updating a block's props (any subset of fields). */
export const WbBlockPatchSchema = z.object({
  headline: z.string().trim().min(1).max(200).optional(),
  subheadline: z.string().trim().max(500).optional(),
  ctaLabel: z.string().trim().max(80).optional(),
  ctaHref: z.string().trim().max(500).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  body: z.string().trim().min(1).max(20_000).optional(),
  src: z.string().trim().url().max(1000).optional(),
  alt: z.string().trim().max(300).optional(),
  caption: z.string().trim().max(300).optional(),
  label: z.string().trim().min(1).max(80).optional(),
  href: z.string().trim().min(1).max(500).optional(),
  variant: z.enum(WB_BUTTON_VARIANTS).optional(),
  title: z.string().trim().max(200).optional(),
  items: z.array(z.object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000),
  })).max(6).optional(),
  content: z.string().min(1).max(50_000).optional(),
});
export type WbBlockPatchInput = z.infer<typeof WbBlockPatchSchema>;

export const WbBlockReorderSchema = z.object({
  blockIds: z.array(z.string().trim().min(1).max(64)).min(1),
});

export const WbCopySchema = z.object({
  kind: z.enum(["hero", "section", "cta"]),
  context: z.string().trim().min(1).max(3000),
  tone: z.string().trim().max(60).optional(),
  brand: z.string().trim().max(120).optional(),
});
export type WbCopyInput = z.infer<typeof WbCopySchema>;
