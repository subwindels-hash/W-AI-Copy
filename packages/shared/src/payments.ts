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
  secret: z.string().min(32).max(500),
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
  // Per-asset enable/disable is the Super Admin's cryptocurrency payment-method
  // control. An empty array is a valid, explicit state: BTC OFF + USDT OFF means
  // cryptocurrency payments are unavailable even while the provider row stays
  // configured. `.min(1)` is deliberately NOT used — do not force either asset on.
  supportedAssets: z.array(z.enum(BLOCKONOMICS_ASSETS)).max(BLOCKONOMICS_ASSETS.length).default(["BTC"]),
  quoteExpiryMinutes: z.number().int().min(5).max(60).default(15),
  requiredConfirmations: z.literal(2).default(2),
});
export type BlockonomicsProviderSettings = z.infer<typeof BlockonomicsProviderSettingsSchema>;

/**
 * Toggle a single Blockonomics settlement asset (BTC or USDT) on or off inside
 * a supported-assets list, returning a new list in canonical BLOCKONOMICS_ASSETS
 * order with no duplicates. This is the pure core of the Super Admin per-method
 * ON/OFF switches: turning both off yields `[]`, which the schema now accepts as
 * "cryptocurrency payments unavailable".
 */
export function toggleBlockonomicsAsset(
  current: readonly BlockonomicsAsset[],
  asset: BlockonomicsAsset,
  enabled: boolean,
): BlockonomicsAsset[] {
  const set = new Set(current);
  if (enabled) set.add(asset);
  else set.delete(asset);
  return BLOCKONOMICS_ASSETS.filter((item) => set.has(item));
}

/**
 * Whether a specific asset may be offered to users. An asset is available only
 * when the provider is configured with credentials, globally enabled, AND that
 * asset is individually toggled on. This is the single rule the user payment
 * page and the create-payment backend guard must agree on.
 */
export function isBlockonomicsAssetAvailable(
  config: Pick<BlockonomicsAdminPublicConfig, "configured" | "enabled" | "supportedAssets">,
  asset: BlockonomicsAsset,
): boolean {
  return Boolean(config.configured) && Boolean(config.enabled) && config.supportedAssets.includes(asset);
}

/** The list of assets currently offerable to users, in canonical order. */
export function availableBlockonomicsAssets(
  config: Pick<BlockonomicsAdminPublicConfig, "configured" | "enabled" | "supportedAssets">,
): BlockonomicsAsset[] {
  return BLOCKONOMICS_ASSETS.filter((asset) => isBlockonomicsAssetAvailable(config, asset));
}

/**
 * Human-facing network label for an asset. USDT MUST always be shown with its
 * network so a user never sends funds over the wrong chain; Blockonomics settles
 * USDT on Ethereum ERC-20 only. BTC has no competing-network ambiguity.
 */
export function blockonomicsNetworkLabel(asset: BlockonomicsAsset): string {
  return asset === "USDT" ? "Ethereum (ERC-20)" : "Bitcoin";
}

/** Display name shown in the user's payment-method picker, network included. */
export function blockonomicsAssetDisplayName(asset: BlockonomicsAsset): string {
  return asset === "USDT" ? "Tether — USDT (Ethereum ERC-20)" : "Bitcoin (BTC)";
}

/** Wrong-network loss warning; non-empty only for assets with network ambiguity. */
export function blockonomicsAssetNetworkWarning(asset: BlockonomicsAsset): string {
  return asset === "USDT"
    ? "Only send USDT on the Ethereum ERC-20 network. Sending USDT over another network (e.g. TRON/TRC-20 or BSC/BEP-20) may result in permanent loss of funds."
    : "";
}

export const BlockonomicsAdminConfigUpdateSchema = z.object({
  apiKey: z.string().trim().min(10).max(500).optional(),
  callbackSecret: z.string().trim().min(32).max(500).optional(),
  settings: BlockonomicsProviderSettingsSchema,
});
export type BlockonomicsAdminConfigUpdateInput = z.infer<typeof BlockonomicsAdminConfigUpdateSchema>;

export const BlockonomicsAdminToggleSchema = z.object({ enabled: z.boolean() });

/** Enable/disable a single settlement asset (the BTC / USDT ON-OFF switches). */
export const BlockonomicsAdminAssetToggleSchema = z.object({
  asset: z.enum(BLOCKONOMICS_ASSETS),
  enabled: z.boolean(),
});
export type BlockonomicsAdminAssetToggleInput = z.infer<typeof BlockonomicsAdminAssetToggleSchema>;

export interface BlockonomicsAdminPublicConfig extends BlockonomicsProviderSettings {
  provider: "blockonomics";
  configured: boolean;
  apiKeyConfigured: boolean;
  callbackSecretConfigured: boolean;
  source: "database" | "environment" | "none";
  version: number;
  healthStatus: string;
  lastHealthAt: string | null;
  lastError: string | null;
}

export interface BlockonomicsAdminDashboard {
  generatedAt: string;
  configuration: BlockonomicsAdminPublicConfig;
  totals: { payments: number; webhookEvents: number; failedWebhookEvents: number };
  paymentsByStatus: Array<{ status: string; count: number }>;
  reconciliationByStatus: Array<{ status: string; count: number }>;
  paymentsByAsset: Array<{ asset: string; count: number }>;
  webhooksByStatus: Array<{ status: string; count: number }>;
  recentPayments: Array<{
    id: string;
    organizationId: string;
    reference: string;
    status: string;
    amountCents: number;
    currency: string;
    cryptoCurrency: string | null;
    confirmations: number;
    requiredConfirmations: number;
    reconciliationStatus: string;
    createdAt: string;
    updatedAt: string;
  }>;
  recentWebhookErrors: Array<{
    id: string;
    paymentId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    attempts: number;
    receivedAt: string;
  }>;
  recentReconciliationRuns: Array<{
    id: string;
    trigger: string;
    timeframe: string;
    matched: number;
    settled: number;
    issueCount: number;
    createdAt: string;
  }>;
}

export interface BlockonomicsAdminHealthResult {
  healthy: boolean;
  latencyMs: number;
  checkedAt: string;
  healthStatus: string;
  error?: string;
}

export const BLOCKONOMICS_RECONCILIATION_TIMEFRAMES = ["1W", "2W", "1M", "3M", "6M", "1Y"] as const;
export const BlockonomicsReconciliationRequestSchema = z.object({
  timeframe: z.enum(BLOCKONOMICS_RECONCILIATION_TIMEFRAMES).default("1M"),
});
export type BlockonomicsReconciliationTimeframe = (typeof BLOCKONOMICS_RECONCILIATION_TIMEFRAMES)[number];
export type BlockonomicsReconciliationIssueKind =
  | "provider_payment_missing"
  | "orphan_provider_payment"
  | "duplicate_provider_transaction"
  | "ambiguous_provider_match"
  | "amount_mismatch"
  | "address_mismatch"
  | "asset_mismatch"
  | "late_payment"
  | "settlement_failed";

export interface BlockonomicsReconciliationIssue {
  kind: BlockonomicsReconciliationIssueKind;
  paymentId?: string;
  providerTransactionId?: string;
  detail: string;
}

export interface BlockonomicsReconciliationResult {
  runId: string;
  trigger: "manual" | "scheduled";
  timeframe: BlockonomicsReconciliationTimeframe;
  startedAt: string;
  completedAt: string;
  localPaymentsScanned: number;
  providerPaymentsScanned: number;
  matched: number;
  settled: number;
  unchanged: number;
  issues: BlockonomicsReconciliationIssue[];
}
