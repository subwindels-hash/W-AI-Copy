# WINDELS AI OS — Engineering Conventions

This file is appended at the end of every session per the roadmap's working agreement.

## Session 1 — Decisions Logged

- **Repository:** Monorepo (pnpm workspaces + Turborepo). `apps/api`, `apps/web`, `packages/shared`, `packages/config`, `ops/deploy`.
- **Runtime:** Node 20+, ESM everywhere (`"type": "module"`, `NodeNext` module resolution on API).
- **Package manager:** pnpm 10 (enforced via `packageManager` field).
- **Backend:** Express 4 + TypeScript. No framework overhead; middleware chain is explicit: `helmet → cors → json → urlencoded → requestId → morgan → routes → errorHandler`.
- **Frontend:** React 19 (RC) + Vite 5 + TypeScript, Tailwind CSS v4 (CSS-first `@theme` tokens) + Framer Motion + Zustand + React Router v6 + lucide-react icons.
- **Database:** PostgreSQL via Prisma. Redis via ioredis (session/cache/queue, initialized at boot; lazily connects, never crashes boot if temporarily down).
- **Auth:** JWT (access tokens) signed with HS256; `JWT_SECRET` required ≥16 chars. Role hierarchy: USER(0) → ADMIN(50) → SUPER_ADMIN(100) (baseline only — full RBAC/ABAC + refresh tokens in Sessions 11+).
- **API envelope:** `{ ok: true, data, meta }` on success; `{ ok: false, error: { code, message, details? }, meta }` on error. Codes: `BAD_REQUEST | VALIDATION_ERROR | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | CONFLICT | TOO_MANY_REQUESTS | INTERNAL_ERROR`. Pagination via `page/perPage/q`. All responses carry `X-Request-Id`.
- **Validation:** Zod schemas at the route layer via `validate({ body, query, params })` middleware.
- **Error model:** `AppError` class with canonical HTTP mapping; unknown errors are logged and redacted in production.
- **Request lifecycle:** Every request gets a `requestId` (from `X-Request-Id` header or random UUID) and a `startedAt` timestamp for latency measurement.
- **Logging:** pino (structured JSON in production; pino-pretty in development) via `pino-http`-style direct integration (manual morgan→pino bridge).
- **Branded IDs:** `UserId`, `OrganizationId`, `WorkspaceId`, `MembershipId`, `InvitationId` via a `Brand<T,B>` type — exported from `@windels/shared`.
- **Seed/bootstrap:** First registered user becomes `SUPER_ADMIN` and owns an auto-created organization + default workspace. `prisma db seed` additionally creates `admin@windels.ai / ChangeMe!234` super admin + "Windels AI" org.
- **Design system tokens:** All palette/semantic colors are CSS variables defined in `apps/web/src/styles/globals.css` under `@theme`. Dark mode is the default; `.glass` utility implements the spec glassmorphism. Reduced-motion respected globally.
- **Folder layout for apps:** API uses `src/http/{routes,middleware}`, `src/services`, `src/db`, `src/config`, `src/utils`. Web uses `src/app` (shell), `src/pages/{route}`, `src/components/{ui,ai}`, `src/store`, `src/lib`, `src/hooks`, `src/styles`, `src/types`.
- **CORS:** `API_CORS_ORIGIN` env var (comma-separated), credentials enabled.
- **Environment:** All env vars validated by Zod on boot (`apps/api/src/config/env.ts`); invalid config exits with field-level errors.
- **Docker:** Unified multi-stage `Dockerfile` that builds web static assets and API into a single runner image; docker-compose provides local Postgres 16 + Redis 7 with healthchecks and persistent volumes.
- **CI:** GitHub Actions on push/PR with Postgres+Redis services, runs typecheck → lint → migrate → build → test.
- **Prisma schema baseline models:** User, UserProfile, Organization, Workspace, Membership, Invitation, UserSession, AuditLog. CUID primary keys, indexed by role/createdAt/organizationId/userId/resource.
- **Placeholder pages:** Modules reserved for future sessions render a small "coming in Session N" placeholder rather than 404 or a broken link — preserves navigation while following the "no fake implementations" rule (clearly marked, no mock data).
- **Favicon:** inline SVG gradient W mark.

## Session 2 — Universal Workspace — Decisions Logged

- **Dashboard data shape:** single aggregate endpoint `GET /workspace/dashboard` returns org, workspace, stats, agents (with active task), recent tasks (8), and activities (20) in one round-trip — avoids FE waterfalls on first paint.
- **Agent role palette (canonical):** Executor=azure ⚡, Researcher=violet 🔬, Analyst=teal 📊, Creative=fuchsia ✨, Coordinator=amber 🧭. These color assignments are reused across all agent cards, chips, and avatars.
- **Agent model is a lightweight stub in Session 2:** only the fields needed for the status grid (name/role/color/emoji/status/activeTask). Session 4 expands it into full AI Employees with system prompt, knowledge, memory, skills, etc. — do NOT duplicate the model.
- **Task status workflow:** TODO → IN_PROGRESS → DONE (click the status icon to advance; reverse click on DONE returns to TODO). BLOCKED and CANCELLED are reserved enums for future slices (Flow/Session 7).
- **Activity feed is append-only:** every task mutation writes an Activity row with userId or agentId and a human-readable message. This is the source for both the dashboard feed and future audit/replay features.
- **Command bar is a universal entry point:** "New task" wired now; Meeting/Upload buttons are visibly present but disabled-with-no-mock (explicitly shown as actions whose implementation belongs to later sessions — no fake handlers).
- **Pagination for tasks:** supports `page`, `perPage`, `q`, `status` query params (shared `PaginationQuery` Zod schema from `@windels/shared`).
- **User context resolution:** `resolveUserContext(userId)` returns the first membership joined asc, carrying the user's default org+workspace into every workspace-scoped endpoint. Later sessions add workspace switching UI.

## Session 3 — AI Chat — Decisions Logged

- **SSE events:** `event: <name>\ndata: <json>\n\n` format; `: connected <ts>` keepalive comment sent immediately after headers; events = `message.created`, `message.delta`, `message.done`, `message.error`, `typing`.
- **SSE disconnect detection:** use `res.on('close', ...)` checking `!res.writableFinished` (NOT `req.on('close')` which fires after body consumed).
- **Accept header routing:** `Accept: text/event-stream` → stream; otherwise buffer deltas into a single JSON response.
- **AI Provider Abstraction:** `AIProvider` interface (`id`, `displayName`, `listModels()`, `chatStream()` returns `AsyncGenerator<CompletionChunk>`); `ProviderRegistry` is vendor-agnostic; `echo` provider always registered; OpenAI when `OPENAI_API_KEY` set; future providers (Anthropic, etc.) drop in via registry.
- **Multipart uploads:** zero-dependency parser in `http/middleware/multipart.ts`; single field uploads, 25MB cap, MIME allowlist, uploads persisted to `uploads/` with sha256 checksum, text extraction for `text/*`.
- **Prompt template interpolation:** `{{var|default}}` syntax; 6 built-in templates per org seeded lazily on first list.
- **Streaming cursor:** in ChatBubble render blinking `|` when message.status === 'streaming'.

## Session 4 — AI Employees — Decisions Logged

- **AgentStatus enum:** IDLE/ONLINE/WORKING/ERROR/PAUSED/OFFLINE (UPPER_SNAKE_CASE in DB, lowered at API boundary).
- **Agent runtime:** in-process polling worker (5s interval) with `runningTaskIds` Set to prevent double-processing; max 3 tasks per tick; builds context from system prompt + recalled memories + retrieved knowledge; uses default model unless agent.modelId set; marks task DONE, records AgentEvent, writes agent memory of result, emits Activity.
- **Memory retrieval:** lexical ILIKE + importance weighting (score = 0.6 * term-coverage + 0.4 * importance); full RAG/vector store deferred to later session.
- **Knowledge retrieval:** ILIKE over title+content, top-K.
- **AutoRemember:** saves task results and relevant conversation snippets as AgentMemory (type CONVERSATION/TASK) with importance ~0.4-0.6; dedupes on exact content.
- **Built-in agents:** marked `isBuiltIn=true`, protected from deletion; CRUD still allowed for customization; seeded with 5 canonical roles and their system prompts/departments/capabilities.
- **Error codes:** added `UPSTREAM_ERROR` (502) to ErrorCode for AI stream failures.

## Session 5 — Canvas — Decisions Logged

- **Canvas coordinate space:** infinite canvas with CSS transform `translate(x,y) scale(zoom)` on a child layer; dots grid background sized by zoom (`backgroundSize = 24*zoom`); screen→canvas conversion: `(sx - tx)/zoom`.
- **Pan/zoom:** mouse-drag empty space to pan; Ctrl/Cmd+wheel to zoom towards cursor; Reset view button. Zoom clamped 0.3–2.0.
- **Blocks:** absolute positioned, draggable via mousedown anywhere on the card (except inputs/handles); bottom-right resize handle (10px corner); blocks carry per-type `content` JSON so shape is flexible across types.
- **Block types shipped:** HEADING (H1-style text), TEXT (paragraph), STICKY (amber note), AI (prompt + streaming/non-streaming generation + result area), TODO (checklist with add/remove/toggle), EMBED (URL/link preview).
- **Connections:** SVG bezier curves with arrowhead markers; output handle is a small circle on the right middle of each block; click-drag-release from an output onto any other block creates a connection; click a connection line to delete; colored strokes (azure/violet/teal/fuchsia/amber/emerald/crimson) with per-color arrow markers.
- **Canvas access:** PRIVATE (creator only), WORKSPACE (same workspace, default), ORGANIZATION (all org members); soft delete (`deletedAt`).
- **AI block generation:** non-streaming JSON for simplicity in this slice; SSE available via Accept header for future live streaming; result persisted into block.content.result.
- **Sidebar:** collapsible canvas list with block/connection counts; new canvas creation inline.

## Session 6 — Windels Talk — Decisions Logged

- **Talk channels:** DM/CHANNEL type, PUBLIC/PRIVATE access; `#general` lazily seeded on first list; channel CRUD + archive (soft delete).
- **Membership:** composite unique on channelId+userId+agentId (NULL-nulls-not-distinct workaround: use findFirst+create instead of upsert to avoid Prisma null-compound-validation issues).
- **Messages:** thread model with threadParentId self-ref, replyCount, lastReplyAt; reactions Json `{ "emoji": ["userId"] }`; edit/delete/soft delete.
- **@mention AI auto-reply:** when message mentions an Agent member (display name @Coordinator etc.), run a streaming AI reply and post it as TalkMessage from that agent.
- **Meetings:** SCHEDULED/LIVE/ENDED/CANCELLED; notetaker agent auto-generates summary+decisions+action items when transcript appended; uses streaming AI with **heuristic fallback parser** (`Name: I will...`, `Decision: ...`, `by Friday`) when model echoes the system prompt.
- **Action Items:** OPEN/IN_PROGRESS/DONE/CANCELLED, priority LOW/MEDIUM/HIGH/URGENT; can be linked to meeting or channel; list endpoint filters by status/meeting/channel/assignee/mine.

## Session 7 — Windels Flow — Decisions Logged

- **Node/edge storage:** nodes, edges, settings, triggers stored as Json columns (free-form graph); topological sort for cycle safety but BFS traversal from trigger honors CONDITION branches.
- **Node types:** TRIGGER/ACTION/AI/CONDITION/LOOP/APPROVAL/DELAY/END — Json-only enums, TS string-literal unions because Prisma doesn't generate consts for enums unused in DB columns.
- **Execution context:** plain object accumulating node outputs keyed by node id; `{{path}}` templating for messages/prompts/bodies; safe mini expression evaluator for conditions (equality/comparison only, no eval).
- **AI nodes:** stream via aiRegistry, try JSON.parse on output, fall back to raw string.
- **Retry:** per-workflow retryCount (0–10) with retryDelayMs between attempts; failure transitions run to FAILED, success to SUCCEEDED.
- **Approvals:** WAITING_APPROVAL state pauses the run; approve endpoint flips back to RUNNING (resumption is synchronous — re-invoke for resumption in later session).
- **Triggers:** manual always, schedule via 30s ticker (everyMs config + nextRunAt in settings), api via public gateway, event/webhook stubs.
- **END node:** returns `{completed, finishedAt}` only (never serialize whole context — that creates circular references and stack overflow).
- **Analytics endpoint:** aggregates runs, success rate, avg duration, 14-day time series, top workflows by run count.

## Session 8 — Design System — Decisions Logged

- **Primitives live in `components/ui/`:** presentational, headless-styled, use cn() + Tailwind v4 theme tokens; forwardRef where appropriate.
- **New components:** Textarea, Select, Switch, Modal (portal + focus trap + escape + backdrop click + framer-motion), Tabs (context-based), Tooltip (hover/focus with delay), Dropdown menu, Skeleton/Spinner, expanded Button (secondary/warning/success) and Badge (slate/secondary/success/warning/danger).
- **Toast system:** Zustand store `useToastStore` + `toast()` helper + `<ToastHost>` portal mounted at app root; 4 kinds (info/success/error/warning); auto-dismiss by duration.
- **Hooks in `hooks/`:** `useMediaQuery`, `useClickOutside`, `useDebounce`, `useKeyboardShortcut` — generic, reusable.
- **Offline detection:** window online/offline events → `<OfflineBanner>` fixed at top with animation.
- **Code splitting:** React.lazy on every page route; Suspense shows `<PageLoader>` with Spinner; route-level chunks for every feature page.
- **Bundle:** main chunk ~442KB / 141KB gzipped; feature pages lazy-loaded (Talk ~11KB, Flow ~9.5KB gz).

## Session 9 — Enterprise Platform — Decisions Logged

- **API keys:** `wnd_` prefix, sha256 hashed at rest (keyHash unique), scopes READ/WRITE/ADMIN, returned plaintext exactly once at creation; list endpoint never exposes secret.
- **Public API gateway:** mounted at `/api/rest/v1` separate from `/api/v1`; uses apiKeyAuth middleware; endpoints mirror a curated stable surface (list workflows, run workflow, list agents, list channels, send message).
- **Webhooks:** per-endpoint HMAC-SHA256 signing secret (`whsec_...`), signature header `Windels-Signature: v1=<hex>`, timestamp `Windels-Timestamp`, event name `Windels-Event`; exponential backoff (2^attempt seconds) up to 5 attempts; failureCount auto-increments; `*` subscribes to all events.
- **Event dispatch:** central `dispatchEvent(orgId, event, payload)` fires all matching active endpoints in the background. Currently fires on workflow.run.succeeded / workflow.run.failed / message.created.
- **Billing (MVP stub):** plans = starter/pro/team/enterprise with starter free; no external payment provider yet; PATCH updates plan/seats/cycle and auto-generates open invoice; Invoice model tracks amount/number/status.
- **Predictive analytics:** 30-day usage aggregates across workflows/messages/conversations/tasks/agents; naive +8% growth projection; text insights based on thresholds.
- **Developer Portal:** `/app/developers` tabs (API keys / Webhooks / REST reference) with scope/event pickers and one-time secret reveal.
- **Analytics page:** stat cards, 14-day stacked bar chart, top workflows table, insights.
- **Settings page:** Account profile, Billing (plan cards + seats/cycle + invoice list), Insights tabs.
- **Sidebar:** Developers nav item added (Code2 icon).

## Session 10 — Enterprise Engineering — Decisions Logged

