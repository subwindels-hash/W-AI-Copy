/**
 * Shared types — Session 79: WMPC Gift Card Payment Platform.
 *
 * Gift card lifecycle (create/activate/reload/redeem/expire), PIN/fraud security,
 * QR/barcode support, scheduled delivery, enterprise bulk issuance + loyalty
 * programs, and AI spending/recommendation/revenue agents. GiftCardPaymentMethod
 * registers into the existing Payment Gateway Framework (not a parallel gateway).
 */

export type GcType = "physical" | "digital" | "virtual" | "one-time" | "reloadable" | "promotional" | "enterprise" | "corporate-reward" | "employee-incentive" | "educational";
export type GcStatus = "issued" | "active" | "partially-redeemed" | "redeemed" | "expired" | "frozen";

export interface WmpcGiftCard {
  id: string;
  type: GcType;
  code: string;
  initialBalance: number;
  balance: number;
  currency: string;
  status: GcStatus;
  pinHash?: string;
  issuerId: string;
  recipientId?: string;
  issuedAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  personalMessage?: string;
}

export interface GcTransaction {
  id: string;
  cardId: string;
  kind: "issue" | "activate" | "reload" | "redeem" | "expire" | "freeze";
  amount: number;
  currency: string;
  at: string;
  orderId?: string;
}

export interface GcFraudFlag {
  id: string;
  cardId: string;
  reason: string;
  severity: "low" | "medium" | "high";
  flaggedAt: string;
  resolved: boolean;
}

export interface GcLoyaltyProgram {
  id: string;
  name: string;
  multiplier: number;         // points per currency unit
  pointsIssued: number;
  memberCount: number;
}

export interface GcDashboard {
  issued: number;
  active: number;
  redeemed: number;
  outstandingBalance: number;
  revenue24h: number;
  fraudFlags: number;
  loyaltyPrograms: number;
  registeredAsPaymentMethod: boolean;
}
