/**
 * Crypto payment safety gate.
 *
 * The previous implementation generated local placeholder addresses and used
 * fixed exchange rates. That can lose funds, so crypto checkout now fails
 * closed until a real chain-verification adapter is implemented. Confirmation
 * threshold helpers remain for the future adapter and for migration tests.
 */
import { safeCompare } from "../webhook/webhookReceiver.service.js";
import { clean, providerNotConfigured, type ProviderConfiguration } from "./paymentConfig.js";
import type { CryptoNetwork } from "@windels/shared";

export const CRYPTO_NETWORK_CONFIRMATIONS: Record<CryptoNetwork, number> = {
  btc: 1,
  tron_trc20: 19,
  eth_erc20: 12,
  bnb_chain: 15,
};

export interface CryptoChargeResult {
  chargeId: string;
  provider: "crypto";
  cryptoNetwork: CryptoNetwork;
  fiatAmount: number;
  fiatCurrency: string;
  cryptoAmount: number;
  cryptoAddress: string;
  requiredConfirmations: number;
  checkoutUrl: string;
}

export const CryptoPaymentsService = {
  configuration(): ProviderConfiguration {
    return {
      configured: false,
      testMode: true,
      issue: "Disabled until real address allocation, market pricing, and on-chain transaction verification are implemented",
    };
  },

  async createCharge(_input: {
    network: CryptoNetwork;
    amount: number;
    currency?: string;
    invoiceId?: string;
    description?: string;
  }): Promise<CryptoChargeResult> {
    throw providerNotConfigured("crypto", [
      "real address allocation adapter",
      "real FX/crypto pricing adapter",
      "on-chain transaction and confirmation verifier",
    ]);
  },

  verifyCallbackSecret(secretParam: string | undefined, secretOverride?: string): boolean {
    const expected = clean(secretOverride) ?? clean(process.env.BLOCKONOMICS_CALLBACK_SECRET);
    if (!secretParam || !expected) return false;
    return safeCompare(secretParam, expected);
  },

  isConfirmed(confirmations: number, requiredConfirmations: number): boolean {
    return Number.isInteger(confirmations) && Number.isInteger(requiredConfirmations)
      && requiredConfirmations > 0 && confirmations >= requiredConfirmations;
  },
};
