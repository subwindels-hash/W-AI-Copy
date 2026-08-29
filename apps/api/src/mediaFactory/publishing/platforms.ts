/**
 * Session 77B — Publishing pipeline: platform adapters.
 *
 * Each adapter implements the platform's real HTTP upload protocol:
 *   youtube   — resumable session upload (uploadType=resumable → PUT bytes)
 *   tiktok    — Content Posting API v2 (init → chunk PUT → status poll)
 *   instagram — Meta Graph container flow (video_url or resumable rupload → publish)
 *   facebook  — Page videos multipart upload (graph-video)
 *   x         — chunked media upload INIT/APPEND/FINALIZE/STATUS → POST /2/tweets
 *   pinterest — media register → upload → create pin
 *
 * Adapters NEVER fake success: with no token the job engine refuses to run;
 * an HTTP failure raises PlatformPublishError carrying the platform's error
 * body so the job engine can retry or mark the job failed with real detail.
 */
import type { PubPlatformId, PubPublishInput } from "@windels/shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type FetchImpl = (url: string, init?: any) => Promise<any>;

export interface PlatformOAuthConfig {
  envClientId: string;
  envClientSecret: string;
  scope: string;
  authorizeUrl: string;
  tokenUrl: string;
  /** X requires PKCE S256 + HTTP Basic client auth on token calls. */
  pkce?: boolean;
  basicAuth?: boolean;
  /** Extra query params on the authorize URL. */
  authQuery?: Record<string, string>;
}

export interface MediaPayload {
  buffer: Buffer;
  contentType: string;
  /** Set when the media came from an external http(s) URL (may be public). */
  sourceUrl?: string;
}

export interface PublishContext {
  accessToken: string;
  input: PubPublishInput;
  media?: MediaPayload;
  fetchImpl?: FetchImpl;
  /** Max total poll time (ms) for async platform processing. Default 45s. */
  pollBudgetMs?: number;
}

export interface PublishOutcome {
  postId?: string;
  url?: string;
  warnings?: string[];
}

export interface RawTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresInSec?: number;
  scope?: string;
  tokenType?: string;
}

export interface PlatformConstraints {
  requiresMedia: boolean;
  mediaKinds: Array<"video" | "image">;
  maxTitle: number;
  maxDescription: number;
  maxMediaMB: number;
}

export interface PlatformAdapter {
  id: PubPlatformId;
  oauth: PlatformOAuthConfig;
  constraints: PlatformConstraints;
  exchangeCode(input: { code: string; redirectUri: string; clientId: string; clientSecret?: string; codeVerifier?: string }, fetchImpl?: FetchImpl): Promise<RawTokenSet>;
  refreshToken(input: { refreshToken: string; clientId: string; clientSecret?: string }, fetchImpl?: FetchImpl): Promise<RawTokenSet>;
  publish(ctx: PublishContext): Promise<PublishOutcome>;
}

/** Permanent errors are not retried (auth, validation, media too large). */
export class PlatformPublishError extends Error {
  constructor(
    public code: string,
    message: string,
    public permanent: boolean,
    public retryAfterSec?: number,
    public detail?: string,
  ) {
    super(message);
    this.name = "PlatformPublishError";
  }
}

const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 10 * 60_000; // large video bodies

/* ── HTTP helpers ─────────────────────────────────────────────────── */

