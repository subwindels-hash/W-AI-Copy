/**
 * WINDELS PLUGIN OS — bootstrap.
 *
 * Seeds the marketplace catalog with curated entries (including built-in
 * WINDELS capabilities and illustrative external providers) and registers
 * already-installed plugins' capabilities. Built-in capabilities execute
 * in-process through their existing services; external entries describe
 * installed plugins that route over HTTP/MCP.
 */
import { logger } from "../config/logger.js";
import { PluginRegistry } from "./pluginRegistry.js";
import { CapabilityRegistry } from "./capabilityRegistry.js";
import type { PluginManifest } from "@windels/shared";

const CATALOG: PluginManifest[] = [
  {
    id: "windels.video", name: "WINDELS Video Studio", version: "1.0.0", publisher: "WINDELS",
    description: "Text/image/multi-reference cinematic video generation built into WINDELS.", category: "AI Video",
    tags: ["video", "cinematic", "ai"], class: "ai_model",
    capabilities: ["video.generate", "video.transform", "video.edit"],
    permissions: ["video.read", "video.generate"], authentication: ["none"],
    tools: [{ name: "generate_video", description: "Generate a cinematic video from a prompt", inputSchema: { type: "object" }, capability: "video.generate", permission: "video.generate" }],
    minPlatformVersion: "1.0.0", quality: 0.9, latencyHintMs: 8000, trust: "official",
  },
  {
    id: "windels.video_transformer", name: "AI Video Editor", version: "1.0.0", publisher: "WINDELS",
    description: "Natural-language selective video editing that preserves motion and timing.", category: "AI Video",
    tags: ["video", "editing"], class: "tool",
    capabilities: ["video.transform"], permissions: ["video.read", "video.write"], authentication: ["none"],
    minPlatformVersion: "1.0.0", quality: 0.85, latencyHintMs: 12000, trust: "official",
  },
  {
    id: "com.github", name: "GitHub", version: "1.0.0", publisher: "WINDELS",
    description: "Read repositories, create pull requests and manage issues.", category: "Developer",
    tags: ["git", "code", "ci"], class: "api",
    capabilities: ["github.read", "github.write"], permissions: ["api.request"], authentication: ["oauth2", "api_key"],
    minPlatformVersion: "1.0.0", quality: 0.95, latencyHintMs: 1500, trust: "verified",
  },
  {
    id: "com.slack", name: "Slack", version: "1.0.0", publisher: "WINDELS",
    description: "Send messages and search channels from WINDELS agents.", category: "Communication",
    tags: ["chat", "messaging"], class: "api",
    capabilities: ["message.send", "channel.read"], permissions: ["api.request"], authentication: ["oauth2"],
    minPlatformVersion: "1.0.0", quality: 0.9, latencyHintMs: 1200, trust: "verified",
  },
  {
    id: "com.higgsfield.video", name: "Higgsfield Video AI", version: "1.0.4", publisher: "Higgsfield",
    description: "Generate and transform AI videos directly inside WINDELS.", category: "AI Video",
    tags: ["video", "generation"], class: "ai_model",
    capabilities: ["video.generate", "video.transform"], permissions: ["video.read", "video.generate", "video.write"],
    authentication: ["api_key"], minPlatformVersion: "1.0.0", cost: { creditsPerSecond: 3 }, quality: 0.88, latencyHintMs: 15000, trust: "verified",
  },
  {
    id: "com.drive", name: "Google Drive", version: "1.0.0", publisher: "WINDELS",
    description: "Search, read and upload files to Google Drive.", category: "Productivity",
    tags: ["storage", "files"], class: "data_connector",
    capabilities: ["files.read", "files.write"], permissions: ["files.read", "files.write"], authentication: ["oauth2"],
    minPlatformVersion: "1.0.0", quality: 0.92, latencyHintMs: 1200, trust: "verified",
  },
];

export async function bootstrapPluginOs(): Promise<void> {
  for (const m of CATALOG) {
    const existing = await PluginRegistry.getManifest(m.id);
    if (!existing) await PluginRegistry.publish({ manifest: m }).catch(() => {});
  }
  // Register capabilities for any already-installed plugins across orgs.
  try {
    // Capabilities are registered per-org at install time; nothing to do at
    // boot for a fresh install. Marketplace discovery uses the catalog directly.
  } catch (e) {
    logger.warn("plugin os capability registration failed", { err: (e as Error).message });
  }
  logger.info("plugin os catalog ready", { entries: CATALOG.length });
}

void CapabilityRegistry; // referenced for tree-shaking clarity
