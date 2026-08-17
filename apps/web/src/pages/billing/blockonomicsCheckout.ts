import type { PaymentTransaction } from "@windels/shared";

const ETHEREUM_TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const TERMINAL_STATUSES = new Set(["completed", "expired", "failed", "cancelled", "under_review", "refunded"]);

export function isEthereumTransactionHash(value: string): boolean {
  return ETHEREUM_TX_HASH.test(value.trim());
}

export function isBlockonomicsTerminal(status: PaymentTransaction["status"]): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function formatBlockonomicsCryptoAmount(payment: PaymentTransaction): string | null {
  const scale = payment.cryptoCurrency === "BTC" ? 8 : payment.cryptoCurrency === "USDT" ? 6 : null;
  if (scale !== null && payment.expectedCryptoUnits && /^\d+$/.test(payment.expectedCryptoUnits)) {
    const units = BigInt(payment.expectedCryptoUnits);
    const divisor = 10n ** BigInt(scale);
    return `${units / divisor}.${(units % divisor).toString().padStart(scale, "0")}`;
  }
  if (payment.cryptoAmount === undefined) return null;
  return String(payment.cryptoAmount);
}

export function blockonomicsQrPayload(payment: PaymentTransaction): string | null {
  if (!payment.cryptoAddress) return null;
  const amount = formatBlockonomicsCryptoAmount(payment);
  if (payment.cryptoCurrency === "BTC" && amount) {
    return `bitcoin:${payment.cryptoAddress}?amount=${amount}`;
  }
  // No universal ERC-20 payment URI is safe across wallets. Encode only the
  // provider address and keep the ERC-20 network/amount warning in visible UI.
  return payment.cryptoAddress;
}

export interface QuoteCountdown {
  expired: boolean;
  secondsRemaining: number | null;
  label: string;
}

export function blockonomicsQuoteCountdown(expiresAt: string | null | undefined, nowMs = Date.now()): QuoteCountdown {
  if (!expiresAt) return { expired: false, secondsRemaining: null, label: "No quote timer reported" };
  const expiryMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiryMs)) return { expired: false, secondsRemaining: null, label: "Quote timer unavailable" };
  const seconds = Math.max(0, Math.ceil((expiryMs - nowMs) / 1000));
  if (seconds === 0) return { expired: true, secondsRemaining: 0, label: "Quote timer elapsed" };
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return { expired: false, secondsRemaining: seconds, label: `${minutes}:${remainder.toString().padStart(2, "0")}` };
}

export function blockonomicsStatusMessage(payment: PaymentTransaction): string {
  switch (payment.status) {
    case "created": return "The backend is preparing provider payment instructions.";
    case "pending": return "Awaiting an on-chain payment. No billing access has been granted.";
    case "detected": return "A transaction was detected and is awaiting confirmations.";
    case "confirming": return "The provider detected payment; backend confirmation and reconciliation are still required.";
    case "confirmed": return "Provider finality was verified; backend billing settlement is being finalized.";
    case "completed": return "Backend verification, reconciliation, and billing settlement completed.";
    case "expired": return "The backend marked this payment quote expired. Create a new payment before sending funds.";
    case "under_review": return "Automatic settlement stopped. Billing review is required.";
    case "failed": return "Payment processing failed. No automatic billing settlement occurred.";
    case "cancelled": return "This payment was cancelled and cannot be used for settlement.";
    case "refunded": return "The backend records this payment as refunded.";
  }
}
