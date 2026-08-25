/**
 * Public-site platform: announcement ticker, SEO, dual SMTP, visitor chat.
 */

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Role as PrismaRole } from "@prisma/client";
import type {
  SpAnnouncement,
  SpAnnouncementPatch,
  SpApiCredentialPublic,
  SpApiUpsertInput,
  SpBrand,
  SpBrandPatch,
  SpChatHealth,
  SpChatMessage,
  SpChatReply,
  SpContactMap,
  SpContactMapPatch,
  SpControlSummary,
  SpCreateAdminInput,
  SpMediaPublic,
  SpMediaUploadInput,
  SpPageContent,
  SpPageContentInput,
  SpPageSeo,
  SpPageSeoInput,
  SpPublicSite,
  SpReview,
  SpReviewsSaveInput,
  SpSeoPatch,
  SpSeoSettings,
  SpSmtpConfigPublic,
  SpSmtpProviderId,
  SpSmtpSaveInput,
  SpSmtpSlotPublic,
  SpSmtpTestResult,
} from "@windels/shared/sitePlatform";
import {
  SP_API_CATALOG,
  SP_DEFAULT_ANNOUNCEMENT,
  SP_DEFAULT_BRAND,
  SP_DEFAULT_IMAGES,
  SP_DEFAULT_MAP,
  SP_DEFAULT_PAGES,
  SP_DEFAULT_REVIEWS,
  SP_DEFAULT_SEO,
  SP_PUBLIC_PATHS,
} from "@windels/shared/sitePlatform";
import { replacePlatformApiOverlay, resolvePlatformApi, setPlatformApiOverlay } from "./platformApis.runtime.js";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { decrypt, encrypt, maskSecret } from "../security/encryption.js";
import { aiRegistry } from "../services/ai/registry.js";
import { sendSmtp } from "../emailIntel/smtp.client.js";
import { spDel, spGet, spPageIndex, spRememberPage, spSet, SpKeys } from "./store.js";

const nowIso = () => new Date().toISOString();

function deny(code: string, message: string, status = 400): never {
  const err: any = new Error(message);
  err.code = code;
  err.status = status;
  throw err;
}

export function announcementIsLive(a: SpAnnouncement, at = Date.now()): boolean {
  if (!a.enabled || !a.message.trim()) return false;
  if (a.startAt && Date.parse(a.startAt) > at) return false;
  if (a.endAt && Date.parse(a.endAt) < at) return false;
  return true;
}

interface SmtpSlotStored {
  id: SpSmtpProviderId;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordEnc: string | null;
  fromEmail: string;
  fromName: string;
}

interface SmtpStored {
  active: SpSmtpProviderId;
  slots: SmtpSlotStored[];
  updatedAt: string;
  updatedBy: string | null;
}

function envFallbackSlot(id: SpSmtpProviderId, label: string): SmtpSlotStored {
  return {
    id,
    label,
    host: env.WINDELS_SMTP_HOST ?? "",
    port: env.WINDELS_SMTP_PORT ?? 587,
    secure: env.WINDELS_SMTP_SECURE ?? false,
    username: env.WINDELS_SMTP_USER ?? "",
    passwordEnc: env.WINDELS_SMTP_PASS ? encrypt(env.WINDELS_SMTP_PASS) : null,
    fromEmail: env.WINDELS_MAIL_FROM,
    fromName: env.WINDELS_MAIL_FROM_NAME,
  };
}

function defaultSmtp(): SmtpStored {
  return {
    active: "external",
    slots: [
      { ...envFallbackSlot("cpanel", "cPanel SMTP"), host: "", port: 465, secure: true, username: "", passwordEnc: null, fromEmail: env.WINDELS_MAIL_FROM },
      envFallbackSlot("external", "External SMTP"),
    ],
    updatedAt: "1970-01-01T00:00:00.000Z",
    updatedBy: null,
  };
}

