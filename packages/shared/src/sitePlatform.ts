/**
 * WINDELS public-site platform: announcement, SEO, dual SMTP, visitor chat.
 * Platform-global — this is the marketing website, not tenant data.
 */

import { z } from "zod";

export const SP_SMTP_PROVIDERS = ["cpanel", "external"] as const;
export type SpSmtpProviderId = (typeof SP_SMTP_PROVIDERS)[number];

export interface SpAnnouncement {
  enabled: boolean;
  message: string;
  link: string | null;
  linkLabel: string | null;
  startAt: string | null;
  endAt: string | null;
  animationEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export const SP_DEFAULT_ANNOUNCEMENT: Omit<SpAnnouncement, "updatedAt" | "updatedBy"> = {
  enabled: true,
  message: "WINDELS AI WORKFORCE • New AI Workforce Features Available • Explore AI Agents • Learn More",
  link: "/agents",
  linkLabel: "Explore AI Agents",
  startAt: null,
  endAt: null,
  animationEnabled: true,
};

export const SpAnnouncementPatchSchema = z.object({
  enabled: z.boolean().optional(),
  message: z.string().trim().min(3).max(400).optional(),
  link: z.string().trim().max(300).nullable().optional(),
  linkLabel: z.string().trim().max(80).nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  animationEnabled: z.boolean().optional(),
});
export type SpAnnouncementPatch = z.infer<typeof SpAnnouncementPatchSchema>;

export interface SpSeoSettings {
  siteTitle: string;
  metaDescription: string;
  keywords: string;
  canonicalUrl: string | null;
  robots: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
  favicon: string;
  siteLogo: string;
  googleVerification: string | null;
  bingVerification: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export const SP_DEFAULT_SEO: Omit<SpSeoSettings, "updatedAt" | "updatedBy"> = {
  siteTitle: "WINDELS AI OS — Enterprise AI Workforce",
  metaDescription: "Build, deploy, and govern AI agents across your organization. Workforce Hub, Flow, Talk, Canvas, and Language Learning in one operating system.",
  keywords: "WINDELS, AI workforce, AI agents, enterprise AI, language learning",
  canonicalUrl: null,
  robots: "index,follow",
  ogTitle: "WINDELS AI OS — Enterprise AI Workforce",
  ogDescription: "Build, deploy, and govern AI agents across your organization.",
  ogImage: "/og/og-image.png",
  twitterTitle: "WINDELS AI OS — Enterprise AI Workforce",
  twitterDescription: "Build, deploy, and govern AI agents across your organization.",
  twitterImage: "/og/og-image.png",
  favicon: "/favicon.svg",
  siteLogo: "/brand/logo-icon.png",
  googleVerification: null,
  bingVerification: null,
};

export const SpSeoPatchSchema = z.object({
  siteTitle: z.string().trim().min(3).max(120).optional(),
  metaDescription: z.string().trim().min(10).max(320).optional(),
  keywords: z.string().trim().max(400).optional(),
  canonicalUrl: z.string().trim().max(400).nullable().optional(),
  robots: z.string().trim().max(80).optional(),
  ogTitle: z.string().trim().max(120).optional(),
  ogDescription: z.string().trim().max(320).optional(),
  ogImage: z.string().trim().max(400).optional(),
  twitterTitle: z.string().trim().max(120).optional(),
  twitterDescription: z.string().trim().max(320).optional(),
  twitterImage: z.string().trim().max(400).optional(),
  favicon: z.string().trim().max(200).optional(),
  siteLogo: z.string().trim().max(200).optional(),
  googleVerification: z.string().trim().max(120).nullable().optional(),
  bingVerification: z.string().trim().max(120).nullable().optional(),
});
export type SpSeoPatch = z.infer<typeof SpSeoPatchSchema>;

export interface SpPageSeo {
  path: string;
  title: string;
  metaDescription: string;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
}

export const SpPageSeoSchema = z.object({
  path: z.string().trim().min(1).max(200),
  title: z.string().trim().min(3).max(120),
  metaDescription: z.string().trim().min(10).max(320),
  canonicalUrl: z.string().trim().max(400).nullable().optional(),
  ogTitle: z.string().trim().max(120).nullable().optional(),
  ogDescription: z.string().trim().max(320).nullable().optional(),
  ogImage: z.string().trim().max(400).nullable().optional(),
});
export type SpPageSeoInput = z.infer<typeof SpPageSeoSchema>;

export interface SpSmtpSlotPublic {
  id: SpSmtpProviderId;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordSet: boolean;
  fromEmail: string;
  fromName: string;
}

export interface SpSmtpConfigPublic {
  active: SpSmtpProviderId;
  slots: SpSmtpSlotPublic[];
  updatedAt: string;
  updatedBy: string | null;
}

export const SpSmtpSlotPatchSchema = z.object({
  host: z.string().trim().min(1).max(200).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().trim().max(200).optional(),
  password: z.string().min(1).max(400).optional(),
  fromEmail: z.string().email().optional(),
  fromName: z.string().trim().max(80).optional(),
});

export const SpSmtpSaveSchema = z.object({
  active: z.enum(SP_SMTP_PROVIDERS).optional(),
  cpanel: SpSmtpSlotPatchSchema.optional(),
  external: SpSmtpSlotPatchSchema.optional(),
});
export type SpSmtpSaveInput = z.infer<typeof SpSmtpSaveSchema>;

export const SpSmtpTestSchema = z.object({
  to: z.string().email(),
});

export interface SpSmtpTestResult {
  ok: boolean;
  sent: boolean;
  provider: SpSmtpProviderId;
  reason: string;
  error: string | null;
}

export const SpChatStartSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});
export const SpChatMessageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});
export const SpChatStreamSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().trim().min(8).max(80).optional(),
});

