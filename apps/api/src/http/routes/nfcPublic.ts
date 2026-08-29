import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireScope } from "../middleware/apiKeyAuth.js";
import { AppError } from "../../utils/result.js";
import { nfcService, type ActorContext } from "../../nfc/nfc.service.js";
import { MutationBase, ProfileSchema, ReadSchema, VerifySchema, WriteSchema } from "./nfc.js";

const Id = z.object({ id: z.string().cuid() });
function actor(req: any): ActorContext {
  const userId = req.apiUser?.id;
  const organizationId = req.apiOrganization?.id;
  if (!userId || !organizationId) throw AppError.forbidden("This API key is not linked to an active WINDELS user and organization");
  return { userId, organizationId };
}

/**
 * API-key authenticated NFC orchestration surface.
 *
 * This API authorizes and verifies operations; it does not pretend a cloud
 * server can touch local NFC hardware. The authorized client must pass the plan
 * to a WINDELS hardware adapter and submit its read-back result to /verify.
 */
export function registerPublicNfcRoutes(router: Router) {
  router.get("/nfc/readers", requireScope("nfc:read"), async (req, res, next) => {
    try { res.json({ ok: true, data: await nfcService.listReaders(actor(req)) }); } catch (error) { next(error); }
  });
  router.get("/nfc/cards", requireScope("nfc:read"), async (req, res, next) => {
    try { res.json({ ok: true, data: await nfcService.listCards(actor(req)) }); } catch (error) { next(error); }
  });
  router.get("/nfc/cards/:id", requireScope("nfc:read"), validate({ params: Id }), async (req, res, next) => {
    try { res.json({ ok: true, data: await nfcService.getCard(actor(req), req.params.id) }); } catch (error) { next(error); }
  });
  router.get("/nfc/operations", requireScope("nfc:read"), validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await nfcService.listOperations(actor(req), Number(req.query.limit)) }); } catch (error) { next(error); }
  });
  router.get("/nfc/templates", requireScope("nfc:read"), (_req, res) => res.json({ ok: true, data: nfcService.templates() }));
  router.get("/nfc/profiles", requireScope("nfc:read"), async (req, res, next) => {
    try { res.json({ ok: true, data: await nfcService.listProfiles(actor(req)) }); } catch (error) { next(error); }
  });
  router.post("/nfc/profiles", requireScope("nfc:write"), validate({ body: ProfileSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await nfcService.createProfile(actor(req), req.body) }); } catch (error) { next(error); }
  });
  router.post("/nfc/read", requireScope("nfc:write"), validate({ body: ReadSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await nfcService.observeCard(actor(req), req.body) }); } catch (error) { next(error); }
  });

  const prepare = (operationType: "WRITE" | "UPDATE" | "ERASE" | "LOCK" | "PROTECT") => async (req: any, res: any, next: any) => {
    try { res.status(201).json({ ok: true, data: await nfcService.prepareMutation(actor(req), { ...req.body, operationType }) }); } catch (error) { next(error); }
  };
  router.post("/nfc/write", requireScope("nfc:write"), validate({ body: WriteSchema }), prepare("WRITE"));
  router.post("/nfc/update", requireScope("nfc:write"), validate({ body: WriteSchema }), prepare("UPDATE"));
  router.post("/nfc/erase", requireScope("nfc:admin"), validate({ body: MutationBase }), prepare("ERASE"));
  router.post("/nfc/lock", requireScope("nfc:admin"), validate({ body: MutationBase }), prepare("LOCK"));
  router.post("/nfc/protect", requireScope("nfc:admin"), validate({ body: MutationBase }), prepare("PROTECT"));
  router.post("/nfc/verify", requireScope("nfc:write", "nfc:admin"), validate({ body: VerifySchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await nfcService.verifyMutation(actor(req), req.body) }); } catch (error) { next(error); }
  });
}
