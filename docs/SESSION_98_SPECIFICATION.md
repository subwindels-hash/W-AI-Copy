# SESSION 98 SPECIFICATION — ENTERPRISE SEARCH (UNIFIED ORGANIZATION SEARCH)

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S97, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Enterprise Applications
```

---

## 1. OBJECTIVES & ARCHITECTURE

The platform now ships an enterprise application suite (CRM, ERP, Email
Intelligence, Website Builder, Social Platform, Helpdesk, AI Software
Factory, Business Intelligence) — but there is **no way to search across all
of it**. Session 98 adds Enterprise Search: a unified, org-scoped search over
the real module records.

1. **Unified index (computed, never stored)** — a search query is answered
   by scanning the real module records through each module service and
   ranking matches with a deterministic relevance score. No separate index
   to drift out of sync; no fabricated results.
2. **Searchable entity types** — contacts, companies, deals (CRM); products,
   suppliers, purchase/sales orders (ERP); messages (Email Intel); posts &
   comments (Social); tickets & comments (Helpdesk); projects, tasks,
   artifacts (Software Factory); reports (BI).
3. **Deterministic relevance ranking** — each match scores by field-weight
   (name/title/subject weighted above description/body), exact-prefix bonus,
   and recency; results are sorted by score then id (stable).
4. **Facets** — group results by entity type with counts.
5. **Recent searches** — a small org-scoped history (most-recent-first,
   deduped, capped at 20) so users can revisit queries.
6. **Deterministic rollup** — indexed entity counts per type (computed live)
   and recent-search counts.
7. **Tenant isolation by construction** — `es:*` org-scoped keys (history
   only — the index itself is computed from org-scoped module reads),
   fail-closed reads, and the namespace registered in the Session 89
   isolation-audit catalog.

```
                 ENTERPRISE SEARCH
                 -----------------
   [query]  ->  scan real module records (org-scoped) -> rank deterministically
   [facets] ->  group results by entity type (counts)
   [history]->  es:history:<org> (recent queries, capped)
   [rollup] ->  computed per read (never invented)
```

---

## 2. DATA MODEL

All types live in `packages/shared/src/enterpriseSearch.ts` (prefixed `Es`).

### 2.1 Search request & result

- `EsSearchQuery`: `{ q: string, types?: EsEntityType[], limit?: number }`
  (`limit` default 25, max 100).
- `EsSearchHit`: `{ id, type, title, snippet, score, updatedAt, meta? }` —
  `snippet` is a trimmed, highlighted context of the matched field(s);
  `meta` carries a stable reference (e.g. the record's `number` or `sku`).
- `EsSearchResult`: `{ query, tookMs, total, hits: EsSearchHit[], facets:
  EsFacet[] }`.

### 2.2 Facets

`EsFacet`: `{ type: EsEntityType, count }` — computed from the same scan.

### 2.3 Entity types

`EsEntityType` = `contact | company | deal | product | supplier | purchase_order |
sales_order | message | post | comment | ticket | task | project | artifact | report`.

### 2.4 Recent search

`EsRecentSearch`: `{ id, query, ranAt }`.

### 2.5 Rollup (computed per read)

`EsRollup`: `indexedCounts: Record<EsEntityType, number>` (live counts via
the module services), `recentSearches` (up to 10), `lastUpdatedAt`.

---

## 3. SEARCH ENGINE (REAL, DETERMINISTIC)

`search(org, q, types?, limit?)`:

1. Normalize the query (lowercase, trim, split into terms).
2. For each requested (or all) entity type, load the real records through
   the module service and score each record:
   - Field weights: title/name/subject/email/sku → ×3; description/body →
     ×1; tags/hashtags → ×2.
   - Each term contributes `weight × (term in field ? 1 : 0)`; a field
     starting with the term adds +1 (prefix bonus).
   - Recency: records updated within 7 days get +0.5.
3. Keep hits with `score > 0`, sort by `score desc`, then `id asc` (stable).
4. Facets: count hits per type (from the same scan, not a separate query).
5. Record the query in the org-scoped recent-searches history.

The engine reads only org-scoped module records — cross-tenant isolation is
inherited from every module's fail-closed reads, and proven by tests.

## 4. DEMO DATA POLICY

Fresh orgs start empty. `WINDELS_DEMO_DATA=true` seeds an idempotent demo
(`org-demo-es`): 2 recent searches only — the search index itself is always
computed from the live module stores, so it reflects whatever data exists.
See `apps/api/src/enterpriseSearch/bootstrap.ts`.

## 5. API SURFACE (`/api/v1/search`, authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/rollup` | computed search rollup |
| GET | `/query` | run a search (`q`, `types[]`, `limit`) |
| GET | `/history` | recent searches (org-scoped) |
| DELETE | `/history` | clear history |
| DELETE | `/history/:id` | remove one recent search |

## 6. DELIVERY SLICE

1. `packages/shared/src/enterpriseSearch.ts` (+ index export)
2. `apps/api/src/enterpriseSearch/enterpriseSearch.service.ts`
3. `apps/api/src/enterpriseSearch/bootstrap.ts` — demo seed (gated)
4. `apps/api/src/http/routes/enterpriseSearch.ts` + server/index wiring
5. `tenantIsolation.service.ts` — register `es:history` namespace
6. `apps/web/src/lib/enterpriseSearch.ts` + `pages/search/EnterpriseSearchPage.tsx` + router + sidebar
7. `apps/api/src/enterpriseSearch/enterpriseSearch.test.ts`
8. Decision log, PROGRESS.md, CHANGELOG.md

## 7. DEFINITION OF DONE

- [ ] `pnpm build` + `pnpm typecheck` pass; `make verify` green.
- [ ] No `Math.random` in read paths; all guard suites pass.
- [ ] Cross-tenant test proves org B cannot see org A's records in search.
- [ ] Search results are deterministic (identical store + query ⇒ identical
      ordering); scores are real computed values.
- [ ] UI renders real API data with demo-honesty rules intact.
