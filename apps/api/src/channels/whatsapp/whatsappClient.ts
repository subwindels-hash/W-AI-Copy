/**
 * WhatsApp Cloud API client — the real Meta Graph API integration.
 *
 * There is no mock mode and no simulated send. When credentials are missing
 * the client throws `WHATSAPP_CONFIGURATION_REQUIRED` so the caller can report
 * the configuration gap honestly instead of pretending a message was
 * delivered.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { WHATSAPP_CONFIGURATION_REQUIRED_MESSAGE } from "@windels/shared";

const GRAPH_HOST = process.env.WHATSAPP_GRAPH_HOST ?? "https://graph.facebook.com";

export interface WhatsAppCredentials {
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string;
}

export class WhatsAppApiError extends Error {
  code: string;
  httpStatus: number;
  /** Meta's numeric error code, when the response carried one. */
  metaCode: string | null;
  /** True when retrying later could plausibly succeed. */
  retryable: boolean;

  constructor(opts: {
    message: string;
    code?: string;
    httpStatus?: number;
    metaCode?: string | null;
    retryable?: boolean;
  }) {
    super(opts.message);
    this.name = "WhatsAppApiError";
    this.code = opts.code ?? "WHATSAPP_API_ERROR";
    this.httpStatus = opts.httpStatus ?? 0;
    this.metaCode = opts.metaCode ?? null;
    this.retryable = opts.retryable ?? false;
  }
}

export function configurationRequiredError(missing: string[]): WhatsAppApiError {
  return new WhatsAppApiError({
    message: `${WHATSAPP_CONFIGURATION_REQUIRED_MESSAGE} Missing: ${missing.join(", ")}.`,
    code: "WHATSAPP_CONFIGURATION_REQUIRED",
    retryable: false,
  });
}