export interface SpChatMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
}

export interface SpChatReply {
  conversationId: string;
  reply: string;
  source: "AI_PROVIDER" | "SITE_KNOWLEDGE" | "UNCONFIGURED";
  links: Array<{ href: string; label: string }>;
  messages: SpChatMessage[];
}

export interface SpChatHealth {
  configured: boolean;
  provider: string | null;
  streaming: boolean;
  note: string;
}

export const SpCreateAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(2).max(80),
  organizationName: z.string().trim().min(2).max(80).optional(),
});
export type SpCreateAdminInput = z.infer<typeof SpCreateAdminSchema>;

export const SP_IMAGE_SLOTS = [
  "logo",
  "wordmark",
  "favicon",
  "chatAvatar",
  "chatAvatarFallback",
  "hero",
  "workforceHero",
  "ogImage",
  "reviewer-1",
  "reviewer-2",
  "reviewer-3",
  "reviewer-4",
  "reviewer-5",
  "reviewer-6",
  "agent-1",
  "agent-2",
  "agent-3",
  "agent-4",
  "agent-5",
  "agent-6",
  "agent-7",
  "agent-8",
] as const;
export type SpImageSlot = (typeof SP_IMAGE_SLOTS)[number];

export const SP_DEFAULT_IMAGES: Record<SpImageSlot, string> = {
  logo: "/brand/logo-icon.png",
  wordmark: "/brand/logo-wordmark.png",
  favicon: "/favicon.svg",
  chatAvatar: "/brand/ai-assistant-avatar.png",
  chatAvatarFallback: "/brand/ai-assistant-fallback.png",
  hero: "/brand/hero-enterprise.png",
  workforceHero: "/brand/workforce-hero.png",
  ogImage: "/og/og-image.png",
  "reviewer-1": "/reviews/reviewer-1.png",
  "reviewer-2": "/reviews/reviewer-2.png",
  "reviewer-3": "/reviews/reviewer-3.png",
  "reviewer-4": "/reviews/reviewer-4.png",
  "reviewer-5": "/reviews/reviewer-5.png",
  "reviewer-6": "/reviews/reviewer-6.png",
  "agent-1": "/avatars/agent-1-strategist.png",
  "agent-2": "/avatars/agent-2-engineer.png",
  "agent-3": "/avatars/agent-3-analyst.png",
  "agent-4": "/avatars/agent-4-creative.png",
  "agent-5": "/avatars/agent-5-support.png",
  "agent-6": "/avatars/agent-6-finance.png",
  "agent-7": "/avatars/agent-7-researcher.png",
  "agent-8": "/avatars/agent-8-ops.png",
};

