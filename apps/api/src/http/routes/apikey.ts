import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import type { ApiEnvelope } from "@windels/shared/api";

export function registerApiKeyRoutes(router: Router) {
  const keys = Router();
  keys.use(authenticate);
  keys.post("/", validate({ body: z.object({ name: z.string().min(1), scopes: z.array(z.string()).optional() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: { key: "ak_" + Date.now() }, meta: { requestId: req.requestId ?? "" } }); } catch (e) { next(e); }
  });
  router.use("/apikeys", keys);
}
