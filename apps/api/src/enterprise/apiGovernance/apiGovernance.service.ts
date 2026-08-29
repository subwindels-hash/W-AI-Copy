/**
 * Enterprise API Governance service (Slice 165).
 *
 * Maintains an API inventory from registered Express routes, tracks versions,
 * generates a best-effort OpenAPI 3.1 spec, and exposes an endpoint for
 * spec retrieval.
 *
 * NOTE: Full schema inference (Zod → JSON Schema) and version negotiation are
 * progressive — MVP captures route metadata, HTTP method, and auth requirement.
 */
import type { Router } from "express";
import type { ApiEndpoint, ApiVersion, OpenAPISpec } from "@windels/shared/enterprise";

const endpoints = new Map<string, ApiEndpoint>(); // `${method} ${path}`
const versions = new Map<string, ApiVersion>();
let cachedSpec: OpenAPISpec | null = null;

// Bootstrap version records
versions.set("v1", { version: "v1", introducedAt: new Date().toISOString(), status: "current" });

function key(m: string, p: string) { return `${m.toUpperCase()} ${p}`; }

/**
 * Walk a router (or Express app) to discover routes recursively. Detects route
 * layers added directly and via `use()`d sub-routers.
 */
export function discoverRoutes(app: Router | any, basePath = "", serviceId = "windels-api"): ApiEndpoint[] {
  const found: ApiEndpoint[] = [];
  const stack = app?.stack ?? app?._router?.stack ?? [];
  for (const layer of stack) {
    if (!layer) continue;
    // Sub-router: recurse
    if (layer.name === "router" && layer.handle?.stack) {
      const mountPath = basePath + (layer.regexp?.source?.toString() ?? "").replace(/\\\//g, "/").replace(/\^|\\\?|\(.*\)|\$$/g, "")
        .replace(/\/\?$/, "");
      // Simpler: use layer.route.path for explicit mounts
      const mount = layer.route?.path ?? layer.path ?? mountPath;
      found.push(...discoverRoutes(layer.handle, basePath + cleanPath(mount), serviceId));
      continue;
    }
    if (layer.route) {
      const methods = Object.keys(layer.route.methods ?? {}).map((m) => m.toUpperCase()).filter((m) => m !== "_ALL");
      const path = basePath + cleanPath(layer.route.path);
      for (const method of methods) {
        const ep: ApiEndpoint = {
          method: method as ApiEndpoint["method"],
          path: normalizePath(path),
          serviceId,
          version: detectVersion(path),
          authRequired: hasAuth(layer),
          summary: undefined,
        };
        endpoints.set(key(ep.method, ep.path), ep);
        found.push(ep);
      }
    }
  }
  cachedSpec = null; // invalidate spec cache
  return found;
}

function cleanPath(p: unknown): string {
  if (!p || typeof p !== "string") return "";
  return p.toString().replace(/\/\?\(\?=\/\|\$\)\/?/g, "").replace(/\\\//g, "/").replace(/\^|\$|\?/g, "");
}
function normalizePath(p: string): string {
  if (!p.startsWith("/")) p = "/" + p;
  p = p.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  return p;
}
function detectVersion(path: string): string {
  const m = path.match(/\/v(\d+)/);
  return m ? `v${m[1]}` : "v1";
}
function hasAuth(layer: any): boolean {
  // Look for authenticate in the stack of middleware
  const stack = layer.route?.stack ?? [];
  for (const mw of stack) {
    const name = mw.handle?.name ?? "";
    if (name === "authenticate" || name === "requireAuth" || name === "authMiddleware") return true;
  }
  return false;
}

// ── Public API ───────────────────────────────────────────────────────────
export const ApiGovernanceService = {
  registerEndpoint(ep: ApiEndpoint) {
    endpoints.set(key(ep.method, ep.path), { ...ep, version: ep.version ?? detectVersion(ep.path) });
    cachedSpec = null;
  },
  listEndpoints(params: { method?: ApiEndpoint["method"]; version?: string; deprecated?: boolean; serviceId?: string } = {}): ApiEndpoint[] {
    let list = [...endpoints.values()];
    if (params.method) list = list.filter((e) => e.method === params.method);
    if (params.version) list = list.filter((e) => e.version === params.version);
    if (params.serviceId) list = list.filter((e) => e.serviceId === params.serviceId);
    if (typeof params.deprecated === "boolean") list = list.filter((e) => !!e.deprecated === params.deprecated);
    return list.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  },
  getVersions(): ApiVersion[] { return [...versions.values()]; },
  registerVersion(v: ApiVersion) { versions.set(v.version, v); cachedSpec = null; },
  deprecateEndpoint(method: string, path: string) {
    const ep = endpoints.get(key(method, path));
    if (ep) { ep.deprecated = true; cachedSpec = null; }
  },
  getOpenApi(): OpenAPISpec {
    if (cachedSpec) return cachedSpec;
    const paths: Record<string, any> = {};
    const epList = [...endpoints.values()];
    for (const ep of epList) {
      if (!paths[ep.path]) paths[ep.path] = {};
      const methodKey = ep.method.toLowerCase();
      paths[ep.path][methodKey] = {
        summary: ep.summary ?? `${ep.method} ${ep.path}`,
        deprecated: ep.deprecated === true,
        security: ep.authRequired ? [{ bearerAuth: [] }] : [],
        tags: [ep.version ?? "v1"],
        responses: {
          "200": { description: "OK" },
          "400": { description: "Bad Request" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Not Found" },
          "500": { description: "Internal Server Error" },
        },
      };
    }
    const spec: OpenAPISpec = {
      openapi: "3.1.0",
      info: {
        title: "WINDELS AI OS API",
        version: "1.0.0",
        description: "Auto-generated API spec from the Enterprise API Governance service. This is a best-effort inventory; full schema annotations will be added progressively as zod schemas are mapped to JSON Schema.",
      },
      paths,
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    };
    cachedSpec = spec;
    return spec;
  },
  /** Validate that a request/response conforms (stub for MVP — returns ok). */
  validateRequest(_method: string, _path: string, _body: unknown): { ok: true } | { ok: false; errors: string[] } {
    return { ok: true };
  },
  /** Version negotiation: resolves the requested version. */
  resolveVersion(requested?: string): string {
    if (requested && versions.has(requested)) return requested;
    const current = [...versions.values()].find((v) => v.status === "current");
    return current?.version ?? "v1";
  },
};
