# WINDELS AI OS — CLAUDE.md (Sessions 77–78)

This file covers two additive updates, in build order. Nothing in Sessions 1–76 is
removed, replaced, or redesigned by either session. Both sessions reuse existing
platform infrastructure — ESI, SI, God-Node Orchestrator, AI Workforce Platform,
Enterprise Memory Fabric, Knowledge Graph, Workflow Engine, Security Framework,
Governance Kernel, Billing/Wallet, Marketplace, Analytics Platform, Voice/Image/
Video/Audio Generation Engines, Developer Platform, Media Studio, and the existing
auth/org/permissions/audit infrastructure — rather than re-implementing any of it.

Read both sessions fully before writing code. Session 78's agents, marketplace
category, and design gate all depend on patterns established in Session 77.

---

## Combined Folder Structure (Sessions 77 + 78)

Three new top-level packages total. No existing package is touched except at
registration points (workforce registry, marketplace catalog, router).

```
packages/
  experts-platform/                     # Session 77 — Professional Intelligence Platform
    src/
      core/
        ExpertAgent.ts                  # shared base interface — ALL new agents extend this,
                                         # including Session 78's UI/UX/QA agents
        DisclaimerPolicy.ts             # standing "informational, not official advice" wrapper
        ExpertRegistry.ts               # registers experts into existing AI Workforce Platform
      agents/
        government/
          GovernmentIntelligenceAgent.ts
          knowledge-packs/              # country-specific packs (installable via Marketplace)
        healthcare/
          HealthcareIntelligenceAgent.ts
        pharmacy/
          PharmacyIntelligenceAgent.ts
          DrugInteractionChecker.ts
        engineering/
          EngineeringIntelligenceAgent.ts
          disciplines/                  # civil, mechanical, electrical, structural, ...
        legal/
          LegalIntelligenceAgent.ts
      lecturer/
        LecturerAgent.ts
        CourseLibrary/                  # shared with media-factory/educational-studio (Session 77)
        PersonalizedLearningEngine.ts
        LearningAnalytics.ts
        MultilingualBridge.ts           # binds to existing Language Intelligence
        MultimodalIntake.ts             # voice/doc/image/video/handwriting intake
      marketplace/
        expert-packages/                # installable expert bundles (medical specialists, etc.)
    db/
      migrations/                       # see Session 77 § Database Schema Additions
    routes/
      experts.router.ts
      lecturer.router.ts

  media-factory/                        # Session 77 — Autonomous AI Media & Content Factory
    src/
      core/
        ChannelManager.ts
        ContentFactoryPipeline.ts       # wired into existing Workflow Engine
      character-studio/
        CharacterBuilder.ts
        AvatarLibrary.ts
        AnimalLibrary.ts
        EmotionEngine.ts
        VoiceAssignment.ts              # binds to existing Voice Studio
        CharacterVersioning.ts
      educational-studio/
        EducationalCartoonGenerator.ts
        LessonBuilder.ts
        CourseBuilder.ts                # imports CourseLibrary from experts-platform — no dupe
        QuizBuilder.ts
        ChildrensContentBuilder.ts
      animal-content/
        WildlifeContentGenerator.ts
        SpeciesAccuracyValidator.ts
      safety/
        ChildSafetyReviewer.ts          # non-bypassable pre-publish gate
        EducationalAccuracyChecker.ts
        CopyrightDetector.ts
        BrandSafetyReviewer.ts
      analytics/
        ContentPerformanceAnalytics.ts  # feeds existing BI Platform
      billing/
        MediaUsageMeter.ts              # feeds existing Billing/Wallet
    db/
      migrations/
    routes/
      media-factory.router.ts

  ux-intelligence/                      # Session 78 — UI/UX Intelligence, Design System & Experience
    src/
      core/
        UXIntelligenceEngine.ts         # central engine every interface call routes through
        DesignQualityGate.ts            # pre-deploy validation, non-bypassable (same pattern
                                         # as media-factory/safety/ChildSafetyReviewer.ts)
      design-system/
        tokens/
          colors.ts
          typography.ts
          spacing.ts
          motion.ts
          breakpoints.ts
        components/                     # canonical component registry (pointers, not copies,
                                         # to existing Shadcn/Tailwind components)
        ThemeManager.ts
        DesignSystemVersioning.ts
      agents/
        AIUIDesignerAgent.ts            # extends ExpertAgent from experts-platform (Session 77)
        AIUXResearcherAgent.ts
        AIDesignQAAgent.ts
      brand/
        BrandIdentityManager.ts
        BrandGuidelinesEngine.ts
        WhiteLabelProfiles.ts
      responsive/
        ResponsiveExperienceEngine.ts
        DeviceProfiles/                 # desktop, tablet, mobile, foldable, TV, watch,
                                         # automotive, kiosk, AR/VR/XR
      accessibility/
        AccessibilityEngine.ts
        WCAGValidator.ts
        AccessibilityAuditor.ts
      personalization/
        ExperiencePersonalizationEngine.ts   # role/org/industry/device/behavior adaptation
      dashboards/
        DashboardDesignIntelligence.ts  # governs layout/widgets for existing dashboard routes
      marketplace/
        component-marketplace/          # UI components, templates, theme packs, icon packs —
                                         # registered into existing Marketplace (Session 77)
    db/
      migrations/                       # see Session 78 § Database Schema Additions
    routes/
      ux-intelligence.router.ts

apps/dashboard/src/
  routes/
    experts/                            # Session 77 — Expert AI dashboards (Gov/Health/Pharmacy/Eng/Legal)
    lecturer/                           # Session 77 — Lecturer AI + Course Library UI
    media-factory/                      # Session 77
      channel-overview/
      character-studio/
      educational-studio/
      production-pipeline/
      analytics/
    design-system/                      # Session 78 — design system admin UI (tokens, themes, versioning)
    brand-studio/                       # Session 78 — brand identity management UI
    accessibility-center/               # Session 78 — accessibility audit + settings UI
  providers/
    UXIntelligenceProvider.tsx          # Session 78 — wraps existing app shell; NOT a new app shell
```

