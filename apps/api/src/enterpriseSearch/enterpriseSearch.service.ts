/**
 * Session 98 — Enterprise Search (Unified Organization Search).
 *
 * Answers a query by scanning the REAL org-scoped module records through
 * each module service and ranking matches with a deterministic relevance
 * score. No separate index (nothing to drift out of sync), no fabricated
 * results. Cross-tenant isolation is inherited from every module's
 * fail-closed reads (and proven by tests).
 *
 * Honesty rules:
 *   - No Math.random; scores are real computed values.
 *   - Identical store state + query ⇒ identical hit ordering (score desc,
 *     then id asc — stable tiebreak).
 *   - Recent-search history is org-scoped, deduped, capped at 20.
 *
 * Keys: es:history:<org>
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  EsSearchHit,
  EsFacet,
  EsSearchResult,
  EsRecentSearch,
  EsRollup,
  EsEntityType,
  EsSearchQuery,
} from "@windels/shared/enterpriseSearch";
import { ES_ENTITY_TYPES } from "@windels/shared/enterpriseSearch";

const historyKey = (org: string) => `es:history:${org}`;
const HISTORY_CAP = 20;

async function emitKernel(kind: string, payload: Record<string, unknown>) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ kind, source: "enterprise-search", payload });
  } catch {
    /* best effort */
  }
}

