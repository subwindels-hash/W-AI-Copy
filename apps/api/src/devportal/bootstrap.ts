/**
 * Session 27 bootstrap — seed developer portal data if empty.
 */
import { logger } from "../observability/logger.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import { SDKRegistryService } from "./sdkRegistry.service.js";
import { CLIService } from "./cli.service.js";
import { EnvironmentService } from "./environment.service.js";
import { ToolkitService } from "./toolkit.service.js";

export async function bootstrapDevPortal() {
  // Seeded SDK/CLI/environment reference catalog is opt-in; production starts empty.
  if (!demoDataEnabled()) return skipDemoSeed("devportal");
  const existing = await SDKRegistryService.list();
  if (existing.length > 0) {
    const cli = await CLIService.list();
    const envs = await EnvironmentService.list();
    logger.info("developer portal already seeded", { sdks: existing.length, cli: cli.length, envs: envs.length });
    return;
  }

  await CLIService.seed();
  await EnvironmentService.seed();

  const sdks = [
    { slug: "agent-sdk", name: "AI Agent SDK", category: "agent" as const, language: "typescript" as const,
      description: "Build, run and deploy AI agents with tools, memory, and workflows.",
      features: ["Tool calling", "Memory access", "Streaming", "Multi-agent orchestration"],
      sliceNumber: 217, bundleSizeKb: 48,
      exampleSnippet: `import { Agent } from "@windels/agent-sdk";\nconst agent = new Agent({ model: "gpt-4o" });\nawait agent.run("Summarize my inbox");` },
    { slug: "plugin-sdk", name: "Plugin SDK", category: "plugin" as const, language: "typescript" as const,
      description: "Extend WINDELS with custom commands, tools, and UI surfaces.",
      features: ["Custom commands", "UI slots", "Settings pages", "Lifecycle hooks"],
      sliceNumber: 218, bundleSizeKb: 22 },
    { slug: "workflow-sdk", name: "Workflow SDK", category: "workflow" as const, language: "typescript" as const,
      description: "Compose durable DAG workflows with retries, human-in-the-loop, and schedules.",
      features: ["DAG builder", "Retries", "Schedules", "HITL steps"],
      sliceNumber: 219, bundleSizeKb: 38 },
    { slug: "marketplace-sdk", name: "Marketplace SDK", category: "marketplace" as const, language: "typescript" as const,
      description: "Publish and discover agents, plugins, and skills on the WINDELS marketplace.",
      features: ["Publish flow", "Versioning", "Install hooks", "Reviews"],
      sliceNumber: 220, bundleSizeKb: 16 },
    { slug: "kg-sdk", name: "Knowledge Graph SDK", category: "knowledge" as const, language: "typescript" as const,
      description: "Query and mutate the enterprise knowledge graph.",
      features: ["Entity CRUD", "Triple queries", "Embeddings", "Reasoning chains"],
      sliceNumber: 221, bundleSizeKb: 54 },
    { slug: "memory-sdk", name: "Memory SDK", category: "memory" as const, language: "typescript" as const,
      description: "Long-term, episodic, and semantic memory for agents.",
      features: ["Semantic search", "Episodic log", "Summarization", "TTL policies"],
      sliceNumber: 222, bundleSizeKb: 29 },
    { slug: "automation-sdk", name: "Automation SDK", category: "automation" as const, language: "typescript" as const,
      description: "Trigger-based automations with conditions and actions.",
      features: ["Triggers", "Conditions", "Actions", "Replay"],
      sliceNumber: 223, bundleSizeKb: 20 },
    { slug: "dashboard-sdk", name: "Dashboard SDK", category: "dashboard" as const, language: "typescript" as const,
      description: "Build custom admin dashboards with charts, KPIs, and widgets.",
      features: ["React widgets", "KPI cards", "Charts", "Real-time streams"],
      sliceNumber: 224, bundleSizeKb: 62 },
    { slug: "web-sdk", name: "Web SDK", category: "web" as const, language: "typescript" as const,
      description: "Embed WINDELS agents and widgets into any web app.",
      features: ["Chat widget", "Agent iframe", "Auth bridge", "Events"],
      sliceNumber: 225, bundleSizeKb: 32 },
    { slug: "mobile-sdk", name: "Mobile SDK", category: "mobile" as const, language: "kotlin" as const,
      description: "Native iOS/Android SDK for mobile agent integration.",
      features: ["Push notifications", "Offline queue", "Voice input", "Biometric auth"],
      sliceNumber: 226 },
    { slug: "desktop-sdk", name: "Desktop SDK", category: "desktop" as const, language: "typescript" as const,
      description: "Build Electron-native extensions and OS integrations.",
      features: ["Tray icon", "Native menus", "File system", "Global shortcuts"],
      sliceNumber: 227, bundleSizeKb: 41 },
    { slug: "voice-sdk", name: "Voice SDK", category: "voice" as const, language: "typescript" as const,
      description: "Real-time voice agents with STT/TTS and barge-in.",
      features: ["Streaming STT", "Neural TTS", "Barge-in", "Wake word"],
      sliceNumber: 228, bundleSizeKb: 55 },
    { slug: "api", name: "REST API", category: "api" as const, language: "curl" as const,
      description: "The full WINDELS REST API with OpenAPI spec and typed clients.",
      features: ["OpenAPI 3.1", "Rate limits", "Webhooks", "Idempotency keys"],
      sliceNumber: 229 },
  ];

  for (const s of sdks) {
    await SDKRegistryService.register({ ...s, status: (s.slug === "api" || s.slug === "agent-sdk" || s.slug === "web-sdk") ? "ga" : "beta" });
  }

  // Seed one example test run and deploy run so the dashboard is not empty
  await ToolkitService.runTests("platform-smoke", "local");
  await ToolkitService.deploy("staging", "api", "1.0.0");

  const list = await SDKRegistryService.list();
  const totalDl = await SDKRegistryService.weeklyTotal();
  const cli = await CLIService.list();
  const envs = await EnvironmentService.list();
  logger.info("developer portal bootstrapped", {
    sdks: list.length,
    ga: list.filter(s=>s.status==="ga").length,
    beta: list.filter(s=>s.status==="beta").length,
    cli: cli.length,
    envs: envs.length,
    weeklyDownloads: totalDl,
  });
}
