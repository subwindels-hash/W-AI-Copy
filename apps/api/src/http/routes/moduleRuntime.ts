import { Router } from "express";
import { createHmac } from "node:crypto";
import { Permission } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import { prisma } from "../../db/client.js";
import { hasPermission } from "../../services/permissions.service.js";
import { auditService } from "../../audit/audit.service.js";
import { ModuleCenterService } from "../../moduleCenter/moduleCenter.service.js";
import type { ModuleManifest } from "@windels/shared/moduleCenter";

const db = prisma as any;
function roleAllowed(role: string, allowed: string[]): boolean { return allowed.includes(role); }
function routeMatches(pattern: string, actual: string): boolean {
  const expected = pattern.split("/").filter(Boolean); const received = actual.split("/").filter(Boolean);
  if (expected.at(-1) !== "*" && expected.length !== received.length) return false;
  if (expected.at(-1) === "*" && received.length < expected.length - 1) return false;
  return expected.every((part, index) => part === "*" || part.startsWith(":") || part === received[index]);
}
function secret(): string | null { const value = process.env.MODULE_RUNNER_HMAC_SECRET?.trim(); return value && value.length >= 32 ? value : null; }

/** Runtime registration and guarded proxy for ACTIVE module services. */
export function registerModuleRuntimeRoutes(parent: Router) {
  const router = Router();
  router.use(authenticate);
  router.get("/health", async (req, res, next) => {
    try { res.json({ ok: true, data: { status: "ok", registrations: (await ModuleCenterService.runtimeRegistrations(req.user!.role)).length } }); } catch (error) { next(error); }
  });
  router.get("/modules", async (req, res, next) => {
    try { res.json({ ok: true, data: await ModuleCenterService.runtimeRegistrations(req.user!.role) }); } catch (error) { next(error); }
  });
  router.get("/registrations", async (req, res, next) => {
    try { res.json({ ok: true, data: await ModuleCenterService.runtimeRegistrations(req.user!.role) }); } catch (error) { next(error); }
  });
  router.all("/:moduleKey/*", async (req, res, next) => {
    try {
      const module = await db.platformModule.findFirst({ where: { moduleKey: req.params.moduleKey, status: "ACTIVE", enabled: true } });
      if (!module) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Active module not found" } });
      const manifest = module.manifest as ModuleManifest;
      if (!roleAllowed(req.user!.role, manifest.accessRoles)) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Role is not allowed to access this module" } });
      const relativePath = `/${String((req.params as any)[0] ?? "").replace(/^\/+/, "")}`;
      const declared = manifest.backend.routes.find((route) => route.method === req.method && routeMatches(route.path, relativePath));
      if (!declared) return res.status(404).json({ ok: false, error: { code: "MODULE_ROUTE_NOT_DECLARED", message: "The requested method/path is not declared by the active module manifest" } });
      const permission = (Permission as any)[declared.permission];
      if (!permission || !(await hasPermission(req.user!.id, permission, req.user!.organizationId ?? undefined))) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: `Missing module route permission: ${declared.permission}` } });
      const registration: any = module.runtimeRegistration;
      const base = registration?.serviceUrl;
      const signingSecret = secret();
      if (!base || !signingSecret) return res.status(503).json({ ok: false, error: { code: "MODULE_RUNTIME_UNAVAILABLE", message: "The module runtime registration is incomplete" } });
      const target = new URL(relativePath, base.endsWith("/") ? base : `${base}/`);
      target.search = new URLSearchParams(req.query as Record<string, string>).toString();
      const context = Buffer.from(JSON.stringify({ userId: req.user!.id, organizationId: req.user!.organizationId, role: req.user!.role, moduleId: module.moduleKey, requestId: req.requestId }), "utf8").toString("base64url");
      const timestamp = new Date().toISOString();
      const signature = createHmac("sha256", signingSecret).update(`${timestamp}.${context}.${req.method}.${relativePath}`).digest("hex");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(process.env.MODULE_RUNTIME_TIMEOUT_MS ?? 15_000));
      let upstream: Response;
      try {
        upstream = await fetch(target, {
          method: req.method, signal: controller.signal, redirect: "error",
          headers: { "accept": "application/json", "content-type": "application/json", "x-windels-module-context": context, "x-windels-timestamp": timestamp, "x-windels-signature": `v1=${signature}`, "x-request-id": req.requestId },
          body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
        });
      } finally { clearTimeout(timeout); }
      const declaredLength = Number(upstream.headers.get("content-length") ?? 0);
      const maxBytes = Number(process.env.MODULE_RUNTIME_RESPONSE_MAX_BYTES ?? 5 * 1024 * 1024);
      if (declaredLength > maxBytes) return res.status(502).json({ ok: false, error: { code: "MODULE_RESPONSE_TOO_LARGE", message: "Module response exceeds platform policy" } });
      const bytes = new Uint8Array(await upstream.arrayBuffer());
      if (bytes.byteLength > maxBytes) return res.status(502).json({ ok: false, error: { code: "MODULE_RESPONSE_TOO_LARGE", message: "Module response exceeds platform policy" } });
      await auditService.log({ organizationId: req.user!.organizationId ?? undefined, userId: req.user!.id, action: req.method === "GET" ? "module.runtime_read" : "module.runtime_write", resourceType: "platform_module", resourceId: module.id, requestId: req.requestId, metadata: { method: req.method, path: relativePath, status: upstream.status } });
      res.status(upstream.status).type(upstream.headers.get("content-type")?.includes("json") ? "application/json" : "application/octet-stream").send(Buffer.from(bytes));
    } catch (error) { next(error); }
  });
  parent.use("/module-runtime", router);
}
