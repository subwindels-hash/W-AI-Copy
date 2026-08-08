# Session 141 — Global Religion, Belief & Spirituality Knowledge System (`religions`)

**Module:** `religions` (new core capability)
**Mount:** `/api/v1/religions`
**Status:** COMPLETE (routes = 12, shared contract = ~900 LOC incl. pure engines, curated catalog = 130+ records, unit suite + E2E spec)
**Date:** 2026-08-08 · **Branch:** `arena/019fe26a-win`

---

## 1. Existing Infrastructure Reused (Untouched)

| Existing System | How It Is Reused by `religions` |
| --- | --- |
| **Auth / sessions** | Every route is behind `authenticate`; catalog reads work for any authenticated session, the expansion pipeline requires an organization (403 without one). |
| **Redis (`db/redis.js`)** | Org-scoped submissions under `rel:sub:idx:<org>` / `rel:sub:i:<org>:<id>` and the globally shared approved-extension store `rel:ext:idx` / `rel:ext:i:<id>` (zset + JSON string, in-memory fallback — the `pay:tx` pattern). |
| **Tenant Isolation (S89)** | `rel:sub` catalogued `org_scoped`; `rel:ext` catalogued `shared` by design (globally curated approved knowledge, no org segment). |
| **Enterprise Search (S98/S125)** | New `religion` entity type: the curated catalog is indexed with the same relevance ranking; the rollup counts it. |
| **Web console conventions** | `apps/web/src/lib/religions.ts` typed client + `/app/religions` console + sidebar "World Religions". |
| **Super Admin authority (S125 pattern)** | Submission approval requires `role === "SUPER_ADMIN"` re-checked in the service, so a mis-wired route cannot bypass it. |

No existing module, route or contract is modified except the additive mount points (`server.ts`, `TI_NAMESPACE_CATALOG`, `ES_ENTITY_TYPES` + scan case, shared index re-export).

---

## 2. What Was Missing (Why This Session Adds It)

WINDELS AI OS had no dedicated religion knowledge layer. Session 141 adds one that can recognize, understand, compare, explain and teach the world's religious heritage — with the neutrality requirement (§14) enforced structurally:

1. **No superiority claims.** No record ranks religions; contested claims are attributed ("Christian traditions generally teach X, while Islamic traditions generally teach Y"); "Which religion is true?" is answered by the neutrality policy — truth claims are matters of faith, theology, philosophy and personal belief, and WINDELS never claims to have chosen a religion.
2. **No invented teachings, no uniformity assumptions, no erasure.** Indigenous names are preserved as primary (§11/§17), denominations are distinct records from their parent religions (§4), and every tradition carries `controversialNote` where popular misconceptions exist (e.g. Vodun ≠ "voodoo dolls", Yazidism ≠ devil worship).
3. **Unbounded expansion with quality control (§18).** The catalog has no fixed target size; new traditions enter through the ten-step pipeline — identity, classification, sources, history, community review, duplicate detection (aliases are mapped, never duplicated), related/branch mapping, confidence scoring and the Super Admin approval gate.

---

## 3. What Was Built

### 3.1 Shared Contract (`packages/shared/src/religions.ts`, ~900 LOC)

- **Enumerations:** 12 families, 11 categories, 6 statuses, 4 teaching levels, 10 theism types, 5 source types, 5 confidence classes, 18 comparison categories with labels, 8 question intents.
- **Standardized record (§12):** the 38-field `ReligionRecord` — names (alt + indigenous + multilingual), family/category/status/theism, region, ethnic groups, origin (label + approximate year), founder/key figures, teachings, deity concept, spiritual beings, cosmology, creation, humanity, afterlife, salvation, morality, worship, prayer, meditation, rituals, festivals, sacred places, symbols, leaders, law, sacred texts, oral traditions, branches/denominations/schools, history, modern status, distribution, relations, differences, similarities, sources (typed), confidence, last-reviewed date, plus teaching fields (summary/simple/advanced/research note) and neutrality fields (`controversialNote`, `expansionNote`).
- **Question engine:** deterministic classification into definition / comparison / truth_claim / practice / history / family / status / general, with specificity-weighted priorities (a "what is the difference…" question is comparison, not definition).
- **Comparison engine:** the 18 spec categories, values drawn only from each record's own fields, with the standing note that WINDELS does not rank religions.
- **Teaching engine:** beginner / intermediate / advanced / research section plans; the underlying record is unchanged.
- **Expansion types:** the ten steps, submission statuses, check reports, and the create/review Zod schemas (sources required).

### 3.2 Curated Catalog (130+ records, all real)