export interface SpBrand {
  logo: string;
  wordmark: string | null;
  favicon: string;
  chatAvatar: string;
  chatAvatarFallback: string;
  heroImage: string;
  workforceHero: string;
  chatName: string;
  updatedAt: string;
  updatedBy: string | null;
}

export const SP_DEFAULT_BRAND: Omit<SpBrand, "updatedAt" | "updatedBy"> = {
  logo: SP_DEFAULT_IMAGES.logo,
  wordmark: SP_DEFAULT_IMAGES.wordmark,
  favicon: SP_DEFAULT_IMAGES.favicon,
  chatAvatar: SP_DEFAULT_IMAGES.chatAvatar,
  chatAvatarFallback: SP_DEFAULT_IMAGES.chatAvatarFallback,
  heroImage: SP_DEFAULT_IMAGES.hero,
  workforceHero: SP_DEFAULT_IMAGES.workforceHero,
  chatName: "WINDELS AI Assistant",
};

export const SpBrandPatchSchema = z.object({
  logo: z.string().trim().min(1).max(500).optional(),
  wordmark: z.string().trim().max(500).nullable().optional(),
  favicon: z.string().trim().min(1).max(500).optional(),
  chatAvatar: z.string().trim().min(1).max(500).optional(),
  chatAvatarFallback: z.string().trim().min(1).max(500).optional(),
  heroImage: z.string().trim().min(1).max(500).optional(),
  workforceHero: z.string().trim().min(1).max(500).optional(),
  chatName: z.string().trim().min(2).max(80).optional(),
});
export type SpBrandPatch = z.infer<typeof SpBrandPatchSchema>;

export interface SpPageContent {
  path: string;
  title: string;
  lead: string;
  body: string;
  image: string | null;
  enabled: boolean;
}

export const SpPageContentSchema = z.object({
  path: z.string().trim().min(1).max(200),
  title: z.string().trim().min(2).max(160),
  lead: z.string().trim().max(800).default(""),
  body: z.string().trim().max(8000).default(""),
  image: z.string().trim().max(500).nullable().optional(),
  enabled: z.boolean().optional(),
});
export type SpPageContentInput = z.infer<typeof SpPageContentSchema>;

export interface SpReview {
  id: string;
  name: string;
  title: string;
  quote: string;
  image: string;
  illustrative: true;
}

export const SpReviewInputSchema = z.object({
  id: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(120),
  quote: z.string().trim().min(8).max(500),
  image: z.string().trim().min(1).max(500),
});
export const SpReviewsSaveSchema = z.object({
  reviews: z.array(SpReviewInputSchema).max(12),
});
export type SpReviewsSaveInput = z.infer<typeof SpReviewsSaveSchema>;

export const SP_DEFAULT_REVIEWS: SpReview[] = [
  { id: "rev-1", name: "Sarah Chen", title: "COO, illustrative org", quote: "WINDELS replaced five tools. Our AI workforce handles onboarding, support and reporting without hiring.", image: "/reviews/reviewer-1.png", illustrative: true },
  { id: "rev-2", name: "James Okoro", title: "Founder, illustrative org", quote: "The Canvas and Flow automation saved us 30 hours a week. Governance controls kept us compliant from day one.", image: "/reviews/reviewer-2.png", illustrative: true },
  { id: "rev-3", name: "Elena Rossi", title: "VP Engineering, illustrative org", quote: "Vendor-agnostic AI is not marketing — we swapped providers in an hour. The platform just works.", image: "/reviews/reviewer-3.png", illustrative: true },
];