interface StoredApi {
  id: string;
  slot: string;
  label: string;
  category: SpApiCredentialPublic["category"];
  enabled: boolean;
  baseUrl: string | null;
  apiKeyEnc: string | null;
  note: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

function safeDecrypt(enc: string): string | null {
  try { return decrypt(enc); } catch { return null; }
}

function catalogEnvConfigured(slot: string): boolean {
  switch (slot) {
    case "openai": return Boolean(process.env.OPENAI_API_KEY);
    case "anthropic": return Boolean(process.env.ANTHROPIC_API_KEY);
    case "gemini": return Boolean(process.env.GEMINI_API_KEY);
    case "ollama": return Boolean(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL);
    case "openai-compat": return Boolean(process.env.OPENAI_COMPAT_BASE_URL && process.env.OPENAI_COMPAT_API_KEY);
    case "sports-football": return Boolean(process.env.WINDELS_SPORTS_API_FOOTBALL_KEY);
    case "sports-odds": return Boolean(process.env.WINDELS_SPORTS_ODDS_API_KEY);
    case "lottery-euromillions": return Boolean(process.env.WINDELS_LOTTERY_EUROMILLIONS_FEED_URL);
    default: return false;
  }
}

function publicApi(
  slot: string,
  rec: StoredApi | undefined,
  cat: { slot: string; label: string; category: SpApiCredentialPublic["category"]; removable: boolean },
  envFallback: boolean,
): SpApiCredentialPublic {
  return {
    id: rec?.id ?? slot,
    slot,
    label: rec?.label ?? cat.label,
    category: rec?.category ?? cat.category,
    enabled: rec?.enabled ?? envFallback,
    baseUrl: rec?.baseUrl ?? null,
    keySet: Boolean(rec?.apiKeyEnc),
    envFallback,
    removable: rec ? !SP_API_CATALOG.some((c) => c.slot === rec.slot) : false,
    note: rec?.note ?? null,
    updatedAt: rec?.updatedAt ?? "1970-01-01T00:00:00.000Z",
    updatedBy: rec?.updatedBy ?? null,
  };
}

function publicSlot(s: SmtpSlotStored): SpSmtpSlotPublic {
  return {
    id: s.id,
    label: s.label,
    host: s.host,
    port: s.port,
    secure: s.secure,
    username: s.username,
    passwordSet: Boolean(s.passwordEnc),
    fromEmail: s.fromEmail,
    fromName: s.fromName,
  };
}

export const SitePlatformService = {
  async getAnnouncement(): Promise<SpAnnouncement> {
    const stored = await spGet<SpAnnouncement>(SpKeys.announcement);
    if (stored) return stored;
    return { ...SP_DEFAULT_ANNOUNCEMENT, updatedAt: "1970-01-01T00:00:00.000Z", updatedBy: null };
  },

  async publicAnnouncement(): Promise<SpAnnouncement | null> {
    const a = await this.getAnnouncement();
    return announcementIsLive(a) ? a : null;
  },

  async updateAnnouncement(patch: SpAnnouncementPatch, actorId: string): Promise<SpAnnouncement> {
    const current = await this.getAnnouncement();
    const next: SpAnnouncement = {
      ...current,
      ...patch,
      message: patch.message ?? current.message,
      updatedAt: nowIso(),
      updatedBy: actorId,
    };
    await spSet(SpKeys.announcement, next);
    return next;
  },

  async getSeo(): Promise<SpSeoSettings> {
    const stored = await spGet<SpSeoSettings>(SpKeys.seo);
    if (stored) return stored;
    return { ...SP_DEFAULT_SEO, updatedAt: "1970-01-01T00:00:00.000Z", updatedBy: null };
  },

  async updateSeo(patch: SpSeoPatch, actorId: string): Promise<SpSeoSettings> {
    const current = await this.getSeo();
    const next: SpSeoSettings = { ...current, ...patch, updatedAt: nowIso(), updatedBy: actorId };
    await spSet(SpKeys.seo, next);
    return next;
  },

  async getPageSeo(path: string): Promise<SpPageSeo | null> {
    const normalized = normalizePath(path);
    const stored = await spGet<SpPageSeo>(SpKeys.page(normalized));
    if (stored) return stored;
    const catalog = SP_PUBLIC_PATHS.find((p) => p.path === normalized);
    if (!catalog) return null;
    return {
      path: catalog.path,
      title: catalog.title,
      metaDescription: catalog.description,
      canonicalUrl: null,
      ogTitle: catalog.title,
      ogDescription: catalog.description,
      ogImage: null,
    };
  },

  async upsertPageSeo(input: SpPageSeoInput, actorId: string): Promise<SpPageSeo> {
    const path = normalizePath(input.path);
    const rec: SpPageSeo = {
      path,
      title: input.title,
      metaDescription: input.metaDescription,
      canonicalUrl: input.canonicalUrl ?? null,
      ogTitle: input.ogTitle ?? null,
      ogDescription: input.ogDescription ?? null,
      ogImage: input.ogImage ?? null,
    };
    await spSet(SpKeys.page(path), rec);
    await spRememberPage(path);
    void actorId;
    return rec;
  },

  async listPageSeo(): Promise<SpPageSeo[]> {
    const idx = await spPageIndex();
    const extra: SpPageSeo[] = [];
    for (const p of idx) {
      const rec = await spGet<SpPageSeo>(SpKeys.page(p));
      if (rec) extra.push(rec);
    }
    const known = new Set(extra.map((p) => p.path));
    for (const p of SP_PUBLIC_PATHS) {
      if (!known.has(p.path)) {
        extra.push({
          path: p.path,
          title: p.title,
          metaDescription: p.description,
          canonicalUrl: null,
          ogTitle: p.title,
          ogDescription: p.description,
          ogImage: null,
        });
      }
    }
    return extra;
  },

  async resolvedMeta(path: string) {
    const site = await this.getSeo();
    const page = await this.getPageSeo(path);
    return {
      title: page?.title ?? site.siteTitle,
      description: page?.metaDescription ?? site.metaDescription,
      canonical: page?.canonicalUrl ?? site.canonicalUrl,
      robots: site.robots,
      ogTitle: page?.ogTitle ?? site.ogTitle,
      ogDescription: page?.ogDescription ?? site.ogDescription,
      ogImage: page?.ogImage ?? site.ogImage,
      twitterTitle: site.twitterTitle,
      twitterDescription: site.twitterDescription,
      twitterImage: site.twitterImage,
      favicon: site.favicon,
      siteLogo: site.siteLogo,
      keywords: site.keywords,
      googleVerification: site.googleVerification,
      bingVerification: site.bingVerification,
    };
  },

  async sitemapXml(origin: string): Promise<string> {
    const pages = await this.listPageSeo();
    const urls = pages.map((p) => `  <url><loc>${xml(origin + p.path)}</loc></url>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  },

  async robotsTxt(origin: string): Promise<string> {
    const seo = await this.getSeo();
    const allow = /noindex/i.test(seo.robots) ? "Disallow: /\n" : "Allow: /\nDisallow: /app/\nDisallow: /admin/\nDisallow: /platform/\n";
    return `User-agent: *\n${allow}Sitemap: ${origin}/sitemap.xml\n`;
  },

  async getSmtp(): Promise<SmtpStored> {
    return (await spGet<SmtpStored>(SpKeys.smtp)) ?? defaultSmtp();
  },

  async publicSmtp(): Promise<SpSmtpConfigPublic> {
    const stored = await this.getSmtp();
    return {
      active: stored.active,
      slots: stored.slots.map(publicSlot),
      updatedAt: stored.updatedAt,
      updatedBy: stored.updatedBy,
    };
  },

  async saveSmtp(input: SpSmtpSaveInput, actorId: string): Promise<SpSmtpConfigPublic> {
    const stored = await this.getSmtp();
    if (input.active) stored.active = input.active;
    for (const id of ["cpanel", "external"] as const) {
      const patch = input[id];
      if (!patch) continue;
      const slot = stored.slots.find((s) => s.id === id)!;
      if (patch.host !== undefined) slot.host = patch.host;
      if (patch.port !== undefined) slot.port = patch.port;
      if (patch.secure !== undefined) slot.secure = patch.secure;
      if (patch.username !== undefined) slot.username = patch.username;
      if (patch.fromEmail !== undefined) slot.fromEmail = patch.fromEmail;
      if (patch.fromName !== undefined) slot.fromName = patch.fromName;
      if (patch.password) slot.passwordEnc = encrypt(patch.password);
    }
    stored.updatedAt = nowIso();
    stored.updatedBy = actorId;
    await spSet(SpKeys.smtp, stored);
    return this.publicSmtp();
  },

  async activeSmtpCredentials(): Promise<{
    provider: SpSmtpProviderId;
    host: string;
    port: number;
    secure: boolean;
    username: string | null;
    password: string | null;
    from: string;
    fromName: string;
  } | null> {
    const stored = await this.getSmtp();
    const slot = stored.slots.find((s) => s.id === stored.active);
    if (!slot?.host || !slot.port) return null;
    return {
      provider: slot.id,
      host: slot.host,
      port: slot.port,
      secure: slot.secure,
      username: slot.username || null,
      password: slot.passwordEnc ? decrypt(slot.passwordEnc) : null,
      from: slot.fromEmail,
      fromName: slot.fromName,
    };
  },

  async sendEmail(input: { to: string | string[]; subject: string; text: string }): Promise<{ ok: boolean; sent: boolean; reason: string; error?: string; provider?: SpSmtpProviderId }> {
    const creds = await this.activeSmtpCredentials();
    if (!creds) {
      logger.warn("[email] no active SMTP provider configured");
      return { ok: true, sent: false, reason: "SMTP_NOT_CONFIGURED" };
    }
    try {
      const res = await sendSmtp({
        host: creds.host,
        port: creds.port,
        secure: creds.secure,
        username: creds.username,
        password: creds.password,
        from: creds.from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        text: input.text,
      });
      if (res.ok) return { ok: true, sent: true, reason: res.response ?? "sent", provider: creds.provider };
      return { ok: false, sent: false, reason: res.errorCode, error: res.error ?? undefined, provider: creds.provider };
    } catch (e) {
      return { ok: false, sent: false, reason: "SMTP_ERROR", error: (e as Error).message, provider: creds.provider };
    }
  },

  async sendTemplate(kind: "password_reset" | "welcome" | "test", to: string, vars: Record<string, string>) {
    const subjects: Record<string, string> = {
      password_reset: "Reset your WINDELS AI OS password",
      welcome: "Welcome to WINDELS AI OS",
      test: "WINDELS SMTP test",
    };
    const text =
      kind === "password_reset"
        ? `Hello,\n\nReset your password (valid for a limited time):\n${vars.resetUrl ?? ""}\n\nIf you did not request this, ignore this email.\n`
        : kind === "welcome"
          ? `Welcome to WINDELS AI OS.\n\nSign in at ${vars.loginUrl ?? "/auth/login"}.\n`
          : `This is a real SMTP test from WINDELS.\nProvider: ${vars.provider ?? "unknown"}\nSent at ${nowIso()}\n`;
    return this.sendEmail({ to, subject: subjects[kind] ?? "WINDELS", text });
  },

  async testSmtp(to: string): Promise<SpSmtpTestResult> {
    const creds = await this.activeSmtpCredentials();
    if (!creds) {
      return { ok: false, sent: false, provider: "external", reason: "SMTP_NOT_CONFIGURED", error: "No active SMTP host/port is configured." };
    }
    const result = await this.sendTemplate("test", to, { provider: creds.provider });
    return {
      ok: result.ok && result.sent,
      sent: result.sent,
      provider: creds.provider,
      reason: result.reason,
      error: result.error ?? null,
    };
  },

  async chatHealth(): Promise<SpChatHealth> {
    const configured = aiRegistry.hasRealModelConfigured();
    const providers = aiRegistry.providerHealth().filter((p) => p.isReal && p.configured);
    return {
      configured,
      provider: providers[0]?.id ?? null,
      note: configured
        ? "Visitor chat uses the platform AI registry."
        : "No real AI provider is configured. The assistant will answer from the public site knowledge base and will not pretend to be a live model.",
    };
  },

  async startChat(message: string): Promise<SpChatReply> {
    const id = randomUUID();
    const history: SpChatMessage[] = [];
    return this.continueChat(id, history, message);
  },

  async chatMessage(id: string, message: string): Promise<SpChatReply> {
    const stored = await spGet<{ messages: SpChatMessage[] }>(SpKeys.chat(id));
    if (!stored) deny("CHAT_NOT_FOUND", "Conversation not found or expired", 404);
    return this.continueChat(id, stored.messages, message);
  },

  async getChat(id: string): Promise<SpChatReply | null> {
    const stored = await spGet<{ messages: SpChatMessage[] }>(SpKeys.chat(id));
    if (!stored) return null;
    const last = [...stored.messages].reverse().find((m) => m.role === "assistant");
    return { conversationId: id, reply: last?.content ?? "", source: "SITE_KNOWLEDGE", links: [], messages: stored.messages };
  },

  async clearChat(id: string): Promise<void> {
    await spDel(SpKeys.chat(id));
  },

  async continueChat(id: string, history: SpChatMessage[], message: string): Promise<SpChatReply> {
    const userMsg: SpChatMessage = { role: "user", content: message, at: nowIso() };
    const links = suggestLinks(message);
    const health = await this.chatHealth();
    let reply = knowledgeReply(message, links);
    let source: SpChatReply["source"] = "SITE_KNOWLEDGE";

    if (health.configured) {
      try {
        const res = await aiRegistry.complete(
          {
            model: "windels-assistant",
            messages: [
              { role: "system", content: VISITOR_SYSTEM },
              ...history.map((m) => ({ role: m.role, content: m.content })),
              { role: "user", content: message },
            ],
            temperature: 0.4,
            maxTokens: 500,
          },
          { channel: "chat", feature: "visitor-chat" },
        );
        if (res.content.trim()) {
          reply = res.content.trim();
          source = res.modelSource === "echo-demo" ? "SITE_KNOWLEDGE" : "AI_PROVIDER";
        }
      } catch {
        source = health.configured ? "SITE_KNOWLEDGE" : "UNCONFIGURED";
      }
    } else {
      source = "UNCONFIGURED";
    }

    const assistantMsg: SpChatMessage = { role: "assistant", content: reply, at: nowIso() };
    const messages = [...history, userMsg, assistantMsg].slice(-24);
    await spSet(SpKeys.chat(id), { messages });
    return { conversationId: id, reply, source, links, messages };
  },

  async getBrand(): Promise<SpBrand> {
    const stored = await spGet<SpBrand>(SpKeys.brand);
    if (stored) return stored;
    return { ...SP_DEFAULT_BRAND, updatedAt: "1970-01-01T00:00:00.000Z", updatedBy: null };
  },

  async updateBrand(patch: SpBrandPatch, actorId: string): Promise<SpBrand> {
    const current = await this.getBrand();
    const next: SpBrand = { ...current, ...patch, updatedAt: nowIso(), updatedBy: actorId };
    await spSet(SpKeys.brand, next);
    const images = await this.getImages();
    if (patch.logo) images.logo = patch.logo;
    if (patch.favicon) images.favicon = patch.favicon;
    if (patch.chatAvatar) images.chatAvatar = patch.chatAvatar;
    if (patch.chatAvatarFallback) images.chatAvatarFallback = patch.chatAvatarFallback;
    if (patch.heroImage) images.hero = patch.heroImage;
    if (patch.workforceHero) images.workforceHero = patch.workforceHero;
    if (patch.wordmark) images.wordmark = patch.wordmark;
    await spSet(SpKeys.images, images);
    if (patch.logo || patch.favicon) {
      await this.updateSeo({
        ...(patch.logo ? { siteLogo: patch.logo } : {}),
        ...(patch.favicon ? { favicon: patch.favicon } : {}),
      }, actorId);
    }
    return next;
  },

  async getImages(): Promise<Record<string, string>> {
    const stored = await spGet<Record<string, string>>(SpKeys.images);
    return { ...SP_DEFAULT_IMAGES, ...(stored ?? {}) };
  },

  async setImageSlot(slot: string, url: string, actorId: string): Promise<Record<string, string>> {
    if (!slot.trim()) deny("INVALID", "Image slot is required");
    const images = await this.getImages();
    images[slot] = url;
    await spSet(SpKeys.images, images);
    const brandPatch: SpBrandPatch = {};
    if (slot === "logo") brandPatch.logo = url;
    if (slot === "favicon") brandPatch.favicon = url;
    if (slot === "chatAvatar") brandPatch.chatAvatar = url;
    if (slot === "chatAvatarFallback") brandPatch.chatAvatarFallback = url;
    if (slot === "hero") brandPatch.heroImage = url;
    if (slot === "workforceHero") brandPatch.workforceHero = url;
    if (slot === "wordmark") brandPatch.wordmark = url;
    if (Object.keys(brandPatch).length) await this.updateBrand(brandPatch, actorId);
    return images;
  },

  async listPageContent(): Promise<SpPageContent[]> {
    const stored = await spGet<SpPageContent[]>(SpKeys.content);
    const byPath = new Map((stored ?? []).map((p) => [p.path, p]));
    return SP_DEFAULT_PAGES.map((d) => byPath.get(d.path) ?? d);
  },

  async upsertPageContent(input: SpPageContentInput, _actorId: string): Promise<SpPageContent> {
    const path = normalizePath(input.path);
    const rec: SpPageContent = {
      path,
      title: input.title,
      lead: input.lead ?? "",
      body: input.body ?? "",
      image: input.image ?? null,
      enabled: input.enabled ?? true,
    };
    const list = await this.listPageContent();
    const next = list.filter((p) => p.path !== path);
    next.push(rec);
    await spSet(SpKeys.content, next);
    return rec;
  },

  async getReviews(): Promise<SpReview[]> {
    const stored = await spGet<SpReview[]>(SpKeys.reviews);
    const list = stored?.length ? stored : SP_DEFAULT_REVIEWS;
    return list.map((r) => ({ ...r, illustrative: true as const }));
  },

  async saveReviews(input: SpReviewsSaveInput, _actorId: string): Promise<SpReview[]> {
    const next: SpReview[] = input.reviews.map((r, i) => ({
      id: r.id ?? `rev-${i + 1}`,
      name: r.name,
      title: r.title,
      quote: r.quote,
      image: r.image,
      illustrative: true,
    }));
    await spSet(SpKeys.reviews, next);
    return next;
  },

  async getMap(): Promise<SpContactMap> {
    const stored = await spGet<SpContactMap & { googleEmbedKeyEnc?: string | null }>(SpKeys.map);
    if (!stored) return { ...SP_DEFAULT_MAP, updatedAt: "1970-01-01T00:00:00.000Z", updatedBy: null };
    return {
      enabled: stored.enabled,
      label: stored.label,
      address: stored.address,
      city: stored.city,
      country: stored.country,
      lat: stored.lat,
      lng: stored.lng,
      zoom: stored.zoom,
      provider: stored.provider,
      googleEmbedKeySet: Boolean(stored.googleEmbedKeyEnc) || stored.googleEmbedKeySet,
      updatedAt: stored.updatedAt,
      updatedBy: stored.updatedBy,
    };
  },

  async updateMap(patch: SpContactMapPatch, actorId: string): Promise<SpContactMap> {
    const stored = (await spGet<SpContactMap & { googleEmbedKeyEnc?: string | null }>(SpKeys.map)) ?? {
      ...SP_DEFAULT_MAP, updatedAt: nowIso(), updatedBy: null, googleEmbedKeyEnc: null,
    };
    const next = {
      ...stored,
      ...patch,
      googleEmbedKeyEnc: patch.googleEmbedKey ? encrypt(patch.googleEmbedKey) : stored.googleEmbedKeyEnc ?? null,
      updatedAt: nowIso(),
      updatedBy: actorId,
    };
    delete (next as { googleEmbedKey?: string }).googleEmbedKey;
    await spSet(SpKeys.map, next);
    return this.getMap();
  },

  async publicMapEmbedKey(): Promise<string | null> {
    const stored = await spGet<{ googleEmbedKeyEnc?: string | null; provider?: string }>(SpKeys.map);
    if (stored?.provider !== "google" || !stored.googleEmbedKeyEnc) {
      const dash = resolvePlatformApi("google-maps");
      return dash.source === "dashboard" ? dash.apiKey : null;
    }
    try { return decrypt(stored.googleEmbedKeyEnc); } catch { return null; }
  },

  async publicSite(): Promise<SpPublicSite> {
    const [brand, images, pages, reviews, map] = await Promise.all([
      this.getBrand(), this.getImages(), this.listPageContent(), this.getReviews(), this.getMap(),
    ]);
    const { updatedBy: _b, ...brandPublic } = brand;
    const { updatedBy: _m, ...mapPublic } = map;
    return { brand: brandPublic, images, pages, reviews, map: mapPublic };
  },

  async uploadMedia(input: SpMediaUploadInput, actorId: string): Promise<SpMediaPublic> {
    const raw = input.dataBase64.includes(",") ? input.dataBase64.split(",").pop()! : input.dataBase64;
    let buf: Buffer;
    try { buf = Buffer.from(raw, "base64"); } catch { deny("INVALID", "Image payload is not valid base64"); }
    if (buf.length < 32) deny("INVALID", "Image is empty");
    if (buf.length > 1_200_000) deny("TOO_LARGE", "Image must be 1.2MB or smaller");
    const id = randomUUID();
    await spSet(SpKeys.media(id), { id, slot: input.slot, mime: input.mime, data: raw, updatedBy: actorId });
    const url = `/api/v1/site/media/${id}`;
    await this.setImageSlot(input.slot, url, actorId);
    return { id, slot: input.slot, mime: input.mime, url };
  },

  async getMedia(id: string): Promise<{ mime: string; buffer: Buffer } | null> {
    const stored = await spGet<{ mime: string; data: string }>(SpKeys.media(id));
    if (!stored?.data) return null;
    return { mime: stored.mime, buffer: Buffer.from(stored.data, "base64") };
  },

  async listApis(): Promise<SpApiCredentialPublic[]> {
    await this.hydrateApiOverlay();
    const stored = (await spGet<StoredApi[]>(SpKeys.apis)) ?? [];
    const bySlot = new Map(stored.map((s) => [s.slot, s]));
    const out: SpApiCredentialPublic[] = [];
    for (const cat of SP_API_CATALOG) {
      const rec = bySlot.get(cat.slot);
      const envHit = catalogEnvConfigured(cat.slot);
      out.push(publicApi(cat.slot, rec, cat, envHit));
    }
    for (const rec of stored) {
      if (SP_API_CATALOG.some((c) => c.slot === rec.slot)) continue;
      out.push(publicApi(rec.slot, rec, {
        slot: rec.slot, label: rec.label, category: rec.category, envHint: "",
        needsKey: true, needsUrl: true, defaultBaseUrl: null, removable: true,
      }, false));
    }
    return out;
  },

  async upsertApi(input: SpApiUpsertInput, actorId: string): Promise<SpApiCredentialPublic[]> {
    const catalog = SP_API_CATALOG.find((c) => c.slot === input.slot);
    const stored = (await spGet<StoredApi[]>(SpKeys.apis)) ?? [];
    let rec = input.id ? stored.find((s) => s.id === input.id) : stored.find((s) => s.slot === input.slot);
    if (!rec) {
      rec = {
        id: input.slot.startsWith("custom") || !catalog ? `custom-${randomUUID().slice(0, 8)}` : input.slot,
        slot: catalog ? catalog.slot : (input.slot.startsWith("custom-") ? input.slot : `custom-${input.slot}`),
        label: input.label ?? catalog?.label ?? input.slot,
        category: input.category ?? catalog?.category ?? "custom",
        enabled: input.enabled ?? true,
        baseUrl: input.baseUrl ?? catalog?.defaultBaseUrl ?? null,
        apiKeyEnc: null,
        note: input.note ?? null,
        updatedAt: nowIso(),
        updatedBy: actorId,
      };
      stored.push(rec);
    } else {
      if (input.label) rec.label = input.label;
      if (input.category) rec.category = input.category;
      if (input.enabled !== undefined) rec.enabled = input.enabled;
      if (input.baseUrl !== undefined) rec.baseUrl = input.baseUrl;
      if (input.note !== undefined) rec.note = input.note;
      rec.updatedAt = nowIso();
      rec.updatedBy = actorId;
    }
    if (input.apiKey) rec.apiKeyEnc = encrypt(input.apiKey);
    await spSet(SpKeys.apis, stored);
    await this.hydrateApiOverlay();
    return this.listApis();
  },

  async removeApi(id: string, actorId: string): Promise<SpApiCredentialPublic[]> {
    const stored = (await spGet<StoredApi[]>(SpKeys.apis)) ?? [];
    const rec = stored.find((s) => s.id === id || s.slot === id);
    if (!rec) deny("NOT_FOUND", "API credential not found", 404);
    const catalog = SP_API_CATALOG.find((c) => c.slot === rec.slot);
    const next = stored.filter((s) => s.id !== rec.id);
    await spSet(SpKeys.apis, next);
    setPlatformApiOverlay(rec.slot, null);
    if (catalog && ["openai", "anthropic", "gemini", "ollama", "openai-compat"].includes(rec.slot)) {
      aiRegistry.applyDashboardProvider(rec.slot, { enabled: false });
    }
    void actorId;
    await this.hydrateApiOverlay();
    return this.listApis();
  },

  async hydrateApiOverlay(): Promise<void> {
    const stored = (await spGet<StoredApi[]>(SpKeys.apis)) ?? [];
    replacePlatformApiOverlay(stored.map((s) => ({
      id: s.slot,
      enabled: s.enabled,
      apiKey: s.apiKeyEnc ? safeDecrypt(s.apiKeyEnc) : null,
      baseUrl: s.baseUrl,
      extra: {},
    })));
    for (const s of stored) {
      if (["openai", "anthropic", "gemini", "ollama", "openai-compat"].includes(s.slot)) {
        aiRegistry.applyDashboardProvider(s.slot, {
          enabled: s.enabled,
          apiKey: s.apiKeyEnc ? safeDecrypt(s.apiKeyEnc) : null,
          baseUrl: s.baseUrl,
        });
      }
    }
  },

  async controlSummary(): Promise<SpControlSummary> {
    const [ann, smtp, apis, pages, reviews, map, chat] = await Promise.all([
      this.publicAnnouncement(),
      this.activeSmtpCredentials(),
      this.listApis(),
      this.listPageContent(),
      this.getReviews(),
      this.getMap(),
      this.chatHealth(),
    ]);
    return {
      announcementLive: Boolean(ann),
      smtpConfigured: Boolean(smtp),
      smtpProvider: smtp?.provider ?? null,
      apisConfigured: apis.filter((a) => a.keySet || a.envFallback || (a.baseUrl && a.enabled)).length,
      apisTotal: apis.length,
      pagesEditable: pages.length,
      reviews: reviews.length,
      mapEnabled: Boolean(map.enabled && map.lat != null && map.lng != null),
      chatConfigured: chat.configured,
    };
  },

  async createAdmin(input: SpCreateAdminInput, actorId: string) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) deny("CONFLICT", "An account with this email already exists", 409);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const orgName = input.organizationName ?? "WINDELS";
    const slugBase = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";
    let slug = slugBase;
    while (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${slugBase}-${randomUUID().slice(0, 6)}`;
    }
    const created = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          role: PrismaRole.ADMIN,
          emailVerifiedAt: new Date(),
          profile: { create: { displayName: input.displayName, theme: "dark" } },
        },
      });
      const org = await tx.organization.create({
        data: { name: orgName, slug, workspaces: { create: { name: "Default Workspace", slug: "default" } } },
        include: { workspaces: true },
      });
      await tx.membership.create({
        data: { userId: u.id, organizationId: org.id, workspaceId: org.workspaces[0]!.id, role: "ADMIN" },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: "admin.create",
          resourceType: "User",
          resourceId: u.id,
          metadata: { email: input.email },
        },
      });
      return u;
    });
    return { id: created.id, email: created.email, role: "admin" as const };
  },
};

