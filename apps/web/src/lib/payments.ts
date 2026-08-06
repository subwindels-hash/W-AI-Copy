/**
 * Multi-Provider Payment Gateways web client (routes/payments.ts → /api/v1/payments).
 *
 * Provides typed functions for:
 *   - Provider status & supported currencies (`listPaymentProviders`)
 *   - Universal checkout (`initiatePaymentCheckout`)
 *   - Transaction ledger queries (`listPaymentTransactions`, `getPaymentTransaction`)
 *   - Gateway verifications (`verifyFlutterwavePayment`, `verifyPaystackPayment`, `capturePayPalOrder`, `getCryptoCharge`)
 */
import { api } from "./api";
import type {
  PaymentProviderConfig,
  PaymentTransaction,
  PaymentCheckoutRequestInput,
  PaymentProvider,
  CryptoNetwork,
  PaymentTransactionStatus,
} from "@windels/shared";

export type {
  PaymentProviderConfig,
  PaymentTransaction,
  PaymentCheckoutRequestInput,
  PaymentProvider,
  CryptoNetwork,
  PaymentTransactionStatus,
};

/**
 * List configured payment providers and their active status.
 */
export function listPaymentProviders(): Promise<PaymentProviderConfig[]> {
  return api<PaymentProviderConfig[]>("/payments/providers");
}

/**
 * List paginated organization payment transactions.
 */
export function listPaymentTransactions(params?: {
  provider?: PaymentProvider | string;
  status?: PaymentTransactionStatus | string;
  limit?: number;
}): Promise<PaymentTransaction[]> {
  const q = new URLSearchParams();
  if (params?.provider) q.set("provider", params.provider);
  if (params?.status) q.set("status", params.status);
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : "";
  return api<PaymentTransaction[]>(`/payments/transactions${qs}`);
}

/**
 * Retrieve single transaction details by ID.
 */
export function getPaymentTransaction(id: string): Promise<PaymentTransaction> {
  return api<PaymentTransaction>(`/payments/transactions/${encodeURIComponent(id)}`);
}

/**
 * Initiate a universal checkout transaction across Flutterwave, Paystack, PayPal, or Crypto.
 */
export function initiatePaymentCheckout(input: PaymentCheckoutRequestInput): Promise<PaymentTransaction> {
  return api<PaymentTransaction>("/payments/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Verify a Flutterwave payment transaction by reference.
 */
export function verifyFlutterwavePayment(reference: string, transactionId?: string): Promise<PaymentTransaction> {
  const qs = transactionId ? `?transaction_id=${encodeURIComponent(transactionId)}` : "";
  return api<PaymentTransaction>(`/payments/flutterwave/verify/${encodeURIComponent(reference)}${qs}`);
}

/**
 * Verify a Paystack payment transaction by reference.
 */
export function verifyPaystackPayment(reference: string): Promise<PaymentTransaction> {
  return api<PaymentTransaction>(`/payments/paystack/verify/${encodeURIComponent(reference)}`);
}

/**
 * Capture an approved PayPal Checkout order.
 */
export function capturePayPalOrder(orderId: string): Promise<PaymentTransaction> {
  return api<PaymentTransaction>("/payments/paypal/capture-order", {
    method: "POST",
    body: JSON.stringify({ orderId }),
  });
}

/**
 * Get details for a Blockonomics / Crypto payment charge.
 */
export function getCryptoCharge(id: string): Promise<PaymentTransaction> {
  return api<PaymentTransaction>(`/payments/crypto/charge/${encodeURIComponent(id)}`);
}
