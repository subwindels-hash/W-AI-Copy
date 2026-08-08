# Session 143 — Religion Knowledge Coverage Completion & AI Response Safety

**Module:** `religions` (coverage completion + §19 safety layer added to the Session 141/142 module)
**Mount:** `/api/v1/religions` (new route: `POST /safety`)
**Status:** COMPLETE (catalog 145+ records; 69 unit tests + 21 e2e cases)
**Date:** 2026-08-08 · **Branch:** `arena/019fe26a-win`

---

## 1. Why This Session Exists

A line-by-line audit of the Session 141 specification against the shipped
implementation found the catalog complete except for a handful of traditions
**explicitly named in the spec** that had no record, and one functional gap:

| Spec item | Gap found | Fixed |
| --- | --- | --- |
| §3 ancient religions | Akkadian, Ancient Persian, Ancient Armenian, Ancient Arabian (pre-Islamic), Hittite — all named in the spec, none present | 5 new records (`anc.akkadian`, `anc.iranian`, `anc.armenian`, `anc.arabian`, `anc.hittite`) |
| §5 Islamic knowledge | "historical Islamic movements" — no Mu'tazila | `sch.mutazila` (the rationalist school, the Mihna, its influence on Ash'ari/Maturidi theology) |
| §5 Islamic knowledge | "regional Islamic traditions" — nothing regional | `den.west-african-islam` (the Qadiriyya, Tijaniyya, Muridiyya; the Sokoto reform; the Magal of Touba) |
| §6 Judaism | "regional Jewish traditions" and "historical Jewish movements" | `den.jewish-regional` (Ashkenazi / Sephardi / Mizrahi) and `den.jewish-movements` (Haskalah, Musar, religious Zionism) |
| §7 Hindu | "modern Hindu movements" (explicitly listed) | `den.modern-hindu` (Brahmo Samaj, Arya Samaj, Ramakrishna Mission, ISKCON — in `branches`) |
| §9 Jain | "Jain philosophical traditions" | `sch.anekantavada` (many-sided reality, syadvada) |
| §10 Sikh | "Sikh historical movements" | `den.sikh-movements` (Namdhari, Singh Sabha, the Akali movement) |
| §19 AI response safety | No mechanism distinguished the seven categories or refused hate content | Full safety layer (below) |

The catalog grows from 133 to **145 records** — still with no fixed target
count (§1/§20: the expansion pipeline governs all future additions).

## 2. The §19 AI Response Safety Layer

### 2.1 Classifier (`packages/shared/src/religions.ts`)

`classifyReligionResponseSafety(text)` — deterministic, narrow and
conservative. It classifies any message into the spec's categories:

`religious_education` · `religious_advice` · `theology` · `personal_faith` ·
`historical_information` · `religious_criticism` · `religious_discrimination`
· `hate_speech`

It flags **only** clear hate speech and blanket discrimination:

- **hate** — calls to harm a group ("kill all Muslims"), dehumanization
  ("all Jews are vermin"), unambiguous religious slurs, and blanket
  condemnation of a whole religion as evil ("Judaism is evil and
  worthless", "Islam is a religion of terror").
- **discrimination** — people-level blanket statements ("All Muslims are
  terrorists"), ban/remove/expel calls ("get rid of all X").

Everything else passes through: "Is Islam violent? (a historical question)",
"I disagree with the doctrine of X because of reason", "I am a Muslim and I
believe…" are never flagged. Educational discussion of religion — including
criticism and history — remains fully available (§19).

### 2.2 Enforcement points

- **`ReligionsService.ask`** — a flagged message returns
  `mode: "safety_refused"` with the `pol.response-safety` policy record as
  the match and an educational redirect; the normal teaching path is
  untouched.
- **`ReligionsIntegrationsService.chatAnswer`** — the chat surface inherits
  the same guard: refusal text, no sections, respectful follow-ups.
- **`POST /api/v1/religions/safety`** — exposes the classifier itself
  (educational: shows *why* a message was refused).
- **`pol.response-safety`** — new policy record documenting the distinction
  and the refusal posture.

### 2.3 UI

The `/app/religions` Integrations tab gained a **Response safety (§19)**
panel: type a message, see its category and whether it is allowed or
refused, with the explanation.

## 3. Tests

- **Unit (`religions.test.ts`, +11):** coverage completion (5 ancient
  records present + substantive; Mu'tazila/Jewish/Islamic-regional records;
  modern Hindu / Anekantavada / Sikh movements; integrity still clean;
  catalog >140 records); the safety classifier (all seven categories;
  hate vs discrimination taxonomy; educational/critical questions never
  flagged); `ask()` refusal with the policy record; the policy record's
  existence.
- **Unit (`religions.integrations.test.ts`, +2):** chat refuses hate with an
  educational redirect; educational and critical questions stay available.
- **E2E (`tests/e2e/religions.spec.ts`, +3):** the five ancient records
  resolve with real content; `POST /safety` distinguishes the categories;
  ask + chat refuse hate and keep education available.
- Total `religions` unit tests: **69** (50 + 19); e2e: **21**.

## 4. Honesty Guarantees (unchanged)

No superiority claims; attributed comparisons; truth-claim neutrality; no
invented teachings; indigenous names preserved; denominations distinct;
uncertainty labelled; **now also**: hate speech and blanket discrimination
are refused with an educational redirect while criticism and history remain
available.

## 5. Docs

- This specification + `docs/SESSION_143_RUNTIME_VALIDATION_CHECKLIST.md`.
- PROGRESS.md row 143; CONVENTIONS.md decision log (Session 143);
  `audit/module-inventory.json` regenerated.
