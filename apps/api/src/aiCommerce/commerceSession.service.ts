/**
 * Commerce session context (§8).
 *
 * THIS IS NOT A CART. It is not an order store, not a payment record and not a
 * ledger. It holds only the pointers an AI needs to keep a multi-turn shopping
 * conversation coherent:
 *
 *   - which products the user was just shown (ids only)
 *   - which WMPC cart / checkout / order the conversation is about (ids only)
 *   - the last intent and the last search terms
 *
 * Every number the user sees — price, stock, tax, total, delivery date — is
 * re-fetched from WMPC at the moment of use. Nothing priced is cached here,
 * deliberately: a cached total is a wrong total.
 *
 * Storage is Redis with a short TTL (conversation lifetime), falling back to an
 * in-process map when Redis is unavailable, exactly like other ephemeral
 * conversation state in the platform. Losing this context degrades the
 * conversation ("which one did you mean?"); it can never lose money, because
 * nothing authoritative lives here.
 */
import { randomUUID } from "node:crypto";
import type {
  CommerceChannel,
  CommerceIntentFilters,
  CommerceIntentName,
  CommerceSessionContext,
} from "@windels/shared";
import { redis } from "../db/redis.js";
import { logger } from "../observability/logger.js";

/** Conversation-scoped, not order-scoped: 6 hours is generous for a chat. */
const SESSION_TTL_SECONDS = 6 * 60 * 60;
/** Cap so a long conversation cannot grow the context without bound. */
const MAX_SELECTED_PRODUCTS = 20;
const MAX_SEARCH_RESULT_IDS = 25;

const memoryFallback = new Map<string, { value: CommerceSessionContext; expiresAt: number }>();

function key(organizationId: string, sessionId: string): string {
  return `commerce:sess:${organizationId}:${sessionId}`;
}

function pruneMemory(): void {
  const now = Date.now();
  for (const [k, entry] of memoryFallback) {
    if (entry.expiresAt <= now) memoryFallback.delete(k);
  }
}

async function readRaw(k: string): Promise<CommerceSessionContext | null> {
  try {
    const raw = await redis.get(k);
    if (raw) return JSON.parse(raw) as CommerceSessionContext;
  } catch (err) {
    logger.debug("[aiCommerce] session read fell back to memory", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  pruneMemory();
  const entry = memoryFallback.get(k);
  return entry && entry.expiresAt > Date.now() ? entry.value : null;
}

async function writeRaw(k: string, value: CommerceSessionContext): Promise<void> {
  const payload = JSON.stringify(value);
  try {
    await redis.set(k, payload, "EX", SESSION_TTL_SECONDS);
    return;
  } catch (err) {
    logger.debug("[aiCommerce] session write fell back to memory", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  pruneMemory();
  memoryFallback.set(k, { value, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 });
}

export interface CommerceSessionIdentity {
  sessionId?: string;
  userId: string;
  organizationId: string;
  channel: CommerceChannel;
}

function emptySession(id: CommerceSessionIdentity & { sessionId: string }): CommerceSessionContext {
  const now = new Date().toISOString();
  return {
    sessionId: id.sessionId,
    userId: id.userId,
    organizationId: id.organizationId,
    channel: id.channel,
    selectedProductIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const commerceSessionService = {
  /**
   * Load the session, or create a fresh one. A session whose stored owner does
   * not match the caller is never returned — a mismatched id yields a NEW
   * session rather than someone else's context (§23 cross-user isolation).
   */
  async getOrCreate(id: CommerceSessionIdentity): Promise<CommerceSessionContext> {
    const sessionId = id.sessionId || randomUUID();
    const existing = await readRaw(key(id.organizationId, sessionId));

    if (existing) {
      if (existing.userId === id.userId && existing.organizationId === id.organizationId) {
        return existing;
      }
      logger.warn("[aiCommerce] commerce session owner mismatch — issuing a new session", {
        sessionId,
        organizationId: id.organizationId,
      });
      const fresh = emptySession({ ...id, sessionId: randomUUID() });
      await writeRaw(key(fresh.organizationId, fresh.sessionId), fresh);
      return fresh;
    }

    const created = emptySession({ ...id, sessionId });
    await writeRaw(key(created.organizationId, created.sessionId), created);
    return created;
  },

  /** Read-only fetch; returns null when absent or owned by someone else. */
  async get(
    organizationId: string,
    sessionId: string,
    userId: string,
  ): Promise<CommerceSessionContext | null> {
    const found = await readRaw(key(organizationId, sessionId));
    if (!found) return null;
    if (found.userId !== userId || found.organizationId !== organizationId) return null;
    return found;
  },

  /**
   * Apply a partial update. Ownership fields cannot be changed through here.
   */
  async update(
    session: CommerceSessionContext,
    patch: Partial<Omit<CommerceSessionContext, "sessionId" | "userId" | "organizationId" | "createdAt">>,
  ): Promise<CommerceSessionContext> {
    const next: CommerceSessionContext = {
      ...session,
      ...patch,
      sessionId: session.sessionId,
      userId: session.userId,
      organizationId: session.organizationId,
      createdAt: session.createdAt,
      updatedAt: new Date().toISOString(),
      selectedProductIds: (patch.selectedProductIds ?? session.selectedProductIds).slice(
        -MAX_SELECTED_PRODUCTS,
      ),
    };
    await writeRaw(key(next.organizationId, next.sessionId), next);
    return next;
  },

  /** Record what a search returned so "the second one" can be resolved later. */
  async rememberSearch(
    session: CommerceSessionContext,
    search: { query?: string; filters?: CommerceIntentFilters; resultIds: string[] },
  ): Promise<CommerceSessionContext> {
    return this.update(session, {
      lastIntent: "PRODUCT_SEARCH",
      lastSearch: {
        query: search.query,
        filters: search.filters,
        resultIds: search.resultIds.slice(0, MAX_SEARCH_RESULT_IDS),
        at: new Date().toISOString(),
      },
      selectedProductIds: search.resultIds.slice(0, MAX_SELECTED_PRODUCTS),
    });
  },

  async rememberIntent(
    session: CommerceSessionContext,
    intent: CommerceIntentName,
  ): Promise<CommerceSessionContext> {
    return this.update(session, { lastIntent: intent });
  },

  /**
   * Resolve an ordinal reference ("the second one", "number 3") against the
   * last search. Returns null when there is nothing to resolve — the caller
   * must then ask the user rather than guess.
   */
  resolveOrdinal(session: CommerceSessionContext, ordinal: number): string | null {
    const ids = session.lastSearch?.resultIds ?? session.selectedProductIds;
    if (!ids.length || ordinal < 1 || ordinal > ids.length) return null;
    return ids[ordinal - 1] ?? null;
  },

  async clear(organizationId: string, sessionId: string): Promise<void> {
    const k = key(organizationId, sessionId);
    try {
      await redis.del(k);
    } catch {
      /* fall through to the memory map */
    }
    memoryFallback.delete(k);
  },

  /** Test seam: drop the in-process fallback between test cases. */
  __resetMemory(): void {
    memoryFallback.clear();
  },
};

export default commerceSessionService;
