# Session 146 Runtime Validation Checklist — Politics Global Expansion

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 146 stays 🟡 VERIFIED (partial).

---

## 1. Current Leadership (§4/§21)

- [ ] Every covered country has a current head of state/government record with `verification: "current_as_of"`, `lastVerified` and `asOfDate`: Nigeria (Tinubu), US (Trump), UK (Starmer + King Charles III), Kenya (Ruto), Ghana (Mahama), SA (Ramaphosa), France (Macron), Germany (Merz), India (Modi), China (Xi), Brazil (Lula), Canada (Carney), Japan (Ishiba), Russia (Putin), Egypt (el-Sisi), Ethiopia (Abiy), Mexico (Sheinbaum), Australia (Albanese).
- [ ] `pol.leader.uk.charles` has `titleKind: "monarch_king"` and role `head_of_state`; `pol.leader.uk.elizabeth` has `monarch_queen` with officeEnd 2022; `pol.leader.nigeria.sultan` has `titleKind: "sultan"`.

## 2. Global Parties & Elections (§9/§10)

- [ ] The 12 global party records resolve (US Democratic/Republican, UK Labour/Conservative, Kenya UDA/ODM, SA ANC/DA, Germany CDU/CSU/SPD, India BJP/INC), each with `selfDescription` distinct from `academicClassification`.
- [ ] The 8 landmark elections resolve with official-source results (e.g. US 2024 "312" electoral votes; Kenya 2022 with the Supreme Court dispute; Germany 2025 with the 5% threshold note).

## 3. Forms, Events, Diplomacy, Movement (§12/§14/§15/§17)

- [ ] `pol.form.federal-monarchy` (UAE/Malaysia examples) and `pol.form.parliamentary-monarchy` (UK/Canada/Japan) resolve.
- [ ] The French, American and Russian Revolutions resolve as `eventType: "revolution"` with non-glorification notes; the Kenya National Accord resolves as a peace agreement.
- [ ] `pol.dip.nigeria-south-africa`, `pol.dip.us-china` (dispute) and `pol.dip.nato-ukraine` resolve.
- [ ] `pol.mov.june12` resolves with MKO Abiola among its leaders.

## 4. The §26 Questions (now pinned)

- [ ] "Who is the King of the United Kingdom?" → Charles III.
- [ ] "Who is the current president of France?" → Macron.
- [ ] "What political parties exist in the United States?" → Democratic + Republican.
- [ ] "What political parties have governed Nigeria?" → ≥5 Nigerian parties (NPN, NCNC, PDP, APC, NPC…).
- [ ] "How does the Nigerian Senate work?" → Nigeria's country profile and the 1999 constitution rank first.
- [ ] "Explain the 2024 United States presidential election" → the US 2024 election record.
- [ ] "What happened during the French Revolution?" → the revolution event.
- [ ] "Who is the Sultan of Sokoto?" → the Sultan record.

## 5. Integrity & Regression

- [ ] `GET /politics/integrity` returns `{ ok: true, issues: [] }` with the 208-record catalog; `GET /politics/catalog` reports `recordCount > 200`.
- [ ] The Sessions 144–145 answers still work (history of Nigeria, first president, list-all, current president, elections, ministers, senators, military governments, transition, comparisons, fact-vs-opinion, update engine).
- [ ] Nonsense questions still return the honest no-knowledge answer.
- [ ] `node audit/build-inventory.mjs` lists `politics` as **COMPLETE**.