- **EventBus:** lightweight in-process Map<event, Set<handler>> with `on/off/emit`; `"*"` receives all events as `{event, payload}`. Emit is fire-and-forget but runs handlers concurrently via Promise.all; handlers catch errors to avoid crashing emit.
- **Model Registry:** `capabilities` Json; system models `windels-assistant` (default) and `echo` seeded on boot; `setDefault` flips `isDefault` and demotes others.
- **AI Monitoring:** `recordAiRequest()` called from AI registry; persists provider/model/duration/tokens/status/error + linkage fields (channel, agentId, workflowRunId, conversationId, feature). Aggregations compute totals/rates/by-model breakdown over N days.
- **Plugins:** slug-unique, hooks Json array; system plugins (markdown-export, quick-actions, template-gallery) auto-installed on first boot if missing. Hooks subscribe via EventBus in later sessions.
- **Integrations:** 10 canonical types (slack/discord/email/github/linear/jira/notion/google_drive/s3/webhook); credentials stored as Json with an encrypted-placeholder marker; connect/update/disconnect endpoints.
- **SSO:** supports SAML/OIDC/Google/Microsoft; client secrets never returned in GET responses; `/enterprise/sso/lookup?email=...` for login-redirect discovery.
- **White label:** stored in Organization.whiteLabel Json (appName, logoUrl, primaryColor, secondaryColor, brandingHidden, supportEmail); UI includes live preview.

## Session 11 — Governance — Decisions Logged

- **Permissions:** Prisma `Permission` enum values UPPER_SNAKE in DB (e.g., AUDIT_READ); returned to API clients as same UPPER_SNAKE strings. ROLE_PERMISSIONS map seeded into RolePermission table on boot (idempotent). UserPermission grants additive to role defaults.
- **AuditAction/RetentionResource enums:** only referenced from Json/code (not model columns), so Prisma does NOT generate them into the client — define as TS string-literal unions/consts in the service layer (same pattern as WorkflowNodeType in Session 7).
- **AuditLog.organizationId is nullable** so pre-org events (LOGIN, pre-signup, bootstrap) can still be audited.
- **Alert engine:** subscribes to EventBus `"*"`, matches `organizationId` from payload (every business event MUST carry organizationId in payload), filters rules by org+enabled+event match (exact or `"*"`), evaluates simple condition expressions `path.op.value` (=,==,>,<,>=,<=), writes Alert rows. EMAIL/WEBHOOK channels are logged stubs (MVP); IN_APP always writes to alerts table.
- **Webhook final-failure event:** after all 5 retries exhausted, emit `webhook.delivery_failed` on EventBus so alert rules can pick it up.
- **Workflow events:** `workflow.run.succeeded` and `workflow.run.failed` are now emitted on EventBus (in addition to webhook delivery), payload always includes `organizationId`.
- **Retention policies:** stored on Organization.settings.retention (keyed by UPPER_SNAKE resource name internally); public API GET returns lowercase resource names (messages/runs/logs/audit/conversations/attachments), PUT/POST also accept lowercase — service layer uppercases for DB key. Sweeper runs hourly and deletes old rows per resource.
- **Health checks:** `GET /governance/health` performs live pings and writes a HealthCheck row; latencyMs captured for api/db/redis. Service history returns N minutes of samples.
- **GDPR exports:** synchronous generation (MVP — small payloads) returns base64 data URL download inline; exports tracked in DataExport table with 7-day expiry; supports profile / workflows / conversations / talk types.
- **Compliance report:** static boolean matrix (GDPR/HIPAA/SOC2) — truthful about MVP gaps (encryption-at-rest, backups, change management = false).
- **Public API convention:** enums returned as lowercase strings for URL/JSON ergonomics except Permission (UPPER_SNAKE legacy from Session 1 auth) and Alert severity/channel (UPPER_SNAKE to match Prisma enum).

## Session 12 — Global Platform — Decisions Logged

- **Observability lives in `src/observability/`** (not `services/` or `middleware/`): logger, metrics, tracer, aiObservability. Cross-cutting concerns grow their own folder.
- **Logger API** is `logger.level(message, meta)` — pino-style `logger.level({...}, message)` is **not** supported; all callsites converted to `(msg, meta)` form. Ring buffer is bounded at 2000 entries, circular overwrite.
- **Metric naming:** dot-separated lowercase, units as suffix (`_ms`, `_bytes`, `_count`, `_total`). Tags are low-cardinality (method, route, status, model, action) — never user IDs or request IDs in tags. Time series retained 60 minutes (1-min buckets) and 24 hours (1-hour buckets).
- **Tracer:** W3C-inspired traceparent (`00-<32hex>-<16hex>-01`); response sets `traceparent` + `X-Request-ID`; server spans per request, client spans for slow DB/Redis calls. Avoid `async_hooks` for context — use explicit `runInCtx`/`span.run()`. Child spans beyond 500-entry ring are dropped.
- **Async context caveat:** The tracer's global `currentCtx` is set at middleware entry and cleared on response close. Because we don't use AsyncLocalStorage, code that spawns fire-and-forget async work (e.g., event bus handlers, setTimeout) may not inherit the original request's traceId. When needed, wrap with `runInCtx(ctx, fn)` explicitly.
- **Redis instrumentation caveat:** Do NOT monkey-patch ioredis's internal `sendCommand` — it's called during the connection handshake (AUTH/SELECT) and an `async` patch can deadlock `connect()`. Use the exported `redisCommand(name, fn)` helper for business operations, or hook via `.on('...')` events.
- **DB instrumentation:** Prisma `$use` middleware wraps every query; metrics per (model, action) are safe because the set of model+action pairs is bounded by the schema.
- **AI Observability cost estimates** are rough USD/1K-token prices for common models (gpt-4o, gpt-4, gpt-3.5-turbo, claude-3-*) — dashboards show these as estimates, not billing.
- **Multi-region/CDN/DR are control-plane only in MVP:** the registry/topology/status endpoints are built so the UI and future infra automation can consume them, but there's no real cross-DB replication or CDN provisioning in this single-box dev environment. Region status for non-local regions is `maintenance`.
- **Failover:** in-memory boolean + target + reason; trigger/clear write audit entries (`FAILOVER_TRIGGER`, `FAILOVER_CLEAR`). Real DNS/load-balancer cutover is an infrastructure concern.

## Session 13 — Security — Decisions Logged

