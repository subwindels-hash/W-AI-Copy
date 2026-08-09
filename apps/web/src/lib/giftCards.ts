/**
 * Session 79 — WMPC Gift Card Payment Platform API client.
 */
import { api } from "./api";
import type { GcDashboard as WmpcGcDashboard, WmpcGiftCard, GcTransaction, GcFraudFlag, GcLoyaltyProgram, GcType } from "@windels/shared";
export type { GcDashboard as WmpcGcDashboard, WmpcGiftCard, GcTransaction, GcFraudFlag, GcLoyaltyProgram, GcType } from "@windels/shared";

export const gcApi = {
  dashboard: () => api<WmpcGcDashboard>("/gift-cards/dashboard/rollup"),
  list: (status?: string) => api<WmpcGiftCard[]>("/gift-cards/cards", status ? { params: { status } } : {}),
  issue: (input: { type: GcType; amount: number; currency: string; pin?: string; recipientId?: string; personalMessage?: string; expiresInDays?: number }) =>
    api<WmpcGiftCard>("/gift-cards/cards", { method: "POST", json: input }),
  get: (id: string) => api<WmpcGiftCard>(`/gift-cards/cards/${id}`),
  activate: (id: string, pin?: string) => api<WmpcGiftCard>(`/gift-cards/cards/${id}/activate`, { method: "POST", json: { pin } }),
  reload: (id: string, amount: number) => api<WmpcGiftCard>(`/gift-cards/cards/${id}/reload`, { method: "POST", json: { amount } }),
  redeem: (id: string, amount: number, pin?: string, orderId?: string) =>
    api<{ card: WmpcGiftCard; redeemed: number; txn: GcTransaction }>(`/gift-cards/cards/${id}/redeem`, { method: "POST", json: { amount, pin, orderId } }),
  expire: (id: string) => api<WmpcGiftCard>(`/gift-cards/cards/${id}/expire`, { method: "POST" }),
  freeze: (id: string, reason: string) => api<WmpcGiftCard>(`/gift-cards/cards/${id}/freeze`, { method: "POST", json: { reason } }),
  unfreeze: (id: string) => api<WmpcGiftCard>(`/gift-cards/cards/${id}/unfreeze`, { method: "POST" }),
  transactions: (cardId?: string) => api<GcTransaction[]>("/gift-cards/transactions", cardId ? { params: { cardId } } : {}),
  fraud: (resolved?: boolean) => api<GcFraudFlag[]>("/gift-cards/fraud", resolved !== undefined ? { params: { resolved } } : {}),
  resolveFraud: (id: string) => api<GcFraudFlag>(`/gift-cards/fraud/${id}/resolve`, { method: "POST" }),
  loyalty: () => api<GcLoyaltyProgram[]>("/gift-cards/loyalty"),
  agents: () => api<Array<{ id: string; name: string; domain: string; role: string; disclaimer: string }>>("/gift-cards/agents"),
  paymentMethod: () => api<{ id: string; kind: string; name: string; capabilities: string[]; currencies: string[]; version: string }>("/gift-cards/payment-method"),
};