**Why this shape, across both sessions:**
- Three packages, not one mega-package, because Professional Intelligence (reasoning/teaching),
  Media Factory (generation/publishing), and UX Intelligence (interface governance) have distinct
  lifecycles and different downstream consumers.
- `ExpertAgent` (defined once, in `experts-platform`) is the single agent contract for the whole
  platform — Session 77's six domain experts *and* Session 78's three UI/UX agents extend it, so
  the AI Workforce registry and God-Node see one consistent shape instead of nine bespoke ones.
- Two deliberate cross-package imports, both one-directional and both to avoid duplicating a model
  that two specs independently described: `media-factory/educational-studio` imports `CourseLibrary`
  from `experts-platform`; `ux-intelligence`'s component/template packs register into the Marketplace
  category system already built out in `experts-platform/marketplace` — no second marketplace.
- `ux-intelligence/design-system/components/` holds registry pointers, never copies, of components
  that already live in `apps/dashboard` — satisfies both specs' explicit "do not duplicate UI" rule.

---

## Pre-Session Non-Duplication Audit (applies to both sessions)

Run this before writing any code. Both specs explicitly forbid re-implementing:

| Do NOT rebuild | Reuse from |
|---|---|
| Auth, User Mgmt, Teams, Orgs, Roles, Permissions | Existing Auth/Org modules (Session 1 slice) |
| Billing, Wallet, Usage Metering | Existing Billing Platform |
| AI Workforce, Agent Orchestration | AI Workforce Platform + God-Node Orchestrator |
| Workflow Engine | Existing Workflow Engine |
| Memory / Knowledge Graph | Enterprise Memory Fabric + Knowledge Graph |
| Analytics, Notifications, Scheduling, Logging, Monitoring | Existing Analytics/Observability stack |
| Governance, Security, Audit | Governance Kernel + Security Framework + Audit Framework |
| Marketplace (listing, versioning, install flow) | Existing Marketplace (established in Session 77, extended in 78) |
| Voice/Image/Video generation | Existing Media Studio / generation engines |
| React / Next.js / TypeScript / Tailwind / Shadcn frontend stack | Existing frontend architecture — Session 78 governs it, doesn't replace it |

If a step below looks like it needs a new instance of any row above, stop and wire into the
existing one instead — this is the single most-violated rule in specs of this size.

