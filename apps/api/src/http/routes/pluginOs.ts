/**
 * WINDELS PLUGIN OS — HTTP API.
 *
 * Mounted at /plugins (authenticated). Covers catalog/marketplace,
 * install/configure/uninstall, connections, capability registry, intent
 * resolution, execution, audit and preferences. Manifest publishing is
 * restricted to admins/developers.
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { PluginRegistry, manifestSchema } from "../../pluginOs/pluginRegistry.js";
import { PluginConnections } from "../../pluginOs/connections.js";
import { CapabilityRegistry } from "../../pluginOs/capabilityRegistry.js";
import { IntentEngine } from "../../pluginOs/intent.js";

const oid = (req: any) => req.user!.organizationId;
const uid = (req: any) => req.user!.id;

const Install = z.object({
  manifestId: z.string().min(1),
  grantedPermissions: z.array(z.string()).optional(),
  config: z.record(z.any()).optional(),
});
const ApiKeyConn = z.object({
  displayName: z.string().min(1),
  apiKey: z.string().min(4),
  apiSecret: z.string().optional(),
  endpoint: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
});
const OAuthStart = z.object({
  displayName: z.string(), pluginId: z.string(),
  authUrl: z.string().url(), tokenUrl: z.string().url(),
  clientId: z.string(), clientSecret: z.string(),
  scopes: z.array(z.string()).default([]), redirectUri: z.string().url(),
});
const McpConn = z.object({ displayName: z.string(), endpoint: z.string().url(), headers: z.record(z.string()).optional() });
const Execute = z.object({ capability: z.string().min(2), input: z.any().optional(), maxCost: z.number().optional(), preferredPluginId: z.string().optional() });
const Resolve = z.object({ prompt: z.string().min(1) });
const Prefs = z.object({ preferredPluginId: z.string().optional(), maxCost: z.number().optional(), qualityPreference: z.enum(["speed", "quality", "balanced"]).optional() });

export function registerPluginOsRoutes(router: Router) {
  const r = Router();
  r.use(authenticate);

  // ── Marketplace / catalog ──
  r.get("/marketplace", async (req, res, next) => {
    try { res.json({ ok: true, data: await PluginRegistry.listCatalog({ category: req.query.category as string, class: req.query.class as any, q: req.query.q as string, capability: req.query.capability as string }) }); } catch (e) { next(e); }
  });
  r.get("/manifest/:id", async (req, res, next) => {
    try { const m = await PluginRegistry.getManifest(req.params.id); if (!m) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } }); res.json({ ok: true, data: m }); } catch (e) { next(e); }
  });

  // ── Publishing (admin/developer) ──
  r.post("/publish", rateLimit("admin"), validate({ body: manifestSchema }), async (req, res, next) => {
    try {
      // Only verified/organization publishers may publish in production.
      if (req.user!.role === "user") return res.status(403).json({ ok: false, error: { code: "FORBIDDEN" } });
      const manifest = await PluginRegistry.publish({ manifest: req.body });
      res.status(201).json({ ok: true, data: manifest });
    } catch (e: any) {
      if (e?.status) return res.status(e.status).json({ ok: false, error: { code: e.code ?? "INVALID", message: e.message } });
      next(e);
    }
  });

  // ── Installed plugins ──
  r.get("/installed", async (req, res, next) => {
    try { res.json({ ok: true, data: await PluginRegistry.listInstalled(oid(req)) }); } catch (e) { next(e); }
  });
  r.post("/install", validate({ body: Install }), async (req, res, next) => {
    try {
      const p = await PluginRegistry.install(oid(req), uid(req), req.body.manifestId, req.body);
      const m = await PluginRegistry.getManifest(req.body.manifestId);
      if (m) await CapabilityRegistry.register(oid(req), m, { enabled: p.status === "enabled", status: p.status, authenticated: p.status !== "auth_required" });
      res.status(201).json({ ok: true, data: p });
    } catch (e: any) { if (e?.status) return res.status(e.status).json({ ok: false, error: { code: e.code, message: e.message } }); next(e); }
  });
  r.post("/:id/status", validate({ body: z.object({ status: z.enum(["enabled", "disabled", "auth_required", "failed", "uninstalled"]) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await PluginRegistry.setStatus(oid(req), req.params.id, req.body.status, uid(req)) }); } catch (e) { next(e); }
  });
  r.post("/:id/permissions", validate({ body: z.object({ grantedPermissions: z.array(z.string()) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await PluginRegistry.setPermissions(oid(req), req.params.id, req.body.grantedPermissions, uid(req)) }); } catch (e) { next(e); }
  });
  r.delete("/:id", async (req, res, next) => {
    try {
      await CapabilityRegistry.unregister(oid(req), req.params.id);
      await PluginRegistry.uninstall(oid(req), req.params.id, uid(req));
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  r.get("/:id/audit", async (req, res, next) => {
    try { res.json({ ok: true, data: await PluginRegistry.listAudit(oid(req)) }); } catch (e) { next(e); }
  });

  // ── Connections ──
  r.get("/connections", async (req, res, next) => { try { res.json({ ok: true, data: await PluginConnections.list(oid(req)) }); } catch (e) { next(e); } });
  r.post("/connections/api-key", validate({ body: ApiKeyConn }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await PluginConnections.createApiKey(oid(req), req.body.pluginId ?? "unknown", req.body) }); } catch (e) { next(e); }
  });
  r.post("/connections/oauth/start", validate({ body: OAuthStart }), async (req, res, next) => {
    try { const { url, state } = await PluginConnections.beginOAuth(oid(req), uid(req), req.body.pluginId, req.body); res.json({ ok: true, data: { url, state } }); } catch (e) { next(e); }
  });
  r.post("/connections/oauth/complete", validate({ body: z.object({ code: z.string(), state: z.string() }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await PluginConnections.completeOAuth(req.body.code, req.body.state) }); } catch (e) { next(e); }
  });
  r.post("/connections/mcp", validate({ body: McpConn }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await PluginConnections.createMcp(oid(req), req.body.pluginId ?? "unknown", req.body) }); } catch (e) { next(e); }
  });
  r.delete("/connections/:id", async (req, res, next) => { try { await PluginConnections.remove(oid(req), req.params.id); res.json({ ok: true }); } catch (e) { next(e); } });

  // ── Capabilities + intent ──
  r.get("/capabilities", async (req, res, next) => {
    try { const cap = req.query.capability as string; res.json({ ok: true, data: cap ? await CapabilityRegistry.listFor(oid(req), cap) : { note: "pass ?capability=..." } }); } catch (e) { next(e); }
  });
  r.post("/capabilities/route", validate({ body: Execute.pick({ capability: true, maxCost: true, preferredPluginId: true }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CapabilityRegistry.route({ organizationId: oid(req), userId: uid(req), ...req.body }) }); } catch (e) { next(e); }
  });
  r.post("/capabilities/execute", validate({ body: Execute }), async (req, res, next) => {
    try { res.json({ ok: true, data: await CapabilityRegistry.execute({ organizationId: oid(req), userId: uid(req), ...req.body }) }); } catch (e) { next(e); }
  });
  r.post("/intent/resolve", validate({ body: Resolve }), async (req, res, next) => {
    try { res.json({ ok: true, data: await IntentEngine.resolve(oid(req), uid(req), req.body.prompt) }); } catch (e) { next(e); }
  });
  r.post("/preferences", validate({ body: Prefs }), async (req, res, next) => {
    try { await CapabilityRegistry.setPreferences(oid(req), uid(req), req.body); res.json({ ok: true }); } catch (e) { next(e); }
  });

  router.use("/plugins", r);
}
