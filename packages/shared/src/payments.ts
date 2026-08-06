import { z } from "zod";

export const PAYMENT_PROVIDERS = ["flutterwave", "paystack", "stripe", "paypal", "crypto"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const CRYPTO_NETWORKS = ["btc", "tron_trc20", "eth_erc20", "bnb_chain"] as const;
export type CryptoNetwork = (typeof CRYPTO_NETWORKS)[number];

export const PAYMENT_TRANSACTION_STATUSES = ["pending", "completed", "failed", "refunded", "expired"] as const;
export type PaymentTransactionStatus = (typeof PAYMENT_TRANSACTION_STATUSES)[number];

export const PaymentProviderConfigSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS),
  active: z.boolean(),
  testMode: z.boolean(),
  supportedCurrencies: z.array(z.string()),
  supportedNetworks: z.array(z.enum(CRYPTO_NETWORKS)).optional(),
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