async function callApi(fetchImpl: FetchImpl | undefined, label: string, url: string, init: any, timeoutMs = REQUEST_TIMEOUT_MS): Promise<{ status: number; headers: any; json?: any; text?: string }> {
  const f: FetchImpl = fetchImpl ?? (globalThis as any).fetch?.bind(globalThis);
  if (!f) throw new PlatformPublishError("NO_FETCH", "No fetch implementation available in this runtime.", true);
  const controller = typeof AbortSignal !== "undefined" && (AbortSignal as any).timeout ? { signal: (AbortSignal as any).timeout(timeoutMs) } : {};
  let res: any;
  try {
    res = await f(url, { ...init, ...controller });
  } catch (e: any) {
    throw new PlatformPublishError("NETWORK", `${label}: network call failed — ${e?.message ?? e}`, false, undefined, url);
  }
  const status = res.status;
  const ct = String(res.headers?.get?.("content-type") ?? "");
  let json: any; let text: string | undefined;
  try {
    if (ct.includes("json")) json = await res.json();
    else text = await res.text();
  } catch { /* empty bodies are fine (201/204) */ }
  if (status === 401 || status === 403) {
    throw new PlatformPublishError("AUTH", `${label}: platform rejected the token (HTTP ${status}). Reconnect the account.`, true, undefined, json ? JSON.stringify(json).slice(0, 500) : text?.slice(0, 500));
  }
  if (status === 429) {
    const retryAfter = Number(res.headers?.get?.("retry-after") ?? 60) || 60;
    throw new PlatformPublishError("RATE_LIMITED", `${label}: rate limited by platform.`, false, retryAfter);
  }
  if (status >= 500) {
    throw new PlatformPublishError("PLATFORM_5XX", `${label}: platform error HTTP ${status}.`, false, undefined, (text ?? JSON.stringify(json ?? {})).slice(0, 500));
  }
  if (status >= 400) {
    const detail = json ? JSON.stringify(json).slice(0, 600) : (text ?? "").slice(0, 600);
    throw new PlatformPublishError("BAD_REQUEST", `${label}: HTTP ${status} — ${detail || "request rejected"}`, true, undefined, detail);
  }
  return { status, headers: res.headers, json, text };
}

function formBody(params: Record<string, string>): string {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

async function sleep(ms: number) { await new Promise((r) => setTimeout(r, ms)); }

async function pollUntil(deadlineMs: number, intervalMs: number, check: () => Promise<{ done: boolean; failed?: string }>): Promise<void> {
  const start = Date.now();
  for (;;) {
    const r = await check();
    if (r.failed) throw new PlatformPublishError("PROCESSING_FAILED", `Platform async processing failed: ${r.failed}`, true);
    if (r.done) return;
    if (Date.now() - start > deadlineMs) throw new PlatformPublishError("PROCESSING_TIMEOUT", "Platform did not finish processing the upload before the poll deadline.", true);
    await sleep(intervalMs);
  }
}

/* ── OAuth exchange/refresh (shared + platform variants) ──────────── */

async function tokenRequest(cfg: PlatformOAuthConfig, params: Record<string, string>, cred: { clientId: string; clientSecret?: string }, fetchImpl?: FetchImpl): Promise<RawTokenSet> {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  const body: Record<string, string> = { ...params };
  if (cfg.basicAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${cred.clientId}:${cred.clientSecret ?? ""}`).toString("base64")}`;
    body.client_id = cred.clientId; // X asks for client_id in body even with Basic
  } else {
    body.client_id = cred.clientId;
    if (cred.clientSecret) body.client_secret = cred.clientSecret;
  }
  const r = await callApi(fetchImpl, "oauth-token", cfg.tokenUrl, { method: "POST", headers, body: formBody(body) });
  const j = r.json ?? {};
  const accessToken = j.access_token;
  if (!accessToken) throw new PlatformPublishError("TOKEN_EXCHANGE", "Token endpoint did not return an access_token.", true, undefined, JSON.stringify(j).slice(0, 400));
  return {
    accessToken,
    refreshToken: j.refresh_token,
    expiresInSec: j.expires_in ? Number(j.expires_in) : undefined,
    scope: j.scope,
    tokenType: j.token_type,
  };
}

function makeOAuth(cfg: PlatformOAuthConfig): Pick<PlatformAdapter, "exchangeCode" | "refreshToken"> {
  return {
    exchangeCode: ({ code, redirectUri, clientId, clientSecret, codeVerifier }, fetchImpl) =>
      tokenRequest(cfg, {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }, { clientId, clientSecret }, fetchImpl),
    refreshToken: ({ refreshToken, clientId, clientSecret }, fetchImpl) =>
      tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken }, { clientId, clientSecret }, fetchImpl),
  };
}

/* ── YouTube ──────────────────────────────────────────────────────── */

const youtubeOAuth: PlatformOAuthConfig = {
  envClientId: "YOUTUBE_CLIENT_ID",
  envClientSecret: "YOUTUBE_CLIENT_SECRET",
  scope: "https://www.googleapis.com/auth/youtube.upload",
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  authQuery: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
};

