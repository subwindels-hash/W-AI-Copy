/** Session 70 — Global Command Center */
import { Router } from "express";
import { z } from "zod";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { CommandService } from "../../command/command.service.js";
import { tenantStore } from "../../utils/tenantStore.js";

// Real command-center directives — persistent tenant-scoped log of decisions
// issued from the global command view.
const directives = tenantStore<{
  scope: "global" | "region" | "workspace" | "team";
  targetRef?: string;
  title: string;
  body: string;
  severity: "info" | "warn" | "critical";
  status: "issued" | "acknowledged" | "resolved" | "cancelled";
}>({ prefix: "cmd:dir", idPrefix: "cmd-" });

const DirectiveSchema = z.object({
  scope: z.enum(["global", "region", "workspace", "team"]),
  targetRef: z.string().max(200).optional(),
  title: z.string().min(2).max(200),
  body: z.string().min(2).max(4000),
  severity: z.enum(["info", "warn", "critical"]).default("info"),
});
const StatusSchema = z.object({ status: z.enum(["acknowledged", "resolved", "cancelled"]) });
const Id = z.object({ id: z.string().min(3).max(64) });

export function registerCommandRoutes(router: Router) {
  router.use(authenticate);

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      const [rollup, dirs] = await Promise.all([
        CommandService.dashboard(oid),
        directives.list(oid, 50),
      ]);
      res.json({ ok: true, data: { ...rollup, directives: dirs.map((d) => ({ id: d.id, createdAt: d.createdAt, ...d.data })) } });
    } catch (e) { next(e); }
  });

  router.get("/directives", async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      res.json({ ok: true, data: (await directives.list(oid, 200)).map((d) => ({ id: d.id, createdAt: d.createdAt, ...d.data })) });
    } catch (e) { next(e); }
  });

  router.post("/directives", requireAdmin, validate({ body: DirectiveSchema }), async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      const rec = await directives.create(oid, { ...req.body, status: "issued" }, (req.user as any).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.patch("/directives/:id/status", requireAdmin, validate({ params: Id, body: StatusSchema }), async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      const rec = await directives.update(oid, req.params.id, { status: req.body.status });
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, ...rec.data } });
    } catch (e) { next(e); }
  });
}
