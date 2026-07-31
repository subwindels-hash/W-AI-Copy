/** Session 59 — Enterprise AI OS SDK routes */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { SdkService } from "../../sdk/sdk.service.js";
import { SDK_KINDS } from "@windels/shared";

const EmuSchema = z.object({ name: z.string().min(2), sdkKind: z.enum(SDK_KINDS), port: z.number().int().min(1024).max(65535).optional() });
const ProfileSchema = z.object({ target: z.string().min(2) });

export function registerSdkRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok:true, data: await SdkService.dashboard((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/cli", (_req, res) => res.json({ ok:true, data: SdkService.listCommands() }));
  router.get("/templates", (_req, res) => res.json({ ok:true, data: SdkService.listTemplates() }));
  router.post("/emulators", validate({ body: EmuSchema }), async (req, res, next) => { try { res.json({ ok:true, data: await SdkService.startEmulator({ ...req.body, organizationId: (req.user as any).organizationId }) }); } catch (e) { next(e); } });
  router.post("/profiler", validate({ body: ProfileSchema }), async (req, res, next) => { try { res.json({ ok:true, data: await SdkService.runProfiler({ ...req.body, organizationId: (req.user as any).organizationId }) }); } catch (e) { next(e); } });
}