export const EmailService = {
  getActiveProvider: () => SitePlatformService.activeSmtpCredentials(),
  sendEmail: (input: { to: string | string[]; subject: string; text: string }) => SitePlatformService.sendEmail(input),
  sendTemplate: (kind: "password_reset" | "welcome" | "test", to: string, vars: Record<string, string>) =>
    SitePlatformService.sendTemplate(kind, to, vars),
  testConnection: () => SitePlatformService.activeSmtpCredentials(),
  sendTestEmail: (to: string) => SitePlatformService.testSmtp(to),
};

function normalizePath(path: string): string {
  const p = path.trim() || "/";
  if (p === "/") return "/";
  return p.startsWith("/") ? p.replace(/\/+$/, "") : `/${p.replace(/\/+$/, "")}`;
}

function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const VISITOR_SYSTEM = `You are the WINDELS AI Assistant on the public website.
Help visitors understand WINDELS AI OS: AI workforce, agents, language learning, pricing pages, login/register, and documentation.
Give working site paths such as /workforce, /agents, /languages (after sign-in), /pricing, /contact, /help, /auth/login, /auth/register.
Never invent customer names, revenue, certifications you cannot verify, or SMTP/admin credentials.
If you do not know, say so and point to /contact or /help.
Keep answers concise.`;

