# Session 145 Runtime Validation Checklist — Politics Coverage Completion (§17 Diplomacy & Remaining Spec Items)

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 145 stays 🟡 VERIFIED (partial).

---

## 1. Diplomacy Database (§17)

- [ ] `GET /politics/records/pol.dip.nigeria-us` returns a `diplomacy` record with partners, `relationshipType: "bilateral_relationship"`, key events, current status, and the dynamic-info note about ambassadors.
- [ ] `pol.dip.nigeria-china` (strategic partnership), `pol.dip.nigeria-uk`, `pol.dip.treaty-lagos` (Treaty of Lagos 1975), `pol.dip.treaty-abuja` (Abuja Treaty 1991), and `pol.dip.ecowas-alliance` (dispute) all resolve with real content.
- [ ] `GET /politics/search?q=Nigeria and China` finds the bilateral record; `?q=Treaty of Lagos` finds the treaty.

## 2. Remaining Spec Items

- [ ] `org.icc` resolves with membership "124 states parties" (§16 international courts).
- [ ] `pol.ideo.democratic-socialism` and `pol.ideo.pan-nationalism` resolve with advocacy notes (§13).
- [ ] `pol.mov.ogoni` (leaders include Ken Saro-Wiwa), `pol.mov.mau-mau`, and `pol.mov.endsars` resolve (§14).
- [ ] `pol.concept.democracy` and `pol.concept.elections` resolve as `concept` records; `pol.form.multi-party` resolves (§31/§12).
- [ ] `pol.leader.germany.merkel` (chancellor, head of government) and `pol.leader.germany.merz` (`current_as_of`) resolve (§4/§5).
- [ ] `pol.event.kenya.2008-crisis` and `pol.event.kenya.2017-annulment` resolve (§15).

## 3. The Completed §26 Questions

- [ ] "Who are the current Nigerian senators?" returns Akpabio, Jibrin and Oshiomhole with `current_as_of` verification.
- [ ] "Who are Nigeria's current ministers?" returns the seven ministries (Finance, Foreign, Defence, Interior, Education, Health, Works) with current ministers.
- [ ] "Who governed Nigeria before independence?" returns Abubakar Tafawa Balewa (Prime Minister 1957–1966).
- [ ] "Who was Nigeria's first prime minister?" returns Balewa.
- [ ] "Explain democracy" and "Explain elections" return the concept records.
- [ ] "Tell me about Nigeria's military governments" returns the military rulers (Ironsi, Gowon, Obasanjo, Buhari, Babangida, Abacha…).

## 4. Integrity & Regression

- [ ] `GET /politics/integrity` returns `{ ok: true, issues: [] }` with the 166-record catalog.
- [ ] Nonsense questions ("What happened at the Zxqvbn summit of 1987 in Qwertyland?") still return the honest no-knowledge answer.
- [ ] The Session 144 §26 answers (history, first president, list-all, current president, elections) still work.

## 5. UI & Audit

- [ ] The `/app/politics` Countries tab shows the Diplomacy (§17) panel; opening a diplomacy record renders its partners, relationship type and current status.
- [ ] `node audit/build-inventory.mjs` lists `politics` as **COMPLETE** with all routes counted.