const youtubeAdapter: PlatformAdapter = {
  id: "youtube",
  oauth: youtubeOAuth,
  constraints: { requiresMedia: true, mediaKinds: ["video"], maxTitle: 100, maxDescription: 5000, maxMediaMB: 2048 },
  ...makeOAuth(youtubeOAuth),
  async publish(ctx) {
    const warnings: string[] = [];
    const media = requireMedia(ctx, "video");
    const meta = {
      snippet: {
        title: ctx.input.title.slice(0, 100),
        description: (ctx.input.description ?? "").slice(0, 5000),
        ...(ctx.input.tags?.length ? { tags: ctx.input.tags.slice(0, 30) } : {}),
      },
      status: { privacyStatus: ctx.input.privacyStatus ?? "unlisted", selfDeclaredMadeForKids: false },
    };
    const init = await callApi(ctx.fetchImpl, "youtube:initiate",
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": media.contentType,
          "X-Upload-Content-Length": String(media.buffer.byteLength),
        },
        body: JSON.stringify(meta),
      });
    const uploadUri = init.headers?.get?.("location");
    if (!uploadUri) throw new PlatformPublishError("NO_UPLOAD_URI", "YouTube did not return a resumable upload URI.", false);
    const up = await callApi(ctx.fetchImpl, "youtube:upload", uploadUri, {
      method: "PUT",
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": media.contentType, "Content-Length": String(media.buffer.byteLength) },
      body: media.buffer,
    }, UPLOAD_TIMEOUT_MS);
    const id = up.json?.id;
    if (!id) throw new PlatformPublishError("NO_VIDEO_ID", "YouTube upload succeeded but returned no video id.", false, undefined, JSON.stringify(up.json ?? {}).slice(0, 400));
    warnings.push("YouTube charges 1600 quota units per upload; processing on YouTube's side may take minutes before the video is playable.");
    return { postId: id, url: `https://youtu.be/${id}`, warnings };
  },
};

/* ── TikTok ───────────────────────────────────────────────────────── */

const tiktokOAuth: PlatformOAuthConfig = {
  envClientId: "TIKTOK_CLIENT_ID",
  envClientSecret: "TIKTOK_CLIENT_SECRET",
  scope: "video.upload,video.publish",
  authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
  tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
  authQuery: { client_key: process.env.TIKTOK_CLIENT_ID ?? "" },
};

const TIKTOK_CHUNK = Math.min(10 * 1024 * 1024, 64 * 1024 * 1024); // 10MB (min 5MB, max 64MB per protocol)

const tiktokAdapter: PlatformAdapter = {
  id: "tiktok",
  oauth: tiktokOAuth,
  constraints: { requiresMedia: true, mediaKinds: ["video"], maxTitle: 2200, maxDescription: 2200, maxMediaMB: 4096 },
  ...makeOAuth(tiktokOAuth),
  async publish(ctx) {
    const warnings: string[] = [];
    const media = requireMedia(ctx, "video");
    const size = media.buffer.byteLength;
    const chunkSize = size <= TIKTOK_CHUNK ? size : TIKTOK_CHUNK;
    const totalChunks = Math.ceil(size / chunkSize);
    const privacy = ctx.input.privacyStatus ?? "SELF_ONLY";
    if (!ctx.input.privacyStatus) warnings.push("Defaulted privacy_level to SELF_ONLY (private draft). Pass privacyStatus PUBLIC_TO_EVERYONE once your TikTok app is approved for public posting; unaudited apps cannot post publicly.");
    const init = await callApi(ctx.fetchImpl, "tiktok:init",
      "https://open.tiktokapis.com/v2/post/publish/video/init/", {
        method: "POST",
        headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({
          post_info: { title: ctx.input.title.slice(0, 2200), privacy_level: privacy },
          source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: totalChunks },
        }),
      });
    const data = init.json?.data ?? {};
    const publishId: string | undefined = data.publish_id;
    const uploadUrl: string | undefined = data.upload_url;
    if (!publishId || !uploadUrl) throw new PlatformPublishError("NO_UPLOAD_URI", "TikTok init returned no publish_id/upload_url.", false, undefined, JSON.stringify(init.json ?? {}).slice(0, 400));
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, size);
      await callApi(ctx.fetchImpl, `tiktok:chunk:${i + 1}/${totalChunks}`, uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": media.contentType === "video/quicktime" ? "video/quicktime" : "video/mp4",
          "Content-Length": String(end - start),
          "Content-Range": `bytes ${start}-${end - 1}/${size}`,
        },
        body: media.buffer.subarray(start, end),
      }, UPLOAD_TIMEOUT_MS);
    }
    await pollUntil(ctx.pollBudgetMs ?? 45_000, 3_000, async () => {
      const st = await callApi(ctx.fetchImpl, "tiktok:status", "https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
        method: "POST",
        headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ publish_id: publishId }),
      });
      const status = st.json?.data?.status;
      if (status === "PUBLISH_COMPLETE") return { done: true };
      if (status === "FAILED") return { done: false, failed: st.json?.data?.fail_reason ?? "unknown" };
      return { done: false };
    });
    return { postId: publishId, warnings };
  },
};

