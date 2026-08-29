export interface DocSection {
  id: string;
  title: string;
  description: string;
  blocks: DocBlock[];
}
export type DocBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "code"; lang: string; text: string }
  | { type: "ul"; items: string[] }
  | { type: "callout"; tone: "info"|"warn"|"success"; text: string };

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "Create your account, workspace, and run your first AI workflow in under 5 minutes.",
    blocks: [
      { type: "h2", text: "Welcome to WINDELS AI OS" },
      { type: "p", text: "WINDELS AI OS is the enterprise operating system for AI workforces. It brings agents, workflows, chat, talk channels, canvas, governance, and observability together under one platform with a unified permission model and audit trail." },
      { type: "h3", text: "Quick start" },
      { type: "ul", items: [
        "Sign up with your work email — your organization workspace is created instantly.",
        "Head to Workforce Hub to deploy your first AI agent (Coordinator, Researcher, or Notetaker).",
        "Open Flow to connect agents into workflows with triggers, conditions, and approvals.",
        "Invite teammates from Settings → Organization.",
      ]},
      { type: "callout", tone: "success", text: "The first 14 days are free on the Team plan with no credit card required." },
    ],
  },
  {
    id: "authentication",
    title: "Authentication",
    description: "JWT-based auth, API keys, SSO, and session management.",
    blocks: [
      { type: "h2", text: "Authentication" },
      { type: "p", text: "All authenticated API requests require a Bearer token in the Authorization header. Tokens are JWTs signed with your organization's JWT secret and expire after 15 minutes. Refresh tokens are issued as httpOnly cookies for the web app." },
      { type: "code", lang: "http", text: "POST /api/v1/auth/login\nContent-Type: application/json\n\n{\"email\":\"you@company.com\",\"password\":\"••••••••\"}\n\n→ {\"ok\":true,\"data\":{\"token\":\"eyJ...\",\"user\":{...}}}" },
      { type: "h3", text: "API keys" },
      { type: "p", text: "For server-to-server integrations, create an API key from Developers → API Keys. Keys are prefixed wnd_ and displayed only once at creation. Scope them to READ, WRITE, or ADMIN." },
    ],
  },
  {
    id: "rest-api",
    title: "REST API",
    description: "The stable public REST surface for workflows, agents, and talk.",
    blocks: [
      { type: "h2", text: "REST API v1" },
      { type: "p", text: "The public REST gateway is mounted at /api/rest/v1. Authenticate with an API key in the Authorization header (Bearer wnd_…). Responses are always JSON envelopes with {ok, data, meta}." },
      { type: "code", lang: "bash", text: "curl https://api.windels.ai/api/rest/v1/workflows \\\n  -H \"Authorization: Bearer wnd_your_key_here\"" },
      { type: "h3", text: "Endpoints" },
      { type: "ul", items: [
        "GET / — API identity (version, auth status)",
        "GET /workflows — list workflows (200 OK, paginated)",
        "POST /workflows/:id/run — trigger a workflow run",
        "GET /agents — list agents",
        "GET /talk/channels — list talk channels",
        "POST /talk/channels/:id/messages — send a message",
      ]},
      { type: "callout", tone: "warn", text: "The REST API is rate-limited at 600 requests/minute per API key. Use Retry-After headers to back off." },
    ],
  },
  {
    id: "webhooks",
    title: "Webhooks",
    description: "Subscribe to events and receive signed HMAC deliveries.",
    blocks: [
      { type: "h2", text: "Webhooks" },
      { type: "p", text: "Register webhook endpoints from Developers → Webhooks. Each endpoint gets a unique signing secret (whsec_…). Deliveries are signed with HMAC-SHA256 and include Windels-Signature, Windels-Timestamp, and Windels-Event headers." },
      { type: "code", lang: "js", text: "import crypto from 'crypto';\nconst sig = req.header('Windels-Signature');\nconst body = rawRequestBody;\nconst hmac = crypto.createHmac('sha256', secret)\n  .update(timestamp + '.' + body).digest('hex');\nif (!crypto.timingSafeEqual(Buffer.from('v1='+hmac), Buffer.from(sig))) throw 'invalid';" },
      { type: "h3", text: "Events" },
      { type: "ul", items: [
        "workflow.run.started", "workflow.run.succeeded", "workflow.run.failed",
        "message.created", "ai.request", "ai.error", "webhook.delivery_failed",
      ]},
      { type: "p", text: "Deliveries are retried up to 5 times with exponential backoff (2^attempt seconds). Failures after all retries emit alerts to the Platform dashboard." },
    ],
  },
  {
    id: "agents",
    title: "Agents",
    description: "The AI workforce — register, configure, and deploy agents.",
    blocks: [
      { type: "h2", text: "Agents" },
      { type: "p", text: "Agents are AI-powered workers with a system prompt, model, capabilities, and memory. They can be assigned tasks, participate in Talk channels, and run workflow nodes." },
      { type: "h3", text: "Built-in roles" },
      { type: "ul", items: [
        "Coordinator — orchestrates other agents and triages tasks",
        "Researcher — web/knowledge-grounded research and summarization",
        "Notetaker — joins Talk meetings, produces summaries + action items",
        "Custom — register any model and prompt template",
      ]},
      { type: "p", text: "Agents can have short-term session memory and long-term recall via the Memoirs tab." },
    ],
  },
  {
    id: "workflows",
    title: "Workflows",
    description: "Windels Flow — triggers, nodes, conditions, approvals, and retries.",
    blocks: [
      { type: "h2", text: "Workflows (Windels Flow)" },
      { type: "p", text: "Flow is a visual automation builder. Build a graph of TRIGGER → ACTION/AI/CONDITION/LOOP/APPROVAL/DELAY → END nodes connected by true/false branches. Runs are recorded with per-node status, duration, retries, and output." },
      { type: "h3", text: "Triggers" },
      { type: "ul", items: [
        "Manual — run from the UI or REST API",
        "Schedule — run every N minutes via the cron ticker",
        "Event — react to EventBus topics (workflow.*, message.*, webhook.*)",
        "Webhook — external HTTP POST triggers a run",
      ]},
      { type: "callout", tone: "info", text: "Templates use {{mustache}} syntax; the END node must return {completed: true} to avoid circular-serialization errors." },
    ],
  },
  {
    id: "talk",
    title: "Talk",
    description: "Channels, DMs, messages, meetings, action items, and @mention AI.",
    blocks: [
      { type: "h2", text: "Talk" },
      { type: "p", text: "Talk is the team messaging layer. Channels and DMs support messages, threads, reactions, files, scheduled meetings, live meeting transcripts, AI notetaker summaries, and @mention-powered AI replies." },
      { type: "h3", text: "Messages API" },
      { type: "code", lang: "http", text: "POST /api/v1/talk/channels/:id/messages\nContent-Type: application/json\n\n{\"content\":\"Hello team, posting from the API!\"}" },
      { type: "p", text: "When a message @mentions an agent, the agent streams an AI reply into the channel automatically." },
    ],
  },
  {
    id: "sdk",
    title: "SDK",
    description: "Coming soon — TypeScript and Python clients.",
    blocks: [
      { type: "h2", text: "SDKs" },
      { type: "p", text: "Official SDKs are in active development. Until the GA release, use the REST API directly with fetch or any HTTP client." },
      { type: "code", lang: "ts", text: "// Coming soon:\nimport { Windels } from '@windels/sdk';\nconst w = new Windels({ apiKey: process.env.WINDELS_API_KEY });\nconst run = await w.workflows.run('wf_abc123', { input: {} });" },
      { type: "callout", tone: "info", text: "Request SDK early access from your account manager or by emailing developers@windels.ai." },
    ],
  },
];
