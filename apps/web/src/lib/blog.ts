export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  readingTime: string;
  tags: string[];
  body: BlogBlock[];
}
export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "quote"; text: string; cite?: string }
  | { type: "ul"; items: string[] }
  | { type: "code"; lang: string; text: string };

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "introducing-windels-flow",
    title: "Introducing Windels Flow: the AI-native workflow engine",
    excerpt: "Flow lets you connect AI agents into production-grade automations with drag-and-drop, conditions, approvals, and retries — out of the box.",
    date: "2026-07-15",
    author: "Windels Engineering",
    readingTime: "4 min read",
    tags: ["product", "flow", "announcement"],
    body: [
      { type: "p", text: "Today we're launching Windels Flow, a visual automation canvas purpose-built for AI workforces. Where traditional workflow tools treat AI as an afterthought — a single \"call LLM\" action buried among HTTP calls — Flow treats AI, humans-in-the-loop, and deterministic steps as first-class citizens from the start." },
      { type: "h2", text: "Why a new kind of workflow engine?" },
      { type: "p", text: "AI workflows fail differently. They don't just timeout or return 500; they hallucinate, return malformed JSON, and ask for approvals. Flow's execution engine was designed for these realities: per-node retries with configurable backoff, CONDITION branches that safely evaluate JSON-path expressions, APPROVAL nodes that pause runs for humans, and DELAY nodes that schedule work without holding workers." },
      { type: "h2", text: "Triggers for every surface" },
      { type: "ul", items: [
        "Manual runs from the builder or REST API",
        "Schedule triggers (any interval, with cron-style syntax on the roadmap)",
        "Event triggers reacting to workflow.run.*, message.created, webhook deliveries",
        "Webhook triggers for third-party systems",
      ]},
      { type: "quote", text: "Flow is the nervous system of your AI workforce. Agents make decisions; Flow composes them into reliable, observable, governable processes.", cite: "Platform design principles" },
      { type: "h2", text: "Built-in observability and governance" },
      { type: "p", text: "Every run records per-node status, duration, input, and output. Audit logs track who triggered what; retention policies auto-purge historical runs; alerts fire on failure rates. It's everything you already expect from an enterprise platform, built in." },
    ],
  },
  {
    slug: "ai-workforce-maturity",
    title: "The five stages of AI workforce maturity",
    excerpt: "From \"we called ChatGPT once\" to autonomous operations — where is your organization, and what comes next?",
    date: "2026-07-08",
    author: "Platform Team",
    readingTime: "6 min read",
    tags: ["best-practices", "enterprise"],
    body: [
      { type: "p", text: "We've worked with dozens of teams deploying AI inside their organizations. A pattern emerged: most progress through five predictable stages. Knowing where you are is the fastest way to figure out what to invest in next." },
      { type: "h2", text: "Stage 1 — Curiosity" },
      { type: "p", text: "Individuals have ChatGPT accounts. No shared data, no governance, no measurable business outcomes. The risk isn't failure here — it's shadow AI spreading faster than security can track it." },
      { type: "h2", text: "Stage 2 — Shared assistants" },
      { type: "p", text: "Teams adopt a shared chat interface (like Windels Chat) with knowledge retrieval and a few prompt templates. Productivity improves, but outputs aren't reproducible, and agents can't act." },
      { type: "h2", text: "Stage 3 — AI agents" },
      { type: "p", text: "Dedicated agents with defined roles, memories, and tool access appear in Workforce Hub. Agents take tickets, draft replies, summarize meetings, and coordinate with each other. Governance starts mattering." },
      { type: "h2", text: "Stage 4 — Automated workflows" },
      { type: "p", text: "Flow connects agents and humans into repeatable, auditable processes. Workflows run on schedules and events. Retries, approvals, and alerts handle failure. This is where AI starts showing up in P&Ls." },
      { type: "h2", text: "Stage 5 — Autonomous operations" },
      { type: "p", text: "Agents and workflows compose into a digital twin of the business: planning, executing, measuring, and improving continuously. Humans focus on direction and exceptions." },
    ],
  },
  {
    slug: "launch-notes-july",
    title: "Launch notes: governance, platform, and security",
    excerpt: "What shipped in July: RBAC + audit logs, global observability, encryption at rest, and prompt-injection protection.",
    date: "2026-07-20",
    author: "Windels Team",
    readingTime: "3 min read",
    tags: ["changelog", "security", "governance"],
    body: [
      { type: "p", text: "We just shipped three of the biggest foundational releases yet, all within a single sprint. Here's what's new." },
      { type: "h2", text: "Governance center" },
      { type: "ul", items: [
        "Full RBAC + permission grants on top of the User/Admin/Super-Admin baseline",
        "Audit logs recording permissions, alerts, retention changes, exports, and failovers",
        "Health monitoring with pings to api/database/redis and service-level history",
        "Alert engine subscribed to the event bus with per-rule severity, channels, and conditions",
        "GDPR data exports, retention policies with hourly purging, and compliance reports",
      ]},
      { type: "h2", text: "Platform observability" },
      { type: "p", text: "Every request now has a trace ID, logs stream to a ring buffer viewable from the Platform dashboard, and metrics counters/histograms track HTTP, DB, Redis, AI, and security events. Multi-region topology and CDN cache controls ship as control-plane APIs, ready to wire into your infrastructure." },
      { type: "h2", text: "Security hardening" },
      { type: "ul", items: [
        "AES-256-GCM encryption for integration credentials and SSO secrets at rest",
        "Prompt-injection detector across all AI call paths, blocking at score ≥80",
        "9 tiers of Redis-backed rate limiting; login brute-force protection",
        "HSTS, strict CSP, CSRF double-submit, and circuit breakers for dependencies",
      ]},
      { type: "code", lang: "bash", text: "# New endpoints to explore:\nGET /api/v1/security/scorecard\nGET /api/v1/platform/metrics\nGET /api/v1/governance/audit\nGET /api/v1/platform/ai-observability" },
    ],
  },
];