/* ── Instagram (Meta Graph) ───────────────────────────────────────── */

const instagramOAuth: PlatformOAuthConfig = {
  envClientId: "INSTAGRAM_CLIENT_ID",
  envClientSecret: "INSTAGRAM_CLIENT_SECRET",
  scope: "instagram_business_basic,instagram_business_content_publish",
  authorizeUrl: "https://www.instagram.com/oauth/authorize",
  tokenUrl: "https://api.instagram.com/oauth/access_token",
};

const GRAPH = "https://graph.facebook.com/v21.0";

async function resolveIgUserId(ctx: PublishContext): Promise<string> {
  if (ctx.input.igUserId) return ctx.input.igUserId;
  if (process.env.INSTAGRAM_IG_USER_ID) return process.env.INSTAGRAM_IG_USER_ID;
  const me = await callApi(ctx.fetchImpl, "instagram:me", `${GRAPH}/me?fields=instagram_business_account&access_token=${encodeURIComponent(ctx.accessToken)}`, {});
  const id = me.json?.instagram_business_account?.id;
  if (!id) throw new PlatformPublishError("IG_USER_ID_REQUIRED", "Could not resolve an Instagram professional account. Pass igUserId or set INSTAGRAM_IG_USER_ID.", true);
  return id;
}

const instagramAdapter: PlatformAdapter = {
  id: "instagram",
  oauth: instagramOAuth,
  constraints: { requiresMedia: true, mediaKinds: ["video", "image"], maxTitle: 2200, maxDescription: 2200, maxMediaMB: 1024 },
  ...makeOAuth(instagramOAuth),
  async publish(ctx) {
    const warnings: string[] = [];
    const media = requireMedia(ctx, "video");
    const igUser = await resolveIgUserId(ctx);
    let containerId: string;
    const caption = `${ctx.input.title}${ctx.input.description ? `\n\n${ctx.input.description}` : ""}`.slice(0, 2200);

    if (media.sourceUrl) {
      // Public URL path — Meta fetches the media itself.
      const r = await callApi(ctx.fetchImpl, "instagram:container", `${GRAPH}/${igUser}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ media_type: "REELS", video_url: media.sourceUrl, caption, access_token: ctx.accessToken }),
      });
      containerId = r.json?.id;
    } else {
      // Resumable upload path (rupload) for local buffers.
      const c = await callApi(ctx.fetchImpl, "instagram:container-init", `${GRAPH}/${igUser}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ media_type: "REELS", upload_type: "resumable", caption, access_token: ctx.accessToken }),
      });
      containerId = c.json?.id;
      const uri: string | undefined = c.json?.uri;
      if (containerId && uri) {
        await callApi(ctx.fetchImpl, "instagram:rupload", uri, {
          method: "POST",
          headers: {
            Authorization: `OAuth ${ctx.accessToken}`,
            offset: "0",
            file_size: String(media.buffer.byteLength),
            "Content-Type": "application/octet-stream",
          },
          body: media.buffer,
        }, UPLOAD_TIMEOUT_MS);
      }
    }
    if (!containerId) throw new PlatformPublishError("NO_CONTAINER", "Instagram did not return a media container id.", false);
    await pollUntil(ctx.pollBudgetMs ?? 90_000, 4_000, async () => {
      const st = await callApi(ctx.fetchImpl, "instagram:container-status", `${GRAPH}/${containerId}?fields=status_code&access_token=${encodeURIComponent(ctx.accessToken)}`, {});
      const code = st.json?.status_code;
      if (code === "FINISHED") return { done: true };
      if (code === "ERROR" || code === "EXPIRED") return { done: false, failed: `container status ${code}` };
      return { done: false };
    });
    const pub = await callApi(ctx.fetchImpl, "instagram:publish", `${GRAPH}/${igUser}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ creation_id: containerId, access_token: ctx.accessToken }),
    });
    const mediaId = pub.json?.id;
    if (!mediaId) throw new PlatformPublishError("NO_MEDIA_ID", "Instagram media_publish returned no id.", false);
    let url: string | undefined;
    try {
      const pl = await callApi(ctx.fetchImpl, "instagram:permalink", `${GRAPH}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(ctx.accessToken)}`, {});
      url = pl.json?.permalink;
    } catch { warnings.push("Published, but fetching the permalink failed; check the account feed."); }
    return { postId: mediaId, url, warnings };
  },
};

/* ── Facebook (Page video) ────────────────────────────────────────── */

const facebookOAuth: PlatformOAuthConfig = {
  envClientId: "FACEBOOK_CLIENT_ID",
  envClientSecret: "FACEBOOK_CLIENT_SECRET",
  scope: "pages_manage_posts,pages_read_engagement,pages_show_list,business_management",
  authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
  tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
};

const facebookAdapter: PlatformAdapter = {
  id: "facebook",
  oauth: facebookOAuth,
  constraints: { requiresMedia: true, mediaKinds: ["video"], maxTitle: 255, maxDescription: 5000, maxMediaMB: 4096 },
  ...makeOAuth(facebookOAuth),
  async publish(ctx) {
    const warnings: string[] = [];
    const media = requireMedia(ctx, "video");
    const pageId = ctx.input.pageId ?? process.env.FACEBOOK_PAGE_ID;
    if (!pageId) throw new PlatformPublishError("PAGE_ID_REQUIRED", "Facebook publishing targets a Page: pass pageId or set FACEBOOK_PAGE_ID.", true);
    const fd = new FormData();
    fd.set("title", ctx.input.title.slice(0, 255));
    fd.set("description", (ctx.input.description ?? "").slice(0, 5000));
    fd.set("source", new Blob([media.buffer], { type: media.contentType }), `upload.${media.contentType.includes("quicktime") ? "mov" : "mp4"}`);
    const r = await callApi(ctx.fetchImpl, "facebook:page-video", `https://graph-video.facebook.com/v21.0/${pageId}/videos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
      body: fd,
    }, UPLOAD_TIMEOUT_MS);
    const id = r.json?.id;
    if (!id) throw new PlatformPublishError("NO_VIDEO_ID", "Facebook returned no video id.", false, undefined, JSON.stringify(r.json ?? {}).slice(0, 400));
    warnings.push("Facebook processes video asynchronously; the post may take minutes to appear in HD.");
    return { postId: id, url: `https://www.facebook.com/${id}`, warnings };
  },
};