/**
 * Verifies Meta's `X-Hub-Signature-256` header against the EXACT raw bytes of
 * the request. Parsing and re-serialising the body changes whitespace and
 * breaks the HMAC, so callers must pass `req.rawBody` (already captured by the
 * global express.json verify hook in http/server.ts).
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  appSecret: string | undefined,
): { valid: boolean; reason?: string } {
  if (!appSecret) return { valid: false, reason: "app secret not configured" };
  if (!rawBody) return { valid: false, reason: "raw body unavailable" };
  if (!signatureHeader) return { valid: false, reason: "missing signature header" };

  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return { valid: false, reason: "unsupported signature scheme" };

  const provided = signatureHeader.slice(prefix.length).trim();
  if (!/^[0-9a-f]+$/i.test(provided)) return { valid: false, reason: "malformed signature" };

  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const expected = createHmac("sha256", appSecret).update(body).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided.toLowerCase(), "utf8");
  if (a.length !== b.length) return { valid: false, reason: "signature length mismatch" };
  return timingSafeEqual(a, b) ? { valid: true } : { valid: false, reason: "signature mismatch" };
}

/** Constant-time compare for the GET webhook verify token. */
export function verifyTokenMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Normalises a phone number to the digits-only form the Graph API expects. */
export function normalizePhoneNumber(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

interface GraphResponse {
  messaging_product?: string;
  messages?: Array<{ id: string; message_status?: string }>;
  contacts?: Array<{ input: string; wa_id: string }>;
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
  [k: string]: unknown;
}

/** Meta error codes that are worth retrying (throttling / transient upstream). */
const RETRYABLE_META_CODES = new Set(["4", "80007", "130429", "131048", "131056", "133016", "1", "2"]);

async function graphFetch(
  creds: WhatsAppCredentials,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number },
): Promise<GraphResponse> {
  const url = `${GRAPH_HOST}/${creds.apiVersion}/${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 15_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    throw new WhatsAppApiError({
      message: aborted ? "WhatsApp API request timed out" : `WhatsApp API request failed: ${e?.message ?? e}`,
      code: aborted ? "WHATSAPP_TIMEOUT" : "WHATSAPP_NETWORK_ERROR",
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }

  let json: GraphResponse = {};
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text) as GraphResponse;
    } catch {
      json = {};
    }
  }

  if (!res.ok || json.error) {
    const metaCode = json.error?.code != null ? String(json.error.code) : null;
    // 429/5xx are always retryable; otherwise consult Meta's code.
    const retryable =
      res.status === 429 ||
      res.status >= 500 ||
      (metaCode != null && RETRYABLE_META_CODES.has(metaCode));
    throw new WhatsAppApiError({
      message: json.error?.message ?? `WhatsApp API returned HTTP ${res.status}`,
      code: res.status === 401 || res.status === 403 ? "WHATSAPP_AUTH_FAILED" : "WHATSAPP_API_ERROR",
      httpStatus: res.status,
      metaCode,
      retryable,
    });
  }

  return json;
}

export interface SendResult {
  /** Meta's wamid for the sent message. */
  messageId: string;
  /** wa_id the message was actually routed to (may differ from `to`). */
  waId: string | null;
}

function extractSendResult(json: GraphResponse): SendResult {
  const messageId = json.messages?.[0]?.id;
  if (!messageId) {
    throw new WhatsAppApiError({
      message: "WhatsApp API accepted the request but returned no message id",
      code: "WHATSAPP_NO_MESSAGE_ID",
      retryable: false,
    });
  }
  return { messageId, waId: json.contacts?.[0]?.wa_id ?? null };
}

export const WhatsAppClient = {
  /** POST a text message. `to` may be E.164 with or without '+'. */
  async sendText(creds: WhatsAppCredentials, to: string, body: string, previewUrl = false): Promise<SendResult> {
    const json = await graphFetch(creds, `${creds.phoneNumberId}/messages`, {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhoneNumber(to),
        type: "text",
        text: { preview_url: previewUrl, body },
      },
    });
    return extractSendResult(json);
  },

  /** POST a media message (image/audio/video/document/sticker). */
  async sendMedia(
    creds: WhatsAppCredentials,
    to: string,
    kind: "image" | "audio" | "video" | "document" | "sticker",
    media: { id?: string; link?: string; caption?: string; filename?: string },
  ): Promise<SendResult> {
    if (!media.id && !media.link) {
      throw new WhatsAppApiError({
        message: "sendMedia requires either a media id or a link",
        code: "WHATSAPP_INVALID_MEDIA",
        retryable: false,
      });
    }
    const payload: Record<string, unknown> = media.id ? { id: media.id } : { link: media.link };
    // Audio and sticker do not accept captions; document additionally takes a filename.
    if (media.caption && kind !== "audio" && kind !== "sticker") payload.caption = media.caption;
    if (media.filename && kind === "document") payload.filename = media.filename;

    const json = await graphFetch(creds, `${creds.phoneNumberId}/messages`, {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhoneNumber(to),
        type: kind,
        [kind]: payload,
      },
    });
    return extractSendResult(json);
  },

  /** POST an interactive message (buttons or list). */
  async sendInteractive(creds: WhatsAppCredentials, to: string, interactive: Record<string, unknown>): Promise<SendResult> {
    const json = await graphFetch(creds, `${creds.phoneNumberId}/messages`, {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhoneNumber(to),
        type: "interactive",
        interactive,
      },
    });
    return extractSendResult(json);
  },

  /** Marks an inbound message read (the blue ticks). Best-effort. */
  async markRead(creds: WhatsAppCredentials, messageId: string): Promise<void> {
    await graphFetch(creds, `${creds.phoneNumberId}/messages`, {
      method: "POST",
      body: { messaging_product: "whatsapp", status: "read", message_id: messageId },
    });
  },

  /** Resolves a media id to a short-lived download URL. */
  async getMediaUrl(creds: WhatsAppCredentials, mediaId: string): Promise<{ url: string; mimeType: string | null; sha256: string | null; fileSize: number | null }> {
    const json = (await graphFetch(creds, mediaId, { method: "GET" })) as GraphResponse & {
      url?: string; mime_type?: string; sha256?: string; file_size?: number;
    };
    if (!json.url) {
      throw new WhatsAppApiError({ message: `Media ${mediaId} has no download URL`, code: "WHATSAPP_MEDIA_NOT_FOUND", retryable: false });
    }
    return {
      url: json.url,
      mimeType: json.mime_type ?? null,
      sha256: json.sha256 ?? null,
      fileSize: json.file_size ?? null,
    };
  },

  /**
   * Downloads the actual bytes of a media object.
   *
   * Meta's media URLs are short-lived AND require the same bearer token as the
   * Graph API, so they cannot be handed to a browser or to an AI provider —
   * the server must fetch them itself. `maxBytes` is enforced while streaming
   * so a hostile or malformed Content-Length cannot exhaust memory.
   */
  async downloadMedia(
    creds: WhatsAppCredentials,
    url: string,
    opts: { maxBytes: number; timeoutMs?: number },
  ): Promise<{ buffer: Buffer; mimeType: string | null }> {
    if (!/^https:\/\//i.test(url)) {
      throw new WhatsAppApiError({
        message: "Refusing to download media over a non-HTTPS URL",
        code: "WHATSAPP_MEDIA_INSECURE_URL",
        retryable: false,
      });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const status = res.status;
        throw new WhatsAppApiError({
          message: `Media download failed with HTTP ${status}`,
          code: status === 404 ? "WHATSAPP_MEDIA_EXPIRED" : "WHATSAPP_MEDIA_DOWNLOAD_FAILED",
          httpStatus: status,
          retryable: status === 429 || status >= 500,
        });
      }

      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > opts.maxBytes) {
        throw new WhatsAppApiError({
          message: `Media is ${declared} bytes, over the ${opts.maxBytes} byte limit`,
          code: "WHATSAPP_MEDIA_TOO_LARGE",
          retryable: false,
        });
      }

      // Stream so an understated Content-Length still cannot overrun the cap.
      const chunks: Buffer[] = [];
      let total = 0;
      const body = res.body;
      if (body) {
        const reader = (body as ReadableStream<Uint8Array>).getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          total += value.byteLength;
          if (total > opts.maxBytes) {
            await reader.cancel().catch(() => { /* best effort */ });
            throw new WhatsAppApiError({
              message: `Media exceeded the ${opts.maxBytes} byte limit while downloading`,
              code: "WHATSAPP_MEDIA_TOO_LARGE",
              retryable: false,
            });
          }
          chunks.push(Buffer.from(value));
        }
      } else {
        const ab = await res.arrayBuffer();
        if (ab.byteLength > opts.maxBytes) {
          throw new WhatsAppApiError({
            message: `Media exceeded the ${opts.maxBytes} byte limit`,
            code: "WHATSAPP_MEDIA_TOO_LARGE",
            retryable: false,
          });
        }
        chunks.push(Buffer.from(ab));
      }

      return {
        buffer: Buffer.concat(chunks),
        mimeType: res.headers.get("content-type")?.split(";")[0]?.trim() ?? null,
      };
    } catch (error) {
      if (error instanceof WhatsAppApiError) throw error;
      const aborted = (error as Error)?.name === "AbortError";
      throw new WhatsAppApiError({
        message: aborted ? "Media download timed out" : `Media download failed: ${(error as Error)?.message}`,
        code: aborted ? "WHATSAPP_MEDIA_TIMEOUT" : "WHATSAPP_MEDIA_DOWNLOAD_FAILED",
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * Live connectivity probe against the configured phone number. Used by the
   * admin UI so "connected" reflects a real API call, never an assumption.
   */
  async checkConnection(creds: WhatsAppCredentials): Promise<{ ok: true; displayPhoneNumber: string | null; verifiedName: string | null; qualityRating: string | null }> {
    const json = (await graphFetch(creds, `${creds.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, {
      method: "GET",
      timeoutMs: 10_000,
    })) as GraphResponse & { display_phone_number?: string; verified_name?: string; quality_rating?: string };
    return {
      ok: true,
      displayPhoneNumber: json.display_phone_number ?? null,
      verifiedName: json.verified_name ?? null,
      qualityRating: json.quality_rating ?? null,
    };
  },
};