---

# SESSION 77 — Enterprise Professional Intelligence Platform & Autonomous AI Media / Content Factory

> Merges two source specs (V10.1 Professional Intelligence update + Autonomous AI Media/Content
> Factory update) into one build order, because both are additive and touch the AI Workforce +
> Marketplace + Workflow Engine in the same places — building them together avoids two passes
> over the same shared modules.

## 77.1 Database Schema Additions

New tables only — no changes to existing User/Org/Billing/Audit/Memory tables, all of which are
foreign-keyed into.

**experts-platform:**
`expert_agents`, `expert_knowledge_packs`, `expert_conversations`, `courses`, `lessons`,
`learning_paths`, `quizzes`, `quiz_attempts`, `learning_progress`, `learner_profiles`

**media-factory:**
`channels`, `characters`, `avatars`, `animals`, `content_projects`, `scripts`, `scenes`,
`storyboards`, `voice_profiles`, `media_assets`, `rendering_jobs`, `publishing_jobs`,
`content_templates`, `character_libraries`, `content_performance`

All reference existing `organizations.id`, `users.id`, `teams.id`.

## 77.2 Build Steps

### 77.A — Professional Intelligence Platform

1. **`ExpertAgent` base + `DisclaimerPolicy`** — shared interface every expert implements;
   disclaimer component required on every response from Government/Healthcare/Pharmacy/Legal
   agents.
   *Done when:* base class compiles, one dummy expert registers into the existing AI Workforce
   Platform and appears in God-Node's agent list.
2. **Government Intelligence Agent** — constitutional/legislative/civic education, country
   knowledge-pack loader.
   *Done when:* agent answers a scoped civic-education question and renders the "not an official
   legal authority" disclaimer.
3. **Healthcare Intelligence Agent** — health education, wellness guidance, appointment prep;
   explicit separation from diagnosis/emergency care.
4. **Pharmacy Intelligence Agent** — medication info, interaction checks, refill tracking,
   prescription workflow gated by existing Governance Kernel + applicable-law checks.
5. **Engineering Intelligence Agent** — discipline-scoped calculation/design-review/standards
   guidance, starting with the disciplines most used by existing WINDELS domains.
6. **Legal Intelligence Agent** — legal research, contract/policy review, drafting; "does not
   replace licensed representation" disclaimer.
7. **Lecturer AI core** — subject-agnostic teaching loop: explain → check understanding → advance.
8. **Course Library scaffolding** — schema + CRUD for courses/lessons across the full discipline
   list in the spec.
9. **Personalized Learning Engine** — knowledge assessment, adaptive difficulty, mastery tracking.
10. **Multilingual bridge** — routes through existing Language Intelligence; supports English,
    Nigerian English, Nigerian Pidgin, Igbo, Yoruba, Hausa, Edo.
11. **Multimodal intake** — voice/document/image/handwriting/video/presentation ingestion into
    Lecturer AI.
12. **Learning Analytics** — progress, mastery, quiz performance, weak/strong topics, feeding
    existing BI Platform.
13. **Professional AI Marketplace packages** — installable bundles (medical specialists,
    engineering specialists, cert tutors) registered into existing Marketplace.

### 77.B — Autonomous AI Media & Content Factory

14. **Content Factory core + `ContentFactoryPipeline`** — wired end-to-end into the existing
    Workflow Engine (topic → research → script → storyboard → characters → voice → animation →
    review → publish → analytics → learn).
15. **Channel Manager** — supports the full channel-type list (faceless, educational, children's,
    cartoon, wildlife, history, finance, motivation, tech, business, podcast, documentary,
    storytelling, brand/marketing).
16. **Character/Avatar Studio** — builder, avatar/animal libraries, emotion engine, lip sync,
    gestures, voice assignment (via existing Voice Studio), versioning, cross-content consistency.
17. **Educational Cartoon Generation Platform** — teacher avatars, talking animals, alphabet/
    number/science lessons, moral/safety stories, nursery rhymes, animated quizzes; consumes
    `CourseLibrary` from experts-platform rather than a separate course model.
18. **Animal Content Generation** — wildlife/documentary/farm/marine/dinosaur content with a
    species-accuracy validator step.