/* ── X / Twitter ──────────────────────────────────────────────────── */

const xOAuth: PlatformOAuthConfig = {
  envClientId: "X_CLIENT_ID",
  envClientSecret: "X_CLIENT_SECRET",
  scope: "tweet.read tweet.write users.read offline.access media.write",
  authorizeUrl: "https://twitter.com/i/oauth2/authorize",
  tokenUrl: "https://api.twitter.com/2/oauth2/token",
  pkce: true,
  basicAuth: true,
  authQuery: { code_challenge_method: "S256" },
};

const X_CHUNK = 5 * 1024 * 1024;

const xAdapter: PlatformAdapter = {
  id: "x",
  oauth: xOAuth,
  constraints: { requiresMedia: false, mediaKinds: ["video", "image"], maxTitle: 280, maxDescription: 280, maxMediaMB: 512 },
  ...makeOAuth(xOAuth),
  async publish(ctx) {
    const warnings: string[] = [];
    const text = `${ctx.input.title}${ctx.input.description ? `\n\n${ctx.input.description}` : ""}`.slice(0, 280);
    let mediaId: string | undefined;

    if (ctx.media?.buffer?.byteLength) {
      const media = ctx.media;
      const mediaType = media.contentType.includes("quicktime") ? "video/quicktime" : media.contentType.includes("image") ? media.contentType : "video/mp4";
      const init = await callApi(ctx.fetchImpl, "x:media:INIT", "https://upload.twitter.com/1.1/media/upload.json", {
        method: "POST",
        headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({
          command: "INIT",
          total_bytes: String(media.buffer.byteLength),
          media_type: mediaType,
          ...(mediaType.startsWith("video") ? { media_category: "tweet_video" } : {}),
        }),
      });
      mediaId = init.json?.media_id_string;
      if (!mediaId) throw new PlatformPublishError("NO_MEDIA_ID", "X INIT returned no media_id.", false, undefined, JSON.stringify(init.json ?? {}).slice(0, 400));

      const size = media.buffer.byteLength;
      const chunks = Math.ceil(size / X_CHUNK);
      for (let i = 0; i < chunks; i++) {
        const fd = new FormData();
        fd.set("command", "APPEND");
        fd.set("media_id", mediaId);
        fd.set("segment_index", String(i));
        fd.set("media", new Blob([media.buffer.subarray(i * X_CHUNK, Math.min((i + 1) * X_CHUNK, size))], { type: mediaType }), "chunk");
        await callApi(ctx.fetchImpl, `x:media:APPEND:${i + 1}/${chunks}`, "https://upload.twitter.com/1.1/media/upload.json", {
          method: "POST",
          headers: { Authorization: `Bearer ${ctx.accessToken}` },
          body: fd,
        }, UPLOAD_TIMEOUT_MS);
      }

      const fin = await callApi(ctx.fetchImpl, "x:media:FINALIZE", "https://upload.twitter.com/1.1/media/upload.json", {
        method: "POST",
        headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ command: "FINALIZE", media_id: mediaId }),
      });
      const proc = fin.json?.processing_info;
      if (proc && proc.state !== "succeeded") {
        await pollUntil(ctx.pollBudgetMs ?? 60_000, Math.max(2_000, Number(proc.check_after_secs ?? 4) * 1000), async () => {
          const st = await callApi(ctx.fetchImpl, "x:media:STATUS", "https://upload.twitter.com/1.1/media/upload.json", {
            method: "POST",
            headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: formBody({ command: "STATUS", media_id: mediaId! }),
          });
          const state = st.json?.processing_info?.state;
          if (state === "succeeded") return { done: true };
          if (state === "failed") return { done: false, failed: st.json?.processing_info?.error?.message ?? "media processing failed" };
          return { done: false };
        });
      }
    }

    const tw = await callApi(ctx.fetchImpl, "x:tweet", "https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...(mediaId ? { media: { media_ids: [mediaId] } } : {}) }),
    });
    const id = tw.json?.data?.id;
    if (!id) throw new PlatformPublishError("NO_TWEET_ID", "X tweet create returned no id.", false, undefined, JSON.stringify(tw.json ?? {}).slice(0, 400));
    return { postId: id, url: `https://x.com/i/web/status/${id}`, warnings };
  },
};

