/** Session 93 — Website Builder client. */
import { api } from "./api";

export type WbSiteStatus = "draft" | "published" | "archived";
export type WbPageStatus = "draft" | "published";
export type WbBlockType = "hero" | "text" | "image" | "button" | "features" | "cta" | "divider" | "html";
export type WbButtonVariant = "primary" | "secondary" | "outline";

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

export type WbBlockProps =
  | { type: "hero"; headline: string; subheadline?: string; ctaLabel?: string; ctaHref?: string; align?: "left" | "center" | "right" }
  | { type: "text"; body: string }
  | { type: "image"; src: string; alt: string; caption?: string }
  | { type: "button"; label: string; href: string; variant?: WbButtonVariant }
  | { type: "features"; title?: string; items: Array<{ title: string; description: string }> }
  | { type: "cta"; headline: string; subheadline?: string; buttonLabel?: string; buttonHref?: string }
  | { type: "divider" }
  | { type: "html"; content: string };

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

export interface WbSiteCreateInput {
  name: string;
  slug: string;
  domain?: string | null;
  description?: string | null;
  themeColor?: string;
  status?: WbSiteStatus;
}

export interface WbPageCreateInput {
  path: string;
  title: string;
  seoDescription?: string | null;
  status?: WbPageStatus;
}

export interface WbCopyResult {
  text: string;
  provider: string;
  modelSource: "real" | "echo-demo";
  durationMs: number;
}

export const websiteBuilderApi = {
  rollup: () => api<WbRollup>("/website-builder/dashboard/rollup"),

  listSites: (params?: { q?: string; status?: WbSiteStatus }) =>
    api<WbSite[]>("/website-builder/sites", { params }),
  createSite: (input: WbSiteCreateInput) => api<WbSite>("/website-builder/sites", { method: "POST", json: input }),
  getSiteDetail: (id: string) => api<WbSiteDetail>(`/website-builder/sites/${id}/detail`),
  updateSite: (id: string, patch: Partial<WbSiteCreateInput>) =>
    api<WbSite>(`/website-builder/sites/${id}`, { method: "PATCH", json: patch }),
  deleteSite: (id: string) => api<{ deleted: boolean; id: string }>(`/website-builder/sites/${id}`, { method: "DELETE" }),
  publishSite: (id: string) => api<WbSite>(`/website-builder/sites/${id}/publish`, { method: "POST" }),
  archiveSite: (id: string) => api<WbSite>(`/website-builder/sites/${id}/archive`, { method: "POST" }),

  createPage: (siteId: string, input: WbPageCreateInput) =>
    api<WbPage>(`/website-builder/sites/${siteId}/pages`, { method: "POST", json: input }),
  updatePage: (id: string, patch: Partial<WbPageCreateInput>) =>
    api<WbPage>(`/website-builder/pages/${id}`, { method: "PATCH", json: patch }),
  deletePage: (id: string) => api<{ deleted: boolean; id: string }>(`/website-builder/pages/${id}`, { method: "DELETE" }),
  publishPage: (id: string) => api<WbPage>(`/website-builder/pages/${id}/publish`, { method: "POST" }),
  previewPage: (id: string) => api<{ html: string; pageId: string }>(`/website-builder/pages/${id}/preview`),

  addBlock: (pageId: string, props: WbBlockProps) =>
    api<WbPage>(`/website-builder/pages/${pageId}/blocks`, { method: "POST", json: props }),
  updateBlock: (pageId: string, blockId: string, patch: Partial<WbBlockProps>) =>
    api<WbPage>(`/website-builder/pages/${pageId}/blocks/${blockId}`, { method: "PATCH", json: patch }),
  removeBlock: (pageId: string, blockId: string) =>
    api<WbPage>(`/website-builder/pages/${pageId}/blocks/${blockId}`, { method: "DELETE" }),
  reorderBlocks: (pageId: string, blockIds: string[]) =>
    api<WbPage>(`/website-builder/pages/${pageId}/blocks/reorder`, { method: "POST", json: { blockIds } }),

  generateCopy: (input: { kind: "hero" | "section" | "cta"; context: string; tone?: string; brand?: string }) =>
    api<WbCopyResult>("/website-builder/intelligence/copy", { method: "POST", json: input }),
};
