# Session 143 Runtime Validation Checklist — Religion Coverage Completion & AI Response Safety

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 143 stays 🟡 VERIFIED (partial).

---

## 1. Coverage Completion

- [ ] `GET /religions/catalog` reports `recordCount > 140` with the neutrality and expansion notes unchanged.
- [ ] The five §3 additions resolve with substantive content: `anc.akkadian`, `anc.iranian`, `anc.armenian`, `anc.arabian`, `anc.hittite` (each with summary, beginner explanation and sources).
- [ ] `sch.mutazila` (historical Islamic school), `den.west-african-islam` (regional Islamic tradition), `den.jewish-regional` and `den.jewish-movements` resolve.
- [ ] `den.modern-hindu` lists the movements in `branches`; `sch.anekantavada` and `den.sikh-movements` resolve.
- [ ] `GET /religions/integrity` returns `{ ok: true, issues: [] }`.

## 2. Response Safety (§19)

- [ ] `POST /religions/safety` classifies educational questions as `religious_education` (allowed).
- [ ] "kill all Muslims" → `hate_speech`, `isHateful: true`.
- [ ] "all Jews are vermin" → `hate_speech` (dehumanization).
- [ ] "All Muslims are terrorists" → `religious_discrimination`, `isDiscriminatory: true`, `isHateful: false`.
- [ ] "I think this doctrine is wrong because of reason" → `religious_criticism`, never flagged.
- [ ] "Is Islam violent? (a historical question)" and personal-faith statements are never flagged.
- [ ] `POST /religions/ask` with hate content returns `mode: "safety_refused"` with `pol.response-safety` and an educational redirect; ordinary questions still return `mode: "teach"`.
- [ ] `POST /religions/integrations/chat` with hate content returns `mode: "safety_refused"` with no sections and respectful follow-ups; educational and critical questions still answer normally.

## 3. UI & Audit

- [ ] The `/app/religions` Integrations tab shows the Response safety panel; checking a hateful message renders the refused state, an educational message the allowed state.
- [ ] `node audit/build-inventory.mjs` lists `religions` as **COMPLETE** with all routes counted.
