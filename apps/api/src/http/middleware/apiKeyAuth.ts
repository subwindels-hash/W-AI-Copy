import type { Request, Response, NextFunction } from "express";
import { verifyApiKey } from "../../publicApi/publicApi.service.js";
import { recordPublicApiCall } from "../../publicApi/publicApiUsage.service.js";

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  // API keys in query strings are routinely captured in logs, browser history,
  // referrers, and proxies. Public API clients must use Bearer authentication.
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "API key required" } });
  const verified = await verifyApiKey(token);
  if (!verified) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid or revoked API key" } });
  // Session 120 — best-effort call ledger: never fails or slows the request.
  recordPublicApiCall(verified.key, req.method, req.path, new Date()).catch(() => {});
  // Attach a fake user-ish object that resolveUserContext can't read directly;
  // for public API we pass organization via key binding.
  (req as any).apiKey = verified.key;
  (req as any).apiKeyScopes = verified.scopes;
  (req as any).apiUser = verified.user;
  (req as any).apiOrganization = verified.organization;
  next();
}

export function requireScope(...required: Array<"READ" | "WRITE" | "ADMIN">) {
  return (req: Request, res: Response, next: NextFunction) => {
    const scopes: string[] = (req as any).apiKeyScopes ?? [];
    const ok = required.some((r) => scopes.includes(r)) || scopes.includes("ADMIN");
    if (!ok) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: `API key missing required scope: ${required.join(",")}` } });
    next();
  };
}
