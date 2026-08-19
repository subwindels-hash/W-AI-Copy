# WINDELS AI OS — CLAUDE.md Addendum
## Sessions 84–86: Project Continuity Engine, AI Lead Discovery Platform, Global Branding

> **Status:** ADDITIVE UPDATE. Do not remove, replace, rewrite, or break any existing WINDELS AI OS modules, sessions, or architecture (Sessions 1–83). Everything below extends the existing AI Workforce Platform, God-Node Orchestrator, Memory Fabric, Knowledge Graph, Workflow Engine, CRM, Security Framework, Governance Kernel, Audit Logs, and Design System. No duplicate systems. No disconnected modules. No placeholder/demo-only code. No fake completion percentages.

---

## Session 84 — Project Import, Codebase Intelligence & Continuous Development Engine

**Goal:** Allow WINDELS AI OS to accept an existing software project (not just start new ones), verify its real condition, understand its architecture, and continue building on it module-by-module — never assuming an uploaded project is empty.

### 84.1 Project Archive Upload
- Accept ZIP, 7Z, TAR, TAR.GZ, TAR.BZ2, TAR.XZ, plus individual/multiple files and folders.
- Support backend, frontend, full-stack, monorepo, microservice, mobile, and desktop project types.
- Configurable upload limits by user plan, org plan, storage capacity, project size, security policy.

### 84.2 Secure Project Intake
- Pre-extraction security scan: malware, suspicious executables, dangerous scripts, archive/zip bombs, path traversal, malicious symlinks, suspicious dependencies.
- Detect and quarantine secrets (API keys, credentials, private keys, tokens, passwords) before any content reaches AI context, logs, dashboards, or reports. Secrets are never surfaced in AI responses.

### 84.3 Codebase Intelligence Engine
- Build a full internal project map: languages, frameworks, libraries, dependencies, package managers, build systems, env config, DB config, API/frontend routes, backend services, microservices, auth, models, integrations, background jobs, websockets, queues, storage, tests, deployment config.

### 84.4 Architecture Map (interactive)
- Visualize Frontend → API Gateway → Backend Services → Database, and AI Agent → Workflow Engine → Task Queue → Execution Worker style component graphs, showing real communication paths pulled from 84.3's map — not a generic template.

### 84.5 Project Verification Engine
Inspect and report on:
- **Code:** syntax/type errors, broken imports, dead/duplicate code, incomplete implementations, TODOs, placeholders, hardcoded demo data.
- **Application:** build status, runtime/startup errors, broken routes/APIs, failed services.
- **Database:** schema integrity, missing migrations, broken relationships, missing tables, migration conflicts, connection issues.
- **Dependencies:** missing packages, version conflicts, deprecated/vulnerable packages, misconfiguration.
- **Testing:** existing tests, coverage, failing tests, missing critical tests, integration status.

### 84.6 Project Health Report
Generate: Project Status (type/framework/languages/architecture/build/test/DB/security/deployment), Completion Status (completed/partial/incomplete/broken/missing/placeholder modules), Technical Debt (high/medium/low), and a Recommended Build Order.

### 84.7 Continue-Building Workflow
On "continue building this project": understand codebase → identify architecture → identify completed/unfinished/broken functionality → identify next required module → implementation plan → modify existing project → **preserve existing working functionality** → run tests → verify changes → proceed to next approved task. Never restart from scratch.

### 84.8 Project Memory
Persist across sessions: architecture, stack, completed/pending features, known issues, architecture decisions, DB schema, API docs, build history, test results, deployment status, prior AI changes, user requirements, roadmap. Store in the existing Memory Fabric / Knowledge Graph — no separate memory store.

### 84.9 Agents (register under existing AI Workforce / God-Node Orchestrator — no new orchestration layer)
Project Architect · Codebase Analysis · Backend Development · Frontend Development · Database · Testing · Security · DevOps · Documentation · Code Review · Project Manager.

### 84.10 Change Control & Versioning
Before significant changes: snapshot the project, record the planned change, affected files/services/DB/API, and risks. Maintain change history, version history, rollback points, before/after diffs. Users can review and roll back where supported.

### 84.11 Build & Test Validation Gate
Every module must pass: **IMPLEMENTED → BUILT → TESTED → VERIFIED → INTEGRATED**. Run build, tests, type-check, lint, migration validation, API validation, frontend validation, regression check, log review, and a completion report — before marking anything complete.

### 84.12 Module-by-Module Development Loop
Select unfinished module → analyze requirements → inspect related existing code → plan → build → wire frontend/backend/DB/agents → test → verify integration → mark complete → move to next. No silent skipping of unfinished modules.

### 84.13 Project Development Dashboard
Surface: uploaded project, size, type, stack, architecture, health, completion %, completed/active/pending/broken modules, security issues, build/test/DB status, recent changes, agent activity, tasks, rollback points.

**Done when:** an existing zipped project can be uploaded, scanned for secrets/malware, mapped, verified with a real (non-fabricated) health report, and built on module-by-module with the gate above enforced — using only existing WINDELS AI OS infrastructure.

---

## Session 85 — AI Lead Discovery & Business Intelligence Platform

**Scope lock:** this is a **lead discovery and extraction** module, not an email/outreach/spam automation platform. It finds and organizes legally accessible business information; it never contacts anyone automatically.

### 85.1 AI Lead Search Engine
Natural-language search ("Find gyms in London", "Find construction companies in Nigeria") parsed into structured queries by business type, industry, name, country/city/region, website, or public attributes.

