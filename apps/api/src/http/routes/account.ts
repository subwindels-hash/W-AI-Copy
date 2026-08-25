import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  AccountAvatarSchema,
  AccountEmailSchema,
  AccountPasswordSchema,
  AccountPinSetSchema,
  AccountProfileSchema,
  AccountUsernameSchema,
} from "@windels/shared/account";
import {
  changeEmail,
  changePassword,
  changeUsername,
  confirmEmailChange,
  getAccount,
  setPin,
  updateProfile,
  uploadAvatar,
} from "../../services/account.service.js";

export function registerAccountRoutes(router: Router) {
  const account = Router();
  account.use(authenticate);

  account.get("/", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await getAccount(req.user!.id), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  account.patch("/username", rateLimit("apiGlobal"), validate({ body: AccountUsernameSchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await changeUsername(req.user!.id, req.body.username), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  account.patch("/email", rateLimit("apiGlobal"), validate({ body: AccountEmailSchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await changeEmail(req.user!.id, req.body.email), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  account.post("/email/confirm", validate({ body: z.object({ token: z.string().min(10) }) }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await confirmEmailChange(req.body.token, req.user!.id), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  account.post("/password", rateLimit("apiGlobal"), validate({ body: AccountPasswordSchema }), async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword, req.body.confirmPassword),
        meta: { requestId: req.requestId },
      });
    } catch (e) { next(e); }
  });

  account.post("/pin", rateLimit("apiGlobal"), validate({ body: AccountPinSetSchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await setPin(req.user!.id, req.body), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  account.patch("/profile", validate({ body: AccountProfileSchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await updateProfile(req.user!.id, req.body), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  account.post("/avatar", validate({ body: AccountAvatarSchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await uploadAvatar(req.user!.id, req.body.mime, req.body.dataBase64), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.use("/account", account);
}
