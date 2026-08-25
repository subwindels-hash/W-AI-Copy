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
  note: string;
}

export const SpCreateAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(2).max(80),
  organizationName: z.string().trim().min(2).max(80).optional(),
});
export type SpCreateAdminInput = z.infer<typeof SpCreateAdminSchema>;

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
