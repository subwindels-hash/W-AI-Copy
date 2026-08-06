/**
 * Multi-Provider Payment Gateways & Crypto Routes — Session 128
 *
 * Implements endpoints for:
 *   - Universal Checkout (`POST /checkout`) & Config (`GET /providers`)
 *   - Flutterwave (`/flutterwave/initialize`, `/verify/:reference`, `/webhook`)
 *   - Paystack (`/paystack/initialize`, `/verify/:reference`, `/webhook`)
 *   - PayPal (`/paypal/create-order`, `/capture-order`, `/webhook`)
 *   - Blockonomics / Crypto (`/crypto/create-charge`, `/charge/:id`, `/callback`)
 *   - Organization Transactions Ledger (`GET /transactions`, `GET /transactions/:id`)
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { PaymentGatewaysService } from "../../payments/payments.service.js";
import { FlutterwaveService } from "../../payments/flutterwave.service.js";
import { PaystackService } from "../../payments/paystack.service.js";
import { PayPalService } from "../../payments/paypal.service.js";
import { CryptoPaymentsService, CRYPTO_NETWORK_CONFIRMATIONS } from "../../payments/crypto.service.js";
import {
  PaymentCheckoutRequestSchema,
  CryptoAddressRequestSchema,
  type PaymentProvider,
  type CryptoNetwork,
} from "@windels/shared";

export function registerPaymentsRoutes(router: Router) {
  const payments = Router();

  // 1. Configured Providers & Status
  payments.get("/providers", async (req, res, next) => {
    try {
      const providers = await PaymentGatewaysService.listProviders();
      res.json({ ok: true, data: providers, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  // 2. Organization Transactions Ledger
  payments.get("/transactions", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      const orgId = user.organizationId ?? "org-payments-default";

      const txs = await PaymentGatewaysService.listTransactions(orgId, req.query as any);
      res.json({ ok: true, data: txs, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  // 3. Single Transaction Detail
  payments.get("/transactions/:id", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      const orgId = user.organizationId ?? "org-payments-default";

      const tx = await PaymentGatewaysService.getTransaction(orgId, req.params.id);
      if (!tx) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Transaction not found in organization" } });
      }

      res.json({ ok: true, data: tx, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  // 4. Universal Checkout Initiator
  payments.post("/checkout", validate({ body: PaymentCheckoutRequestSchema }), async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      const orgId = user.organizationId ?? "org-payments-default";

      const tx = await PaymentGatewaysService.initiateCheckout(orgId, {
        ...req.body,
        customerEmail: req.body.customerEmail || user.email,
      });

      res.status(201).json({ ok: true, data: tx, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  // ─── Flutterwave Gateways ──────────────────────────────────────────────────
  payments.post("/flutterwave/initialize", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      const orgId = user.organizationId ?? "org-payments-default";

      const tx = await PaymentGatewaysService.initiateCheckout(orgId, {
        provider: "flutterwave",
        amount: Number(req.body.amount || 100),
        currency: req.body.currency || "NGN",
        invoiceId: req.body.invoiceId,
        description: req.body.description,
        customerEmail: req.body.customerEmail || user.email,
      });
      res.status(201).json({ ok: true, data: tx, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  payments.get("/flutterwave/verify/:reference", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      const orgId = user.organizationId ?? "org-payments-default";

      const flw = await FlutterwaveService.verifyPayment(req.params.reference, req.query.transaction_id as string);
      const settled = await PaymentGatewaysService.settleTransaction(orgId, req.params.reference, flw.status, flw as any);
      res.json({ ok: true, data: settled || flw, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  payments.post("/flutterwave/webhook", async (req, res, next) => {
    try {
      const hash = req.headers["verif-hash"] as string | undefined;
      if (!FlutterwaveService.verifyWebhookSignature(hash)) {
        return res.status(401).json({ ok: false, error: "Invalid Flutterwave webhook signature" });
      }

      const txRef = req.body?.data?.tx_ref || req.body?.tx_ref;
      const status = req.body?.data?.status === "successful" ? "completed" : "failed";
      if (txRef) {
        // Resolve orgId from reference or default
        await PaymentGatewaysService.settleTransaction("org-payments-default", txRef, status, req.body);
      }
      res.json({ ok: true, data: { received: true } });
    } catch (e) {
      next(e);
    }
  });

  // ─── Paystack Gateways ─────────────────────────────────────────────────────
  payments.post("/paystack/initialize", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      const orgId = user.organizationId ?? "org-payments-default";

      const tx = await PaymentGatewaysService.initiateCheckout(orgId, {
        provider: "paystack",
        amount: Number(req.body.amount || 100),
        currency: req.body.currency || "NGN",
        invoiceId: req.body.invoiceId,
        description: req.body.description,
        customerEmail: req.body.customerEmail || user.email,
      });
      res.status(201).json({ ok: true, data: tx, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  payments.get("/paystack/verify/:reference", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      const orgId = user.organizationId ?? "org-payments-default";

      const pys = await PaystackService.verifyPayment(req.params.reference);
      const settled = await PaymentGatewaysService.settleTransaction(orgId, req.params.reference, pys.status, pys as any);
      res.json({ ok: true, data: settled || pys, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  payments.post("/paystack/webhook", async (req, res, next) => {
    try {
      const signature = req.headers["x-paystack-signature"] as string | undefined;
      const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      if (!PaystackService.verifyWebhookSignature(signature, rawBody)) {
        return res.status(401).json({ ok: false, error: "Invalid Paystack webhook signature" });
      }

      const ref = req.body?.data?.reference;
      const status = req.body?.event === "charge.success" ? "completed" : "failed";
      if (ref) {
        await PaymentGatewaysService.settleTransaction("org-payments-default", ref, status, req.body);
      }
      res.json({ ok: true, data: { received: true } });
    } catch (e) {
      next(e);
    }
  });

  // ─── PayPal Gateways ───────────────────────────────────────────────────────
  payments.post("/paypal/create-order", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      const orgId = user.organizationId ?? "org-payments-default";

      const tx = await PaymentGatewaysService.initiateCheckout(orgId, {
        provider: "paypal",
        amount: Number(req.body.amount || 10),
        currency: req.body.currency || "USD",
        invoiceId: req.body.invoiceId,
        description: req.body.description,
      });
      res.status(201).json({ ok: true, data: tx, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  payments.post("/paypal/capture-order", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      const orgId = user.organizationId ?? "org-payments-default";

      const orderId = req.body.orderId;
      const cap = await PayPalService.captureOrder(orderId);
      const settled = await PaymentGatewaysService.settleTransaction(orgId, orderId, cap.status, cap as any);
      res.json({ ok: true, data: settled || cap, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  payments.post("/paypal/webhook", async (req, res, next) => {
    try {
      const sig = req.headers["paypal-transmission-sig"] as string | undefined;
      const id = req.headers["paypal-transmission-id"] as string | undefined;
      const time = req.headers["paypal-transmission-time"] as string | undefined;
      const cert = req.headers["paypal-cert-url"] as string | undefined;
      const algo = req.headers["paypal-auth-algo"] as string | undefined;

      if (!PayPalService.verifyWebhookSignature(algo, cert, id, sig, time)) {
        return res.status(401).json({ ok: false, error: "Invalid PayPal webhook signature" });
      }

      const orderId = req.body?.resource?.id;
      const eventType = req.body?.event_type;
      const status = eventType === "CHECKOUT.ORDER.APPROVED" || eventType === "PAYMENT.CAPTURE.COMPLETED" ? "completed" : "failed";
      if (orderId) {
        await PaymentGatewaysService.settleTransaction("org-payments-default", orderId, status, req.body);
      }
      res.json({ ok: true, data: { received: true } });
    } catch (e) {
      next(e);
    }
  });

  // ─── Blockonomics / Multi-Chain Crypto Gateways ─────────────────────────────
  payments.post("/crypto/create-charge", validate({ body: CryptoAddressRequestSchema }), async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      const orgId = user.organizationId ?? "org-payments-default";

      const tx = await PaymentGatewaysService.initiateCheckout(orgId, {
        provider: "crypto",
        amount: Number(req.body.amount || 50),
        currency: req.body.currency || "USD",
        invoiceId: req.body.invoiceId,
        description: req.body.description,
        cryptoNetwork: req.body.network as CryptoNetwork,
      });

      res.status(201).json({ ok: true, data: tx, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  payments.get("/crypto/charge/:id", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
      const orgId = user.organizationId ?? "org-payments-default";

      const tx = await PaymentGatewaysService.getTransaction(orgId, req.params.id);
      if (!tx || tx.provider !== "crypto") {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Crypto charge not found" } });
      }

      res.json({ ok: true, data: tx, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  payments.post("/crypto/callback", async (req, res, next) => {
    try {
      const secret = (req.query.secret || req.body?.secret || req.headers["x-blockonomics-secret"]) as string | undefined;
      if (!CryptoPaymentsService.verifyCallbackSecret(secret)) {
        return res.status(401).json({ ok: false, error: "Invalid Blockonomics callback secret" });
      }

      const txid = req.query.txid || req.body?.txid;
      const confirmations = Number(req.query.confirmations || req.body?.confirmations || 0);
      const addr = req.query.addr || req.body?.addr;

      // Find matching crypto transaction by cryptoAddress
      const all = await PaymentGatewaysService.listTransactions("org-payments-default", { provider: "crypto", limit: 200 });
      const match = all.find((x) => x.cryptoAddress === addr || x.id === txid);

      if (match) {
        const reqConfs = match.requiredConfirmations || CRYPTO_NETWORK_CONFIRMATIONS[match.cryptoNetwork || "btc"] || 1;
        const status = CryptoPaymentsService.isConfirmed(confirmations, reqConfs) ? "completed" : "pending";
        await PaymentGatewaysService.settleTransaction(match.organizationId, match.id, status, {
          confirmations,
          txid,
        });
      }

      res.json({ ok: true, data: { received: true, confirmations } });
    } catch (e) {
      next(e);
    }
  });

  router.use("/payments", payments);
}
