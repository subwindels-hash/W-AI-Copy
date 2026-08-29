# Session 160 — Scientific completion (unfinished-module track, 6/N)

**Module:** `scientific` (Session 68)
**Status:** 🟡 VERIFIED (partial)

## What was unfinished

- `dashboard()` called `ensureBootstrapped()` on first GET (a read was still a seeder).
- Seed used RNG for `progressPct`, `simulations`, `citations`, `relevanceScore`, `confidence`, evidence counts and random status.
- Empty org: `collaborators: 0`, `citationsTracked: 0`, `simulationsRun30d: 0`, `knowledgeGraphNodes: 0`, `knowledgeGraphEdges: 0` — structural zeros that look measured.
- `publicationsInProgress` counted hypotheses with `status === "testing"` (there is no publication ledger).
- `topDomains` assigned papers by round-robin because papers had no domain.
- PlatformPage `ScientificTab` divided `papersIndexed` / KG counts by `1e6` and labelled them "M" — 12 papers displayed as "0M".
- No list/create for experiments or hypotheses; no POST papers; no unit tests; no `/app/scientific`; no TI catalog for `sci:*`.

## What this session adds

- Reads never seed. Demo seed (when `WINDELS_DEMO_DATA`) writes planned/proposed records with null citations, relevance and confidence — no RNG progress or citation counts.
- `citations` / `relevanceScore` / `confidence` are `number | null`. KG nodes/edges, collaborators and `simulationsRun30d` are null when unmeasured.
- `publicationsInProgress` / `publicationsPublished30d` stay 0 (no publication ledger). `citationsTracked` is the sum of recorded `paper.citations`, or null.
- `topDomains` counts only records that carry a domain.
- List + create for experiments, papers and hypotheses; PATCH experiment status (stamps `completedAt` on completed).
- `/app/scientific` console (Experiments / Literature / Hypotheses). Empty KG/collaborators/simulations show "—".
- `sci:exp/exps/pap/paps/hyp/hyps/meta` + existing `sci:notes` catalogued. Bare `sci` is never added.
- Existing dashboard / papers search / notes paths kept.

## Not claimed

A live Crossref, PubMed or arXiv index, a research knowledge graph, a collaborator register, or a 30-day simulation event ledger. Experiment.simulations is an operator-entered lifetime total.