function suggestLinks(message: string): Array<{ href: string; label: string }> {
  const t = message.toLowerCase();
  const out: Array<{ href: string; label: string }> = [];
  const add = (href: string, label: string) => {
    if (!out.some((l) => l.href === href)) out.push({ href, label });
  };
  if (/price|plan|cost|billing/.test(t)) add("/pricing", "Pricing");
  if (/agent|workforce|employee/.test(t)) { add("/workforce", "AI Workforce"); add("/agents", "AI Agents"); }
  if (/language|learn dutch|spanish|lesson/.test(t)) add("/features", "Features");
  if (/login|sign in/.test(t)) add("/auth/login", "Sign in");
  if (/register|sign up|start/.test(t)) add("/auth/register", "Create an account");
  if (/contact|support|help/.test(t)) { add("/contact", "Contact"); add("/help", "Help"); }
  if (/how|work|start/.test(t)) add("/how-it-works", "How it works");
  if (!out.length) add("/features", "Explore features");
  return out.slice(0, 4);
}

function knowledgeReply(message: string, links: Array<{ href: string; label: string }>): string {
  const t = message.toLowerCase();
  if (/price|plan|cost/.test(t)) {
    return "WINDELS publishes Starter, Pro, Team, and Enterprise plans on the Pricing page. I will not invent a custom quote — open Pricing or Contact sales.";
  }
  if (/language/.test(t)) {
    return "Language Learning is a signed-in product at /app/languages. The public site explains it under Features. Create an account to start a language profile.";
  }
  if (/agent|workforce/.test(t)) {
    return "WINDELS AI Workforce lets an organization deploy specialized agents with memory, tools, and audit. See AI Workforce and AI Agents, then sign in to Workforce Hub.";
  }
  if (/login|sign in/.test(t)) return "Sign in at /auth/login. Forgot your password? Use /auth/forgot — a reset email is sent only when SMTP is configured.";
  const listed = links.map((l) => `${l.label} (${l.href})`).join(", ");
  return `I can help you find your way around WINDELS. Useful pages: ${listed}. Ask about workforce, agents, pricing, or how to sign in.`;
}

export { maskSecret };