/* ── Pinterest ────────────────────────────────────────────────────── */

const pinterestOAuth: PlatformOAuthConfig = {
  envClientId: "PINTEREST_CLIENT_ID",
  envClientSecret: "PINTEREST_CLIENT_SECRET",
  scope: "boards:read,pins:read,pins:write,user_accounts:read",
  authorizeUrl: "https://www.pinterest.com/oauth/",
  tokenUrl: "https://api.pinterest.com/v5/oauth/token",
  basicAuth: true,
};

const pinterestAdapter: PlatformAdapter = {
  id: "pinterest",
  oauth: pinterestOAuth,
  constraints: { requiresMedia: true, mediaKinds: ["video"], maxTitle: 100, maxDescription: 800, maxMediaMB: 2048 },
  ...makeOAuth(pinterestOAuth),
  async publish(ctx) {
    const warnings: string[] = [];
    const media = requireMedia(ctx, "video");
    const boardId = ctx.input.boardId ?? process.env.PINTEREST_BOARD_ID;
    if (!boardId) throw new PlatformPublishError("BOARD_ID_REQUIRED", "Pinterest pins target a board: pass boardId or set PINTEREST_BOARD_ID.", true);

    const reg = await callApi(ctx.fetchImpl, "pinterest:register", "https://api.pinterest.com/v5/media", {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ media_type: "video" }),
    });
    const mediaId = reg.json?.media_id;
    const uploadUrl = reg.json?.upload_url;
    const params = reg.json?.upload_parameters ?? {};
    if (!mediaId || !uploadUrl) throw new PlatformPublishError("NO_UPLOAD_URI", "Pinterest register returned no media_id/upload_url.", false, undefined, JSON.stringify(reg.json ?? {}).slice(0, 400));

    const fd = new FormData();
    for (const [k, v] of Object.entries(params)) fd.set(k, String(v));
    fd.set("file", new Blob([media.buffer], { type: media.contentType }), "video.mp4");
    await callApi(ctx.fetchImpl, "pinterest:upload", uploadUrl, { method: "POST", body: fd }, UPLOAD_TIMEOUT_MS);

    const pin = await callApi(ctx.fetchImpl, "pinterest:pin", "https://api.pinterest.com/v5/pins", {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        board_id: boardId,
        title: ctx.input.title.slice(0, 100),
        description: (ctx.input.description ?? "").slice(0, 800),
        media_source: { source_type: "video_id", media_id: mediaId },
      }),
    });
    const id = pin.json?.id;
    if (!id) throw new PlatformPublishError("NO_PIN_ID", "Pinterest pin create returned no id.", false, undefined, JSON.stringify(pin.json ?? {}).slice(0, 400));
    warnings.push("Pinterest transcodes video pins asynchronously; the pin may appear as processing for a few minutes.");
    return { postId: id, url: `https://www.pinterest.com/pin/${id}/`, warnings };
  },
};

