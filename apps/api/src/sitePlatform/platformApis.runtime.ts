/**
 * In-memory overlay for Super Admin dashboard API credentials.
 * Dashboard values take precedence over environment variables when enabled.
 * Secrets never leave this module except via resolvePlatformApi() for server use.
 */

export interface PlatformApiOverlay {
  enabled: boolean;
  apiKey: string | null;
  baseUrl: string | null;
  extra: Record<string, string>;
}

const overlay = new Map<string, PlatformApiOverlay>();

export function setPlatformApiOverlay(id: string, entry: PlatformApiOverlay | null): void {
  if (!entry) overlay.delete(id);
  else overlay.set(id, entry);
}

export function replacePlatformApiOverlay(entries: Array<{ id: string } & PlatformApiOverlay>): void {
  overlay.clear();
  for (const e of entries) overlay.set(e.id, e);
}

export function listPlatformApiOverlayIds(): string[] {
  return [...overlay.keys()];
}

export function resolvePlatformApi(
  slot: string,
  envKey?: string,
  envBase?: string | null,
): {
  configured: boolean;
  apiKey: string | null;
  baseUrl: string | null;
  source: "dashboard" | "env" | "none";
  extra: Record<string, string>;
} {
  const o = overlay.get(slot);
  if (o?.enabled && (o.apiKey || o.baseUrl)) {
    return {
      configured: true,
      apiKey: o.apiKey,
      baseUrl: o.baseUrl ?? envBase ?? null,
      source: "dashboard",
      extra: o.extra,
    };
  }
  const envVal = envKey ? process.env[envKey] : undefined;
  if (envVal) {
    return {
      configured: true,
      apiKey: envVal,
      baseUrl: envBase ?? null,
      source: "env",
      extra: {},
    };
  }
  if (envBase && !envKey) {
    return { configured: true, apiKey: null, baseUrl: envBase, source: "env", extra: {} };
  }
  return { configured: false, apiKey: null, baseUrl: envBase ?? null, source: "none", extra: {} };
}
