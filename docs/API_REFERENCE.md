# API REFERENCE MANUAL — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Developer Reference  

---

## 1. RESTFUL ENDPOINTS

WINDELS AI OS exposes a strict, JSON-based RESTful API under the `/api/v1` namespace.

---

## 2. CORE REST ROUTES

### 2.1 Authentication & Profile
*   `POST /api/v1/auth/login`: Email and password login.
*   `POST /api/v1/auth/mfa/verify`: TOTP validation.
*   `POST /api/v1/auth/refresh`: JWT token rotations.

### 2.2 ETL Pipelines
*   `GET /api/v1/etl/pipelines`: Retrieve pipelines.
*   `POST /api/v1/etl/pipelines`: Add a pipeline.
*   `POST /api/v1/etl/pipelines/:id/run`: Trigger immediate run.

### 2.3 Surveillance Cameras
*   `GET /api/v1/camera/feeds`: List feeds.
*   `POST /api/v1/camera/feeds`: Register camera.
*   `GET /api/v1/camera/feeds/:id/alerts`: Retrieve alarms.

### 2.4 Cognitive / World Model (Session 110)
*   `GET /api/v1/cognitive/dashboard/rollup`: Platform observability rollup + observations + world model.
*   `GET /api/v1/cognitive/world-model`: Deterministic world-model rollup (counts, coverage, blind spots).
*   `GET|POST /api/v1/cognitive/entities`, `GET|PATCH|DELETE /api/v1/cognitive/entities/:id`: Modelled entities (admin writes).
*   `GET|POST /api/v1/cognitive/observations`, `GET|DELETE /api/v1/cognitive/observations/:id`: Evidence-backed observations; `origin` is `human`, `integration` or `ai_assisted` and confidence is always self-reported.
*   `GET|POST /api/v1/cognitive/hypotheses`, `GET|DELETE /api/v1/cognitive/hypotheses/:id`: Hypotheses; created `open`.
*   `POST /api/v1/cognitive/hypotheses/:id/resolve`: Human resolution (`supported`/`refuted`/`inconclusive`) with a mandatory note.

### 2.5 Global Command Center (Session 111)
*   `GET /api/v1/command/dashboard/rollup`: Session 70 executive rollup + `directives` + the `operations` rollup.
*   `GET /api/v1/command/operations`: Deterministic operations rollup (incident counts, measured MTTR, regional posture, briefing/initiative/directive tallies).
*   `GET|POST /api/v1/command/incidents`, `GET|PATCH|DELETE /api/v1/command/incidents/:id`: Incident register (admin writes); incidents are always created `open`.
*   `POST /api/v1/command/incidents/:id/updates`: Append a human timeline note, optionally moving to `acknowledged`/`mitigating`.
*   `POST /api/v1/command/incidents/:id/acknowledge`: A named human takes ownership (`409` if already acknowledged).
*   `POST /api/v1/command/incidents/:id/resolve`: Human resolution with a mandatory note; this is the only writer of `resolvedAt`, so MTTR is measured.
*   `GET|POST /api/v1/command/regions`, `GET|PATCH|DELETE /api/v1/command/regions/:id`: Declared regional footprint; a region is `unreported` until an operator reports it.
*   `POST /api/v1/command/regions/:id/status`: Operator status report (`400` if `servicesUp` exceeds the declared `servicesTotal`).
*   `GET|POST /api/v1/command/briefings`, `GET|DELETE /api/v1/command/briefings/:id`: Executive briefings; `origin` is `human` or `ai_assisted` (advisory, counted separately).
*   `GET|POST /api/v1/command/initiatives`, `GET|PATCH|DELETE /api/v1/command/initiatives/:id`: Strategic initiatives; `progressPct` is always self-reported.
*   `GET|POST /api/v1/command/directives`, `GET /api/v1/command/directives/:id`, `PATCH /api/v1/command/directives/:id/status`: Session 70 directive log with issuer and transition author.

