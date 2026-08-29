import { Router } from "express";
import { z } from "zod";
import { Permission } from "@prisma/client";
import { NfcCapabilitySchema, NfcRecordListSchema } from "@windels/shared/nfc";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { requirePerm } from "../../services/permissions.service.js";
import { AppError } from "../../utils/result.js";
import { nfcService, type ActorContext } from "../../nfc/nfc.service.js";

const Id = z.object({ id: z.string().cuid() });
export const ReaderSchema = z.object({
  localId: z.string().min(1).max(512),
  name: z.string().min(1).max(200),
  vendor: z.string().max(120).optional(),
  product: z.string().max(120).optional(),
  interfaceType: z.enum(["PCSC", "WEB_NFC", "ANDROID_NATIVE", "IOS_CORE_NFC", "READER_SDK"]),
  bridgeVersion: z.string().max(50).optional(),
  platform: z.string().max(100).optional(),
  status: z.enum(["ONLINE", "OFFLINE", "ERROR"]),
  capabilities: z.record(z.unknown()).optional(),
  error: z.string().max(1000).optional(),
});
export const ReadSchema = z.object({
  reader: ReaderSchema,
  hardwareCardKey: z.string().min(1).max(512),
  uid: z.string().max(128).optional(),
  name: z.string().min(1).max(120).optional(),
  technology: z.string().max(120).optional(),
  identificationConfidence: z.enum(["PROTOCOL_VERIFIED", "SDK_VERIFIED", "ATR_FAMILY_ONLY", "UNKNOWN"]),
  capabilities: NfcCapabilitySchema,
  ndefMessageBase64: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/).max(32_768).optional(),
  hardwareEvidence: z.record(z.unknown()).optional(),
});
export const MutationBase = z.object({
  cardId: z.string().cuid(),
  readerId: z.string().cuid(),
  idempotencyKey: z.string().min(12).max(160),
  previousNdefHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  overwriteConfirmed: z.boolean().default(false),
  irreversibleConfirmed: z.boolean().default(false),
  confirmationPhrase: z.string().max(40).optional(),
});
export const WriteSchema = MutationBase.extend({ records: NfcRecordListSchema });
export const VerifySchema = z.object({
  operationId: z.string().cuid(),
  operationToken: z.string().min(32).max(128),
  hardwareSucceeded: z.boolean(),
  readbackNdefBase64: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/).max(32_768).optional(),
  lockStatus: z.enum(["UNLOCKED", "LOCKED", "PARTIALLY_LOCKED", "UNKNOWN"]).optional(),
  protected: z.boolean().optional(),
  hardwareEvidence: z.record(z.unknown()).optional(),
  errorCode: z.string().max(100).optional(),
  errorMessage: z.string().max(1000).optional(),
});
const QualificationSchema = z.object({
  technology: z.string().min(2).max(120),
  hardwareTestRunId: z.string().min(8).max(160),
  testedAt: z.string().datetime(),
  readerDetectionPassed: z.literal(true),
  cardDetectionPassed: z.literal(true),
  readPassed: z.literal(true),
  writePassed: z.boolean(),
  verifyPassed: z.boolean(),
  erasePassed: z.boolean().optional(),
  lockPassed: z.boolean().optional(),
  protectPassed: z.boolean().optional(),
  notes: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.writePassed && !value.verifyPassed) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["verifyPassed"], message: "A write cannot be qualified without successful read-back verification" });
});
export const ProfileSchema = z.object({
  name: z.string().min(1).max(120),
  profileType: z.enum(["PERSONAL", "BUSINESS", "COMPANY", "VENDOR", "PRODUCT", "EVENT", "SOCIAL", "WINDELS"]),
  targetType: z.enum(["USER_PROFILE", "ORGANIZATION", "MARKETPLACE_VENDOR", "MARKETPLACE_PRODUCT", "EVENT", "URL"]),
  targetId: z.string().max(160).optional(),
  secureUrl: z.string().url().max(2048),
  metadata: z.record(z.unknown()).optional(),
});

function actor(req: any): ActorContext {
  if (!req.user?.organizationId) throw AppError.forbidden("An organization context is required for NFC operations");
  return { userId: req.user.id, organizationId: req.user.organizationId };
}
function meta(req: any) { return { requestId: req.requestId, tookMs: Date.now() - req.startedAt }; }

