import { z } from "zod";

export const PAYMENT_PROVIDERS = ["flutterwave", "paystack", "stripe", "paypal", "crypto", "blockonomics"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const CRYPTO_NETWORKS = ["btc", "tron_trc20", "eth_erc20", "bnb_chain"] as const;
export type CryptoNetwork = (typeof CRYPTO_NETWORKS)[number];

export const PAYMENT_TRANSACTION_STATUSES = [
  "created", "pending", "detected", "confirming", "confirmed", "completed",
  "expired", "failed", "cancelled", "under_review", "refunded",
] as const;
export type PaymentTransactionStatus = (typeof PAYMENT_TRANSACTION_STATUSES)[number];

export const PaymentProviderConfigSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS),
  /** True only when the complete credential set is present and the adapter is enabled. */
  active: z.boolean(),
  configured: z.boolean(),
  status: z.enum(["ready", "disabled", "not_configured", "blocked"]),
  configurationIssue: z.string().optional(),
  testMode: z.boolean(),
  supportedCurrencies: z.array(z.string()),
  supportedNetworks: z.array(z.enum(CRYPTO_NETWORKS)).optional(),
  supportedAssets: z.array(z.enum(["BTC", "USDT"])).optional(),
  displayName: z.string(),
});

export type PaymentProviderConfig = z.infer<typeof PaymentProviderConfigSchema>;

export const PaymentTransactionSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  provider: z.enum(PAYMENT_PROVIDERS),
  reference: z.string(),
  amount: z.number().positive(),
  currency: z.string(),
  cryptoAmount: z.number().positive().optional(),
  cryptoNetwork: z.enum(CRYPTO_NETWORKS).optional(),
  cryptoAddress: z.string().optional(),
  confirmations: z.number().int().nonnegative().optional(),
  requiredConfirmations: z.number().int().nonnegative().optional(),
  cryptoCurrency: z.enum(["BTC", "USDT"]).optional(),
  expectedCryptoUnits: z.string().regex(/^\d+$/).optional(),
  receivedCryptoUnits: z.string().regex(/^\d+$/).optional(),
  providerStatus: z.string().optional(),
  providerTransactionId: z.string().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  reconciliationStatus: z.string().optional(),
  receipt: z.object({
    number: z.string(),
    issuedAt: z.string(),
    invoiceId: z.string().nullable().optional(),
  }).optional(),
  status: z.enum(PAYMENT_TRANSACTION_STATUSES),
  invoiceId: z.string().nullable().optional(),
  description: z.string().optional(),
  customerEmail: z.string().email().optional(),
  checkoutUrl: z.string().url().optional(),
  createdAt: z.string(),
  completedAt: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type PaymentTransaction = z.infer<typeof PaymentTransactionSchema>;

export const PaymentCheckoutRequestSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS),
  amount: z.number().positive(),
  currency: z.string().default("USD"),
  invoiceId: z.string().optional(),
  description: z.string().max(500).optional(),
  customerEmail: z.string().email().optional(),
  cryptoNetwork: z.enum(CRYPTO_NETWORKS).optional(),
  cryptoCurrency: z.enum(["BTC", "USDT"]).optional(),
});

export type PaymentCheckoutRequestInput = z.input<typeof PaymentCheckoutRequestSchema>;

export const PaymentVerificationSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS),
  reference: z.string().min(1),
  transactionId: z.string().optional(),
});

export type PaymentVerificationInput = z.infer<typeof PaymentVerificationSchema>;

export const CryptoAddressRequestSchema = z.object({
  network: z.enum(CRYPTO_NETWORKS),
  amount: z.number().positive(),
  currency: z.string().default("USD"),
  invoiceId: z.string().optional(),
  description: z.string().optional(),
});

export type CryptoAddressRequestInput = z.input<typeof CryptoAddressRequestSchema>;

export const BLOCKONOMICS_ASSETS = ["BTC", "USDT"] as const;
export type BlockonomicsAsset = (typeof BLOCKONOMICS_ASSETS)[number];

export const BlockonomicsCreatePaymentSchema = z.object({
  amount: z.number().positive().refine((value) => Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, "Amount must have at most two decimal places"),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  cryptoCurrency: z.enum(BLOCKONOMICS_ASSETS),
  invoiceId: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  customerEmail: z.string().email().optional(),
});
export type BlockonomicsCreatePaymentInput = z.infer<typeof BlockonomicsCreatePaymentSchema>;

export const BlockonomicsMonitorTransactionSchema = z.object({
  txhash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});
export type BlockonomicsMonitorTransactionInput = z.infer<typeof BlockonomicsMonitorTransactionSchema>;

export const BlockonomicsCallbackSchema = z.object({
  secret: z.string().min(16).max(500),
  addr: z.string().min(20).max(200),
  crypto: z.enum(BLOCKONOMICS_ASSETS).default("BTC"),
  status: z.coerce.number().int().min(0).max(2),
  value: z.coerce.bigint().positive(),
  txid: z.string().min(16).max(200),
  rbf: z.coerce.number().int().optional(),
});
export type BlockonomicsCallbackInput = z.infer<typeof BlockonomicsCallbackSchema>;

export const BlockonomicsProviderSettingsSchema = z.object({
  enabled: z.boolean(),
  testMode: z.boolean().default(false),
  matchCallback: z.string().trim().min(3).max(300),
  supportedAssets: z.array(z.enum(BLOCKONOMICS_ASSETS)).min(1).default(["BTC"]),
  quoteExpiryMinutes: z.number().int().min(5).max(60).default(15),
  requiredConfirmations: z.literal(2).default(2),
});
export type BlockonomicsProviderSettings = z.infer<typeof BlockonomicsProviderSettingsSchema>;
