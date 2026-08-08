# Session 146 — Politics Global Expansion: Current Leaders, Monarchs, Parties, Elections, Revolutions & Diplomacy

**Module:** `politics` (global expansion added to the Sessions 144–145 module)
**Mount:** `/api/v1/politics` (unchanged)
**Status:** COMPLETE (catalog 166 → 208 records; 75 unit tests + 17 e2e cases)
**Date:** 2026-08-08 · **Branch:** `arena/019fe26a-win`

---

## 1. Why This Session Exists

A second line-by-line audit of the re-sent Session 144 specification found
these remaining gaps, all closed here:

| Spec item | Gap found | Fixed |
| --- | --- | --- |
| §4/§21 | Nine covered countries had **no current head of state/government record** | `pol.leader.france.macron`, `pol.leader.china.xi`, `pol.leader.russia.putin`, `pol.leader.brazil.lula`, `pol.leader.canada.carney`, `pol.leader.japan.ishiba`, `pol.leader.egypt.sisi`, `pol.leader.mexico.sheinbaum`, `pol.leader.australia.albanese` — all `current_as_of` + Last Verified. Every covered country now has a current leader record. |
| §4 King/Queen/Sultan, §6 traditional rulers | **No monarch or traditional-ruler records at all** (the spec explicitly lists King, Queen, Sultan) | `pol.leader.uk.charles` (King, current), `pol.leader.uk.elizabeth` (Queen, 1952–2022), `pol.leader.nigeria.sultan` (Sultan of Sokoto — §6 "traditional rulers where politically relevant"). |
| §9 | Parties existed only for Nigeria | 12 global parties: US Democratic + Republican, UK Labour + Conservative, Kenya UDA + ODM, SA ANC + DA, Germany CDU/CSU + SPD, India BJP + INC — each with self-description vs academic classification. |
| §10 | Elections existed only for Nigeria | 8 landmark elections: US 2024, UK 2024, Kenya 2022, SA 2024, Ghana 2024, Germany 2025, India 2024, France 2024 — with official-source results, importance and disputes. |
| §12 | "Federal monarchy" and "Parliamentary monarchy" missing | `pol.form.federal-monarchy` + `pol.form.parliamentary-monarchy`. |
| §15 | No revolutions, no explicit peace agreements | French Revolution (1789), American Revolution (1776), Russian Revolution (1917), and the Kenya National Accord (2008 peace agreement) — all with non-glorification notes. |
| §17 | Only Nigerian-centric diplomacy | Nigeria–South Africa (bilateral), United States–China (strategic rivalry), NATO–Ukraine (negotiation). |
| §14 | No constitutional/pro-democracy movement record for June 12 | `pol.mov.june12` (MKO Abiola, NADECO, the 1993–99 struggle, Democracy Day). |
| §26 | "What political parties have governed Nigeria?" and "How does the Nigerian Senate work?" were not reliably answerable | Pinned by new engine refinements (below) and both are now unit- and e2e-tested. |

The catalog grows from 166 to **208 records** (42 new).

## 2. Engine Refinements (each pinned by tests)

1. **Possessive-stripping in tokens** — `"nigeria's"` → `"nigeria"` so possessive questions match (the previous failure mode).
2. **Plural stemming** — `parties → party`, `senators → senator` via candidate forms.
3. **Acceptance threshold raised to 6** with **ministry boost +6** (the direct answer to "who are the current ministers?"), governor/legislator/party +4, military rulers +5 (including leaders whose title contains "Military" — Buhari/Obasanjo served both roles), and a country-name-prefix boost for government_how questions ("Nigerian" → Nigeria ranks first for "How does the Nigerian Senate work?").
4. **Leader timelines filter to heads of state/government** — traditional rulers (the Sultan) no longer pollute the §19 timeline.
5. **Searchable text extended** — title/office/jurisdiction/legislature/legislativePowers/executive/executivePowers/history/independence/modernHistory join the search corpus, so "How does the Senate work?" matches the institutional fields.

## 3. Tests

- **Unit (`politics.test.ts`, +17):** current leaders for all 18 covered countries (with Last Verified); monarchs (King/Queen/Sultan); 12 global parties (self-description ≠ academic classification); 8 global elections (with official-source results); the two new government forms; 4 revolutions/peace-agreement events; 3 new diplomacy records; the June 12 movement; and the newly answerable §26 questions (King of the UK, current French president, US parties, Nigerian governing parties, the Nigerian Senate, the US 2024 election, the French Revolution, the Sultan of Sokoto). Integrity clean at 208 records.
- **E2E (`tests/e2e/politics.spec.ts`, +4):** current leaders with Last Verified; global parties/elections resolve; the §26 additions answer; integrity clean at 200+.
- Total `politics`: **75 unit tests** + **17 e2e cases**.

## 4. Honesty Guarantees (unchanged, now global)

Current leaders for every covered country carry `current_as_of` + Last
Verified; election numbers stay official-source-bound; revolutions and wars
carry non-glorification notes; the neutrality, fact-vs-opinion and
never-overwrite guarantees are untouched.

## 5. Docs

- This specification + `docs/SESSION_146_RUNTIME_VALIDATION_CHECKLIST.md`.
- PROGRESS.md row 146; CONVENTIONS.md decision log (Session 146);
  `audit/module-inventory.json` regenerated.