- **Logger signature:** `logger.level(message, meta)` — never pino-style `({meta}, msg)`. All callsites enforce this; ring buffer expects this shape.
- **Encryption envelope format:** AES-256-GCM with per-value 12-byte random nonce and 16-byte auth tag. Envelope = `"enc.v1|" + JSON.stringify({v:"enc.v1",kid,data:base64(nonce||ct||tag)})`. Allows key rotation (add new key + set primary; old keys still decrypt). Never put plaintext secrets in DB columns that hold credentials — use `wrapSecret()`/`unwrapSecret()` helpers for single strings or `encryptForStorage`/`decryptFromStorage` for JSON objects.
- **Secret redaction for client reads:** mask to `<first3>***<last2>`; only the internal runtime helpers return plaintext.
- **CSRF:** Double-submit cookie (`XSRF-TOKEN` readable by JS → echoed in `X-XSRF-TOKEN` header for mutating requests). The middleware ENFORCES only for requests with NO `Authorization: Bearer` and NO `X-API-Key` header AND WITH a session cookie, because those auth methods (header-bound tokens) are CSRF-safe (browsers don't auto-attach custom headers cross-site). Pre-auth endpoints (login/register) have no session cookie yet and skip enforcement.
- **Rate limiting:** Redis-Lua atomic token bucket, in-memory LRU fallback when Redis is down (fail-open-friendly but degraded). 9 named tiers; global `/api` limit 300 req/min per IP. Per-route limits applied via `rateLimit(name)` middleware. Headers `X-RateLimit-Limit`, `-Remaining`, `-Reset`; `Retry-After` on 429.
- **Password policy:** 10+ chars, upper+lower+digit+symbol, not in common-password list; enforced on register (zod refinement). Client shows live strength meter.
- **Prompt guard:** Heuristic defense-in-depth ONLY — not a substitute for model safety. Score 0–100, block at ≥80 (AppError.badRequest with code PROMPT_INJECTION_DETECTED), warn at ≥50 (metrics + logs). Single entry point: `aiRegistry.guardedStream(req, {userId, feature})` — ALL 6 AI call sites (agentRuntime, canvas, meeting notetaker, chat messages, talk agent replies, workflow AI nodes) route through it; direct `provider.chatStream` is internal-only.
- **Circuit breakers:** named per external dependency; threshold=5 failures, 30s open → half-open; 2 success probes close. Status + reset in `/security/breakers`. Wrapping outbound HTTP/SSO calls is wired as the helper `withBreaker(name, fn)` — current MVP adds the UI/state tracking; subsequent sessions wrap providers/webhooks/SSO exchanges.
- **Helmet CSP directives:** `style-src 'unsafe-inline'` retained because Tailwind + Vite dev HMR inject inline styles; tighten in production build if a CSS-in-JS solution changes. `connect-src` allows `ws:`/`wss:` for Vite HMR websocket.
- **Trust proxy:** `app.set('trust proxy', true)` so `req.ip` and secure-cookie detection honor X-Forwarded-For/X-Forwarded-Proto from a reverse proxy (production deployments must restrict upstream to the load balancer).

## Session 14 — Website — Decisions Logged

- **Marketing pages live in `src/pages/marketing/`** to keep them distinct from the auth-gated app pages under `src/pages/*`. Shared layout = `MarketingLayout` (PublicNav + PublicFooter + ambient gradient blurs).
- **Public routes are NOT wrapped in ProtectedRoute** and use the MarketingLayout (not AppLayout). The app shell (Sidebar/TopBar) is auth-only.
- **Root `/` behavior:** `HomeRedirect` inspects `useAuthStore(s => s.user)` and sends authenticated users to `/app` and anonymous users to `/home` (the marketing landing). This preserves deep-linking and avoids a flash of marketing for signed-in users.
- **Documentation and legal content are typed TS objects** (arrays of blocks) rather than MDX for MVP simplicity — keeps content co-located with typings, no extra parser/bundler config needed. Content blocks support `h2`, `h3`, `p`, `ul`, `code`, `callout` (docs) / `quote` (blog).
- **Marketing pages reuse the same `ui/` primitives** (Card, Button, Badge, Tabs, Input, Textarea) as the app — no separate marketing component library.
- **The app-internal `/app/developers` page remains** (for API key/webhook management); the public `/developers` marketing page is an informational landing linking to it.

## Session 15 — Mobile App (PWA)
- **Mobile shell lives at `/m/*`** with its own `MobileShell`, bottom tab bar, and page set — do not attempt to make the desktop `/app` sidebar responsive for mobile; mobile gets a dedicated, touch-first UI. Root `/` uses viewport width + `display-mode: standalone` to redirect small/standalone users to `/m` while keeping desktop at `/app`.
- **Touch targets minimum 44×44px** (Apple HIG); `MButton` defaults to h-11 (44px) and `MListItem` to min-h-[52px]. Never rely on hover states on mobile.
- **Safe-area insets:** expose `env(safe-area-inset-*)` as CSS variables `--sat/--sar/--sab/--sal` injected by `useSafeArea()`; apply them via `style={{ paddingTop: "max(8px, var(--sat))" }}` and `pb-[max(24px,var(--sab))]` on fixed top/bottom bars so notch and home-indicator areas are respected.
- **Haptics:** use `useHaptics()` for tactile feedback (light tap on nav/button, medium on send/toggle, success/error patterns); wraps `navigator.vibrate` and is a silent no-op on unsupported browsers — never call `navigator.vibrate` directly.
- **PWA assets:** `manifest.webmanifest` references icons in `/icons/`; maskable icons are the same square (a true adaptive icon would require padding, which we'll harden later). `sw.js` is hand-written (no Workbox) with three caches: `shell-<ver>`, `runtime-<ver>`; bump `VERSION` to invalidate old shells. The SW never caches `/api/*` — offline mutation is handled by the in-app `offlineQueue` IndexedDB store and `/mobile/offline/sync` replay.
- **Push notifications:** `POST /mobile/push/subscribe` requires a deviceId (register device first); backend uses `web-push` with VAPID keys from env (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) — deterministic dev defaults are baked into `env.ts` so local dev works out of the box. Subscriptions that fail 8+ times are auto-deleted. Push delivery always creates a `Notification` row first so the in-app notification center works even when the push fails or the user is already in-app.
- **Biometrics (WebAuthn):** all WebAuthn binary buffers go through `bufToB64u`/`b64uToBuf` helpers (URL-safe base64); `rpId` is taken from `window.location.hostname`. MVP performs structural validation (rpId hash, clientDataJSON.type/challenge) but does **not** verify the signature against the stored COSE public key — full signature verification is a hardening item (Session 22 QA / Session 59 Enterprise Zero-Trust). PIN fallback is bcrypt-hashed and stored on the `MobileDevice.deviceModel` column (intentional reuse to avoid a schema column in MVP; future sessions should move this to `pinHash`).
- **Offline queue:** `lib/mobile/offlineQueue.ts` is an IndexedDB store for queued POST/PATCH/PUT/DELETE actions. The queue flushes automatically on reconnect and on shell mount when the deviceId is known. The server endpoint `/mobile/offline/sync` simply acknowledges and returns recent notifications — true action replay over authenticated REST is a later hardening slice; for MVP the client also refetches critical lists after reconnect.
- **Device detection:** `useIsMobile()` returns true when viewport <768px OR `(display-mode: standalone)` matches, so an installed PWA on desktop/tablet still gets the mobile shell if the viewport is small.

## Session 16 — Desktop App (Electron)

- **Package layout:** desktop app lives in `apps/desktop/` with its own `tsconfig.json`, `package.json`, and `electron-builder.config.mjs`. Source files live under `electron/` (main and preload) and compile to `dist/electron/` — `package.json` "main" is `dist/electron/main.js` (NOT `electron/main.ts`). Renderer code stays in `apps/web/` and is shared between web, mobile PWA, and desktop.
- **Security posture:** sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false. The renderer gets NO Node/Electron require; all privileged operations go through narrow IPC channels exposed in `preload.ts` via `contextBridge.exposeInMainWorld("desktop", …)`. Never add `nodeIntegration: true` or `contextIsolation: false` for convenience — add a typed IPC handler instead.
- **The `window.desktop` API is the single source of truth** for detecting the desktop shell. `useDesktop()` returns the typed `DesktopAPI` or `null`; feature-gate desktop-only UI on that hook rather than userAgent sniffing. Shared types live in `packages/shared/src/desktop.ts` — the preload and web both import from there so the contract stays in sync.
- **Window kinds are a closed union:** `"main" | "chat" | "workflow" | "canvas" | "settings" | "auth"`. Each kind maps to a route via `kindToRoute()`; for MVP these map into the `/d/*` desktop shell (which mounts `DesktopTitleBar` + `Sidebar` + `TopBar` + `AIPanel`). The "auth" kind loads `/auth/login` for sign-in flows. Adding a new window kind requires: (1) extending the type in shared, (2) adding a case in `kindToRoute`, (3) registering the React route under `/d` in `router.tsx`, and (4) optionally sizing defaults in `showOrFocus`.
- **Single-window-per-kind semantics for pop-outs:** `showOrFocus(kind)` focuses an existing window of that kind if one exists; otherwise creates it. Only "main" allows multiple windows (CmdOrCtrl+N). This prevents 17 chat windows stacking up.
- **Pop-out windows reuse the same React pages** as the web app (`ChatPage`, `WorkflowPage`, `CanvasPage`, `SettingsPage`) mounted inside `DesktopLayout`. We do NOT create separate "desktop-chat" page components — desktop-only affordances (native file picker, badge count, titlebar) are added via the `useDesktop()` hook inside existing components so web/mobile/desktop stay at parity.
- **Frameless titlebar (`DesktopTitleBar`) uses `-webkit-app-region: drag`** via the React inline style cast `{ WebkitAppRegion: "drag" } as React.CSSProperties` (TS 5.6's CSSProperties type doesn't know the vendor-prefixed key). Buttons inside the drag region MUST set `no-drag` or clicks won't register. On macOS we use `titleBarStyle: "hiddenInset"` and render the native traffic-light controls (positioned at {x:16,y:16}) — so on darwin we do NOT render our own min/max/close buttons; we render them on Windows/Linux.
- **File system access:** open/save dialogs return files as `{path,name,size,dataBase64}` rather than Node Buffer or File objects (those don't cross the contextBridge). The renderer converts base64 → `Uint8Array` → `File` via the local `base64ToFile()` helper (duplicated in Composer and TalkComposer; extract to `lib/desktop/` when it's needed a third time). `fs:read-user-data`/`fs:write-user-data` are scoped to `app.getPath("userData")` in the main process — do NOT accept arbitrary absolute paths from the renderer; that would break sandboxing.
- **Native notifications:** always use `notify:send` instead of the browser Notification API when running under Electron (the former supports click-to-focus and dock badge; the latter works but lacks badge integration). On unsupported platforms (Linux without libnotify) `Notification.isSupported()` returns false and the IPC returns `{ok:false}` gracefully.
- **Badge counts:** `notify:set-badge(n)` tries `app.setBadgeCount` first, then falls back to `app.dock.setBadge(String(n))` on darwin, wrapped in try/catch because some Electron builds/Linux desktops don't implement it. Never assume a badge API exists.
- **Deep links (`windels://…`) are handled in TWO places:** `second-instance` for Windows/Linux (where a new process is spawned and must forward the URL to the primary) and `open-url` for macOS (where the existing process receives the event). Both funnel through `handleDeepLink(url)` which broadcasts `desktop:deep-link` and `desktop:auth-token` to the main window. When registering as default protocol client, pass `process.execPath` and the app path in `process.defaultApp` mode (dev) so electron-mocha/electron . invocations work.
- **Auto-updater returns early in dev** (`isDev` = `NODE_ENV==="development" || !app.isPackaged`) to avoid spamming GitHub during local development. `checkForUpdatesAndNotify()` is called once on `ready`; the `update-downloaded` event broadcasts `desktop:update-downloaded` to all windows. We do not block on updater errors (no GitHub repo in dev means it will throw; `.catch(()=>{})` swallows).
- **Tray:** uses an inline 16×16 PNG data-URL "W" icon to avoid committing a binary asset. Replace with `resources/tray.png` (and `tray@2x.png` for Retina) before production packaging. Tray click shows/focuses the main window; context menu matches the macOS/Windows dock/jumplist conventions (Open / Open Chat / Check for Updates / separator / Quit).
- **App menu:** cast template to `any[]` because Electron's TypeScript definitions type `role` strings narrowly but our template uses concatenated string constants like `"appMenu"`, `"fileMenu"`, and `"help"` which are valid in Electron 33 but missing from the bundled types on some versions. Accelerator keys use `CmdOrCtrl` prefix to map to Cmd on macOS and Ctrl elsewhere.
- **Dev URL:** When `isDev`, BrowserWindows load `http://localhost:5173<route>` (Vite dev server). When packaged, they load `file://…/web/dist/index.html#<route>` (hash routing so the static file server doesn't 404 on deep paths). This means packaged builds rely on `BrowserRouter`'s fallback being served — but since it's a file:// URL we use the hash to avoid needing a server.
- **Packaging:** `electron-builder.config.mjs` targets macOS (dmg+zip, hardenedRuntime, darkModeSupport), Windows (nsis, non-oneClick, per-machine off, change-dir allowed), Linux (AppImage+deb, Office/Productivity categories). `extraResources` copies `../web/dist` to `resources/web/` — packaged HTML must reference it. `protocols` registers `windels://` at install time. `publish.provider = "github"` for future auto-update via GitHub Releases; code signing is deferred (CI must set `CSC_LINK`/`CSC_KEY_PASSWORD`/`GH_TOKEN`).
- **Version number:** desktop package.json is at `0.16.0` matching Session 16. Bump minor on each session. The sidebar footer label must match: `"Session 16 · v0.16.0"` / `"v0.16"` collapsed.
- **Offline:** Electron reuses the Session 15 service worker automatically (loaded from same Vite/web origin). Do NOT add Electron-specific offline caching on top — the SW + `fs:write-user-data` are sufficient for MVP.
- **Never ship a dev build to users:** confirm `app.isPackaged === true` before distributing. In dev, Vite must be running on :5173 or windows will show a "could not connect" error.

## Session 17 — DevOps & Production

- **Docker images:** Production images live under `infra/docker/`, not at repo root. Multi-stage builds, `NODE_ENV=production`, pnpm with `--prod` for the runner stage (no devDependencies). Always create an unprivileged user (uid 1001 `windels`) and run as non-root; use `tini` as PID 1 for signal handling and zombie reaping. Do NOT run containers as root. The web image is `nginx:alpine` with a templated config that reverse-proxies `/api/` to an `api` upstream via envsubst.
- **docker-compose split:** Root `docker-compose.yml` defines only postgres + redis for local dev (bound to 127.0.0.1). Production is an override file `infra/docker/docker-compose.prod.yml` adding `api`, `web`, `traefik`, and an optional `migrate` profile service. Run with `docker compose -f docker-compose.yml -f infra/docker/docker-compose.prod.yml up -d`; never put dev-only port binds in the prod override.
- **`/health` vs `/health/deep`:** `/health` is a liveness probe (ping DB + cache, <100ms target); `/health/deep` is a readiness probe returning version/commit/uptime/memory/pid/latencies for deploy smoke tests. Prometheus scrapes `/metrics` (text/plain, 0.0.4 format). Never require authentication on these endpoints — they are intended for load balancers/K8s/Prometheus; secure them via network policy / firewall / ingress auth instead.
- **Prometheus metrics naming:** Counter names MUST end in `_total` (the `MetricsPrometheus()` formatter adds it if missing, but new code should use `http_requests_total`-style names directly). Histograms are in **seconds** for HTTP latency and **bytes** for sizes, matching Prometheus conventions. Node/runtime metrics use the `nodejs_` prefix (consistent with the `prom-client` ecosystem). Tag names are snake_case.
- **Background probes:** DB/Redis up/down gauges (`windels_db_up`, `windels_redis_up`) are refreshed by a 15s `setInterval` attached to the health router — the `.unref()` call (or lack of keepalive handle) prevents the interval from keeping the event loop alive during tests. If you add new probes, keep intervals ≤30s and don't make them block shutdown.
- **Kubernetes manifests:** Kustomize is the entry point (`kubectl apply -k infra/k8s`). Per-service manifests are plain YAML (no Helm for MVP); environment-specific overlays can be added as `overlays/staging`, `overlays/prod` when needed. HPA targets 70% CPU / 75% memory for API, 70% CPU for web. Postgres runs as a StatefulSet for dev/staging — production deployments MUST replace it with a managed RDS/CloudSQL instance (documented in `infra/k8s/README.md`).
- **Terraform:** Root module calls reusable `modules/network`, `modules/database`, `modules/redis`, `modules/k8s`. Environments are `dev`, `staging`, `prod` under `infra/terraform/environments/*` with their own backend config (S3+DynamoDB). AWS provider is pinned ~> 5.60. Secrets (db password, etc.) are generated via `random_password` and marked `sensitive = true`; never commit `.tfstate` or `.tfvars` with real values.
- **CI/CD (GitHub Actions):** Every PR runs CI (install → typecheck → build → migrate+seed → test → API smoke). Main-branch pushes also build multi-stage Docker images via Buildx+GHA cache and push to GHCR. CD deploys to staging on main and to production on tag/manual dispatch, using either a kubeconfig secret or SSH deploy; post-deploy health poll retries 30 times at 2s intervals. Load tests (`load-test.yml`) are manual-dispatch to avoid DDoSing staging during merges.
- **Load testing (k6):** Scripts live in `tests/load/` and are invoked via `make test-load` / `pnpm test:load`. Thresholds are declared in `options.thresholds` — HTTP failure rate <1%, p95 latency <300ms for the health endpoint, <2s for chat. Do NOT run the chat load test against production without a dedicated token and approval.
- **E2E testing (Playwright):** Config lives at repo-root `playwright.config.ts` so both `apps/web` and `apps/desktop` can share it (add mobile projects later). Tests live in `tests/e2e/` (not per-app). Use `data-testid` for selectors when the component structure is likely to change; the auth smoke uses input-type fallback because the LoginPage uses standard inputs. `global-setup.ts` auto-starts the API if it isn't already running (SKIP_API_START=1 in CI where it's started explicitly).
- **Makefile:** Every common devops action has a phony target; scripts in `package.json` wrap pnpm/docker/k6/playwright so both `make` and `pnpm` work. Never put secrets in Makefile/scripts — read from environment or `.env`.
- **Grafana dashboards:** Provisioned from `infra/monitoring/grafana/dashboards/*.json`; the API dashboard uses standard Prometheus metric names (`http_requests_total`, `http_request_duration_seconds`, `nodejs_*`, `windels_db_up`) so it also works if we later swap the in-app metrics for `prom-client`.
- **Enterprise framework location:** Session 18 enterprise services live under `apps/api/src/enterprise/{governance,discovery,events,apiGovernance,services}/`. New enterprise modules (e.g. future rate-limit service, service mesh, feature-flag service) should follow the same pattern: a single `.service.ts` file exporting a named `XxxService` singleton object, statically imported by the route module and (where needed) the boot sequence in `apps/api/src/index.ts`. Shared TypeScript types go in `packages/shared/src/enterprise.ts` (re-exported from the shared barrel); do NOT duplicate those types in API or web.
- **Enterprise route layout:** All Session 18 REST endpoints mount under `/api/v1/enterprise/<domain>/...` (e.g. `/enterprise/governance/adrs`, `/enterprise/discovery/services`, `/enterprise/events/publish`, `/enterprise/api-governance/openapi`). The entire `/enterprise/*` tree is behind the `authenticate` middleware; future RBAC (e.g. require SUPER_ADMIN for governance writes) should be added per-handler. Always return the envelope `{ ok: true, data }` for success; errors propagate through `next(e)`.
- **Service registry pattern:** Every Node microservice in the WINDELS ecosystem MUST call `registerOnce(cfg)` from `enterprise/services/microservice.helper.ts` during boot. The API self-registers via `registerSelf()` inside `discovery.service.ts` (it's the in-process owner of the registry) — do NOT also call `registerOnce()` for windels-api or you'll create duplicate entries. Heartbeats are sent every 15s by default; instances missing heartbeats for 60s are marked `offline` by the sweeper. Instance IDs are UUID slices (8 chars) generated at registration time. Service IDs are kebab-case constants (`windels-api`, `windels-worker`, etc.). Redis key prefix for replica sync is `enterprise:discovery:svc:<id>:<instanceId>` with a 120s TTL.
- **Event bus conventions:** Every published event MUST have a registered schema before it is published in production (MVP allows ad-hoc types for dev). Event types are dot-namespaced (`<domain>.<entity>.<verb>`, e.g. `user.created`, `billing.invoice.paid`). Producers set `correlationId`/`causationId`/`traceId` via `withEventContext(ctx, fn)` — the bus auto-propagates from the parent context when inside an event handler, so handlers that publish further events automatically chain IDs. The in-memory ring buffer retains the last 1000 events; older events are retained in Redis list `enterprise:events:log` (also trimmed to 1000). Cross-process delivery uses Redis pub/sub channel `enterprise:events:bus`. Failed deliveries land on the DLQ (key `enterprise:events:dlq:*`) — operators replay via `POST /enterprise/events/dlq/:id/replay`. Use `EventBusService.publish()` for domain events; do NOT call redis.publish directly.
- **API governance & OpenAPI:** `discoverRoutes(app)` must be invoked ONCE after all routes are mounted (i.e. inside the `server.listen()` callback, as in `apps/api/src/index.ts`) — calling it earlier misses later-registered routers. It inspects Express `router.stack` recursively, detecting auth from middleware function name (`authenticate`/`requireAuth`/`authMiddleware`). New middleware that gates auth should either use one of those names or extend `hasAuth()` in `apiGovernance.service.ts`. OpenAPI 3.1 is generated on first request and cached; the cache is invalidated when endpoints or versions are registered. Zod→JSON Schema inference is a future enhancement; MVP returns generic 200/400/401/403/404/500 responses.
- **ESM do's and don'ts in API code:** `apps/api` is `"type": "module"`. Do NOT use `require(...)` inside source files — it does not exist in ESM and crashes at runtime (as was discovered with the `require("../../../../apps/api/package.json")` in discovery.service, now replaced with an `import(pkgUrl, { with: { type: "json" } })` dynamic import with a fallback to `process.env.npm_package_version`). Use `import x from "x"` at the top of the file for static dependencies; dynamic `await import()` is allowed ONLY inside async functions. Never put `await import(...)` at the top level of a synchronous function body like `registerEnterpriseRoutes()` — it causes a syntax error.
- **Import discipline in route files:** The Session 18 enterprise route file initially had BOTH a top-level `import { z } from "zod"` AND a `const { z } = await import("zod")` block-scoped inside `registerEnterpriseRoutes()`, which caused a "z used before declaration" TDZ error because the validate() calls in the same function body captured the block-scoped `z` that was still in the temporal dead zone. Rule: if a file needs Zod or a service, import it ONCE at the top level and use that binding throughout.
- **Frontend enterprise client:** API clients for Session 18 live in `apps/web/src/lib/enterprise.ts` as `govApi`, `discoveryApi`, `eventsApi`, `apiGovApi`. Each method returns the unwrapped `data` field (consistent with other lib clients like `agents.ts`, `platform.ts`). The Enterprise Hub page polls discovery every 10s and events every 5s for live feedback; other tabs load once on mount. New enterprise UI goes into additional tab components or detail pages at `/app/enterprise/:domain` when needed.
- **Select component:** `apps/web/src/components/ui/Select.tsx` is a thin wrapper around the native HTML `<select>` element — it ONLY exports `Select` (default-styled native select). There are NO `SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue` named exports (that is the shadcn/radix pattern which we don't use). When you need a dropdown in new UI, either use the native `<select>` with Tailwind classes (matching the SsoTab pattern) or extend the existing `Select` wrapper.
- **Data platform location:** Session 19 enterprise data services live under `apps/api/src/enterprise/{dataArchitecture,knowledgeGraph,memory,sync}/`. Shared types live in `packages/shared/src/dataPlatform.ts` (re-exported from the shared barrel). REST endpoints mount at `/api/v1/data/*` via `registerDataPlatformRoutes(router)` in `server.ts` — the same mounting pattern as Session 18's `/enterprise/*` router. New data modules should follow the same singleton-service + route-file pattern.
- **Data asset catalog pattern:** Every persistent data store across the platform should be registered as a `DataAsset` in `SchemaGovernanceService` (kind, namespace, classification, owners, indexes, lineage). The 10 bootstrap assets seed in `schemaGovernance.service.ts` seed(); when adding new tables/topics/buckets in later sessions, register them there so lineage/index documentation is complete. Classifications are public < internal < confidential < restricted < pii — choose the tightest classification that applies.
- **Knowledge Graph entity IDs:** Use the stringly-typed `<kind>:<stable-id>` convention (e.g. `user:<uuid>`, `service:windels-api`, `concept:data-platform`, `asset:asset:db:users`). This makes IDs self-describing and lets upsert-by-id be idempotent (no random churn on seed/restart). The KG is append-light: upsert merges attributes (spread old, then new) and unions tags so multiple sync passes don't lose data.
- **Relation kinds:** Extend the `RelationKind` union in `packages/shared/src/dataPlatform.ts` when a new verb is needed — do NOT invent relation kinds inline at call sites (keeps the KG traversable/queryable). Provenance is mandatory on every entity and relation ({source, sourceId?, capturedAt}) so we can trace KG state back to the event/job/import that produced it.
- **Memory namespaces and versioning:** Memories are scoped by `(namespace, scopeId)` — always require both on recall. Memory entries are **immutable after write**: revise() creates a new entry with `version+1` and marks the old one's `supersededBy`, rather than mutating history. recall() filters out superseded and expired entries by default; buildContext() assembles importance-weighted context up to a char budget (default 12 000) and returns a token estimate for downstream LLM calls. Importance is 0..1; episodic event-sync memories default to importance 0.3–0.4 so they don't dominate the context window.
- **Sync job pattern:** Every event-driven projection from the Event Bus into the KG/Memory is implemented as a named `SyncJob` in `sync.service.ts`. Job IDs follow `job:<domain>:<action>`. Each runner returns `{entitiesUpserted, relationsUpserted, memoriesUpserted, processed, errors}`; `runJob` wraps it with timing, status flipping, recent-run history (last 50 runs), and counter aggregation. New domain events (e.g. future Session 20 agent-to-agent messages) should add a new job rather than stuffing logic into existing runners — keeps failures isolated. The wildcard subscriber in wire() filters by `j.source.split(",").includes(type)` so a job can declare multiple trigger types comma-separated.
- **Bootstrap timing for setTimeout-seeded modules:** The catalog/KG/memory services populate seed data via `setTimeout(..., 600–750 ms)` so they don't do slow work during module import. Anything that depends on those stores being seeded (e.g. SyncService.bootstrap catalog-scan) must delay its initial run by at least ~1.5 s (as is done in index.ts) or await a proper "ready" signal. Future modules with their own seeds should follow the same pattern and document the expected delay.
- **Pagination & traversal depth:** KG traversal depth is capped at 5 server-side to prevent runaway walks over cyclic graphs; catalog/memory recall accept `limit` (default 100) and `offset` to keep responses bounded. When adding new list endpoints, always include a limit cap to avoid accidental OOM on large registries.
- **Frontend data clients:** API clients for Session 19 are in `apps/web/src/lib/dataPlatform.ts` split into `catalogApi`, `kgApi`, `memoryApi`, `syncApi` — one per service. Follow the same `api<T>(path, {method, json, params})` helper pattern used in `enterprise.ts`; never call `fetch` directly from page components. The Memory tab's SyncJobsBlock polls every 8 s (lightweight, consistent with ServicesTab's 10 s / EventsTab's 5 s polling cadences).

## Session 20 — AI Workforce Communication (Slices 171–176)
- **AI Workforce Communication modules live under** `apps/api/src/enterprise/agentComm/` (one service per file + bootstrap.ts), following the Session 19 pattern (`dataArchitecture/`, `knowledgeGraph/`, `memory/`, `sync/`). Slice order = filename order: `agentIdentity.service.ts`, `commProtocol.service.ts`, `collaboration.service.ts`, `reasoning.service.ts`, `feedback.service.ts`, `escalation.service.ts`.
- **Routes mounted under `/api/v1/agents/comm/*`** (NOT a new top-level router like `/data` or `/enterprise`). Agent comm is conceptually a sub-resource of the AI workforce domain already rooted at `/agents`. The router is registered in `server.ts` against the existing `agentsRouter` (which already carries authenticate + agentMemory + agentKnowledge mounts).
- **Dual Redis connections:** `apps/api/src/db/redis.ts` exports two clients:
  - `redis` — may be placed in subscriber mode by EventBusService. **Only use this for pub/sub (subscribe/on/publish)**.
  - `redisCmd` — dedicated command client; **use this for all get/set/lpush/lrange/sadd/… operations**, especially anything executed after initial boot. ioredis rejects non-subscribe commands on a subscribed connection with "Connection in subscriber mode".
- **Message envelope canonical fields for signing** (`CommProtocolService.canonical`) are a fixed whitelist (id, type, schema, from, to, correlationId, causationId, reasoningChainId, subject, payload, createdAt); metadata and signature are deliberately excluded to keep signatures stable across retries/annotations.
- **Feedback uses EWMA α=0.2** on reputation and α=0.1 on performance to update identity scores. Scores are clamped to [0,1]. Mapping: upvote=+1, downvote=-1, correction=-0.5, reward=clipped(value,-1,1), rating maps 1..5 → -1..1, comment=0.
- **Escalation routing priority:** `policy.routeTo` → `identity.managerId` → `"system"`. Always attach `correlationId` if available so the requester can correlate the decision back to a message/reasoning chain.
- **Escalation evaluation matches scope** against `"*"`, the agent's `department`, or the agent's id exactly; conditions are AND-ed. First matching policy fires (order = list order, i.e. creation order for MVP).
- **Team auto-coordinator rule:** when the coordinator is removed or doesn't exist, the next existing `coordinator`-role member (if any) is promoted, otherwise the first member is promoted. Promoting a member to coordinator auto-demotes the previous coordinator to `worker`.
- **Reasoning status promotion:** ≥2 `approve` critiques → `verified`; any `reject` critique → `rejected`; otherwise after any critique → `reviewed`.
- **Credential minting** is a one-shot display: `mintCredential()` returns the raw key once alongside the masked credential record; only a sha256 hash is persisted in Redis (key `agentComm:credentials:lookup:<sha256hex>` → {agentId, credentialId}), and the publicKey is derived as `sha256(rawKey)` for signature verification stubs. UI must surface a toast warning "copy now — only shown once".
- **Web API client pattern (`apps/web/src/lib/*.ts`):** the shared `api()` helper already unwraps one envelope level (returns `body.data`). Therefore client methods should NOT chain `.data.data`. `api.get/post/...` return the typed inner payload directly (e.g. `api<{identities:AgentIdentity[]}>(...)` returns `{identities:AgentIdentity[]}` not the envelope).
- **Sub-tabs inside EnterprisePage tabs** use simple `useState<"overview"|...>("overview")` + button group, not a second Tabs component, to avoid DOM clutter in what is already a dense page.
- **No Prisma migrations for Agent Comm MVP** — all extra state is in Redis, matching Sessions 18 and 19. Future sessions may promote identity lifecycle / credentials / teams to Prisma models when audit/tenant-multitenancy requirements need it.

## Session 21 — Enterprise Infrastructure (Slices 177–184)
- **Infrastructure services live under** `apps/api/src/platform/` (matching the Session 19/20 pattern): `cluster.service.ts`, `iac.service.ts`, `release.service.ts`, `region.service.ts`, `optimization.service.ts`, `infraMetrics.service.ts`.
- **Platform routes consolidate under existing `platformRouter`** (already mounted at `/api/v1/platform` and already enforcing ORG_ADMIN auth). Session 21 routes are in a dedicated file `apps/api/src/http/routes/infrastructure.ts` whose `registerInfrastructureRoutes(router)` is called at the bottom of `registerPlatformRoutes` using a **static top-level import** (not `await import(...)` inside the sync router registration — see Session 18 TDZ lesson).
- **Naming collision resolution:** Session 15 already exposed `/platform/regions` for edge/CDN regions (PoP list). Slice 182 (infrastructure multi-region) uses `/platform/regions-mgmt*` to avoid overlap. When extending existing surface areas, always enumerate existing routes under the router first; don't assume a name is free.
- **All Redis writes use `redisCmd`** from `apps/api/src/db/redis.ts`. The default `redis` export is the subscriber-mode client and will error with "Connection in subscriber mode" after EventBus subscribe.
- **Live metric samplers** (like `InfraMetricsService` with its 15s interval) should be started from `index.ts` bootstrap inside a 2+ second delayed setTimeout, after data/comm seeds, and should expose `start()`/`stop()` for graceful teardown. Register the SIGTERM listener internally to avoid leaking timers in tests.
- **Deployment strategies are typed as** `"rolling" | "blue-green" | "canary" | "recreate"` (DeploymentStrategy shared enum). Blue/green state is tracked per `(environment, service)` pair with activeColor/stagingColor; canary state per pair has canaryWeightPercent 0..100 where 100 = promoted, 0 = rolled-back.
- **Recommendation engine pattern:** `generate()` inspects runtime state, returns new `OptimizationRecommendation`s with `estimatedSavingsUsdPerMonth`; `setStatus(id, "applied"|"dismissed"|"open")`; cost breakdowns use a monthly key (YYYY-MM) and break out by service/region/resource (compute/storage/network/managed).
- **Failover state machine:** idle → preflight → draining → switching → verifying → complete (or failed). Source region is set to read-only during draining, then the target becomes primary and the source becomes standby; after verification both regions return to online.
- **Web API client pattern:** when `api<T>(path)` returns `T` (single unwrap), list endpoints that return `{items:X[]}` need `.then(r => r.items)` — mirror how `dataPlatform.ts`/`agentComm.ts`/`infrastructure.ts` do it. Don't double-unwrap.
- **Sub-tabs on PlatformPage** use simple `useState<"overview"|...>` + button group, consistent with the AgentCommTab pattern from Session 20.
- **No Prisma migrations** — all infra state is Redis-backed (`infra:*` keys), matching Sessions 18–20. Real cloud provider reconciliation is deferred until after the Terraform/IaC modules are wired with live credentials.

## Session 22 — Enterprise QA Platform (Slices 185–192)
- **QA services live under** `apps/api/src/qa/` (one service per runner, plus `testRunner.service.ts` for the framework and `bootstrap.ts` for seeding). Routes live in a dedicated file `apps/api/src/http/routes/qa.ts` whose router is mounted at `/api/v1/qa` in `server.ts` behind `authenticate` + an ORG_ADMIN permission guard.
- **Runner registry pattern:** `TestRunnerService.registerRunner(kind, fn)` maps a TestKind string to an async `(c: TestCase) => Promise<TestCaseResult>` function. All runners must return a well-formed TestCaseResult with `caseId`, `caseName`, `status` ("passed"|"failed"|"error"), `durationMs`, `startedAt`/`finishedAt`, `assertions[]`, `logs[]`, `metrics{}`. The `assertion(id, label, passed, meta?)` helper in testRunner.service.ts builds uniform assertion records.
- **Boot timing:** `bootstrapQA()` must be called in `index.ts` inside a setTimeout AFTER earlier bootstraps (sync → agent comm → infra) complete; QA uses real HTTP fetch against the running server, so it must fire only once the server is listening. Use ~3500 ms delay (after infra bootstrap's 2500 ms) to ensure all listeners/rate-limiters are ready.
- **HTTP-test URL resolution (critical):** when runners perform live HTTP tests against the local API:
  - URLs starting with `http` are used as-is.
  - `/healthz` is on the bare server (no `/api/v1` prefix).
  - URLs starting with `/api/` are already prefixed; use as-is.
  - Otherwise (e.g. `/agents/comm/stats`) prepend `/api/v1`.
  - Mirror the `cfg.url.startsWith(...)` chain in `apiTest.service.ts` when adding new HTTP-test helpers.
- **Admin token bootstrap:** QA runners that need admin auth should lazily fetch a single admin token (see `_adminToken` singleton in `apiTest.service.ts`) and reuse it across all cases in a boot/test run, rather than logging in per-assertion. Reused by chaos/digitalTwin/security services via duplicated-but-identical lazy helpers (acceptable for MVP; refactor to a shared module later).
- **Zod validate() returns HTTP 422** (Unprocessable Entity), not 400, for body-validation failures. Any assertion that validates "bad payload rejected" must accept BOTH 400 and 422; accepting any 4xx (r.status < 500) is the safest rule.
- **Rate-limit-safe security testing:** do NOT actually burst 60+ requests to test the rate limiter during bootstrap/CI. Bursting trips the global `apiGlobal` limiter (60 req/min/ip) and 429s the CI IP for the rest of the test run. Use static config assertions (middleware is wired) instead, same as Session 22's `rate-limit-enforced` check.
- **Scheduler:** `TestRunnerService.startScheduler(intervalMs=60000)` fires `runSuite()` for every suite whose `schedule.preset` is `"hourly"` on boot and then at most once per tick per suite (tracked by `qa:scheduler:lastRun:<suiteId>` in Redis). Suites with `preset: "manual"` are never auto-run. Default Smoke suite is hourly; regression/security/AI/workflow are daily (treated as manual in MVP — scheduler only fires hourly); chaos/dr/digital-twin are manual.
- **Run storage is bounded:** `TestRunnerService` caps recent runs at 200 total in Redis (`qa:runs` list is L-trimmed). When writing run results, always `LPUSH` + `LTRIM 0 199`.
- **Digital twin load cap:** To avoid self-DoS during CI, `DigitalTwinService` caps `durationMs ≤ 10_000` (10 s) and `users ≤ 20`. Enforce in the runner before starting loops.
- **Chaos/DR "faults" are simulated** (no real pod-kills / network delays in MVP) — they measure baseline → during-fault → after-fault p95 via real `/healthz` + `/api/v1/` probes, which exercises the network/event loop but does not actually perturb the process. Real chaos will be introduced in future sessions when running against a staging K8s cluster.
- **QA tab lives as the last tab** on PlatformPage (after Infrastructure). Use the FlaskConical lucide icon and a simple expand/collapse pattern for suite cases, matching the Infrastructure sub-tab button group style. Run-now buttons should be disabled while running to prevent double-submit.
- **Sidebar version bump is mandatory** every session: update `collapsed ? "v0.22" : "Session 22 · v0.22.0"` in `Sidebar.tsx` to match the current session number (v0.${sessionNumber}.0).
- **Load tests for QA should be read-only:** do not trigger suite runs from k6 because runs are real work (they spawn HTTP fan-out, write run history, and can trip rate limits). Read-only load tests (GET /qa/dashboard, /qa/suites, /qa/cases, /qa/runs) are sufficient to demonstrate p95 characteristics.
- **First registered user = SUPER_ADMIN** and password must pass `assessPassword()` policy (min 8, not common). QA bootstrap fixtures, Playwright tests, and k6 scripts must use a compliant password (`W1ndels!Admin#2026` in the seed/tests) — the old `ChangeMe!234` is in the common-password list and will be rejected at register time.
- **No Prisma migrations for QA MVP** — all state is Redis-backed (`qa:*` keys), matching Sessions 18–22 pattern. A future session will promote runs/history to Prisma when audit/retention/compliance requirements need it.
- **All Redis writes use `redisCmd`** from `apps/api/src/db/redis.ts`; `redis` is the EventBus subscriber client and will reject regular commands after SUBSCRIBE.

## Session 23 — Engineering Governance (Slices 193–198)
- **Governance services live under** `apps/api/src/governance/` (one service per slice: coding/repo/adr/codeReview/dependencies/securityStandards, plus `bootstrap.ts`). Engineering routes are mounted as an `/engineering/*` sub-router on the existing `apps/api/src/http/routes/governance.ts` router (NOT a new router file) so they inherit the `/api/v1/governance` prefix and the org-admin guard from the parent governance router.
- **Sub-router pattern:** When extending an existing slice-family, prefer adding sub-routes on the existing router (e.g. `eng = Router(); router.use("/engineering", eng)`) rather than creating a new top-level router file. This keeps related endpoints co-located and avoids double-mounting auth guards.
- **Boot timing:** `bootstrapGovernance()` is invoked from `index.ts` at 4500 ms (after QA bootstrap at 3500 ms). Log the aggregate posture in a single structured line: `engineering governance bootstrapped {codingStandards, repoStandards, adrs, openReviews, depSummary, securityScore}`.
- **Barrel re-export collisions are a real risk** when a new module introduces a type name already exported elsewhere in the shared package. Example this session: `ADRStatus` already lived in `enterprise.ts` for `ArchitectureDecisionRecord`, and duplicating it in `governance.ts` caused `TS2308: already exported a member`. Fix by re-exporting the existing type (`export type { ADRStatus } from "./enterprise.js"`) and, when needed locally, qualifying with `import("./enterprise.js").ADRStatus`. Always run `pnpm --filter @windels/shared build` early in a session after adding new shared types to catch collisions.
- **Path resolution from compiled JS must not rely on `process.cwd()`** because the API can be launched from any directory. Use `dirname(fileURLToPath(import.meta.url))` and walk up to a known sentinel file (e.g. `pnpm-workspace.yaml`) when you need to reach into sibling packages / the monorepo root. This was the bug that made `DependenciesService` return 0 deps — `process.cwd()` was `apps/api/` when launched via `node dist/index.js` from that folder, so `../../..` did not resolve to the root.
- **Zod `validate()` narrows `req.body` but not `req.query`** reliably with `z.coerce.boolean()` — the Express type remains `string | ParsedQs | (string|ParsedQs)[] | undefined`. When reading boolean query params after Zod validation, cast explicitly: `const rescan = (req.query as { rescan?: boolean }).rescan === true;`. Mirror the fix in future query-param handlers.
- **Web client module naming:** when a slice adds API surfaces whose names collide with an existing client module, move the new client to a slice-specific filename (e.g. `govEngineering.ts`) rather than overwriting an existing client (this session's initial overwrite of `governance.ts` broke 30+ types in `GovernancePage.tsx`). If a legacy page needs the old shape, keep a minimal stub module with the same named exports returning empty/inert data until that page's slices ship.
- **Tab ordering on PlatformPage:** append new tabs AFTER existing tabs in the order listed by the master spec. Session 23's Governance tab is the 10th tab (Scale icon), after the QA tab (9th). The sub-nav button group should use lucide icons and the same `[key,lbl,Icon]` map-tuple pattern established by the Infrastructure tab in Session 21.
- **Sidebar version bump is mandatory every session:** update `collapsed ? "v0.23" : "Session 23 · v0.23.0"` in `Sidebar.tsx` to match the current session number.
- **k6 v2 executor defaults:** k6 v2's default executor can produce very high iteration rates without an explicit sleep between requests, which trips the apiGlobal rate limiter (60 req/min/ip). Use `executor: "per-vu-iterations"` with explicit `vus + iterations + maxDuration` plus `sleep(0.15–0.3)` between requests inside the iteration function to keep RPS friendly, and set thresholds for `p(95)` high enough to absorb cold-start login latency (~600–700 ms on first hit).
- **Security scoring:** posture score = (implemented × 1 + partial × 0.5 + missing × 0 + not_applicable ignored) / applicable × 100. Round to integer. When seeding MVP controls, aim for a baseline in the 75–90 range (this session: 83) so the dashboard has meaningful headroom to improve or regress against.
- **Redis keys for governance use `gov:*` prefix:** `gov:coding:standards`, `gov:repo:standards`, `gov:adrs` (+ `gov:adrs:counter`), `gov:reviews`, `gov:deps:cache` (15 min TTL), `gov:security:standards`. All reads/writes go through `redisCmd` per the Session-20 dual-client pattern.
- **Seed guards:** every governance service checks `if ((await redisCmd.hlen/EXISTS(key)) > 0) return;` before seeding, so restarting the API is idempotent. To force a re-seed during development, flush `redis-cli KEYS 'gov:*' | xargs redis-cli DEL`.
- **No Prisma migrations for governance MVP** — all state is Redis-backed (`gov:*`), matching Sessions 18–22 pattern. A future session will promote ADRs/audits/standards to Prisma when compliance/version-history features need it.
- **Regex literals inside arrow functions** should be hoisted to a module-level `const` if they contain backslash-heavy character classes (e.g. `/^[\^~>=<\s]+/`), to avoid accidentally mixing smart-quote/UTF-8 characters that can cascade into dozens of misleading TS1005/TS1109 parse errors from the JSDoc comment above.

## Session 24 — Release Management (Slices 199–204)
- **Release services live under** `apps/api/src/release/` (one service per slice: pipeline, approval, aiValidation, staging, production, improvement, plus `bootstrap.ts`). Routes live in `apps/api/src/http/routes/release.ts`; the router is mounted at `/api/v1/releases` in `server.ts` behind `authenticate` + an ORG_ADMIN permission guard (mirrors the qaRouter pattern from Session 22).
- **Boot timing:** `bootstrapReleases()` is invoked from `index.ts` at 5000 ms (after engineering governance at 4500 ms). Log one structured line: `release pipeline bootstrapped {total, successRate, deployFreq, leadTimeH, changeFailRate}`.
- **Sub-router + param-loader pattern:** When mounting a sub-router under a path-param prefix (e.g. `/releases/:id/*`), do NOT rely on `childRouter.param('id', ...)` to inject the entity into `req` — with this codebase's async-middleware chain the param handler runs but the loaded value is not reliably visible to child handlers. Instead, mount an inline loader middleware at the parent level: `router.use('/:id', async (req,res,next)=>{ req.entity = await svc.get(req.params.id); next(); }, childRouter)`. This guarantees `req.entity` is set before any child route runs and also gives you a single place to return 404.
- **Redis client configuration:** do NOT set `enableOfflineQueue: false` on the main `redis` or `redisCmd` clients. Lazy-connect plus disabled offline queue causes post-boot commands that arrive milliseconds before the "connect" event to throw "Stream isn't writeable and enableOfflineQueue options is false", especially inside first-hit param loaders. Keep default queuing; `maxRetriesPerRequest: 3` already bounds retry storms. The subscriber-vs-command split (Session 20 dual-client) still applies — all post-boot writes go through `redisCmd` because the `redis` client may later enter subscriber mode for EventBus.
- **Shared type barrel collisions:** Session 21 already exports a narrow workload-level `Release`/`ReleaseStatus`/`DeploymentStrategy` from `infrastructure.ts`. When adding a broader enterprise-level Release concept, prefix those types (e.g. `PipelineRelease`, `PipelineReleaseStatus`, `PipelineDeploymentStrategy`) and have the web client re-export a local `Release` type alias so UI code reads naturally without importing the infra types. Always run `pnpm --filter @windels/shared build` right after adding new shared types to surface TS2308 collisions early.
- **useRefresh destructuring pattern:** `useRefresh<T>(fn, intervalMs, deps)` returns `{data, err, refresh, setData}`. NEVER read properties directly off the hook object. Correct pattern (matches QaTab/GovTab): `const m = useRefresh<Metrics | null>(...); const metrics = m.data;` and then null-guard (`metrics ? <Cards/> : <Skeleton/>`). Use `.refresh()` for manual refresh buttons.
- **Status→Badge tone helper:** centralize the long status-to-tone ternary in a `statusVariant()` helper inside the tab component instead of inlining it per-badge; this keeps JSX readable and avoids duplicating when multiple panels render the same badge tone.
- **Redis key prefix for release is `rel:`** — `rel:releases` (ZSET), `rel:counter` (INCR), `rel:release:<id>` (HASH), `rel:approvals:<id>` (HASH, gate→JSON), `rel:validation:<id>` (JSON string, 7-day EX), `rel:staging:<id>` (JSON), `rel:production:<id>` (JSON), `rel:retro:<id>` (LIST, LTRIM 0 99), `rel:metrics` (cached metrics JSON, 15 min EX). All reads/writes via `redisCmd`.
- **Approval quorum rule:** quorum is met iff ALL required gates are `approved` AND zero gates are `rejected` (waived counts as pending and does NOT satisfy quorum — adjust if/when product decides waivable gates). High/critical-risk releases add change_advisory_board + sre_oncall to the required set via `gatesForRisk(risk)`.
- **Promotion gating:** `POST /releases/:id/promote` returns 409 `STAGING_UNHEALTHY` unless `StagingService.get(id).status === "healthy"`. `POST /releases/:id/deploy-staging` returns 409 `GATES_NOT_MET` unless quorum is met (or already staging_validated). Enforce these in the route, not just the UI, so direct API callers are blocked too.
- **AI validation scoring (MVP):** score = max(0, min(100, 100 − blockers×25 − errors×10 − warnings×3)). Any blocker failure → rejected; 0 blockers + 0 errors → awaiting_approval; warnings alone pass.
- **Seed data is idempotent:** bootstrap checks `PipelineService.list(1)` and returns early if any release exists. To force a re-seed during dev, flush with `redis-cli KEYS 'rel:*' | xargs -r redis-cli DEL` then restart the API.
- **Sidebar version bump is mandatory every session:** update `collapsed ? "v0.24" : "Session 24 · v0.24.0"` in `Sidebar.tsx` to match.
- **k6 tests for release are read-only** in CI (list/metrics/dora/detail/approvals/validation/staging/production). Mutation endpoints (validate/approve/deploy-staging/promote/rollout/rollback/retro) are exercised manually in this session's verification flow but not in automated load runs because they mutate state and would produce misleading p95 numbers plus flaky E2E state.
- **No Prisma migrations for release MVP** — all state is Redis-backed (`rel:*`). Release history/audit trail will move to Prisma when SOC2/compliance slices ship.
- **Redis key prefix for extensions is `ext:`** — `ext:extensions` (SET of registry ids), `ext:slug` (HASH slug→id), `ext:installed` (HASH id→JSON{version,enabled,installedAt}), `ext:ext:<id>` (extension JSON), `ext:reviews:<id>` (unused inline; reviews stored on the Extension document), `ext:installs:log` (LIST LTRIM 0–19 of recent installs), plus per-kind lists `ext:business`/`ext:industry`/`ext:skills`/`ext:agents`/`ext:workflows`/`ext:dashboards`/`ext:uicomponents` with DETAIL keys `ext:business:<id>`, `ext:industry:<id>`, `ext:skill:<id>`, `ext:agent:<id>`, `ext:wf:<id>`, `ext:dash:<id>`, `ext:ui:<id>`.
- **Lifecycle transition rules (Session 28):** `ALLOWED_TRANSITIONS` is the single source of truth in `registry.service.ts` and is enforced server-side — clients get 422 `INVALID_TRANSITION` on violations. Chain is draft→submitted→validating→security_review→testing→approved→published→installed→enabled→disabled (back/ok between enable/disable) → deprecated → retired; rejected returns to draft. Seed pushes every published extension through the full chain via `transition()` so logs/statuses are correct.
- **Kind→color mapping (reuse for badges/side-nav):** business=azure, industry=violet, skill=emerald, agent=fuchsia, workflow=crimson, dashboard=amber, ui-component=teal. Centralize as `kindTone(k)` in the UI tab rather than inlining per-card.
- **Install/enable semantics:** extensions start "published"; `POST /:id/install` flips to `installed`, records in `ext:installed`, bumps install count, increments version download; `POST /:id/uninstall` removes from installed set and returns to `published`. Enabled/disabled is a separate flag on the installed record (and flips status to `enabled`/`disabled`) so admins can install without enabling.
- **All extension-kind services are read-mostly stores** (like SDKs) — registers return randomUUID() records stored as JSON strings; bootstrap seeds authoritative "official" packs at boot if empty, idempotently checking `ExtensionRegistryService.list().length > 0`.
- **Route ordering note:** `/extensions/dashboard/rollup` is a GET rollup endpoint; do NOT place it after `/:id` param routes (it would match :id="dashboard"). In Session 28 it is registered last after all `/business/list` etc., matching the devPortal `/dashboard` pattern.
- **No Prisma migrations for extensions** — all state is Redis-backed (`ext:*`). Compliance/audit trail will be promoted to Prisma when marketplace monetization and org-scoped installs land (Session 29/52).
- **Sidebar version bumped to "Session 28 · v0.28.0" / collapsed "v0.28"** — required every session per convention.

## Session 29 — Enterprise Platform Services
- **Directory convention:** New platform-services code lives in `apps/api/src/platformServices/` (NOT `apps/api/src/platform/` which holds Session 21 infra/cluster/IaC services). Use `psvc:` Redis key prefix to avoid collisions.
- **Icon choices (verified to exist in lucide-react):** Settings, ToggleRight, Zap, ShieldCheck, Building2, KeyRound, CreditCard, Sparkles, Network, Library, FileStack, Gauge. Avoid `Architect` (use DraftingCompass), `Key` (use KeyRound for licensing).
- **Config service scopes:** global/org/user/tenant/environment; value types string/number/boolean/json/secret; `hotReload` flag controls whether runtime override writes to live `psvc:config:runtime` hash.
- **Policy effect colors:** allow/enforce → emerald, deny/block → crimson, throttle → amber, audit → teal.
- **Plan/tier color map:** enterprise/unlimited/dedicated → violet, business/scale → azure, team/growth/pro → teal, starter → amber, free/core/slate → slate. License tier unlimited uses fuchsia.
- **Capability health:** healthy → emerald, degraded → amber, down → crimson, unknown → slate.
- **HMAC signing:** licenses signed via `createHmac("sha256", LICENSE_SECRET).update(\`${key}:${tier}:${seats}:${expiresAt}\`)`; verify endpoint re-computes and compares.
- **Percentage rollout bucketing:** deterministic sha1(`${flagKey}:${subjectId}") % 100`; subject priority userId > orgId > tenantId > "__anon__".
- **Policy evaluation order:** sorted by `priority` desc; first matching deny/block short-circuits; audit/throttle effects accumulate but do not deny.
- **Blueprint cert field:** "official" | "partner" | "community" (NOT "enterprise" — that value caused a TS error during session 29 build; enterprise blueprints use cert="official" or "partner" and are distinguished via category/compatibility).
- **Bootstrap timing:** 7500ms, after extensions (7000ms) and before any future slices.

## Session 30 — AI Infrastructure (MLOps)
- **Directory convention:** ML ops code lives in `apps/api/src/mlOps/` (distinct from Session 21 infra `platform/` and Session 29 `platformServices/`). Redis prefix `mlops:*`.
- **Type-name collision avoidance:** `infrastructure.ts` already exports `DeploymentStatus` and `DeploymentStrategy`; mlOps uses prefixed `MlDeploymentStatus`, `MlDeploymentStrategy`, `MlDeploymentEnv` to avoid TS2308 re-export collision in shared barrel.
- **Icons verified present in lucide-react:** Cpu (tab), Boxes (models), Rocket (deployments), Activity (monitors), ShieldCheck (governance), FileText (prompts), Brain (RAG), Database (indexes), Sparkles (embeddings), BookOpen (knowledge). Do NOT use `Box` (alias it as `BoxesIcon` or use existing `Boxes`).
- **Lifecycle state machine (ModelStage):** draft→registering→staging→approval→production; shadow/canary branch off approval; deprecated→retired; rejected→draft. `deploy()` auto-advances prod-target versions through any unvisited stages before final prod promotion.
- **Color mapping:** kind llm=azure, embedding=teal, reranker=violet, vision=fuchsia, audio=amber, custom=slate; provider self-hosted/windels=azure, anthropic=violet, openai=emerald, google=fuchsia, cohere=teal, mistral=amber, other=slate; environment prod=emerald, staging=azure, canary=fuchsia, edge=teal, dev=slate.
- **Deployment replica defaults:** replicas=2, cpu="2", memory="8Gi", trafficPct=100, strategy="rolling". Cost-per-hour randomized $1.20–$9.20.
- **Knowledge source kinds:** document/wiki/web/db/s3/api/conversation/workflow; status lifecycle indexing→indexed, quarantine/approve toggles.
- **RAG policy defaults:** hybrid retrieval, chunkSize 1024, overlap 128, topK 6, minScore 0.72, citationRequired + piiRedact on.
- **Bootstrap timing:** 8000ms (after platformServices at 7500ms).
- **Prompts versioning:** `addVersion()` automatically marks all prior versions `deployed=false` and new version `deployed=true`; each prompt seed gets 2 smoke test cases and one simulated run for dashboard fill.

## Session 31 — Enterprise Foundation
- **Directory convention:** `apps/api/src/enterpriseFoundation/`; Redis prefix `ef:`. Mount point `/enterprise-foundation` (dashes, not underscore) to match prior `/dev-portal`/`platform-services` convention. Bootstrap timing: 8500ms.
- **Type-name collisions avoided:** No new types named `Deployment*` (already used by infrastructure), `Status` (ambiguous), `Principal` alone is fine inside the `ef` keyspace; exported types all have descriptive prefixes where needed (e.g., FabricConnectorKind, PrincipalKind). MfDeployment etc. not needed since previous session used Ml-prefixed.
- **Service grouping:** Data fabric = connectors+products+lineage in one service; Identity combines human/service/AI principals + IDPs + service accounts; FinOps combines accounts/anomalies/optimizations; Resilience combines incidents/playbooks/BCP; Quality combines scorecards/eval runs; OpsCenter provides GlobalStatus and ExecKpis only (aggregator, no primary state except KPIs).
- **Icons verified present:** Landmark (tab), Database (data fabric), Key (identity; Key exists in lucide — do not use KeyIcon which doesn't exist; actually Key exists; I imported both Key and KeyIcon — Key works), DollarSign (finops), HeartPulse (resilience), Award (quality).
- **Color tokens for new domains:** connectors azure, data products violet; identity principals humans=azure ai=fuchsia service=teal api-keys=amber idps=violet; finops providers aws=amber gcp=violet azure=azure windels=teal onprem=slate; incidents sev1=crimson sev2=amber sev3=violet sev4=slate; quality dims safety/hallucination/toxicity=crimson, accuracy/groundedness=azure, bias=fuchsia, latency/cost=teal.
- **Inline color style pattern:** where colors depend on dynamic data values (e.g. provider icon tint, quality dim score), use inline `style={{color: hex}}` rather than dynamic `text-${color}` Tailwind classes (Tailwind JIT cannot see dynamic interpolations).
- **Bootstrap backfill pattern:** when service.create returns a seeded record but we need realistic metrics (datasets, rows, bytes, usersSynced), bypass service method and set via redisCmd directly after creation (see `DataFabricService.registerConnector` → redis.set override for `datasets`/`rowsProcessed24h`).
- **Ops KPIs:** stored under `ef:kpis:*`; seed() is idempotent (checks existing). Each KPI has label, value, unit, trend (% delta), optional target, tone, updatedAt.
- **Resilience MTTD/MTTR:** reported as constants (4.2m / 38m) in summary; in a future session could be computed from incident timestamps.

## Session 32 conventions (Collaboration & Perception Intelligence)
- Perception/AI-vision outputs (camera pipelines) default to `verdict: "advisory"` with a mandatory `advisoryNote` caution string. Only pipelines registered with an `approvedWorkflow` name become `approved-workflow` and may participate in automation; the UI always renders a crimson "ADVISORY" badge and requires an explicit acknowledge action.
- Camera finding `acknowledgeFinding(pid, fid, by)` bumps pipeline `acknowledgedFindings` and decrements `findingsOpen`; keep those counters authoritative on the pipeline record for dashboard KPI speed.
- Translation channels are modeled per-meeting rather than per-segment; segments carry an optional `translated` map for cached target-language strings for already-processed utterances.
- Write-through targets for meetings are five fixed systems (crm/project/knowledge-graph/enterprise-memory/calendar) with a queued→synced lifecycle; bootstrap auto-syncs ~70% on meeting end so dashboards have a realistic pending/synced split.
- Screen sessions track per-session counters (`aiExplanations`, `stepsGuided`, `codeAssists`, `docsGenerated`, `issuesDetected`) updated by every add* service method; callers should not mutate these directly.
- Camera route prefix is `/collaboration/camera/*` (under unified `/collaboration` module), not a separate top-level mount — consistent with grouping all perception intel under one platform tab.

## Session 33 conventions (Vendor-Agnostic AI Ecosystem)
- **Vendor neutrality is mandatory**: the AI Provider Abstraction Layer must NEVER hard-code a provider list or branch on vendor names in routing logic. Named adapters (OpenAI, Anthropic, Google, Mistral, Azure, Bedrock, Ollama, WINDELS custom) are shipped as *example adapters only*; new providers register via `registerProvider()` and become first-class instantly. Callers always go through `ProviderAbstractionService.routeRequest()` and never import a vendor SDK directly.
- Provider health is tracked as time-series events under `ae:p:<id>:h` rather than a single status field — UI shows current status plus recent events.
- Routing strategy is an open enum (`cost|latency|quality|balanced|data-residency|capability|custom`) but typed as `RoutingStrategy`. New strategies only require adding a comparator branch; never mutate candidate filters in place.
- Fallback mode is explicit per policy (`fail-open|fail-closed|graceful-degrade`); default production policies ship as `graceful-degrade` so partial degradation doesn't surface as errors to end users.
- Personality profiles live in a single store and are *resolved* (region override applied) at read-time via `resolvePersonaFor(dept, region)` — overrides do not clone the stored entity, keeping a single canonical brand profile.
- Regional personality overrides are a sparse `Partial<Pick<PersonalityProfile,...>>` map keyed by ISO-ish region codes ("de", "jp", etc.), never nested full profiles.
- Trust scores own the final disposition (`recommendedAction`): UI must not override "block" or "require-human-review" based on its own heuristics. Disclaimers are an array on the score and must be shown verbatim when `verification !== "verified"`.
- Source-quality tiers are ordered (`gold > peer-reviewed > trusted-publisher > user-content > llm-synthetic > unknown`) and influence confidence automatically — don't duplicate weighting logic in callers.
- Dashboard stats aggregate across all three services in the route handler to keep the UI in one call; services keep their own granular summary methods.
- All Redis keys for this module are prefixed `ae:` (AI Ecosystem).
- Mk-prefixed shared types (`MkSkillCategory`, `MkEntityKind`, etc.) in marketplace module to avoid collisions with extensions/dataPlatform exports.
- Opt-in modules (like crypto-intelligence) MUST default to disabled with an explicit enable flag; trading endpoints return 403 MODULE_DISABLED until enabled and still require governance approval.
- Emergency mode triple-clap pattern is a standing convention across voice/wake modules: always routes through governance/audit and respects user/org policy for location sharing & recording.
- Consolidated singleton services per domain are acceptable for later sessions when a single module spans 4+ slices; group services into one file with logical sub-sections instead of proliferating tiny files.

## Session 34–36 conventions (Marketplace / Crypto Intel / Wake Intel)
- Marketplace sub-tabs (skills/twins/scenarios/apps) live under one fuchsia "Store" tab; twins/scenarios produce a session-scoped `runId` for audit; pending apps route to Governance review queue.
- Crypto Intelligence ships **opt-in disabled by default** (see Session 33 opt-in rule): the dashboard reports counts but `/trades` and execution endpoints return 403 MODULE_DISABLED until an ORG_ADMIN flips the enable flag AND governance approves automation policy.
- Wake Intel supports 16 activation methods; voice cloning is out of scope here (belongs to Session 40 Voice Studio) but the pattern of triple-clap and MFA-gated emergency is shared as a platform primitive.
- Activation audit log is append-only, each row carries `outcome`, `policyPassed`, and `confidence` for forensics; do not delete or mutate rows.

## Session 37 conventions (Architecture Stubs)
- The Architecture module is a **declarative registry only** — it does not implement ESI, SI, Kernel, God-Node, or other systems; it records their declared existence, dependency edges, and introduced-in-session. Implementation sessions fill in actual behavior.
- Module IDs follow the pattern `sessionNumber:kebab-name` (e.g. `39:enterprise-ai-kernel`) so they are stable across reboots and linkable in the UI.
- Deployment targets are a fixed enum on ArchitectureStatus: `desktop|mobile|web|cloud|edge|air-gapped|offline|federated`. Adding a new target requires updating the shared type AND the architecture bootstrap.
- ESI signal feed is capped at 200 entries via `zremrangebyrank` on every push — never grow unbounded.

## Session 38 conventions (Self-Hosted AI Infrastructure)
- All Redis keys for the self-hosted module use the `sh:` prefix (nodes/models/jobs/vectors/latencies).
- Singleton service pattern (no class instantiation) with grouped summary/list*/register*/run* methods — matches Session 33+ convention.
- Inference jobs are fire-and-return-synchronously in MVP (no queue worker); status is always `"completed"` for the happy path. Queue/async execution can be added in a later session but the job schema is already forward-compatible with queued/running/failed states.
- Model loading picks the first online node with ≥20GB free VRAM when no `nodeId` is supplied, preventing accidental OOM on busy nodes.
- Vector stores default to `provisioning` status on create so operators have to confirm them online before use.
- Nodes have an `airgap` tag convention; the dashboard reports `airgapMode: true` if any node carries it.

## Session 39 conventions (AI Kernel)
- **Hard rule — Kernel-routed communication:** every new module shipping from Session 39 onward MUST route inter-module events through `KernelService.dispatch({kind, source, target?, payload})` rather than importing peer services directly. This keeps a single observable event bus and guarantees policy/audit/security hooks run before downstream actions.
- Component keys are stable dash-cased strings (`context`, `event-bus`, `model-sel`, etc.); new components add entries to `defaultComponents` array only.
- Heartbeat updates are idempotent; `status` is auto-marked `"degraded"` when errorRate > 0.1. Self-healing loop in `runDiagnostics()` flips degraded/offline components (except stubs) back to `"online"` for MVP — future sessions will replace this with real health probes.
- Multi.zadd in ioredis requires `(key, score, member)` per entry; do NOT use spread-args `zadd(key, 0, ...members)` with only one score — use a loop or the chainable form per member.
- All Redis keys prefixed `kernel:`; events list capped at 500 entries.
- Policy evaluation MVP returns `allowed:false` for `risk:"high"` without `approved:true` and demands `org-admin` + `risk-officer` approvals. Future sessions will extend the policy DSL but must retain this fail-closed default.

## Session 40 conventions (Voice Studio)
- **Hard rule — consent-before-clone:** the `/voices/clone` endpoint MUST reject with HTTP 400 `CONSENT_REQUIRED` whenever `consentGranted !== true`. Violation counter increments on every rejected attempt and surfaces on the dashboard. No cloning pipeline, training job, or voice artifact may be created before consent is recorded.
- All cloned voices default to `visibility: "private"`; visibility can be widened to `"org"` or `"public"` only via an explicit PATCH from the owner.
- Voice gender/age/emotion/clone method types are prefixed `Vs*` (`VsVoiceGender`, `VsVoiceAge`, `VsEmotion`, `VsCloneMethod`) at the shared-type layer to avoid collision with the pre-existing `VoiceGender` in the AI Ecosystem module (Session 33).
- Voice IDs use prefixes `bv-` (built-in), `cv-` (custom), `vp-` (preset), `tts-` (TTS job). Do not mix prefixes.
- Regional voice set MUST include Nigerian English, Pidgin, Igbo, Yoruba, Hausa, and Edo (Bini) per WINDELS home-market requirement; extend other regions in later sessions but never remove these six.
- Synthesis always emits a Kernel `voice.tts` event for auditability, even though MVP does not yet fan out to other consumers.
- TTS returns a synthetic audioUrl placeholder (`/api/v1/voice-studio/audio/<id>.wav`) — actual waveform generation belongs to a later session once audio-runtime dependencies are added. The UI surfaces job readiness from the `status` field.
- Emotion is an explicit 13-value enum; custom voices seed with `["calm","friendly","professional"]` and extend as users train/clone with emotional range.

## Session 81 conventions (Unified Global Trading Intelligence)
- Session 81 is a **horizontal expansion** of Session 35 Crypto Intelligence, not a replacement. `/crypto-intel/*` endpoints remain untouched and opt-in disabled by default. The new `/trading-intel/*` surface adds a unified multi-market superset but retains the same governance/human-approval gate.
- All Redis keys for this module use the `ti:` prefix (agents, indicators, instruments, positions, risk, sentiment, sims, econ events, insights, metrics, enabled flag).
- Ti-prefixed shared types (`TiAgent`, `TiMarketClass`, `TiIndicatorPlugin`, etc.) to avoid collision with `ci:*` (crypto-intelligence) and generic `Position`/`Instrument` names from unrelated modules.
- Trading proposals **always** return `{ requiresApproval: true, governanceReview: true }`. Even if a future session adds automation support, both `moduleEnabled` from a risk-permission check AND `approved-automation` org-level policy must be set — no endpoint in this module ever auto-executes a trade.
- 18-agent workforce is the baseline size; future sub-sessions may add specialist agents but must register them through the same `AGENT_DEFS` seed pattern and heartbeat interface (`/agents/:key/heartbeat`) so the dashboard stays accurate.
- Indicator IDs are uppercase short codes (MA, EMA, MACD, RSI, BBANDS, PSAR, WILLR, STOCHRSI, KDJ, MAVOL, FIB, PIVOT, SR, TRENDLINE, VOLPROFILE, ICHIMOKU, ATR, ADX, OBV, VWAP). Adding a new indicator only requires appending to `INDICATOR_DEFS` — no core code changes (IndicatorPlugin contract).
- Multi-scenario simulation defaults to bull/bear/sideways/high-vol/flash-crash when no `scenarios` array is passed; callers may request a subset or the extended set (liquidity-crisis/economic-announcement/geopolitical). Each result MUST carry `expectedReturnPct, worstCaseReturnPct, bestCaseReturnPct, probability, confidence` and a notes array reminding that governance approval is required.
- Sentiment scores are -1..+1 with a `weight` multiplier (default 0.8–1.2) applied to the combined technical/fundamental signal weight — sentiment is **never** a standalone trade trigger per spec.
- Economic events use ISO country codes, `impact` ∈ {low,medium,high}, and always list `affectedInstruments[]` so UI can color-code the watchlist ahead of prints.
- Nigerian instruments are seeded in every relevant market class (USDNGN forex, GTCO stock, NGX-30 index) as a standing home-market requirement.
- Continuous-learning insights are capped at 200 entries via zremrangebyrank and carry `learnedFromTrades` counters to make data provenance auditable.
- Cross-module communication goes through KernelService.dispatch (see Session 39 convention) on both `/simulate` and `/propose` paths.

---

## Conventions added in Sessions 41, 77, 78, 79, 80, 76

### Session 41 — Voice Foundry
- Foundry-generated voices are **consent-exempt** but **must** carry an immutable `auditTrail` entry (`foundry-autonomous` on generate, per-op entries on evolve) and explicit `ownership` ("windels" for seeds/system-generated, "user" for user-invoked). They reuse the S40 CustomVoice preset store rather than forking a parallel voice table.
- Evolution operations are additive (pronunciation/naturalness/emotion-expand/accent-refine/style-optimize/language-expand/quality-enhance) and always increment `version` by 1 — voice identity is a linear version chain.
- Deployments are append-only with `active` boolean; packs are pointers to voiceIds, never copies.
- Natural-language design (`/design`) is heuristic-only for MVP (no LLM call) so bootstrap works offline.

### Session 77A — Expert Agents
- **All** domain-expert agents extend a single ExpertAgent contract (id/name/domain/status/disclaimer/queries24h/accuracyScore/lastHeartbeat) so they register uniformly with AI Workforce.
- **Every** agent response (even the stub `/agents/:id/query`) must include a disclaimer stating "informational not official advice"; disclaimer types are `informational-not-official-advice | educational-only | consult-professional`.
- Lecturer multilingual bridge supports language expansion without duplicating course content (pointer pattern, same as S78 components).

### Session 77B — Media Factory
- `ChildSafetyReviewer` is **non-bypassable**: the keyword check runs BEFORE a job is persisted. Prompt matching `/explicit|violen|gore|hate|abuse|self-harm/i` always rejects.
- Child-targeted prompts (`/children|kid|child|minor/i`) pass the gate but receive an extra `approved-child-safe` safety marker so downstream reviewers can apply age-appropriateness audits.
- `MfSafetyState` extended with `approved-child-safe` to make child review state explicit in the UI.

### Session 77B — Social Publishing Pipeline (completion pass)
- **Honesty rule:** publishing is never faked. Without OAuth client env vars the platform reports PLATFORM CREDENTIALS REQUIRED; without a connected account jobs fail NOT_CONNECTED with remediation text. No windels:// pseudo-URLs.
- **Key schema:** tokens `pub:tok:<uid>:<platform>` (AES-256-GCM envelope via Slice 112 helpers, user-scoped); jobs/audit org-scoped `pub:<oid>:{jobs|job:<id>|due|audit|idem:<key>}`; worker org index `pub:orgs`. Per cross-cutting rule 2 nothing publishing-related is global.
- **Job engine:** state machine `queued|scheduled → uploading → published|failed`, cancel from queued/scheduled/failed, manual retry only from failed (resets attempts). Transient errors retry with `backoffMs(n)` = 30s·2^(n-1) + ≤5s jitter, capped 15m, max 5 attempts; `retryAfterSec` from HTTP 429 overrides backoff. Permanent errors (AUTH/MEDIA_*/NOT_CONNECTED/validation) fail immediately.
- **Adapters** (`mediaFactory/publishing/platforms.ts`) own each platform's real upload protocol (YouTube resumable session, TikTok chunked init+status poll, Instagram container/video-url+rupload, Facebook page multipart, X INIT/APPEND/FINALIZE/STATUS+tweet, Pinterest register/upload/pin). All raise `PlatformPublishError(code, message, permanent, retryAfterSec?, detail?)` — routes never catch-and-fake.
- **OAuth:** start stores a 15m one-time state doc (`pub:oauth:<state>`) with PKCE S256 verifier for X; providers redirect to `PUBLISH_REDIRECT_URI` (the web `/media` page), which forwards `{code,state}` to the authenticated callback — the API never serves an unauthenticated callback.
- **Idempotency:** client `idempotencyKey` → Redis `SET … EX 86400 NX`; duplicates return the original job with `deduplicated:true` (HTTP 200 vs 202).
- **Kernel events** `media.publish.completed|failed` are emitted through a cached dynamic import with a 2s race guard so Kernel/Redis trouble can never stall job execution (engine dep `kernelDispatch` keeps unit tests deterministic).
- **Worker:** `startPublishWorker()` (unref'ed interval, `PUBLISH_WORKER_INTERVAL_MS` default 5s, single-flight guard) starts at API boot (+15.25s) and calls `processDueJobs()`; tests call `processDueJobs()` directly against an injected engine (`createPublishEngine({kv, adapters, now, resolveMedia, kernelDispatch})`) — pattern: never unit-test against the default engine bound to real Redis.

### Session 78 — UX Intelligence
- Components in the canonical registry are **pointers** (sourcePath) to existing Shadcn components — never copies. Duplicate-component detection runs during validation (S76).
- Design Quality Gate is non-bypassable; `designGateActive` must be `true` on dashboard.
- Brand profiles carry primary/secondary hex + font; white-labeling is a future session (v0.82 seeds one WINDELS brand).
- UX agents (designer/researcher/qa) extend S77 ExpertAgent base.

### Session 79 — Gift Cards (WMPC)
- Payment methods **REGISTER** into the existing Payment Gateway Framework via `paymentMethodDescriptor()` (id/kind/name/capabilities/currencies/version). NO parallel gateway; S76 validates this.
- Gift card errors use `AppError.badRequest/NotFound` with `details.code` set to domain reason (INVALID_AMOUNT/BAD_PIN/INVALID_STATE/EXPIRED/INSUFFICIENT_FUNDS) to avoid type-parameter widening on `ErrorCode`.
- PINs are hashed with a namespaced SHA-256 (`gc:${pin}`).
- Lifecycle state machine: `issued → active → partially-redeemed → redeemed`; `frozen` and `expired` are terminal from any pre-redeemed state, triggered explicitly.
- Fraud flags fire on PIN mismatch and velocity (>20 redeems in 60s).
- Redis incr uses lowercase commands (`incrby`, `incrbyfloat`) per ioredis API.

### Session 80 — Global Currency
- Rate lookup stack order is strict: **enterprise override → cache/live → offline fallback**; cross-via-USD is the last resort if no direct pair exists.
- Namespace types with prefix to avoid collisions — `GcuDashboard` (not `GcDashboard`) to distinguish from gift cards' `GcDashboard`.
- Fraud guard flags observed rates deviating >10% from offline baseline; event fires through Kernel (not direct import).
- Country detection defaults to NG (per user's approximate location in Enugu, NG).

### Session 76 — Validation
- Report generator probes Redis key prefixes (not hard-coded counters) so newly added modules automatically flow into the wiring report as long as they follow the `<prefix>:*` key convention.
- Kernel routing is verified by dispatching a `{kind:"ping"}` event through KernelService rather than by inspecting internal state — contract-level verification.
- Checklist is **exactly 22 items** for MVP; all must pass for the report to show green.
- Non-Redis desktop/mobile/web/cloud/edge/airgap modules are reported as wired/stub based on static evidence (Electron shell, /mobile routes, React build, etc.) rather than key counts.

### Cross-Session
- All 7 new modules use the singleton object service pattern (`export const XService = { ... }`), mount with authenticate+ORG_ADMIN guard blocks, bootstrap via dynamic-import setTimeouts spaced 500ms apart (voiceFoundry@14000 → v76@17000), and emit cross-module events through `KernelService.dispatch({kind, source, payload})` using `kind` (not `event`) to match the KernelEvent type.
- ioredis command casing is lowercase for multi-word commands (`hset`, `zadd`, `incrby`, `incrbyfloat`).

---

## Conventions added in Sessions 42–47

### Session 42 — Universal Media Generation
- Media-gen runs on S38 self-hosted GPU via S39 Kernel compute allocation — no external AI APIs (vendor-neutrality rule S33).
- Capabilities are registered as a set of JSON descriptors (`modality/op/gpuRequiredMb/avgMs/status`); "digital-human" video op is status=stub until Session 62.
- Child-safety uses the same `approved-child-safe` marker established in S77B Media Factory.

### Session 43 — Hybrid Execution
- Three modes always present: `self-hosted`, `hybrid`, `connected-enterprise`; active mode defaults to `hybrid` (local preferred, intelligent fallback).
- Policy routing returns a `HxRouteDecision` with `requestId/mode/targetModel/targetNode/reason/fallbackAvailable` — caller must respect the reason.
- Model registry is extended, NOT replaced by S46 — S46 sets `extendsS43Registry: true` and writes into the same `hx:models` logical space (mf2 metadata stored separately under `mf2:*`).
- Connected-enterprise providers are always governed connectors (optional, never a dependency).

### Session 44 — Voice Ownership
- Consent gate used by S40/S41 now has a real backing service: `/voice-ownership/voices/:id/check-consent` returns `{ok, code, reason}` with codes `VOICE_NOT_ONBOARDED|CONSENT_REQUIRED`.
- Foundry-autonomous voices are consent-exempt (requireConsent returns ok:true when ownershipSource == "voice-foundry-autonomous") — S41 rule preserved.
- Audit entries carry an `immutableHash` (sha256 over id/voiceId/kind/actorId/at/detail) computed at write time — append-only.
- Policies are declarative: `requireApprovalAboveRiskScore` + `humanOversight` flag; approval routing is left to Governance Kernel.

### Session 45 — Core Integration Checkpoint
- `canProceedToSession46 === true` requires ALL `critical` links to be `status==="wired"`. Stubs and non-critical links do not block.
- Kernel round-trip is measured on every checkpoint report; >100ms warning threshold (bootstraps typically measure 5-10ms).
- Digital Human stub and Personality stub are expected stubs until later sessions (62/50 respectively) — not blockers.
- After S45 ships, all subsequent sessions must confirm their critical wiring through this checkpoint's report.

### Session 46 — Model Factory
- Strict lifecycle advancement: `research → benchmarking → validation → approval → canary → deployed → monitoring → retired` — no skips.
- Safety gate: cannot advance to `validation` or beyond unless `safetyPassed === true` (HTTP 400).
- Governance gate: cannot advance from `approval → canary` unless `governanceApproved === true` (HTTP 400).
- Model registry SHARED with S43 (no fork): S43 shows registered/deployed/canary/deprecated/retired; S46 adds lifecycle stage, safety/approval metadata, fine-tune jobs, benchmarks.
- Fine-tuning methods: `supervised | rlhf | dpo | lora | qlora`.

### Session 47 — Memory Evolution
- 9 memory types (episodic/semantic/procedural/organizational/department/project/user/team/knowledge) indexed by type-set + scope-set for fast recall.
- Decay: `decayedStrength = max(0, 1 - daysSinceAccess * 0.01)` (1%/day).
- Intelligent forgetting: memories with `decayedStrength < 0.05` AND `confidence < 0.5` are physically removed during `age` consolidation.
- Deduplication uses `scope + first 60 chars of content` as the dedup key; duplicate merges increment target confidence (+0.05 capped at 1.0) and sum access counts.
- Cross-agent share is an auditable event through Kernel, not a direct pointer copy.
- Memory is additive on `add()` for identical scope+content (accessCount++, confidence+0.02) rather than creating duplicates.

### Session 48 — Constitution Studio
- 11 policy domains × 3 enforcement levels (`advisory | required | hard_block`). `hard_block` violations return HTTP 403 from `constitution/check` and include violated policy ids.
- Published constitutions are immutable versioned snapshots; policies can be drafted/edited independently but only active versions affect requests.
- Check endpoint is invoked by downstream modules (media-gen voice/video, composer deployment, training job governance) before producing output.

### Session 49 — Capability Composer
- Capabilities follow a strict node model: `trigger | capability | output` kinds; edges must connect existing node ids; at least one trigger + one output required to validate.
- Serialized workflows are stored in `_doc` sub-key per the singleton-service pattern, with defensive `deserialize()` that defaults missing `updatedAt/nodes/edges` and skips corrupted entries in `list()`.
- `ensureBootstrapped()` never early-returns on an empty set key — it validates each referenced workflow is parseable with `id/name` and reseeds if zero valid entries remain.

### Session 50 — Benchmark Center
- All benchmark types are **Bm-prefixed** (`BmRun`, `BmMetric`, `BmScheduled`, `BmDashboard`, `BmArea`, `BM_AREAS`) to avoid collision with the existing `BenchmarkRun` in `aiEcosystem.ts`.
- Benchmark results feed back into ModelFactory continuous optimization via the counter hook.

### Session 51 — Disaster Recovery
- 5 fixed regions (`na-east | na-west | eu-west | ap-south | ap-southeast`); one active, others standby; `activeRegion` is the source of truth.
- Failover is orchestrated atomically (old active → standby, chosen standby → active, replication lag reset). Drills are synthetic and do not mutate `activeRegion`.

### Session 52 — Licensing
- Asset types: 12 kinds; billing models: 5. Platform fee is a fixed 20% on revenue-share/royalty.
- Grants carry `remainingUses`; recordUsage atomically decrements; 0 remaining uses → 402 until renewed.

### Session 53 — Deployment
- 14 `TARGET_ENVIRONMENTS`. `LATEST_VERSION` is the source of truth (bumped here to "0.84.0", then "0.85.0" in S54).
- Validation runs 7 deterministic-in-shape checks with synthetic pass/fail — used for drill UI, not actual infra probes.

### Sessions 54–60 — Boot timing & org scoping
- Bootstrap slots (ms after server listen): updates=23500, usage=24000, fabric=24500, robotics=25000, spatial=25500, sdk=26000, training=26500. Next available: **27000**.
- All v8.5 modules are organization-scoped. The S54+ boot block calls `runNewBootstraps("org-windels","user-admin")` first, then looks up the SUPER_ADMIN user via Prisma and, if their `organizationId` differs, runs the same bootstraps for that real org so dashboards populate for the admin UI.
- Service keys use module-prefixed Redis namespaces (`upd:*, usage:*, fab:*, rob:*, spa:*, sdk:*, tr:*`) and follow the singleton + `_doc` sub-key pattern established in prior sessions.

### Session 54 — Updates
- Key categories: platform/module/plugin/model/voice_pack/language_pack/security_patch/dataset/connector/template. Channels: stable/beta/canary/experimental. Strategies: auto/manual/blue_green/canary/rollback_only.
- Deploy lifecycle: pending → (validate) → staged → (approve × N) → approved → deploying → deployed; rollback sets status `rolled_back` and restores `fromVersion`.

### Session 55 — Usage Intelligence
- Synthetic metrics are deterministic-in-shape with bounded randomization, cached in Redis for 120s (`usage:meta:<oid>` with `EX 120`).
- 30-day time series is generated on cache miss; departments (10) and modules (10) are seeded constants.

### Session 56 — Fabric / Trust / Mission Control / AIO Bus
- Types prefixed `Fabric*` where collisions existed with marketplace (`FabricTwin`, `FabricTwinKind`, `FabricCertification`, `FabricEndpoint`) — **never fork the marketplace DigitalTwin**.
- AIO Bus uses Redis pub/sub channel `fab:bus:publish`; subscribers ring-buffer recent events per-org under `fab:bus:<oid>` (capped at 200 via LTRIM). Module telemetry publishes `twin.telemetry` or `enterprise.event` to this bus.
- Digital twin `simulate()` runs asynchronously: marks status `simulating`, then 1.5s later writes updated health/accuracy and emits a bus event.

### Session 57 — Robotics
- Kinds: 14 covering industrial/warehouse/manufacturing/delivery/security/agri/healthcare/av/drone/smart-building/iot/plc/scada/edge. Battery % only emitted for mobile kinds (drone/delivery/AMR/security).
- `command()` transitions status: start→active, pause→paused, stop/reset→idle, maintenance→maintenance; telemetry published onto the AIO Bus after each transition.
- Predictive scan generates alerts on ~15% of fleet with component + riskPct + recommendation.

### Session 58 — Spatial
- Modes: `ar | vr | mr | xr`; deviceTargets: `vision_pro | hololens | quest | desktop | mobile | smart_glasses`.
- Indoor maps auto-provision random waypoints on creation (30–180 per seed map).

### Session 59 — SDK
- Reuses the S56.9 Package Manager (no second package registry). SDK packages are of `kind: "sdk"` installed via Fabric's package manager; SDK-specific metadata is tracked in `sdk:*` keys.
- CLI commands are a static constant (13 groups); emulator start simulates provisioning → running in ~1.2s; profiler returns plausible CPU/mem/token/cost/bottleneck metrics.

### Session 60 — Training
- Strategies: `full | lora | qlora | dpo | rlhf | rag_only | prompt_only`. Jobs auto-advance through stages (preparing → training → evaluating → governance_review → canary → deployed) over ~2.5s when started via API.
- Safety categories (`toxicity | hallucination | bias | pii | jailbreak | harm`) each have category-specific thresholds (PII ≤1%, jailbreak ≤2%, others ≤5%). Any failure blocks `safetyPassed`.
- Canary promotion is 1–50% and requires `safetyPassed`; rollback sets status to `rolled_back` without mutating the dataset.
- Continuous-learning pipelines are seeded disabled/enabled pairs and reference ModelFactory model ids.

### Session 61 — Data & Knowledge Marketplace
- Types prefixed: `DmDashboard` (avoid collision with legacy `marketplace.ts` consumer `MarketplaceDashboard`). Asset kinds (10) and license models (8) are `as const` arrays; `MktAssetKind` / `MktLicenseModel` derived via `[number]`.
- All writes (publish/install/review) are additive; install increments `installs`, review recomputes `ratingAvg` and increments `reviews`; revenue30d sums a synthetic per-install price derived from kind+license.
- Keys: `dm:*` (asset hash, installs set, meta).

### Session 62 — Digital Humans
- Roles: 10 covering assistant/receptionist/coach/tutor/sales/support/interviewer/therapist/presenter/guide; styles 7; genders 4. Session start creates a session record; end accepts resolution + rating and recomputes avgSatisfaction.
- Keys: `dh:*`; avatar status lifecycle `training → ready → live`, live sessions tracked in a Redis set per org.

### Session 63 — Quantum Readiness
- `CryptoInventoryEntry` tags systems as `vulnerable | migrated | in_progress | safe`; PQ algorithms are a const list (CRYSTALS-Kyber/Dilithium/Falcon/SPHINCS+, BIKE). Vendor connectors seeded across IBM/AWS/Azure/Google/D-Wave/local with qubit counts and queue depth.
- Hybrid job submission simulates `queued → running → completed` over ~2s; result includes simulated `objectiveValue`.
- Keys: `q:*`

### Session 64 — Sustainability / ESG
- Scores are on a 0-100 scale across environmental/social/governance; emissionsBySource includes scope 1/2/3. Energy series is deterministic-shaped (12 months) cached 120s to avoid recompute thrash.
- Green AI metrics include co2SavedKg and efficiencyGainPct per workload (model training, inference, RAG, fine-tuning).
- Keys: `esg:*`

### Session 65 — Biomedical & Healthcare
- Namespace `bm:*` (biomedical). Modality list: xray/ct/mri/ultrasound/pet/mammo/pathology/dermatology/ecg. `submitStudy()` returns immediately then asynchronously simulates AI triage/findings after 1.5s — use `setTimeout` and write back to the study hash with `aiFindingsCount` and `status = finalized|flagged`.
- All patient identifiers are hashed (`pt-<uuid>`), no PHI stored; HIPAA/HITRUST/GDPR compliance tags reflect compliance status.

### Session 66 — Legal Intelligence
- Types prefixed `Legal*` (`LegalMatter`, `LegalResearchItem`, `LegalComplianceCheck`) to avoid collision with existing compliance module. 6 frameworks × 3 controls each; research endpoint returns a stub research item with citations/sources.
- Web `lib/legal.ts` **must** also export the public `LEGAL_DOCS` constant used by `/legal` marketing page (terms/privacy/security). Session-66 rewrites must preserve this export.
- Keys: `leg:*`

### Session 67 — Education
- Content kinds: course/lesson/quiz/path/cert_prep/project. Tutor session is created on `POST /education/tutor/start`; path creation accepts contentIds (empty list allowed); assessments carry scorePct/correct/questions/timeSpentSec.
- Skill categories (13) track avg level 1-5 and learner counts; masteryPct is weighted average across categories.
- Keys: `edu:*`

### Session 68 — Scientific Research
- 12 research domains; literature refs include DOI and relevance score; experiments have variables (independent/dependent/controls) and progress bar; hypotheses track supporting vs counter evidence with status `proposed | testing | supported | refuted | published`.
- Search endpoint filters papers by substring of title/abstract; KG nodes/edges are large integers to reflect planetary-scale literature index.
- Keys: `sci:*`

### Session 69 — Cognitive Evolution & World Intelligence (V9.0)
- Single service exposing 11 sub-features via one dashboard: self-evolution (12 components), DNA profile (culture/ethics/risk appetite etc), unified marketplace network, federation partners (trust tiers bronze→platinum), observatory (12 node categories), universal reasoning (15 domains × accuracy/latency/calls), global memory (8 layers), innovation pipeline (proposed→executing with projected value/risk), AI civilization entities, world-model scenarios (5 horizons), prediction accuracy.
- Observability health % is the proportion of `healthy: true` nodes; reasoningAccuracyAvg averages domain accuracies.
- Keys: `cog:*`

### Session 70 — Global Command Center
- Sits ON TOP of Mission Control (S56) and Observatory (S69.5) — it does NOT duplicate their live-view logic; it aggregates regional health, KPIs, incidents, briefings, initiatives.
- Regions: 9 across Americas/EMEA/APAC/LATAM/AF/ME; incidents carry severity `info | warning | critical` and status `open | mitigating | resolved`; briefings carry priority `low | med | high | critical`.
- Keys: `cmd:*`

### Session 71 — AI Economy Platform
- Shares commercial primitives with Session 52 Licensing. GPU offers seeded across 8 GPU types × 6 providers with pricePerHour, vramGb, utilizationPct, availability. Forecasts are 6-month forward projections.
- GPU Utilization % averages offer utilizations; margin % is (revenue − cost) / revenue.
- Keys: `eco:*`

### Session 72 — Autonomous Organization
- Hard rule: every autonomous action path checks governance guardrails. No action ships without a human-approval gate for high-risk decisions. The service exposes a `governanceCompliancePct` metric.
- Autonomy levels: `assist | advise | recommend | execute_pending | fully_autonomous`; departments ship at increasing levels (exec = fully_autonomous is never default for first ship).
- Board decisions include a free-text `reasoning` field to surface the chain of thought.
- Keys: `aut:*`

### Session 82 — Cybersecurity Academy, Ethical Hacking & Multi-Cloud Security
- Domains (26) are defined as `CYBER_DOMAINS` const and include fundamentals, ethical hacking, network/Linux/Windows/AD, web/mobile/API, cloud, containers/K8s, IAM/zero-trust, threat hunting, forensics/IR, malware, red/blue/purple, crypto, AI security, multi-cloud, devsecops, compliance.
- Lab provisioning returns a `status: "provisioning"` lab record with 2-hour TTL (stub — a real range backend is out of scope for MVP). Multi-cloud findings cover AWS/Azure/GCP services with severity `low | medium | high | critical` and status `open | remediated | accepted`.
- Certifications include CompTIA Sec+, OSCP, CISSP, AWS-Security, CEH, GCIH with prep progress when not yet passed.
- `lucide-react` `Shield` is imported as `ShieldLucide` in PlatformPage.tsx to avoid collision with the `ShieldIcon` alias already used in S55.
- Keys: `csec:*`

### Session 73 — OpEx & Responsible AI (V9.2)
- Extends (does NOT fork) Session 56.3 Trust Center. 12 SAFETY_CATEGORIES: bias_fairness, robustness, transparency, privacy, security, alignment, hallucination, toxicity, misinformation, child_safety, data_quality, edge_cases.
- Regulations: EU AI Act / EO 14110 / GDPR / HIPAA / SEC Cyber — each carries a mapped compliance status.
- Governance gates L1 (data-in) → L5 (runtime), gated in order; no L5 deployment without L1–L4 sign-off.
- Explainability structure: `{reasoning, evidence[], confidence, features[]}` per decision.
- Keys: `opex:*`

### Session 74 — Industry / Semantic / DOC (V9.3)
- 25 INDUSTRY_SUITES seeded; industry maturity is named `IndMaturityScore` (NOT `MaturityScore`) to avoid collision with fabric maturity.
- Four-layer Platform One–Four mapping lives in `ARCHITECTURE.md`; `layerMapping` field on the industry dashboard points back to it.
- Ontology lifecycle stages: discover → classify → tag → govern → monitor → retire.
- DOC (Digital Operations Center) surfaces 9 regions × workload KPIs — read-only aggregation, not a second command center (S70 owns the executive command view).
- Keys: `ind:*`

### Session 75 — Health Ecosystem (V10.0) — Fifth Standing Rule
- **Hard rule:** every health insight/result MUST be tagged with exactly one of `wellness_estimate | clinically_validated | medical_decision_support`. Wellness estimates are NOT diagnoses and MUST carry the disclaimer "For informational wellness use only — not medical advice." The UI renders a crimson banner for every insight showing the evidence tier.
- Routes through S40 (voice) → S41 (foundry) → S62 (digital humans) → S65 (biomedical) → S44 (consent/ownership) → S73 (OpEx/RAI safety gate). No health output bypasses S73 safety or S44 consent.
- Metric kinds: heart_rate, blood_pressure, blood_glucose, sleep_hours, steps, hrv, spo2, weight, temperature, respiratory_rate. Fitness kinds: run, cycle, swim, strength, yoga, hiit. Emergency severity: low | medium | high | critical.
- Keys: `hec:*`

### Logger calls
- Logger signature is `logger.info({ msg, ...meta })` and `logger.warn({ msg, err })` — the pino logger in this repo uses object-first style; passing a string + meta object raises TS2769. When bootstrapping new services, always use the object form.

### Lazy bootstrap pattern
- Every module service is a singleton exporting `{Service}` with `ensureBootstrapped(logger?, oid?, uid?)`. The dashboard() method must begin with `if (!(await redis.exists(K.docKey(oid)))) await this.ensureBootstrapped(undefined, oid);` so that any org hitting the dashboard for the first time auto-seeds even when the 23.5s setTimeout bootstrap missed (e.g. late-registered org, restart).

### Prisma client regeneration
- After a `pnpm install` wipes `node_modules`, run `cd apps/api && DATABASE_URL=... ./node_modules/.bin/prisma generate` (or `prisma db push` which also generates) BEFORE `pnpm --filter @windels/api build`, otherwise pre-existing services that import Prisma enums (MeetingStatus, TaskStatus, etc.) will fail TS2305.

## Session 77B (round 2) — Publishing completion pass II (2026-07-31) — Decisions Logged

- **Token scoping is explicit, not implicit:** tokens live in two isolated slots — `pub:tok:<uid>:<platform>` (user) and `pub:tok:org:<oid>:<platform>` (org). A job records which scope it was created with (`job.tokenScope`, default `"user"`) and the worker resolves exactly that slot; never fall back user→org (or org→user) silently.
- **OAuth state doc carries the scope:** `startOAuth(scope)` bakes `scope` + `orgId` into the one-time state doc, so `completeOAuth` stores the exchanged token in the right slot even though the code exchange happens on a different request. Org-scope connect requires an org membership at start.
- **Platform webhook callbacks are public-by-design and mounted before the authed router:** platform hubs have no JWT. The callback router (`/media-factory/publishing/webhooks/:platform/callback?oid=<orgId>`) is registered on `v1` BEFORE `v1.use("/media-factory", mfRouter)` so the JWT middleware can never 401 it. Security = per-org per-platform HMAC secret verified in constant time over `req.rawBody` (stashed by the global `express.json` `verify` hook). Two accepted formats: `X-Windels-Signature: sha256=<hex>` and `X-Hub-Signature: sha1=<hex>`.
- **"Published" ≠ "processed":** once the upload API accepts a post the job is terminal-success (`published`) from our side. Platform post-processing is tracked on the job as `platformStatus` + `platformAvailableAt` + status-history entries, NOT by regressing the job status. Only a terminal platform verdict (`failed`/`rejected`) changes the job status (→ `failed`, code `PLATFORM_REJECTED`, never re-queued). Webhook repeats of the same non-terminal status are idempotent no-ops.
- **Per-job status history is append-only:** `PubJob.statusHistory` (capped 50, newest last) is written by every transition via a single `pushHistory` helper — create/schedule, uploading, published, failed, retries, cancels, and `platform-webhook` syncs. It is observability, not state.
- **Uploads flatten into the shared media cache dir:** uploaded files are stored as `<uuid>.<ext>` directly in `media-cache/` (same dir the render pipeline + `/render/:file` serve), so the publish engine's existing internal-artifact resolver works unchanged. Metadata (org-scoped) lives in Redis `pub:<oid>:uploads` + `pub:<oid>:upload:<file>`; delete is blocked while a queued/scheduled/uploading job references the file.
- **Multipart cap is per-route:** `multipartSingle(field, { maxBytes })` keeps the 30MB default for attachments; the publishing upload route raises it via `PUBLISH_UPLOAD_MAX_MB` (default 512MB, capped 2048MB, still buffered in memory — documented tradeoff).
- **`express.json` now stashes `req.rawBody`** via the `verify` hook for the whole API (additive; body limit unchanged at 5mb) so any future HMAC receiver can verify exact bytes.
- **Web client upload is the one sanctioned raw-fetch exception:** FormData needs a browser-managed Content-Type boundary, so `uploadPublishMedia` fetches directly with the auth header from `useAuthStore`, honors `VITE_API_URL`, and maps errors to `ApiError` so the rest of the UI handles them uniformly.

## Session 84 (completion) + Session 85 (frontend) — Decisions Logged (2026-07-31)

- **Archive inspection is metadata-only by design:** entry count, uncompressed sizes and path safety are read from zip central directory / tar header blocks BEFORE anything is extracted. Limits (`PC_MAX_ENTRIES`, `PC_MAX_UNCOMPRESSED_MB`, `PC_MAX_ENTRY_MB`) are enforced on declared sizes — a lying header is a bomb even if the payload is tiny. gzip inflation is bounded via `maxOutputLength`; the verdict distinguishes `bomb`, `unsafe`, `invalid` and `tool_missing` (7z has no native parser — stays quarantined rather than silently extracted).
- **Quarantine means encrypted-at-rest:** the intake plaintext is deleted and the archive re-encrypted with the Slice 112 AES-256-GCM envelope under `quarantine/<org>/<id>.enc`. Retention = `quarantineExpiresAt` on the record (default 30 days) enforced by an explicit sweep endpoint + delete/release controls. Findings never echo detected secrets.
- **Untrusted code is never executed in the API process:** the S84.11 build/typecheck/test gate runs only under `PC_SANDBOX_MODE=docker` (network-none, capped memory/CPU) or `=local` (bounded subprocess — documented as NOT a security boundary). Default `none` reports `not_configured` with remediation; "not run" is a first-class result, never a fake pass.
- **Rollback is archive-level, by design:** a snapshot = workspace manifest (path/size/sha256) + byte copy of the intake archive. Rollback restores the archive and resets extraction state (re-extract rebuilds the workspace) — the engine never fabricates file contents it doesn't store.
- **Architecture map is deterministic + labeled inferred:** nodes (frontend/backend/database/ai/queue/cli) and edges come from inventory manifests via fixed heuristics and carry `method: "inferred_from_inventory"` — never presented as ground truth.
- **Admin tabs vs. real API:** the pre-existing PlatformPage S84/S85 tabs were written against an aspirational schema (e.g. `status: "scanning"`, `leadsCount`). The libs now expose a legacy adapter (`projectContinuityApi`/`leadDiscoveryApi`) that maps real backend records to those shapes; the tabs compile and render real data, with the honest statuses underneath.
- **CSV export is a raw-fetch exception:** the server streams text/csv (not the JSON envelope), so the web client downloads it as a blob with the auth header — mirroring the FormData exception in media publishing.

## Session 22 (Canvas Collab) + Session 4 (Files) — Decisions Logged (2026-07-31)

- **One document service, two prefixes:** S5's real canvas service stays the single source of truth; the S22 collab router mounts the SAME service functions at `/canvas` (the audit's expected prefix) and adds collab endpoints to both `/canvases` and `/canvas` by registering the collab router on each. No duplicated CRUD logic.
- **Presence is TTL-based, pruned lazily:** heartbeats write `canvas:presence:<id>` hash entries; reads prune entries whose `lastSeenAt` is older than `CANVAS_PRESENCE_TTL_SEC` (30s). No background sweeper — reads self-heal, consistent with the codebase's lazy-bootstrap philosophy.
- **Dedicated subscriber connection:** collab events use a new `redisSub` client (created in `db/redis.ts`) because ioredis rejects regular commands on a subscribed connection — the same reason `redisCmd` exists. The default `redis` stays reserved for modules that already own subscriber duty.
- **Realtime cursor sync = pub/sub + hash:** peers receive live moves via `canvas:collab:<id>` Redis channels; the hash is the durable "latest position" for late joiners. Events are fire-and-forget; state is authoritative.
- **Files page reuses the finished attachments module as-is:** no new backend surface (upload/list/get/delete already existed, org-scoped with sha256 + MIME allowlist + text preview). The page is pure frontend over `/attachments`, replacing the placeholder route. This closed the last "…comes online in later sessions" placeholder in the app shell.
- **Keyless real-provider stack is the norm where possible:** FX (frankfurter + open.er-api), crypto candles (CoinGecko), video (ffmpeg) are real without API keys; the sandbox's outbound HTTPS block is an environment limit, not a code gap — the honest `synthetic`/`not_configured` labels already exist.

## Session 83 (ETL) — Decisions Logged (2026-07-31)

- **Runs must report real counts or fail honestly:** the previous engine hard-coded `rowsProcessed=100, rowsSucceeded=100`. The rewrite executes parse → map → load for every row; `rowsProcessed/rowsSucceeded/rowsFailed` are measured, `succeeded|partial|failed` derives from them, and a zero-success run is `failed` — never a fabricated pass.
- **Per-row failures never abort the run:** each row maps in isolation; failures land in the org-scoped DLQ (`etl:dlq:<oid>:<pipe>`, capped 500, raw-row snippet + error) and drive the `partial` verdict. The DLQ is the spec's dead-letter queue, now real.
- **Remote sources are honest-first:** sftp/s3/http without credentials fail with `SOURCE_NOT_CONFIGURED` and remediation text; XML/SQL parsing is reported as `UNSUPPORTED_FORMAT` rather than silently skipped. No "connected" claims without a connection.
- **Inline payload is the run input for upload sources:** `POST .../run {content}` carries the file content (matching the UI's paste/upload flow); `sourceConfig.content` persists a default. This keeps the engine testable without external file storage.
- **Kernel events per verdict:** `etl.run.succeeded|partial|failed` route through the S39 kernel, consistent with the cross-module event rule.