19. **Content Safety layer** — child safety policy, educational accuracy checks, copyright/
    duplicate detection, brand safety, misinformation detection, age classification,
    platform-compliance checks. `ChildSafetyReviewer` is a non-bypassable gate before any
    children's-content publish job.
20. **Automation pipeline hookup** — confirm the full 12-stage workflow (find topic → research →
    lesson → script → storyboard → characters → voices → animation → QA → publish → analytics →
    learn) runs entirely through the existing Workflow Engine, not a bespoke scheduler.
21. **Performance analytics integration** — views, watch time, retention, completion, subscriber
    growth, revenue, ROI, learning outcomes — into existing BI Platform.
22. **Billing/usage metering** — AI tokens, GPU time, render time, voice minutes, image/video
    generation, storage, publishing, workflow executions — into existing Billing/Wallet, with cost
    estimate shown pre-execution.
23. **Frontend dashboards** — Autonomous Media Dashboard (pipeline/rendering/publishing/
    performance/revenue/cost), Character Studio UI, Educational Studio UI (lesson/course/quiz/
    children's-content/cartoon/animal-story/AI-teacher builders).

## 77.3 Conventions Log — additions for `CONVENTIONS.md`

- **Naming:** all Professional Intelligence agents are `<Domain>IntelligenceAgent` (e.g.
  `GovernmentIntelligenceAgent`, `PharmacyIntelligenceAgent`); all implement the shared
  `ExpertAgent` interface rather than one-off classes.
- **Disclaimer pattern:** Government / Healthcare / Pharmacy / Legal agents must wrap every
  response in `DisclaimerPolicy` — this is a rendering-layer requirement, not just a prompt
  instruction, so it can't be silently dropped by a prompt change later.
- **Shared course model:** `CourseLibrary` lives once, in `experts-platform`;
  `media-factory/educational-studio` imports it instead of defining its own course schema —
  prevents the two specs' course concepts from diverging.
- **Content type enum:** all channel/content types live in one shared `ContentChannelType` enum,
  referenced by Channel Manager, Analytics, and Billing, so a new channel type is added in one
  place.
- **Non-bypassable safety gates:** `ChildSafetyReviewer` and prescription-workflow governance
  checks are implemented as pipeline steps that block publish/execution, not as advisory
  warnings — matches how the two specs phrase these as hard requirements, not soft ones.
- **Package boundary:** Professional Intelligence (`experts-platform`) and Media Factory
  (`media-factory`) are separate packages with one explicit cross-import (CourseLibrary), not a
  merged package — keeps their independent lifecycles (reasoning/teaching vs.
  generation/publishing) from becoming tangled.

## 77.4 Open Questions (need your call before I start coding)

1. **Trading Edition scope:** the Trading Edition variant is stripped to two trading workforces on
   Drizzle — does Session 77 apply to it at all, or is Professional Intelligence / Media Factory
   main-platform-only?
2. **ORM for these two new packages:** main platform uses Prisma, Trading Edition uses Drizzle for
   sandbox reasons — confirm `experts-platform`/`media-factory` migrations use Prisma (matching
   main).
3. **Build order between 77.A and 77.B:** default is 77.A first, since 77.B's educational-studio
   depends on 77.A's CourseLibrary — flag if media-factory should be prioritized instead.

---

# SESSION 78 — Enterprise UI/UX Intelligence, Design System & Experience Platform

> Not a standalone design tool — it's an intelligence layer that every existing and future WINDELS
> AI OS interface routes through.

## 78.1 Database Schema Additions

New tables only, foreign-keyed into existing `organizations.id`, `users.id`, `teams.id`.

`design_tokens`, `themes`, `component_registry`, `layout_templates`, `brand_identities`,
`brand_assets`, `white_label_profiles`, `accessibility_settings`, `accessibility_audits`,
`ux_personalization_profiles`, `ux_experience_metrics`, `design_quality_checks`,
`dashboard_layouts`, `component_marketplace_listings` (registered as a category in the existing
`marketplace_listings` table from Session 77, not a new marketplace).

## 78.2 Build Steps

1. **`UXIntelligenceEngine` core** — the routing layer every interface generation call passes
   through; starts as a pass-through wrapper so nothing breaks, then gains capability step by
   step.
   *Done when:* one existing dashboard route renders through the engine with identical output to
   before.
2. **Design Tokens + Theme Manager** — global color/typography/spacing/motion/breakpoint tokens,
   versioned.
   *Done when:* at least one existing app pulls its Tailwind config from generated tokens instead
   of a hardcoded value.
3. **Component Registry** — canonical pointers to existing Shadcn/Tailwind components; no
   component code duplicated.
4. **AI UI Designer Agent** — dashboard/form/landing-page/data-viz design recommendations, extends
   `ExpertAgent`.
5. **AI UX Researcher Agent** — journey mapping, friction detection, click-path analysis, feeding
   existing Analytics Platform.
6. **AI Design QA Agent + `DesignQualityGate`** — layout/component-reuse/responsive/accessibility/
   brand/typography/color/nav/performance checks. Non-bypassable: no interface promotes to
   production without passing.
7. **Brand & Visual Identity Platform** — brand identity manager, guidelines, multi-brand support
   for white-label orgs.
8. **Responsive Experience Engine** — device-profile-driven optimization across desktop through
   AR/VR/XR, extensible for future display types.
9. **Accessibility Intelligence** — WCAG compliance, keyboard nav, screen reader support,
   contrast/font/motion/color-blind settings, voice nav, captioning, automated pre-deploy audit
   (wires into `DesignQualityGate`).
10. **Dashboard Design Intelligence** — governs the existing dashboard set (Executive, Analytics,
    AI Workforce, Trading, Healthcare, Education, CRM, Workflow, Media, Command Centers) with
    real-time widgets, KPI cards, drill-down, role-based views — no new dashboard shells, only
    intelligence over existing ones.
11. **Experience Personalization Engine** — adapts by role/org/industry/department/language/
    accessibility need/device/usage pattern, respecting existing Governance Kernel privacy
    policies.
12. **Component Marketplace category** — UI components/templates/theme packs/icon packs
    registered as a listing type in the existing Marketplace, not a new marketplace instance.
13. **Frontend integration pass** — `UXIntelligenceProvider` wraps the existing React/Next.js/
    TypeScript/Tailwind/Shadcn app shell; confirm no duplicate UI system was introduced anywhere
    in steps 1–12.

## 78.3 Conventions Log — additions for `CONVENTIONS.md`

- **Registry-not-copy rule:** any new "component library" or "template library" work stores
  pointers/metadata into `component_registry`, never a second copy of component source — applies
  beyond this session too, to any future spec that mentions UI components.
- **Agent base reuse:** `AIUIDesignerAgent`, `AIUXResearcherAgent`, `AIDesignQAAgent` extend the
  `ExpertAgent` interface from Session 77's `experts-platform`, confirming that interface is the
  platform-wide standard for any new "AI \<role\> Agent," not just the six professional-domain
  experts.
- **Non-bypassable gate pattern (extended):** `DesignQualityGate` follows the same pattern as
  Session 77's `ChildSafetyReviewer` — a hard pipeline block, not an advisory warning. Two
  sessions in a row use this pattern; formalize as a named convention ("Hard Gate" steps) rather
  than re-deriving it each time.
- **Marketplace as single catalog:** component/template/theme packs are a *listing category*
  inside the existing Marketplace from Session 77, not a parallel marketplace — same rule applies
  to any future spec proposing an "X Marketplace."
- **Provider-not-shell pattern:** platform-wide intelligence layers (this session's UX engine)
  attach via a Provider wrapping the existing app shell, rather than owning routing or layout
  themselves — keeps "intelligence layer" specs from silently becoming "new frontend framework"
  specs.

## 78.4 Open Questions

1. **Rollout order:** should `DesignQualityGate` be enforced platform-wide immediately, or opt-in
   per app during a transition period so Sessions 1–77's existing dashboards aren't blocked from
   deploying while their design debt gets addressed?
2. **React Native / Flutter:** spec lists React Native now and Flutter as future — confirm whether
   `ResponsiveExperienceEngine`'s device-profile work should scaffold Flutter now or genuinely
   wait.
3. **Trading Edition:** same question as Session 77 — does the stripped-down Trading Edition
   variant get the full UX Intelligence layer, or a minimal subset (tokens + accessibility only)?
