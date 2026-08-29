import { tenantStore } from "../utils/tenantStore.js";

/**
 * One shared usage-event ledger. Feature modules write here rather than adding
 * their own counters/billing stores; `/usage-intel` already exposes this data.
 */
export interface UsageLedgerEvent {
  [key: string]: unknown;
  feature: string;
  actor: string;
  quantity: number;
  unit: string;
  meta?: Record<string, unknown>;
}

const events = tenantStore<UsageLedgerEvent>({ prefix: "usg:evt", idPrefix: "u-" });

export const UsageEventsService = {
  record(organizationId: string, event: UsageLedgerEvent, createdBy?: string) {
    return events.create(organizationId, event, createdBy);
  },
  list(organizationId: string, limit = 100) {
    return events.list(organizationId, limit);
  },
  get(organizationId: string, id: string) {
    return events.get(organizationId, id);
  },
  remove(organizationId: string, id: string) {
    return events.delete(organizationId, id);
  },
};