- **Abrahamic (35):** Judaism, Christianity, Islam, Baháʼí, Samaritanism, Druze, Mandaeism, Rastafari, Yazidism; 24 Christian denominations/movements (Catholic → Assyrian Church, incl. Restorationism); 15 Islamic branches/legal schools/theological schools; 8 Jewish movements + Kabbalah.
- **Dharmic (30):** Hinduism, Buddhism, Jainism, Sikhism; 12 Hindu traditions/schools (Vaishnavism → Tantra); 12 Buddhist schools (Theravada → Tendai); 4 Jain branches.
- **Iranian (3):** Zoroastrianism, Manichaeism, Yarsanism/Ahl-e Haqq.
- **East Asian (8):** Taoism, Confucianism, Chinese folk religion, Shinto, Korean Muism, Vietnamese Đạo Mẫu, Tengrism, Bon.
- **African traditional (18):** Yoruba (Ìṣẹ̀ṣe), Ifá, Vodun, Akan, Igbo (Odinani), Edo, Serer, Waaqeffanna, Dinka, Maasai, San, Zulu, Xhosa, Shona, Kongo, Dogon, Fon, Ewe — with indigenous endonyms preserved.
- **African diaspora (3):** Haitian Vodou, Santería (Regla de Ocha), Candomblé.
- **Indigenous American (11):** Navajo/Diné, Lakota, Cherokee, Haudenosaunee, Hopi, Inuit, Maya, Aztec/Mexica, Inca, Mapuche, Guaraní.
- **Oceanian (6):** Aboriginal Australian (the Dreaming), Māori, Polynesian, Melanesian, Micronesian, Hawaiian.
- **Ancient (16):** Egyptian, Mesopotamian, Sumerian, Babylonian, Assyrian, Canaanite, Phoenician, Greek, Roman, Etruscan, Norse, Germanic, Celtic, Slavic, Baltic, Israelite, Minoan, Thracian, Scythian + Gnosticism — each with honest confidence (fragmentary traditions are `uncertain`).
- **NRM & humanistic (4):** Wicca, Modern Paganism, Secular Humanism, Unitarian Universalism.
- **Policy (2):** `pol.neutrality` (how WINDELS teaches religion) and `pol.expansion` (the ten-step process).

### 3.3 Service (`religions.service.ts`)

Catalog meta/families/search (unicode-aware: Hebrew, Yoruba, Han names match; exact names outrank partials), record detail, the Ask engine (definition/comparison/truth-claim/practice/history/family/status + honest no-match), the 18-category comparison engine, teaching levels, the ten-step expansion pipeline with duplicate detection against catalog + pending submissions, cross-org submission isolation, the Super Admin approval gate that publishes approved records into the shared `rel:ext` store (merged into search/ask for every org), stats, an integrity report, and the enterprise-search hook.

### 3.4 Endpoints (`/api/v1/religions/*`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/catalog` | version + counts + neutrality/expansion notes |
| GET | `/families` | the 12 families with counts |
| GET | `/search` | deterministic retrieval + filters (family/category/status/theism/region) |
| GET | `/records/:id` | record detail (catalog or approved extension) |
| GET | `/records/:id/teach?level=` | beginner → research rendering |
| POST | `/ask` | religion question engine (neutrality for truth claims) |
| POST | `/compare` | 18-category comparison, no winner |
| POST | `/submissions` | ten-step expansion pipeline (org-scoped) |
| GET | `/submissions`, `/submissions/:id` | list / detail |
| DELETE | `/submissions/:id` | correction path |
| PATCH | `/submissions/:id` | Super Admin approve/reject |
| GET | `/integrity`, `/stats` | integrity report, rollup |

Routes: 12. Every submission route is org-scoped; approval is Super Admin-only (route-agnostic service check).

### 3.5 UI — Web Client & Console Page

- `apps/web/src/lib/religions.ts` — typed client for all endpoints.
- `/app/religions` (`pages/religions/ReligionsPage.tsx`) with five tabs:
  - **Ask** — question engine with the spec's example questions; the neutrality panel for truth claims; attributed answers with `controversialNote` callouts.
  - **Explore** — family chips, search (indigenous names work), and the full standardized record detail.
  - **Compare** — the 18-category table with the spec's presets (Christianity vs Islam, Hinduism vs Buddhism, Yoruba vs Christianity, ancient vs modern…).
  - **Learn** — level selector for any record; festivals, texts, research notes and sources.
  - **Expand** — the submission form and per-submission check reports; Approve/Reject buttons render only for the Super Admin.
- Sidebar "World Religions" + router `/app/religions`.

### 3.6 Integrations

- **Enterprise Search:** `religion` entity type (catalog indexed; rollup counts it).
- **Tenant Isolation:** `rel:sub` org-scoped, `rel:ext` shared (documented in the catalog).

---

## 4. Honesty Guarantees

1. **Neutrality is structural** — the comparison engine attributes; the truth-claim answer is the policy; the catalog contains no superiority claim (pinned by tests).
2. **No fabrication** — retrieval with no match says "I do not have sufficient verified knowledge…"; submissions default to UNVERIFIED.
3. **No duplicates from alias drift** — the pipeline's duplicate detection maps names to aliases instead of creating new entries.
4. **No erasure** — indigenous names are primary names; `controversialNote` corrects harmful popular misconceptions.
5. **Denominations are not religions** — each has its own record with its relation to the parent explained.
6. **Uncertainty is labelled** — fragmentary ancient traditions carry `uncertain`/`well_supported` with research notes.

## 5. Tests

- **Unit (`apps/api/src/religions/religions.test.ts`, 39 tests):** full spec coverage lists (§2–§8), integrity (clean report; every record has the §12 core fields), the question engine (8 intents + truth-claim neutrality + honest no-match), the comparison engine (18 categories, no winner, missing ids, cross-family), teaching levels, indigenous-name preservation, and the expansion pipeline (10 checks, duplicate detection by name and alias, source requirement, cross-org isolation, Super Admin gate, publish-to-shared-store, double-review refusal).
- **E2E (`tests/e2e/religions.spec.ts`, 10 cases):** live API — catalog, unicode search, ask routing, truth-claim neutrality, comparison, teach levels, submission + duplicate + approval flow, source verification, 404s.
- Guard suites: no `Math.random`, no simulation markers, no demo-data seeding (catalog is curated static content).

## 6. Docs

- This specification + `docs/SESSION_141_RUNTIME_VALIDATION_CHECKLIST.md`.
- PROGRESS.md row 141; CONVENTIONS.md decision log (Session 141); `audit/module-inventory.json` regenerated.
