/** Fail-closed multi-provider payment routes. */
import { createHash } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { PaymentGatewaysService, type VerifiedPaymentEvidence } from "../../payments/payments.service.js";
import { FlutterwaveService } from "../../payments/flutterwave.service.js";
import { PaystackService } from "../../payments/paystack.service.js";
import { StripeService } from "../../payments/stripe.service.js";
import { PayPalService } from "../../payments/paypal.service.js";
import { CryptoPaymentsService } from "../../payments/crypto.service.js";
import { AppError } from "../../utils/result.js";
import {
  PaymentCheckoutRequestSchema,
  CryptoAddressRequestSchema,
  PAYMENT_PROVIDERS,
  PAYMENT_TRANSACTION_STATUSES,
  type PaymentProvider,
} from "@windels/shared";

const GatewayCheckoutSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().trim().min(3).max(3),
  invoiceId: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  customerEmail: z.string().email().optional(),
});
const TransactionQuerySchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS).optional(),
  status: z.enum(PAYMENT_TRANSACTION_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
const CaptureSchema = z.object({ orderId: z.string().trim().min(1).max(200) });

function organization(req: Request): { id: string; email: string } {
  if (!req.user) throw AppError.unauthorized();
  if (!req.user.organizationId) throw AppError.forbidden("An organization context is required for payments");
  return { id: req.user.organizationId, email: req.user.email };
}
function rawBody(req: Request): Buffer {
  return (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
}
function webhookEventId(provider: string, req: Request, candidate?: unknown): string {
  const supplied = typeof candidate === "string" || typeof candidate === "number" ? String(candidate) : "";
  if (supplied) return `${provider}:${supplied}`;
  return `${provider}:sha256:${createHash("sha256").update(rawBody(req)).digest("hex")}`;
}
async function once(provider: PaymentProvider, eventId: string, work: () => Promise<void>): Promise<boolean> {
  const claimed = await PaymentGatewaysService.claimWebhookEvent(provider, eventId);
  if (!claimed) return false;
  try { await work(); return true; }
  catch (error) { await PaymentGatewaysService.releaseWebhookEvent(provider, eventId); throw error; }
}
async function applyForAuthenticatedOrg(req: Request, evidence: VerifiedPaymentEvidence) {
  const org = organization(req);
  return PaymentGatewaysService.applyVerifiedResult(org.id, evidence.reference, evidence);
}
async function applyForIndexedReference(evidence: VerifiedPaymentEvidence) {
  const tx = await PaymentGatewaysService.resolveProviderTransaction(evidence.provider, evidence.reference);
  if (!tx) return null;
  return PaymentGatewaysService.applyVerifiedResult(tx.organizationId, tx.reference, evidence);
}

export function registerPaymentsRoutes(router: Router) {
  const payments = Router();

  payments.get("/providers", async (req, res, next) => {
    try { res.json({ ok: true, data: await PaymentGatewaysService.listProviders(), meta: { requestId: req.requestId } }); }
    catch (error) { next(error); }
  });

  payments.get("/transactions", validate({ query: TransactionQuerySchema }), async (req, res, next) => {
    try {
      const org = organization(req);
      res.json({ ok: true, data: await PaymentGatewaysService.listTransactions(org.id, req.query as any), meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  payments.get("/transactions/:id", async (req, res, next) => {
    try {
      const org = organization(req);
      const tx = await PaymentGatewaysService.getTransaction(org.id, req.params.id);
      if (!tx) throw AppError.notFound("Transaction not found in organization");
      res.json({ ok: true, data: tx, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  payments.post("/checkout", validate({ body: PaymentCheckoutRequestSchema }), async (req, res, next) => {
    try {
      const org = organization(req);
      const tx = await PaymentGatewaysService.initiateCheckout(org.id, { ...req.body, customerEmail: req.body.customerEmail || org.email });
      res.status(201).json({ ok: true, data: tx, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  const initialize = (provider: Exclude<PaymentProvider, "crypto">) => [
    validate({ body: GatewayCheckoutSchema }),
    async (req: Request, res: any, next: any) => {
      try {
        const org = organization(req);
        const tx = await PaymentGatewaysService.initiateCheckout(org.id, { ...req.body, provider, customerEmail: req.body.customerEmail || org.email });
        res.status(201).json({ ok: true, data: tx, meta: { requestId: req.requestId } });
      } catch (error) { next(error); }
    },
  ] as const;
  payments.post("/flutterwave/initialize", ...initialize("flutterwave"));
  payments.post("/paystack/initialize", ...initialize("paystack"));
  payments.post("/stripe/initialize", ...initialize("stripe"));
  payments.post("/paypal/create-order", ...initialize("paypal"));

  payments.get("/flutterwave/verify/:reference", async (req, res, next) => {
    try {
      const result = await FlutterwaveService.verifyPayment(req.params.reference, req.query.transaction_id as string | undefined);
      res.json({ ok: true, data: await applyForAuthenticatedOrg(req, { ...result, verificationSource: "provider_api" }), meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  payments.get("/paystack/verify/:reference", async (req, res, next) => {
    try {
      const result = await PaystackService.verifyPayment(req.params.reference);
      res.json({ ok: true, data: await applyForAuthenticatedOrg(req, { ...result, verificationSource: "provider_api" }), meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  payments.get("/stripe/verify/:reference", async (req, res, next) => {
    try {
      const org = organization(req);
      const tx = await PaymentGatewaysService.getTransactionByRef(org.id, req.params.reference);
      if (!tx || tx.provider !== "stripe") throw AppError.notFound("Stripe transaction not found in organization");
      const sessionId = (req.query.session_id as string | undefined) || String((tx.metadata as any)?.sessionId ?? "") || undefined;
      const result = await StripeService.verifyPayment(req.params.reference, sessionId);
      res.json({ ok: true, data: await PaymentGatewaysService.applyVerifiedResult(org.id, req.params.reference, { ...result, verificationSource: "provider_api" }), meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  payments.post("/paypal/capture-order", validate({ body: CaptureSchema }), async (req, res, next) => {
    try {
      const result = await PayPalService.captureOrder(req.body.orderId);
      res.json({ ok: true, data: await applyForAuthenticatedOrg(req, { ...result, verificationSource: "provider_api" }), meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  payments.post("/flutterwave/webhook", async (req, res, next) => {
    try {
      if (!FlutterwaveService.verifyWebhookSignature(req.headers["verif-hash"] as string | undefined)) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid Flutterwave webhook signature" } });
      const reference = String(req.body?.data?.tx_ref ?? req.body?.tx_ref ?? "");
      const transactionId = String(req.body?.data?.id ?? req.body?.id ?? "");
      if (!reference || !transactionId) throw AppError.badRequest("Flutterwave webhook is missing transaction ID or reference");
      const eventId = webhookEventId("flutterwave", req, req.body?.id ?? `${transactionId}:${req.body?.data?.status ?? "update"}`);
      const processed = await once("flutterwave", eventId, async () => {
        const result = await FlutterwaveService.verifyPayment(reference, transactionId);
        await applyForIndexedReference({ ...result, verificationSource: "provider_api", eventId });
      });
      res.json({ ok: true, data: { received: true, duplicate: !processed } });
    } catch (error) { next(error); }
  });

  payments.post("/paystack/webhook", async (req, res, next) => {
    try {
      if (!PaystackService.verifyWebhookSignature(req.headers["x-paystack-signature"] as string | undefined, rawBody(req))) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid Paystack webhook signature" } });
      const reference = String(req.body?.data?.reference ?? "");
      if (!reference) throw AppError.badRequest("Paystack webhook is missing a reference");
      const eventId = webhookEventId("paystack", req, `${req.body?.event ?? "event"}:${req.body?.data?.id ?? reference}`);
      const processed = await once("paystack", eventId, async () => {
        const result = await PaystackService.verifyPayment(reference);
        await applyForIndexedReference({ ...result, verificationSource: "provider_api", eventId });
      });
      res.json({ ok: true, data: { received: true, duplicate: !processed } });
    } catch (error) { next(error); }
  });

  payments.post("/stripe/webhook", async (req, res, next) => {
    try {
      if (!StripeService.verifyWebhookSignature(req.headers["stripe-signature"] as string | undefined, rawBody(req))) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid Stripe webhook signature" } });
      const eventId = webhookEventId("stripe", req, req.body?.id);
      const processed = await once("stripe", eventId, async () => {
        const object = req.body?.data?.object;
        const reference = String(object?.client_reference_id ?? "");
        const sessionId = String(object?.id ?? "");
        if (!reference || !sessionId) throw AppError.badRequest("Stripe webhook is missing session or reference");
        const result = await StripeService.verifyPayment(reference, sessionId);
        await applyForIndexedReference({ ...result, verificationSource: "provider_api", eventId });
      });
      res.json({ ok: true, data: { received: true, duplicate: !processed } });
    } catch (error) { next(error); }
  });

  payments.post("/paypal/webhook", async (req, res, next) => {
    try {
      const valid = await PayPalService.verifyWebhookSignature({
        authAlgo: req.headers["paypal-auth-algo"] as string | undefined,
        certUrl: req.headers["paypal-cert-url"] as string | undefined,
        transmissionId: req.headers["paypal-transmission-id"] as string | undefined,
        transmissionSig: req.headers["paypal-transmission-sig"] as string | undefined,
        transmissionTime: req.headers["paypal-transmission-time"] as string | undefined,
      }, req.body);
      if (!valid) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid PayPal webhook signature" } });
      const eventId = webhookEventId("paypal", req, req.body?.id);
      const processed = await once("paypal", eventId, async () => {
        const eventType = String(req.body?.event_type ?? "");
        if (eventType !== "PAYMENT.CAPTURE.COMPLETED" && eventType !== "PAYMENT.CAPTURE.DENIED") return;
        const resource = req.body?.resource ?? {};
        const orderId = String(resource?.supplementary_data?.related_ids?.order_id ?? "");
        if (!orderId) throw AppError.badRequest("PayPal webhook is missing related order ID");
        const evidence: VerifiedPaymentEvidence = {
          verified: true,
          provider: "paypal",
          reference: orderId,
          status: eventType === "PAYMENT.CAPTURE.COMPLETED" ? "completed" : "failed",
          amount: Number(resource?.amount?.value),
          currency: String(resource?.amount?.currency_code ?? "").toUpperCase(),
          providerTransactionId: String(resource?.id ?? ""),
          verificationSource: "verified_webhook",
          eventId,
        };
        await applyForIndexedReference(evidence);
      });
      res.json({ ok: true, data: { received: true, duplicate: !processed } });
    } catch (error) { next(error); }
  });

  payments.post("/crypto/create-charge", validate({ body: CryptoAddressRequestSchema }), async (req, res, next) => {
    try {
      const org = organization(req);
      await PaymentGatewaysService.initiateCheckout(org.id, { provider: "crypto", amount: req.body.amount, currency: req.body.currency, invoiceId: req.body.invoiceId, description: req.body.description, cryptoNetwork: req.body.network });
      throw AppError.internal("Crypto safety gate did not refuse checkout");
    } catch (error) { next(error); }
  });

  payments.get("/crypto/charge/:id", async (req, res, next) => {
    try {
      const org = organization(req);
      const tx = await PaymentGatewaysService.getTransaction(org.id, req.params.id);
      if (!tx || tx.provider !== "crypto") throw AppError.notFound("Crypto charge not found");
      res.json({ ok: true, data: tx, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  payments.post("/crypto/callback", async (_req, _res, next) => {
    next(new AppError("SERVICE_UNAVAILABLE", "Crypto callbacks are disabled until an on-chain verifier is implemented", 503, { code: "PAYMENT_PROVIDER_BLOCKED", provider: "crypto" }));
  });

  router.use("/payments", payments);
}
