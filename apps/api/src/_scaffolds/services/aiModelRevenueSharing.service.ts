/**
 * Module 97: AI Model Revenue Sharing Service
 * WINDELS AI OS - Phase 1
 * 
 * Manages revenue distribution between model publishers and platform, commission
 * tracking, payout management, publisher earnings analytics, and financial
 * reporting for the AI model marketplace.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RevenueSharingAgreement {
  id: string;
  organizationId: string;
  publisherId: string;
  publisherName: string;
  status: AgreementStatus;
  commissionRate: number;
  revenueSplit: RevenueSplit;
  paymentTerms: PaymentTerms;
  effectiveDate: string;
  expirationDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type AgreementStatus = 'draft' | 'active' | 'suspended' | 'terminated' | 'expired';

export interface RevenueSplit {
  publisherPercentage: number;
  platformPercentage: number;
  affiliatePercentage?: number;
  taxWithholding?: number;
}

export interface PaymentTerms {
  paymentCycle: 'monthly' | 'quarterly' | 'annual';
  minimumPayout: number;
  currency: string;
  paymentMethod: 'bank_transfer' | 'paypal' | 'stripe' | 'crypto';
  paymentDelayDays: number;
  invoicingEnabled: boolean;
}

export interface RevenueTransaction {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  publisherId: string;
  transactionType: TransactionType;
  amount: number;
  currency: string;
  commissionAmount: number;
  publisherEarnings: number;
  platformEarnings: number;
  transactionDate: string;
  customerInfo: CustomerInfo;
  metadata: Record<string, any>;
  createdAt: string;
}

export type TransactionType =
  | 'purchase'
  | 'subscription'
  | 'usage_fee'
  | 'refund'
  | 'chargeback'
  | 'adjustment';

export interface CustomerInfo {
  customerId: string;
  customerName: string;
  customerEmail?: string;
  organizationId?: string;
}

export interface PublisherEarnings {
  id: string;
  publisherId: string;
  publisherName: string;
  period: EarningsPeriod;
  grossRevenue: number;
  commissionDeducted: number;
  refundsDeducted: number;
  taxWithheld: number;
  netEarnings: number;
  transactionCount: number;
  topModels: ModelEarnings[];
  payoutStatus: PayoutStatus;
  payoutId?: string;
  createdAt: string;
}

export interface EarningsPeriod {
  startDate: string;
  endDate: string;
  periodType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
}

export interface ModelEarnings {
  modelId: string;
  modelName: string;
  revenue: number;
  transactions: number;
  percentage: number;
}

export type PayoutStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'held'
  | 'cancelled';

export interface Payout {
  id: string;
  publisherId: string;
  publisherName: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: PayoutStatus;
  earningsPeriods: string[];
  processingFee: number;
  netAmount: number;
  initiatedAt: string;
  completedAt?: string;
  failureReason?: string;
  transactionReference?: string;
  metadata: Record<string, any>;
}

export interface FinancialReport {
  id: string;
  organizationId: string;
  reportType: ReportType;
  period: EarningsPeriod;
  summary: FinancialSummary;
  breakdown: FinancialBreakdown;
  generatedAt: string;
  generatedBy: string;
}

export type ReportType =
  | 'revenue_summary'
  | 'publisher_earnings'
  | 'commission_report'
  | 'payout_history'
  | 'tax_report';

export interface FinancialSummary {
  totalRevenue: number;
  totalCommission: number;
  totalPayouts: number;
  totalRefunds: number;
  netRevenue: number;
  currency: string;
}

export interface FinancialBreakdown {
  byModel: Array<{ modelId: string; modelName: string; revenue: number; percentage: number }>;
  byPublisher: Array<{ publisherId: string; publisherName: string; earnings: number; percentage: number }>;
  byTransactionType: Array<{ type: TransactionType; amount: number; count: number }>;
  byMonth: Array<{ month: string; revenue: number; commission: number; payouts: number }>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const revenueAgreements = new Map<string, RevenueSharingAgreement>();
const revenueTransactions = new Map<string, RevenueTransaction>();
const publisherEarnings = new Map<string, PublisherEarnings>();
const payouts = new Map<string, Payout>();
const financialReports = new Map<string, FinancialReport>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculateEarnings(
  amount: number,
  agreement: RevenueSharingAgreement
): {
  commissionAmount: number;
  publisherEarnings: number;
  platformEarnings: number;
} {
  const commissionAmount = amount * (agreement.commissionRate / 100);
  const afterCommission = amount - commissionAmount;
  const publisherEarnings = afterCommission * (agreement.revenueSplit.publisherPercentage / 100);
  const platformEarnings = afterCommission * (agreement.revenueSplit.platformPercentage / 100);
  
  return { commissionAmount, publisherEarnings, platformEarnings };
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createRevenueSharingAgreement(params: {
  organizationId: string;
  publisherId: string;
  publisherName: string;
  commissionRate: number;
  revenueSplit: RevenueSplit;
  paymentTerms: PaymentTerms;
  effectiveDate: string;
  expirationDate?: string;
}): RevenueSharingAgreement {
  const now = new Date().toISOString();
  const id = randomUUID();
  
  const agreement: RevenueSharingAgreement = {
    id,
    organizationId: params.organizationId,
    publisherId: params.publisherId,
    publisherName: params.publisherName,
    status: 'draft',
    commissionRate: params.commissionRate,
    revenueSplit: params.revenueSplit,
    paymentTerms: params.paymentTerms,
    effectiveDate: params.effectiveDate,
    expirationDate: params.expirationDate,
    createdAt: now,
    updatedAt: now,
  };
  
  revenueAgreements.set(id, agreement);
  return agreement;
}

export function getRevenueSharingAgreement(id: string): RevenueSharingAgreement | undefined {
  return revenueAgreements.get(id);
}

export function listRevenueSharingAgreements(organizationId: string): RevenueSharingAgreement[] {
  return Array.from(revenueAgreements.values()).filter(
    a => a.organizationId === organizationId
  );
}

export function activateAgreement(agreementId: string): RevenueSharingAgreement {
  const agreement = revenueAgreements.get(agreementId);
  if (!agreement) {
    throw new Error(`Revenue sharing agreement ${agreementId} not found`);
  }
  
  if (agreement.status !== 'draft') {
    throw new Error(`Agreement ${agreementId} is not in draft state`);
  }
  
  agreement.status = 'active';
  agreement.updatedAt = new Date().toISOString();
  
  return agreement;
}

export function recordRevenueTransaction(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  publisherId: string;
  transactionType: TransactionType;
  amount: number;
  currency: string;
  customerInfo: CustomerInfo;
  metadata?: Record<string, any>;
}): RevenueTransaction {
  const now = new Date().toISOString();
  const id = randomUUID();
  
  // Find active agreement for publisher
  const agreement = Array.from(revenueAgreements.values()).find(
    a => a.publisherId === params.publisherId && a.status === 'active'
  );
  
  if (!agreement) {
    throw new Error(`No active revenue sharing agreement found for publisher ${params.publisherId}`);
  }
  
  const { commissionAmount, publisherEarnings, platformEarnings } = calculateEarnings(
    params.amount,
    agreement
  );
  
  const transaction: RevenueTransaction = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    publisherId: params.publisherId,
    transactionType: params.transactionType,
    amount: params.amount,
    currency: params.currency,
    commissionAmount,
    publisherEarnings,
    platformEarnings,
    transactionDate: now,
    customerInfo: params.customerInfo,
    metadata: params.metadata || {},
    createdAt: now,
  };
  
  revenueTransactions.set(id, transaction);
  return transaction;
}

export function getRevenueTransaction(id: string): RevenueTransaction | undefined {
  return revenueTransactions.get(id);
}

export function listRevenueTransactions(
  organizationId: string,
  filters?: {
    publisherId?: string;
    modelId?: string;
    transactionType?: TransactionType;
    startDate?: string;
    endDate?: string;
  }
): RevenueTransaction[] {
  let transactions = Array.from(revenueTransactions.values()).filter(
    t => t.organizationId === organizationId
  );
  
  if (filters?.publisherId) {
    transactions = transactions.filter(t => t.publisherId === filters.publisherId);
  }
  if (filters?.modelId) {
    transactions = transactions.filter(t => t.modelId === filters.modelId);
  }
  if (filters?.transactionType) {
    transactions = transactions.filter(t => t.transactionType === filters.transactionType);
  }
  if (filters?.startDate) {
    transactions = transactions.filter(t => t.transactionDate >= filters.startDate!);
  }
  if (filters?.endDate) {
    transactions = transactions.filter(t => t.transactionDate <= filters.endDate!);
  }
  
  return transactions;
}

export function calculatePublisherEarnings(
  publisherId: string,
  period: EarningsPeriod
): PublisherEarnings {
  const transactions = Array.from(revenueTransactions.values()).filter(
    t => t.publisherId === publisherId &&
         t.transactionDate >= period.startDate &&
         t.transactionDate <= period.endDate
  );
  
  const grossRevenue = transactions
    .filter(t => t.transactionType !== 'refund' && t.transactionType !== 'chargeback')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const commissionDeducted = transactions.reduce((sum, t) => sum + t.commissionAmount, 0);
  
  const refundsDeducted = transactions
    .filter(t => t.transactionType === 'refund' || t.transactionType === 'chargeback')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  const taxWithheld = 0; // Simplified for demo
  const netEarnings = grossRevenue - commissionDeducted - refundsDeducted - taxWithheld;
  
  // Calculate top models
  const modelRevenue = new Map<string, { modelName: string; revenue: number; transactions: number }>();
  transactions.forEach(t => {
    const existing = modelRevenue.get(t.modelId) || { modelName: t.modelName, revenue: 0, transactions: 0 };
    existing.revenue += t.publisherEarnings;
    existing.transactions += 1;
    modelRevenue.set(t.modelId, existing);
  });
  
  const topModels = Array.from(modelRevenue.entries())
    .map(([modelId, data]) => ({
      modelId,
      modelName: data.modelName,
      revenue: data.revenue,
      transactions: data.transactions,
      percentage: (data.revenue / netEarnings) * 100,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  
  const agreement = Array.from(revenueAgreements.values()).find(
    a => a.publisherId === publisherId && a.status === 'active'
  );
  
  const payoutStatus: PayoutStatus = netEarnings >= (agreement?.paymentTerms.minimumPayout || 100)
    ? 'pending'
    : 'held';
  
  const earnings: PublisherEarnings = {
    id: randomUUID(),
    publisherId,
    publisherName: transactions[0]?.customerInfo.customerName || 'Unknown',
    period,
    grossRevenue,
    commissionDeducted,
    refundsDeducted,
    taxWithheld,
    netEarnings,
    transactionCount: transactions.length,
    topModels,
    payoutStatus,
    createdAt: new Date().toISOString(),
  };
  
  publisherEarnings.set(earnings.id, earnings);
  return earnings;
}

export function initiatePayout(
  publisherId: string,
  earningsIds: string[]
): Payout {
  const now = new Date().toISOString();
  const id = randomUUID();
  
  const earnings = earningsIds
    .map(id => publisherEarnings.get(id))
    .filter((e): e is PublisherEarnings => e !== undefined);
  
  if (earnings.length === 0) {
    throw new Error('No earnings records found');
  }
  
  const totalAmount = earnings.reduce((sum, e) => sum + e.netEarnings, 0);
  const agreement = Array.from(revenueAgreements.values()).find(
    a => a.publisherId === publisherId && a.status === 'active'
  );
  
  if (!agreement) {
    throw new Error(`No active agreement found for publisher ${publisherId}`);
  }
  
  if (totalAmount < agreement.paymentTerms.minimumPayout) {
    throw new Error(`Total amount ${totalAmount} is below minimum payout ${agreement.paymentTerms.minimumPayout}`);
  }
  
  const processingFee = totalAmount * 0.02; // 2% processing fee
  const netAmount = totalAmount - processingFee;
  
  const payout: Payout = {
    id,
    publisherId,
    publisherName: earnings[0].publisherName,
    amount: totalAmount,
    currency: agreement.paymentTerms.currency,
    paymentMethod: agreement.paymentTerms.paymentMethod,
    status: 'processing',
    earningsPeriods: earningsIds,
    processingFee,
    netAmount,
    initiatedAt: now,
    metadata: {},
  };
  
  payouts.set(id, payout);
  
  // Update earnings payout status
  earnings.forEach(e => {
    e.payoutStatus = 'processing';
    e.payoutId = id;
  });
  
  return payout;
}

export function completePayout(
  payoutId: string,
  transactionReference: string
): Payout {
  const payout = payouts.get(payoutId);
  if (!payout) {
    throw new Error(`Payout ${payoutId} not found`);
  }
  
  if (payout.status !== 'processing') {
    throw new Error(`Payout ${payoutId} is not in processing state`);
  }
  
  payout.status = 'completed';
  payout.completedAt = new Date().toISOString();
  payout.transactionReference = transactionReference;
  
  // Update earnings payout status
  payout.earningsPeriods.forEach(earningsId => {
    const earnings = publisherEarnings.get(earningsId);
    if (earnings) {
      earnings.payoutStatus = 'completed';
    }
  });
  
  return payout;
}

export function failPayout(payoutId: string, reason: string): Payout {
  const payout = payouts.get(payoutId);
  if (!payout) {
    throw new Error(`Payout ${payoutId} not found`);
  }
  
  payout.status = 'failed';
  payout.failureReason = reason;
  
  // Update earnings payout status
  payout.earningsPeriods.forEach(earningsId => {
    const earnings = publisherEarnings.get(earningsId);
    if (earnings) {
      earnings.payoutStatus = 'failed';
    }
  });
  
  return payout;
}

export function getPayout(id: string): Payout | undefined {
  return payouts.get(id);
}

export function listPayouts(publisherId?: string): Payout[] {
  let allPayouts = Array.from(payouts.values());
  
  if (publisherId) {
    allPayouts = allPayouts.filter(p => p.publisherId === publisherId);
  }
  
  return allPayouts;
}

export function generateFinancialReport(params: {
  organizationId: string;
  reportType: ReportType;
  period: EarningsPeriod;
  generatedBy: string;
}): FinancialReport {
  const now = new Date().toISOString();
  const id = randomUUID();
  
  const transactions = Array.from(revenueTransactions.values()).filter(
    t => t.organizationId === params.organizationId &&
         t.transactionDate >= params.period.startDate &&
         t.transactionDate <= params.period.endDate
  );
  
  const totalRevenue = transactions
    .filter(t => t.transactionType !== 'refund' && t.transactionType !== 'chargeback')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const totalCommission = transactions.reduce((sum, t) => sum + t.commissionAmount, 0);
  const totalRefunds = transactions
    .filter(t => t.transactionType === 'refund' || t.transactionType === 'chargeback')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  const periodPayouts = Array.from(payouts.values()).filter(
    p => p.initiatedAt >= params.period.startDate &&
         p.initiatedAt <= params.period.endDate &&
         p.status === 'completed'
  );
  
  const totalPayouts = periodPayouts.reduce((sum, p) => sum + p.netAmount, 0);
  
  const summary: FinancialSummary = {
    totalRevenue,
    totalCommission,
    totalPayouts,
    totalRefunds,
    netRevenue: totalRevenue - totalCommission - totalRefunds,
    currency: 'USD',
  };
  
  // Calculate breakdowns
  const modelBreakdown = new Map<string, { modelName: string; revenue: number }>();
  transactions.forEach(t => {
    const existing = modelBreakdown.get(t.modelId) || { modelName: t.modelName, revenue: 0 };
    existing.revenue += t.amount;
    modelBreakdown.set(t.modelId, existing);
  });
  
  const byModel = Array.from(modelBreakdown.entries())
    .map(([modelId, data]) => ({
      modelId,
      modelName: data.modelName,
      revenue: data.revenue,
      percentage: (data.revenue / totalRevenue) * 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);
  
  const report: FinancialReport = {
    id,
    organizationId: params.organizationId,
    reportType: params.reportType,
    period: params.period,
    summary,
    breakdown: {
      byModel,
      byPublisher: [],
      byTransactionType: [],
      byMonth: [],
    },
    generatedAt: now,
    generatedBy: params.generatedBy,
  };
  
  financialReports.set(id, report);
  return report;
}

export function getFinancialReport(id: string): FinancialReport | undefined {
  return financialReports.get(id);
}