export interface SpContactMap {
  enabled: boolean;
  label: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  zoom: number;
  provider: "openstreetmap" | "google";
  /** Browser-restricted Google Maps Embed key. Null unless Super Admin set one. */
  googleEmbedKeySet: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export const SP_DEFAULT_MAP: Omit<SpContactMap, "updatedAt" | "updatedBy"> = {
  enabled: false,
  label: null,
  address: null,
  city: null,
  country: null,
  lat: null,
  lng: null,
  zoom: 14,
  provider: "openstreetmap",
  googleEmbedKeySet: false,
};

export const SpContactMapPatchSchema = z.object({
  enabled: z.boolean().optional(),
  label: z.string().trim().max(120).nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  zoom: z.number().int().min(2).max(19).optional(),
  provider: z.enum(["openstreetmap", "google"]).optional(),
  googleEmbedKey: z.string().trim().min(8).max(200).optional(),
});
export type SpContactMapPatch = z.infer<typeof SpContactMapPatchSchema>;

export const SP_API_CATEGORIES = ["ai", "sports", "lottery", "maps", "email", "lead_discovery", "integrations", "custom"] as const;
export type SpApiCategory = (typeof SP_API_CATEGORIES)[number];

export interface SpApiCatalogItem {
  slot: string;
  label: string;
  category: SpApiCategory;
  envHint: string;
  needsKey: boolean;
  needsUrl: boolean;
  defaultBaseUrl: string | null;
  removable: boolean;
}

export const SP_API_CATALOG: SpApiCatalogItem[] = [
  { slot: "openai", label: "OpenAI", category: "ai", envHint: "OPENAI_API_KEY", needsKey: true, needsUrl: false, defaultBaseUrl: "https://api.openai.com/v1", removable: false },
  { slot: "anthropic", label: "Anthropic", category: "ai", envHint: "ANTHROPIC_API_KEY", needsKey: true, needsUrl: false, defaultBaseUrl: "https://api.anthropic.com", removable: false },
  { slot: "gemini", label: "Google Gemini", category: "ai", envHint: "GEMINI_API_KEY", needsKey: true, needsUrl: false, defaultBaseUrl: null, removable: false },
  { slot: "ollama", label: "Ollama (self-hosted)", category: "ai", envHint: "OLLAMA_BASE_URL", needsKey: false, needsUrl: true, defaultBaseUrl: "http://127.0.0.1:11434", removable: false },
  { slot: "openai-compat", label: "OpenAI-compatible endpoint", category: "ai", envHint: "OPENAI_COMPAT_API_KEY", needsKey: true, needsUrl: true, defaultBaseUrl: null, removable: false },
  { slot: "sports-football", label: "API-Football", category: "sports", envHint: "WINDELS_SPORTS_API_FOOTBALL_KEY", needsKey: true, needsUrl: true, defaultBaseUrl: "https://v3.football.api-sports.io", removable: false },
  { slot: "sports-odds", label: "The Odds API", category: "sports", envHint: "WINDELS_SPORTS_ODDS_API_KEY", needsKey: true, needsUrl: true, defaultBaseUrl: "https://api.the-odds-api.com/v4", removable: false },
  { slot: "lottery-euromillions", label: "EuroMillions official feed", category: "lottery", envHint: "WINDELS_LOTTERY_EUROMILLIONS_FEED_URL", needsKey: false, needsUrl: true, defaultBaseUrl: null, removable: false },
  { slot: "lottery-powerball", label: "Powerball official feed", category: "lottery", envHint: "WINDELS_LOTTERY_POWERBALL_FEED_URL", needsKey: false, needsUrl: true, defaultBaseUrl: null, removable: false },
  { slot: "github-client-id", label: "GitHub OAuth client id", category: "integrations", envHint: "GITHUB_CLIENT_ID", needsKey: true, needsUrl: false, defaultBaseUrl: null, removable: false },
  { slot: "github-oauth", label: "GitHub OAuth client secret", category: "integrations", envHint: "GITHUB_CLIENT_SECRET", needsKey: true, needsUrl: false, defaultBaseUrl: null, removable: false },
  { slot: "google-maps", label: "Google Maps Embed (browser key)", category: "maps", envHint: "public embed key", needsKey: true, needsUrl: false, defaultBaseUrl: null, removable: false },
  { slot: "google-places-lead-discovery", label: "Google Places Lead Discovery", category: "lead_discovery", envHint: "GOOGLE_PLACES_API_KEY", needsKey: true, needsUrl: true, defaultBaseUrl: "https://maps.googleapis.com", removable: false },
  { slot: "apollo", label: "Apollo Lead Intelligence", category: "lead_discovery", envHint: "LEAD_APOLLO_API_KEY", needsKey: true, needsUrl: true, defaultBaseUrl: "https://api.apollo.io", removable: false },
  { slot: "neverbounce", label: "NeverBounce Email Verification", category: "lead_discovery", envHint: "LEAD_NEVERBOUNCE_API_KEY", needsKey: true, needsUrl: true, defaultBaseUrl: "https://api.neverbounce.com", removable: false },
];

export interface SpApiCredentialPublic {
  id: string;
  slot: string;
  label: string;
  category: SpApiCategory;
  enabled: boolean;
  baseUrl: string | null;
  keySet: boolean;
  envFallback: boolean;
  removable: boolean;
  note: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export const SpApiUpsertSchema = z.object({
  id: z.string().trim().min(2).max(80).optional(),
  slot: z.string().trim().min(2).max(80),
  label: z.string().trim().min(2).max(80).optional(),
  category: z.enum(SP_API_CATEGORIES).optional(),
  enabled: z.boolean().optional(),
  baseUrl: z.string().trim().max(400).nullable().optional(),
  apiKey: z.string().min(1).max(800).optional(),
  note: z.string().trim().max(240).nullable().optional(),
});
export type SpApiUpsertInput = z.infer<typeof SpApiUpsertSchema>;

export const SpMediaUploadSchema = z.object({
  slot: z.string().trim().min(2).max(40),
  filename: z.string().trim().min(1).max(120).optional(),
  mime: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"]),
  dataBase64: z.string().min(16).max(2_000_000),
});
export type SpMediaUploadInput = z.infer<typeof SpMediaUploadSchema>;

export interface SpMediaPublic {
  id: string;
  slot: string;
  mime: string;
  url: string;
}

export interface SpPublicSite {
  brand: Omit<SpBrand, "updatedBy">;
  images: Record<string, string>;
  pages: SpPageContent[];
  reviews: SpReview[];
  map: Omit<SpContactMap, "updatedBy">;
}

export interface SpControlSummary {
  announcementLive: boolean;
  smtpConfigured: boolean;
  smtpProvider: string | null;
  apisConfigured: number;
  apisTotal: number;
  pagesEditable: number;
  reviews: number;
  mapEnabled: boolean;
  chatConfigured: boolean;
}

export const SP_PUBLIC_PATHS: Array<{ path: string; title: string; description: string }> = [
  { path: "/", title: "WINDELS AI OS", description: "The enterprise operating system for AI workforces." },
  { path: "/about", title: "About WINDELS", description: "What WINDELS AI OS is and how the platform is built." },
  { path: "/features", title: "Features", description: "Workforce Hub, Chat, Talk, Flow, Canvas, Language Learning, and governance." },
  { path: "/workforce", title: "AI Workforce", description: "Deploy specialized AI employees with memory, tools, and audit." },
  { path: "/agents", title: "AI Agents", description: "Meet the agent roles that run inside WINDELS." },
  { path: "/solutions", title: "Solutions", description: "How teams use WINDELS for operations, support, and learning." },
  { path: "/how-it-works", title: "How it works", description: "From sign-up to a governed AI workforce." },
  { path: "/pricing", title: "Pricing", description: "Starter, Pro, Team, and Enterprise plans." },
  { path: "/faq", title: "FAQ", description: "Common questions about WINDELS AI OS." },
  { path: "/contact", title: "Contact", description: "Talk to WINDELS support or sales." },
  { path: "/help", title: "Help", description: "Help center and getting-started guides." },
  { path: "/docs", title: "Documentation", description: "Product and platform documentation." },
  { path: "/enterprise", title: "Enterprise", description: "Governance, security, and deployment for large organizations." },
  { path: "/auth/login", title: "Sign in", description: "Sign in to your WINDELS workspace." },
  { path: "/auth/register", title: "Create an account", description: "Start a WINDELS organization." },
];

export const SP_DEFAULT_PAGES: SpPageContent[] = SP_PUBLIC_PATHS.map((p) => ({
  path: p.path,
  title: p.title,
  lead: p.description,
  body: "",
  image: p.path === "/" ? SP_DEFAULT_IMAGES.hero : p.path === "/about" || p.path === "/workforce" ? SP_DEFAULT_IMAGES.workforceHero : null,
  enabled: true,
}));
