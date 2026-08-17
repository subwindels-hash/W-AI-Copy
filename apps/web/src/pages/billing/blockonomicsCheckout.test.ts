import { describe, expect, it } from "vitest";
import type { PaymentTransaction } from "@windels/shared";
import {
  blockonomicsQrPayload,
  blockonomicsQuoteCountdown,
  blockonomicsStatusMessage,
  formatBlockonomicsCryptoAmount,
  isBlockonomicsTerminal,
  isEthereumTransactionHash,
} from "./blockonomicsCheckout";

function payment(overrides: Partial<PaymentTransaction> = {}): PaymentTransaction {
  return {
    id: "pay-1",
    organizationId: "org-1",
    provider: "blockonomics",
    reference: "BLK_1",
    amount: 100,
    currency: "USD",
    status: "pending",
    createdAt: "2026-08-17T12:00:00.000Z",
    ...overrides,
  };
}

describe("Blockonomics checkout presentation", () => {
  it("formats exact BTC and USDT values from backend smallest units", () => {
    expect(formatBlockonomicsCryptoAmount(payment({ cryptoCurrency: "BTC", expectedCryptoUnits: "12345678" }))).toBe("0.12345678");
    expect(formatBlockonomicsCryptoAmount(payment({ cryptoCurrency: "USDT", expectedCryptoUnits: "1250000" }))).toBe("1.250000");
  });

  it("builds a BIP-21 BTC QR but uses an address-only payload for ERC-20", () => {
    expect(blockonomicsQrPayload(payment({
      cryptoCurrency: "BTC",
      cryptoAddress: "bc1qexample",
      expectedCryptoUnits: "250000",
    }))).toBe("bitcoin:bc1qexample?amount=0.00250000");
    expect(blockonomicsQrPayload(payment({
      cryptoCurrency: "USDT",
      cryptoAddress: "0x1111111111111111111111111111111111111111",
      expectedCryptoUnits: "2500000",
    }))).toBe("0x1111111111111111111111111111111111111111");
  });

  it("reports quote time without turning browser time into payment completion", () => {
    expect(blockonomicsQuoteCountdown("2026-08-17T12:01:30.000Z", Date.parse("2026-08-17T12:00:00.000Z"))).toEqual({
      expired: false,
      secondsRemaining: 90,
      label: "1:30",
    });
    expect(blockonomicsQuoteCountdown("2026-08-17T11:59:00.000Z", Date.parse("2026-08-17T12:00:00.000Z"))).toMatchObject({
      expired: true,
      label: "Quote timer elapsed",
    });
  });

  it("accepts only an Ethereum transaction hash for USDT monitoring", () => {
    expect(isEthereumTransactionHash(`0x${"a".repeat(64)}`)).toBe(true);
    expect(isEthereumTransactionHash("provider-says-paid")).toBe(false);
  });

  it("keeps provider confirmation distinct from backend completion", () => {
    expect(isBlockonomicsTerminal("confirmed")).toBe(false);
    expect(isBlockonomicsTerminal("completed")).toBe(true);
    expect(blockonomicsStatusMessage(payment({ status: "confirmed" }))).toContain("settlement is being finalized");
    expect(blockonomicsStatusMessage(payment({ status: "completed" }))).toContain("billing settlement completed");
  });
});