### 2.6 Conversations / Messaging (Sessions 2/3/4 + 112)
*   `GET|POST /api/v1/conversations`, `GET|PATCH|DELETE /api/v1/conversations/:id`: Session 2 thread CRUD (`DELETE` is a soft delete).
*   `GET|POST /api/v1/conversations/:id/messages`: Session 3/4 message list and send; `Accept: text/event-stream` streams the reply over SSE.
*   `GET /api/v1/conversations/search`: Message-body search across threads the caller can read. Labelled `matchKind: "substring_case_insensitive"`; excerpts are verbatim slices at a reported `matchOffset` — not semantic, not ranked.
*   `GET /api/v1/conversations/unread`: Unread summary; reports `inspectedConversations` and `truncated` so a capped scan is never mistaken for a total.
*   `GET /api/v1/conversations/deleted`: Soft-deleted threads the caller created, with `restorableByCaller`.
*   `GET|POST /api/v1/conversations/:id/participants`, `DELETE /api/v1/conversations/:id/participants/:participantId`: Roster. Adding a user verifies their `Membership` in the thread's organization (`404` otherwise); duplicates are `409`; the creator's seat cannot be removed (`409`).
*   `GET /api/v1/conversations/:id/read-state`, `POST /api/v1/conversations/:id/read`: Unread position. Every response carries `basis` (`last_read_at` / `never_marked_read`) and `excludesOwnMessages: true`; a future `at` is rejected `400`.
*   `GET /api/v1/conversations/:id/stats`: Measured statistics (`measuredFrom: "stored_messages"`). Usage counters no message recorded are `null`, never `0`, and `messagesMissingUsage` reports how many rows lacked them.
*   `GET /api/v1/conversations/:id/transcript`: Ordered transcript, `format=json|markdown`; redacted bodies export as `[redacted]`.
*   `GET /api/v1/conversations/:id/digest`: Extractive digest — `kind: "extractive_deterministic"`, `aiGenerated: false`, verbatim disclaimer. Quotes stored bodies and counts terms; no model is invoked.
*   `POST /api/v1/conversations/:id/restore`: Creator-only restore of a soft-deleted thread (`409` if not deleted, `403` if not the creator).
*   `GET|PATCH|DELETE /api/v1/conversations/:id/messages/:messageId`: Single message with its audit trail; `PATCH` is an author-only edit of a **user** message (`409` on model output, `403` on another author) recording an append-only trail; `DELETE` redacts the body (author or thread creator), keeping the row, its ordering and its usage counters.

### 2.7 Derivatives & Fixed Income (Sessions 81 + 113)

**Session 81 — stateless calculators (unchanged, still unauthenticated):**
*   `POST /api/v1/derivatives/option-greeks`: Black-Scholes Greeks. May legitimately return `OPTIONS_CHAIN_REQUIRED` rather than invent a volatility.
*   `POST /api/v1/derivatives/implied-vol`: Newton-Raphson IV solver; `iv` is `null` when the solver cannot converge — never a clamped boundary presented as a solution.
*   `POST /api/v1/derivatives/option-payoff`: Multi-leg payoff at one spot.
*   `POST /api/v1/fixed-income/bond-analytics`: Duration / convexity / sensitivity from supplied terms.

**Session 113 — the desk (authenticated; mutations require an administrator):**
*   `GET /api/v1/derivatives/desk`: Rollup across both books. Declares `marketDataSource: "none_operator_entered_only"` and carries the valuation disclaimer verbatim.
*   `GET|POST /api/v1/derivatives/positions`, `GET|PATCH|DELETE /api/v1/derivatives/positions/:id`: The option book. Every mark is `markSource: "operator_entered"` with a `markedAt` timestamp; only a re-mark refreshes it. `markSpot`, `impliedVol`, `riskFreeRate` and `premiumPerShare` are `null` when nobody supplied them.
*   `GET /api/v1/derivatives/portfolio`: Exposure grouped per underlying (raw delta/gamma are summed only within a symbol) with delta *notional* as the only cross-symbol directional total. Positions that cannot be priced are excluded and listed in `unpriceable[]` with a reason; `deltaNotional` and `unrealizedPnl` are `null` when nothing supports them. Marks older than 24h report `markFreshness: "stale"`.
*   `POST /api/v1/derivatives/portfolio/scenarios`: Spot × volatility grid, `method: "full_reprice"` (not a Taylor expansion), capped at 400 cells. Each cell reports `pricedPositions`, which drops where a shock invalidates the model for a position.
*   `POST /api/v1/derivatives/portfolio/hedge`: Static delta-neutral share count, `method: "static_delta_neutral"`, gamma explicitly ignored. A book with nothing priced is reported as unmeasured, not flat.
*   `POST /api/v1/derivatives/payoff-curve`: Sampled expiry payoff with linearly-interpolated breakevens. Extremes are named `maxProfitInRange`/`maxLossInRange`, and `unboundedAbove`/`unboundedBelow` flag payoffs that keep moving past the sampled boundary.
*   `POST /api/v1/derivatives/parity-check`: Put-call parity residual with the rich leg named. States in the payload that it is not an arbitrage claim.
*   `GET|POST /api/v1/derivatives/bonds`, `GET|PATCH|DELETE /api/v1/derivatives/bonds/:id`: Fixed-income holdings. A holding needs a yield or a price; creating or updating into a state with neither is `400`.
*   `GET /api/v1/derivatives/bonds/ladder`: Market-value weighted duration/convexity/yield (`null`, not `0`, when nothing can be valued), maturity buckets, contractual cashflows, and `shiftsBps` parallel shifts computed as a full reprice against the model's own base valuation.

---

## 3. ERROR SCHEMA

All API validation errors return standard JSON responses:
```json
{
  "success": false,
  "error": "VALIDATION_FAILED",
  "message": "Required fields are missing",
  "details": []
}
```