/* ── Registry ─────────────────────────────────────────────────────── */

function requireMedia(ctx: PublishContext, kind: "video" | "image"): MediaPayload {
  const m = ctx.media;
  if (!m || !m.buffer?.byteLength) {
    throw new PlatformPublishError("MEDIA_REQUIRED", `${ctx.input.title ? "This platform" : "Platform"} requires a ${kind} file. Provide videoUrl/mediaUrl on the publish job.`, true);
  }
  return m;
}

export const PLATFORM_ADAPTERS: Record<PubPlatformId, PlatformAdapter> = {
  youtube: youtubeAdapter,
  tiktok: tiktokAdapter,
  instagram: instagramAdapter,
  facebook: facebookAdapter,
  x: xAdapter,
  pinterest: pinterestAdapter,
};

export const PUB_PLATFORM_IDS = Object.keys(PLATFORM_ADAPTERS) as PubPlatformId[];

export function isPubPlatform(v: string): v is PubPlatformId {
  return v in PLATFORM_ADAPTERS;
}

export interface LoadedOAuth extends PlatformOAuthConfig {
  clientId?: string;
  clientSecret?: string;
}

export function loadOAuthConfig(platform: PubPlatformId): LoadedOAuth {
  const cfg = PLATFORM_ADAPTERS[platform].oauth;
  return { ...cfg, clientId: process.env[cfg.envClientId], clientSecret: process.env[cfg.envClientSecret] };
}

export function buildAuthorizeUrl(platform: PubPlatformId, opts: { clientId: string; redirectUri: string; state: string; codeChallenge?: string }): string {
  const cfg = PLATFORM_ADAPTERS[platform].oauth;
  const q = new URLSearchParams({
    response_type: "code",
    redirect_uri: opts.redirectUri,
    state: opts.state,
    ...(platform === "tiktok" ? { client_key: opts.clientId } : { client_id: opts.clientId }),
    scope: cfg.scope,
    ...(cfg.authQuery ? Object.fromEntries(Object.entries(cfg.authQuery).filter(([, v]) => v)) : {}),
    ...(opts.codeChallenge ? { code_challenge: opts.codeChallenge } : {}),
  });
  return `${cfg.authorizeUrl}?${q.toString()}`;
}
