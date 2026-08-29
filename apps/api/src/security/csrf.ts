/**
 * Security — CSRF protection (Slice 111).
 *
 * Double-submit cookie pattern: issues an `XSRF-TOKEN` cookie on every GET; future
 * session-cookie-authenticated requests must echo it back in `X-XSRF-TOKEN`.
 *
 * In this MVP all authenticated requests use Authorization: Bearer (JWT or API key)
 * from localStorage / client headers, which are NOT auto-attachable by browsers
 * cross-site — they are inherently CSRF-safe. We therefore only ENFORCE CSRF on
 * requests that arrive WITHOUT an Authorization header (i.e. future session-cookie
 * flows). The cookie is still SET on every response so clients building against
 * the cookie API can adopt it later without a server change.
 */
import type { Request, Response, NextFunction } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "XSRF-TOKEN";
const HEADER_NAME = "x-xsrf-token";

export function csrfMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    let token = req.cookies?.[COOKIE_NAME];
    if (!token || token.length < 32) {
      token = randomBytes(32).toString("hex");
    }
    res.cookie(COOKIE_NAME, token, {
      httpOnly: false,
      secure: req.secure || req.headers["x-forwarded-proto"] === "https",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const auth = req.header("authorization") ?? "";
      const hasApiKey = !!req.header("x-api-key");
      const hasCookieSession = !!req.cookies?.windels_sid;
      // Bearer-token or API-key requests are not CSRF-vulnerable (header not auto-attached).
      if (auth.toLowerCase().startsWith("bearer ") || hasApiKey) return next();
      // Pre-auth endpoints (no session cookie yet) don't need CSRF — they authenticate
      // via credentials in the body, not via a cookie.
      if (!hasCookieSession) return next();
      // Otherwise (cookie-session flow): require the double-submit token.
      const submitted = req.header(HEADER_NAME);
      if (!submitted || !token || !safeEqual(submitted, token)) {
        return res.status(403).json({ ok: false, error: { code: "CSRF_INVALID", message: "CSRF token missing or invalid" }, meta: { requestId: req.requestId } });
      }
    }
    next();
  };
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try { return timingSafeEqual(ba, bb); } catch { return false; }
}