/** Authenticated, tenant-scoped NFC Card Manager API. Hardware execution stays local. */
export function registerNfcRoutes(parent: Router) {
  const router = Router();
  router.use(authenticate);

  router.get("/readers", requirePerm(Permission.NFC_READ), async (req, res, next) => {
    try { res.json({ ok: true, data: await nfcService.listReaders(actor(req)), meta: meta(req) }); } catch (error) { next(error); }
  });
  router.post("/readers/report", requirePerm(Permission.NFC_READ), validate({ body: ReaderSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await nfcService.reportReader(actor(req), req.body), meta: meta(req) }); } catch (error) { next(error); }
  });
  router.post("/readers/:id/qualify", requirePerm(Permission.NFC_ADMIN), validate({ params: Id, body: QualificationSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await nfcService.qualifyReader(actor(req), req.params.id, req.body), meta: meta(req) }); } catch (error) { next(error); }
  });

  router.get("/cards", requirePerm(Permission.NFC_READ), async (req, res, next) => {
    try { res.json({ ok: true, data: await nfcService.listCards(actor(req)), meta: meta(req) }); } catch (error) { next(error); }
  });
  router.get("/cards/:id", requirePerm(Permission.NFC_READ), validate({ params: Id }), async (req, res, next) => {
    try { res.json({ ok: true, data: await nfcService.getCard(actor(req), req.params.id), meta: meta(req) }); } catch (error) { next(error); }
  });
  router.patch("/cards/:id", requirePerm(Permission.NFC_WRITE), validate({ params: Id, body: z.object({ name: z.string().min(1).max(120).optional(), profileId: z.string().cuid().nullable().optional(), assignedUserId: z.string().cuid().nullable().optional(), status: z.enum(["ACTIVE", "INACTIVE", "LOST", "RETIRED"]).optional() }).refine((body) => Object.keys(body).length > 0) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await nfcService.updateCard(actor(req), req.params.id, req.body), meta: meta(req) }); } catch (error) { next(error); }
  });

  // A read is a hardware observation from the Web NFC/mobile/desktop adapter.
  // Raw UIDs are accepted only in transit and immediately HMAC-hashed/masked.
  router.post("/read", requirePerm(Permission.NFC_READ), validate({ body: ReadSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await nfcService.observeCard(actor(req), req.body), meta: meta(req) }); } catch (error) { next(error); }
  });

  const prepare = (operationType: "WRITE" | "UPDATE" | "ERASE" | "LOCK" | "PROTECT") => async (req: any, res: any, next: any) => {
    try { res.status(201).json({ ok: true, data: await nfcService.prepareMutation(actor(req), { ...req.body, operationType }), meta: meta(req) }); } catch (error) { next(error); }
  };
  router.post("/write", requirePerm(Permission.NFC_WRITE), validate({ body: WriteSchema }), prepare("WRITE"));
  router.post("/update", requirePerm(Permission.NFC_WRITE), validate({ body: WriteSchema }), prepare("UPDATE"));
  router.post("/erase", requirePerm(Permission.NFC_DESTRUCTIVE), validate({ body: MutationBase }), prepare("ERASE"));
  router.post("/lock", requirePerm(Permission.NFC_DESTRUCTIVE), validate({ body: MutationBase }), prepare("LOCK"));
  router.post("/protect", requirePerm(Permission.NFC_DESTRUCTIVE), validate({ body: MutationBase }), prepare("PROTECT"));
  router.post("/verify", requirePerm(Permission.NFC_WRITE), validate({ body: VerifySchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await nfcService.verifyMutation(actor(req), req.body), meta: meta(req) }); } catch (error) { next(error); }
  });

  router.get("/operations", requirePerm(Permission.NFC_READ), validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await nfcService.listOperations(actor(req), Number(req.query.limit)), meta: meta(req) }); } catch (error) { next(error); }
  });
  router.get("/templates", requirePerm(Permission.NFC_READ), (req, res) => res.json({ ok: true, data: nfcService.templates(), meta: meta(req) }));
  router.get("/profiles", requirePerm(Permission.NFC_READ), async (req, res, next) => {
    try { res.json({ ok: true, data: await nfcService.listProfiles(actor(req)), meta: meta(req) }); } catch (error) { next(error); }
  });
  router.post("/profiles", requirePerm(Permission.NFC_WRITE), validate({ body: ProfileSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await nfcService.createProfile(actor(req), req.body), meta: meta(req) }); } catch (error) { next(error); }
  });

  router.get("/diagnostics", requirePerm(Permission.NFC_READ), async (req, res, next) => {
    try {
      const readers = await nfcService.listReaders(actor(req));
      res.json({ ok: true, data: {
        moduleStatus: "HARDWARE_VALIDATION_REQUIRED",
        readers,
        checks: [
          { code: "READER_NOT_DETECTED", guidance: "Install the reader vendor driver/PCSC service, reconnect USB, then restart the WINDELS Desktop hardware adapter." },
          { code: "CARD_NOT_DETECTED", guidance: "Keep one tag centered on the reader and confirm the reader supports its ISO/IEC 14443 family." },
          { code: "UNQUALIFIED_COMBINATION", guidance: "Run and record real read/write/read-back tests for this exact reader, driver, OS, and card technology before enabling writes." },
          { code: "INSUFFICIENT_MEMORY", guidance: "Use a shorter secure profile URL, remove records, or select a verified higher-capacity tag." },
          { code: "LOCKED_CARD", guidance: "A permanently locked tag cannot be made writable by WINDELS. Use a different tag." },
          { code: "DRIVER_INTERFACE", guidance: "Verify PC/SC Smart Card service status and the reader's vendor SDK/driver architecture." },
        ],
      }, meta: meta(req) });
    } catch (error) { next(error); }
  });

  parent.use("/nfc", router);
}
