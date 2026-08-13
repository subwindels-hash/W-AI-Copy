/**
 * WINDELS PLUGIN OS — shared contracts.
 *
 * The Plugin & Module Ecosystem sits on top of the existing Extension
 * Platform. It adds external plugins (signed manifests, capabilities,
 * permissions, connections), a universal Capability Registry for intent
 * routing, connection records (OAuth / API key / MCP), and the agent-facing
 * tool descriptor shape. Internal modules reuse the existing ExtensionRegistry.
 *
 * No parallel auth/billing/storage: credentials use the existing encryption,
 * usage flows through existing billing, execution through existing agents.
 */

// ── Plugin manifest (§15) ─────────────────────────────────────────
export type PluginAuthType = "none" | "oauth2" | "api_key" | "mcp" | "webhook";
export type PluginClass =
  | "api" | "tool" | "ai_model" | "ui" | "workflow" | "agent" | "data_connector" | "full_module";
export type PluginTrust = "official" | "verified" | "community" | "unverified" | "blocked";
export type PluginStatus =
  | "draft" | "published" | "installed" | "enabled" | "disabled"
  | "auth_required" | "degraded" | "failed" | "uninstalled" | "blocked";

export interface PluginManifest {
  id: string;                    // reverse-DNS, e.g. com.higgsfield.video
  name: string;
  version: string;
  publisher: string;
  publisherId?: string;
  description: string;
  category: string;
  tags: string[];
  icon?: string;
  homepageUrl?: string;
  docsUrl?: string;
  class: PluginClass;
  /** Capabilities this plugin provides (e.g. video.generate). */
  capabilities: string[];
  /** Granular permissions requested (§10). */
  permissions: string[];
  authentication: PluginAuthType[];
  /** Declared tools for agent use (§13/§25). */
  tools?: PluginToolDescriptor[];
  /** Declared MCP resources/prompts. */
  mcp?: { tools?: string[]; resources?: string[]; prompts?: string[] };
  /** Declared UI surface route (for UI plugins). */
  uiRoute?: string;
  /** Declared workflow node types. */
  workflowNodes?: string[];
  minPlatformVersion: string;
  /** Remote base URL / MCP endpoint for external plugins. */
  endpoint?: string;
  /** Cost hints used by the router. */
  cost?: { creditsPerRequest?: number; creditsPerSecond?: number; unit?: string };
  /** Quality hints 0..1. */
  quality?: number;
  latencyHintMs?: number;
  /** Publisher signature over the canonical manifest (§16). */
  signature?: { kid: string; alg: string; sig: string };
  trust: PluginTrust;
}

export interface PluginToolDescriptor {
  name: string;
  description: string;
  /** JSON-schema-ish input shape. */
  inputSchema: Record<string, unknown>;
  capability: string;
  /** Permission required to invoke this tool. */
  permission: string;
  /** Whether this tool can produce side effects. */
  sideEffects?: boolean;
}

// ── Installed plugin instance ─────────────────────────────────────
export interface InstalledPlugin {
  id: string;
  manifestId: string;
  organizationId: string;
  installedBy: string;
  version: string;
  status: PluginStatus;
  config: Record<string, unknown>;
  /** Granted permissions (subset of manifest.permissions). */
  grantedPermissions: string[];
  connectionIds: string[];
  installedAt: string;
  updatedAt: string;
  lastError?: string;
  health: PluginHealth;
}

export type PluginHealth =
  | "healthy" | "degraded" | "auth_required" | "rate_limited" | "unavailable" | "failed" | "disabled" | "security_blocked";

// ── Connections (OAuth / API key / MCP) (§11–13) ─────────────────
export type ConnectionType = "oauth2" | "api_key" | "mcp" | "webhook";
export type ConnectionStatus = "connected" | "disconnected" | "expired" | "error" | "pending";

export interface PluginConnection {
  id: string;
  organizationId: string;
  pluginId: string;
  type: ConnectionType;
  status: ConnectionStatus;
  displayName: string;
  /** Encrypted credential reference (never the raw secret). */
  credentialRef?: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Capability Registry (§58) ─────────────────────────────────────
export interface CapabilityProvider {
  pluginId: string;
  manifestId: string;
  capability: string;
  /** Quality 0..1 and cost hints for the router. */
  quality: number;
  cost: number;
  latencyMs: number;
  installed: boolean;
  enabled: boolean;
  authenticated: boolean;
  permissions: string[];
  toolName?: string;
}

export interface CapabilityRoute {
  capability: string;
  pluginId: string;
  manifestId: string;
  toolName?: string;
  reason: string;
  estimatedCost: number;
  estimatedLatencyMs: number;
  installed: boolean;
  authenticated: boolean;
  /** If no installed plugin can serve the capability, candidates to install. */
  installCandidates?: string[];
}

// ── Execution / audit ─────────────────────────────────────────────
export interface PluginInvocationResult {
  ok: boolean;
  pluginId: string;
  capability: string;
  toolName?: string;
  result?: unknown;
  error?: { code: string; message: string; retryable?: boolean };
  creditsUsed: number;
  durationMs: number;
  createdAt: string;
}

export interface PluginAuditEvent {
  id: string;
  organizationId: string;
  pluginId: string;
  event:
    | "installed" | "enabled" | "disabled" | "uninstalled" | "permission_granted"
    | "permission_revoked" | "connected" | "disconnected" | "tool_executed"
    | "data_accessed" | "updated" | "blocked" | "fallback";
  message: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  createdAt: string;
}

// ── Marketplace catalog entry (lighter than full manifest) ────────
export interface MarketplaceEntry {
  manifest: PluginManifest;
  installs: number;
  ratingAvg: number;
  reviewCount: number;
  installed?: boolean;
}

export interface IntentResolution {
  capability: string;
  confidence: number;
  route: CapabilityRoute;
  recommendations?: Array<{ id: string; name: string; reason: string }>;
}