### 85.2 Business Lead Discovery
Collect only legally accessible business data from authorized sources: name, category, industry, description, address, city/region/country, public phone, public email (where legally accessible), website, public social profiles, hours, source, discovery date, verification status.
- Must never bypass authentication, access controls, CAPTCHA, private-data restrictions, or platform terms.
- All collection must comply with applicable privacy law and source terms of service.

### 85.3 Lead Results Dashboard
Structured, paginated results (e.g. "1,058 Businesses Found in London — Gyms") with view/search/filter/sort/select/save/tag/categorize/remove/verify/export actions.

### 85.4 AI Lead Intelligence
Classify leads (High/Medium/Low relevance, Needs Verification) from actual retrieved data only — the AI must not invent fields it cannot support.

### 85.5 Search Filters
Country, city, region, industry, business type, has-website, has-public-email, has-public-phone, verified, data completeness, relevance, date discovered.

### 85.6 Lead Collections
Create/rename/add/remove/search/tag/export/share (with authorized teammates) named collections.

### 85.7 Lead Data Export
CSV, Excel, JSON, PDF — governed by existing account/org export permissions.

### 85.8 CRM Integration (user-initiated only)
Selected leads → existing CRM as contact/company/opportunity records, with tags/notes. This action is always explicit and user-triggered.
- **Hard rule:** no automatic emails, WhatsApp, SMS, social messages, or automated voice calls to discovered leads, ever, unless a separate explicitly-authorized outreach module is enabled later by the user/org. Session 85 does not include or enable that module.

### 85.9 AI Research Agent Integration
Reuse existing AI Research Agents to answer questions about a lead ("what does this company do", "summarize their public site", "compare these 50 businesses") — responses must clearly separate Verified / Publicly Available / AI Analysis / Estimated information.

### 85.10 Map & Geographic Intelligence
Integrate with the existing Geographic Intelligence Center: map/list view, clustering, location/distance filtering, density analysis.

### 85.11 Lead Data Analytics
Totals by industry/country/city, website/email/phone coverage, verified count, incomplete records, search history, collection growth.

### 85.12 Agents (register under existing AI Workforce / God-Node Orchestrator)
Lead Discovery · Business Research · Lead Verification · Lead Organization · Geographic Intelligence · Lead Analytics.

### 85.13 Data Governance & Privacy
Source tracking, provenance, discovery timestamp, verification status, access control, org/export permissions, audit logging, retention controls.

**Done when:** a user can search in natural language, get a real (non-fabricated) results set from authorized sources, organize it into collections, export it, and optionally push selected records into the existing CRM — with zero automated outreach anywhere in the loop.

---

## Session 86 — Official Branding & Global Footer

### 86.1 Shared Component
Add/extend a single reusable component in the existing shared UI/design system (e.g. `GlobalBrandingFooter`, name per existing project conventions) — no per-platform duplicate implementations.

Content (exact wording, do not alter):
- Left: `Proudly Powered by WIL.®`
- Right: `© {currentYear} WINDELS AI OS` — year computed at render time (`new Date().getFullYear()` or platform equivalent), never hardcoded.

### 86.2 Layout Rules
- **Web / Windows / macOS:** two-sided horizontal footer, left/right aligned as above; must not overlap or crowd Command Center, nav, dashboards, workforce/agent/workflow UIs, dev tools, or enterprise modules; responsive at existing breakpoints.
- **iOS / Android:** horizontal when width allows; stack vertically (Powered-by line, then copyright line) below the responsive threshold; must hold up across small/large phones, tablets, both orientations, and accessibility font scaling.

### 86.3 Design Requirements
Use existing design tokens, typography, spacing, color, and theme system only — no new token set. Must render correctly in light, dark, system, and all existing theme variants (and remain forward-compatible with future ones). Subtle, non-disruptive, accessible (contrast, scalable text).

### 86.4 Integration
Wire into the shared layout used by AI Command Center, AI Workforce, Agent Ecosystem, Synthetic/Superintelligence layers, God-Node Orchestrator dashboards, Workflow Engine, Media Generation, Health Platform, Trading Intelligence, Developer Platform, Session 84's Project Development Platform, Marketplace, and other enterprise surfaces — via the one shared component, not per-module copies.

### 86.5 Validation Checklist
- [ ] Correct exact text, both sides, ® preserved
- [ ] Year is dynamic, verified against system clock (not hardcoded)
- [ ] Light / dark / system theme all correct
- [ ] Web responsive breakpoints (desktop/tablet/mobile browser)
- [ ] iOS: small phone, large phone, iPad, portrait, landscape, accessibility font sizes
- [ ] Android: small/large phone, tablet, portrait/landscape, screen densities
- [ ] Windows: resizable, maximized, multi-window
- [ ] macOS: resizable, full-screen
- [ ] No overlap with Command Center / nav / dashboards / dev tools
- [ ] Single shared component reused everywhere (no duplicate implementations found in a codebase grep)

**Done when:** every supported surface renders the identical footer content from one shared component, with a genuinely dynamic year and correct light/dark behavior, verified against the checklist above.

---

## Standing Rules Carried Forward (apply to all three sessions above)
- No new orchestration, memory, or design-token systems where an existing one already does the job — extend, don't duplicate.
- No module is "complete" on generated code alone; it must clear the Session 84.11 gate (IMPLEMENTED → BUILT → TESTED → VERIFIED → INTEGRATED).
- No fabricated data: health reports, lead results, and completion percentages must reflect real scan/build/test/search output, never placeholders.
- Any data-collection or credential-handling logic (84.2, 85.2) is subject to the existing Security Framework, Governance Kernel, and Audit Logs — log the check, not the secret.