/** Normalized search terms from a query. */
function terms(q: string): string[] {
  return q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Score a record against terms with deterministic field weights. */
function scoreRecord(
  fields: Array<[string, number]>, // [fieldValue, weight]
  termsList: string[],
  updatedAt: string | null,
  now = Date.now()
): { score: number; snippet: string } {
  let score = 0;
  let bestSnippet = "";
  let bestSnippetScore = -1;
  for (const [value, weight] of fields) {
    if (!value) continue;
    const v = value.toLowerCase();
    let fieldScore = 0;
    for (const t of termsList) {
      if (v.includes(t)) {
        fieldScore += weight;
        if (v.startsWith(t)) fieldScore += 1; // prefix bonus
      }
    }
    if (fieldScore > 0) {
      if (fieldScore > bestSnippetScore) {
        bestSnippetScore = fieldScore;
        bestSnippet = value;
      }
      score += fieldScore;
    }
  }
  if (score > 0 && updatedAt) {
    const age = now - new Date(updatedAt).getTime();
    if (age >= 0 && age <= 7 * 86_400_000) score += 0.5; // recency bonus
  }
  return { score, snippet: bestSnippet.slice(0, 240) };
}

interface Candidate {
  id: string;
  type: EsEntityType;
  title: string;
  snippet: string;
  score: number;
  updatedAt: string;
  meta: string | null;
}

export const EnterpriseSearchService = {
  /**
   * Load real records for one entity type and score them against the terms.
   * Returns candidates (score > 0) sorted stably.
   */
  async scanType(org: string, type: EsEntityType, termsList: string[], viewer: { id: string; role: string | null } = { id: "", role: null }): Promise<Candidate[]> {
    const now = Date.now();
    const out: Candidate[] = [];
    const push = (hit: Omit<Candidate, "type" | "score" | "snippet">, fields: Array<[string, number]>) => {
      const { score, snippet } = scoreRecord(fields, termsList, hit.updatedAt, now);
      if (score > 0) out.push({ ...hit, type, score, snippet });
    };

    switch (type) {
      case "contact": {
        const { CrmService } = await import("../crm/crm.service.js");
        for (const r of await CrmService.listContacts(org)) {
          push(
            { id: r.id, title: `${r.firstName} ${r.lastName}`, updatedAt: r.updatedAt, meta: r.email ?? null },
            [[`${r.firstName} ${r.lastName}`, 3], [r.email ?? "", 3], [r.title ?? "", 2], [r.notes ?? "", 1], [r.tags.join(" "), 2]]
          );
        }
        break;
      }
      case "company": {
        const { CrmService } = await import("../crm/crm.service.js");
        for (const r of await CrmService.listCompanies(org)) {
          push(
            { id: r.id, title: r.name, updatedAt: r.updatedAt, meta: r.domain ?? null },
            [[r.name, 3], [r.domain ?? "", 2], [r.industry ?? "", 2], [r.city ?? "", 1], [r.country ?? "", 1], [r.tags.join(" "), 2]]
          );
        }
        break;
      }
      case "deal": {
        const { CrmService } = await import("../crm/crm.service.js");
        for (const r of await CrmService.listDeals(org)) {
          push(
            { id: r.id, title: r.name, updatedAt: r.updatedAt, meta: r.stage },
            [[r.name, 3], [r.stage, 2], [r.currency, 1], [r.tags.join(" "), 2]]
          );
        }
        break;
      }
      case "product": {
        const { ErpService } = await import("../erp/erp.service.js");
        for (const r of await ErpService.listProducts(org)) {
          push(
            { id: r.id, title: r.name, updatedAt: r.updatedAt, meta: r.sku },
            [[r.name, 3], [r.sku, 3], [r.category ?? "", 2], [r.description ?? "", 1], [r.tags.join(" "), 2]]
          );
        }
        break;
      }
      case "supplier": {
        const { ErpService } = await import("../erp/erp.service.js");
        for (const r of await ErpService.listSuppliers(org)) {
          push(
            { id: r.id, title: r.name, updatedAt: r.updatedAt, meta: r.contactEmail ?? null },
            [[r.name, 3], [r.contactEmail ?? "", 2], [r.paymentTerms ?? "", 1], [r.tags.join(" "), 2]]
          );
        }
        break;
      }
      case "purchase_order": {
        const { ErpService } = await import("../erp/erp.service.js");
        for (const r of await ErpService.listPurchaseOrders(org)) {
          push(
            { id: r.id, title: `PO ${r.id.slice(-6)}`, updatedAt: r.updatedAt, meta: r.status },
            [[r.status, 2], [r.supplierId, 1], [r.items.map((i) => i.productId).join(" "), 1], [r.note ?? "", 1]]
          );
        }
        break;
      }
      case "sales_order": {
        const { ErpService } = await import("../erp/erp.service.js");
        for (const r of await ErpService.listSalesOrders(org)) {
          push(
            { id: r.id, title: `SO ${r.orderDate}`, updatedAt: r.updatedAt, meta: r.status },
            [[r.status, 2], [r.customerCompanyId ?? "", 1], [r.items.map((i) => i.productId).join(" "), 1], [r.note ?? "", 1]]
          );
        }
        break;
      }
      case "message": {
        const { EmailIntelService } = await import("../emailIntel/emailIntel.service.js");
        for (const r of await EmailIntelService.listMessages(org)) {
          push(
            { id: r.id, title: r.subject, updatedAt: r.receivedAt, meta: `${r.direction} · ${r.fromAddress}` },
            [[r.subject, 3], [r.fromAddress, 2], [r.fromName ?? "", 2], [r.bodyText, 1], [r.to.join(" "), 1], [r.labels.join(" "), 2]]
          );
        }
        break;
      }
      case "post": {
        const { SocialPlatformService } = await import("../socialPlatform/socialPlatform.service.js");
        for (const r of await SocialPlatformService.listPosts(org)) {
          push(
            { id: r.id, title: `${r.authorName}: ${r.content.slice(0, 60)}`, updatedAt: r.createdAt, meta: r.kind },
            [[r.content, 1], [r.authorName, 2], [r.hashtags.join(" "), 2]]
          );
        }
        break;
      }
      case "comment": {
        const { SocialPlatformService } = await import("../socialPlatform/socialPlatform.service.js");
        for (const r of await SocialPlatformService.listComments(org)) {
          push(
            { id: r.id, title: `Comment by ${r.authorName}`, updatedAt: r.createdAt, meta: r.postId },
            [[r.content, 1], [r.authorName, 2]]
          );
        }
        break;
      }
      case "ticket": {
        const { HelpdeskService } = await import("../helpdesk/helpdesk.service.js");
        for (const r of await HelpdeskService.listTickets(org)) {
          push(
            { id: r.id, title: `${r.number} — ${r.subject}`, updatedAt: r.updatedAt, meta: r.status },
            [[r.subject, 3], [r.number, 3], [r.description ?? "", 1], [r.requesterName, 2], [r.requesterEmail ?? "", 2], [r.tags.join(" "), 2]]
          );
        }
        break;
      }
      case "task": {
        const { AppBuilderService } = await import("../appBuilder/appBuilder.service.js");
        for (const r of await AppBuilderService.listTasks(org)) {
          push(
            { id: r.id, title: r.title, updatedAt: r.createdAt, meta: `${r.assignedAgent} · ${r.group}` },
            [[r.title, 3], [r.description ?? "", 1], [r.assignedAgent, 2], [r.group, 2]]
          );
        }
        break;
      }
      case "project": {
        const { AppBuilderService } = await import("../appBuilder/appBuilder.service.js");
        for (const r of await AppBuilderService.listProjects(org)) {
          push(
            { id: r.id, title: r.name, updatedAt: r.updatedAt, meta: r.targetType },
            [[r.name, 3], [r.description ?? "", 1], [r.targetType, 2], [r.systemPrompt, 1]]
          );
        }
        break;
      }
      case "artifact": {
        const { AppBuilderService } = await import("../appBuilder/appBuilder.service.js");
        for (const r of await AppBuilderService.listArtifacts(org)) {
          push(
            { id: r.id, title: r.name, updatedAt: r.createdAt, meta: r.version },
            [[r.name, 3], [r.version, 2], [r.sbom.map((s) => s.name).join(" "), 1], [r.manifestJson.slice(0, 500), 1]]
          );
        }
        break;
      }
      case "report": {
        const { BusinessIntelligenceService } = await import("../businessIntelligence/businessIntelligence.service.js");
        for (const r of await BusinessIntelligenceService.listReports(org)) {
          push(
            { id: r.id, title: r.name, updatedAt: r.updatedAt, meta: `${r.cards.length} cards` },
            [[r.name, 3], [r.description ?? "", 1], [r.cards.map((c) => `${c.title} ${c.metric}`).join(" "), 2]]
          );
        }
        break;
      }
      case "politics": {
        // Session 144 — curated political knowledge (countries, leaders,
        // parties, elections, ideologies, movements, organizations).
        const { PoliticsService } = await import("../politics/politics.service.js");
        for (const r of PoliticsService.listSearchable()) {
          push(
            { id: r.id, title: r.title, updatedAt: r.updatedAt, meta: r.meta },
            [[r.title, 3], [r.body, 2], [r.meta, 1]]
          );
        }
        break;
      }
      case "religion": {
        // Session 141 — the curated religion knowledge catalog (families,
        // denominations, indigenous traditions, ancient religions). Static
        // global knowledge — searched with the same relevance ranking.
        const { ReligionsService } = await import("../religions/religions.service.js");
        for (const r of ReligionsService.listSearchable()) {
          push(
            { id: r.id, title: r.title, updatedAt: r.updatedAt, meta: r.meta },
            [[r.title, 3], [r.body, 2], [r.meta, 1]]
          );
        }
        break;
      }
      case "life_principle": {
        // Session 150 — the curated Life Operating Principles catalog
        // (115 practical life principles across 10 parts). Static global
        // content — searched with the same relevance ranking.
        const { LifePrinciplesService } = await import("../lifePrinciples/lifePrinciples.service.js");
        for (const r of LifePrinciplesService.listSearchable()) {
          push(
            { id: r.id, title: r.title, updatedAt: r.updatedAt, meta: r.meta },
            [[r.title, 3], [r.body, 2], [r.meta, 1]]
          );
        }
        break;
      }
      case "knowledge": {
        // Session 125 — approved identity-knowledge records (Super Admin
        // biography, company/organization profiles, brand, mission, FAQs…).
        // Permission-aware: the search viewer sees only records their
        // classification allows (private records are never indexed).
        const { IdentityKnowledgeService } = await import("../identityKnowledge/identityKnowledge.service.js");
        for (const r of await IdentityKnowledgeService.listSearchable(org, viewer)) {
          push(
            { id: r.id, title: r.title, updatedAt: r.updatedAt, meta: `${r.classification} · ${r.tags.join(" ")}` },
            [[r.title, 3], [r.body, 2], [r.tags.join(" "), 2]]
          );
        }
        break;
      }
    }
    return out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  },

  /** Run a search across the requested (or all) entity types. */
  async search(org: string, query: EsSearchQuery, viewer: { id: string; role: string | null } = { id: "", role: null }): Promise<EsSearchResult> {
    const started = Date.now();
    const termsList = terms(query.q);
    const types = query.types?.length ? query.types : ([...ES_ENTITY_TYPES] as EsEntityType[]);
    const limit = query.limit ?? 25;

    const all: Candidate[] = [];
    const facetMap = new Map<EsEntityType, number>();
    for (const type of types) {
      const hits = await this.scanType(org, type, termsList, viewer);
      if (hits.length) facetMap.set(type, hits.length);
      all.push(...hits);
    }
    all.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));

    const hits: EsSearchHit[] = all.slice(0, limit).map(({ id, type, title, snippet, score, updatedAt, meta }) => ({
      id, type, title, snippet, score, updatedAt, meta,
    }));
    const facets: EsFacet[] = [...facetMap.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || (a.type < b.type ? -1 : 1));

    await this.recordSearch(org, query.q);

    const result: EsSearchResult = {
      query: query.q,
      tookMs: Date.now() - started,
      total: all.length,
      hits,
      facets,
    };
    void emitKernel("es.search.ran", { organizationId: org, query: query.q, total: all.length });
    return result;
  },

  // ── Recent-search history (org-scoped, capped, deduped) ───────────
  async recordSearch(org: string, q: string): Promise<void> {
    const list = await this.listHistory(org);
    const remaining = list.filter((h) => h.query.toLowerCase() !== q.toLowerCase()).slice(0, HISTORY_CAP - 1);
    remaining.unshift({ id: randomUUID().slice(0, 12), query: q, ranAt: new Date().toISOString() });
    await redis.del(historyKey(org));
    // lpush prepends — push oldest-first so the list ends newest-first.
    for (const h of [...remaining].reverse()) await redis.lpush(historyKey(org), JSON.stringify(h));
  },

  async listHistory(org: string): Promise<EsRecentSearch[]> {
    const raw = await redis.lrange(historyKey(org), 0, -1);
    return (raw ?? []).map((s) => JSON.parse(s as string) as EsRecentSearch);
  },

  async clearHistory(org: string): Promise<void> {
    await redis.del(historyKey(org));
  },

  async removeHistory(org: string, id: string): Promise<boolean> {
    const list = await this.listHistory(org);
    const next = list.filter((h) => h.id !== id);
    if (next.length === list.length) return false;
    await redis.del(historyKey(org));
    for (const h of [...next].reverse()) await redis.lpush(historyKey(org), JSON.stringify(h));
    return true;
  },

  // ── Rollup (computed per read) ────────────────────────────────────
  async rollup(org: string): Promise<EsRollup> {
    const real = await this.indexedCounts(org);
    const history = await this.listHistory(org);
    return {
      indexedCounts: real,
      recentSearches: history.slice(0, 10),
      lastUpdatedAt: history[0]?.ranAt ?? null,
    };
  },

  /** Live counts per entity type — reads the real module stores. */
  async indexedCounts(org: string): Promise<Record<EsEntityType, number>> {
    const [crm, erp, email, social, hd, ab, bi, ik] = await Promise.all([
      import("../crm/crm.service.js"),
      import("../erp/erp.service.js"),
      import("../emailIntel/emailIntel.service.js"),
      import("../socialPlatform/socialPlatform.service.js"),
      import("../helpdesk/helpdesk.service.js"),
      import("../appBuilder/appBuilder.service.js"),
      import("../businessIntelligence/businessIntelligence.service.js"),
      import("../identityKnowledge/identityKnowledge.service.js"),
    ]);
    const [contacts, companies, deals, products, suppliers, pos, sos, messages, posts, comments, tickets, tasks, projects, artifacts, reports] = await Promise.all([
      crm.CrmService.listContacts(org),
      crm.CrmService.listCompanies(org),
      crm.CrmService.listDeals(org),
      erp.ErpService.listProducts(org),
      erp.ErpService.listSuppliers(org),
      erp.ErpService.listPurchaseOrders(org),
      erp.ErpService.listSalesOrders(org),
      email.EmailIntelService.listMessages(org),
      social.SocialPlatformService.listPosts(org),
      social.SocialPlatformService.listComments(org),
      hd.HelpdeskService.listTickets(org),
      ab.AppBuilderService.listTasks(org),
      ab.AppBuilderService.listProjects(org),
      ab.AppBuilderService.listArtifacts(org),
      bi.BusinessIntelligenceService.listReports(org),
    ]);
    return {
      contact: contacts.length,
      company: companies.length,
      deal: deals.length,
      product: products.length,
      supplier: suppliers.length,
      purchase_order: pos.length,
      sales_order: sos.length,
      message: messages.length,
      post: posts.length,
      comment: comments.length,
      ticket: tickets.length,
      task: tasks.length,
      project: projects.length,
      artifact: artifacts.length,
      report: reports.length,
      // Session 125 — approved identity-knowledge records (counted for the
      // search viewer's own permissions via the service's public list).
      knowledge: (await ik.IdentityKnowledgeService.listSearchable(org, { id: "", role: null })).length,
      // Session 141 — curated religion knowledge catalog (static count).
      religion: (await import("../religions/religions.service.js")).RELIGION_CATALOG.length,
      // Session 144 — curated political knowledge catalog (static count).
      politics: (await import("../politics/politics.service.js")).POLITICS_CATALOG.length,
      // Session 150 — curated Life Operating Principles catalog (static count).
      life_principle: (await import("../lifePrinciples/lifePrinciples.service.js")).LIFE_RULES_CATALOG.length,
    };
  },

  // ── Idempotent demo seed (opt-in only) ─────────────────────────────
  async ensureDemoSeed(logger?: { info?: (...a: any[]) => void }): Promise<boolean> {
    const demoOrg = "org-demo-es";
    const existing = await this.listHistory(demoOrg);
    if (existing.length > 0) return false;
    await this.recordSearch(demoOrg, "invoice");
    await this.recordSearch(demoOrg, "support ticket");
    logger?.info?.("[enterprise-search] demo seed complete (org-demo-es): 2 recent searches");
    return true;
  },
};
