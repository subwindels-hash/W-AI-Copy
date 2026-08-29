/**
 * Centralized API client with:
 * - Automatic JWT refresh on 401
 * - Request queuing during refresh (prevents concurrent refresh races)
 * - Token expiry pre-check (proactive refresh before expiry)
 * - Typed error handling with ApiError class
 * - Auth header injection
 *
 * Every request goes through this client. Do NOT use raw fetch() elsewhere.
 */
import { useAuthStore } from "@/store/auth";

const BASE = import.meta.env.VITE_API_URL ?? "/api/v1";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Refresh Token Infrastructure ────────────────────────────────
// Only one refresh attempt can be in-flight at a time. All other requests
// that get a 401 while a refresh is happening will wait for it to complete.
let refreshPromise: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  const { refreshToken, updateToken, clear } = useAuthStore.getState();
  if (!refreshToken) return false;

  try {
    // Call refresh WITHOUT going through the auth-injected api() to avoid loops
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      // Refresh failed — session is truly dead
      clear();
      // Redirect to login if we're in a browser context
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
        window.location.href = "/auth/login";
      }
      return false;
    }

    const body = await res.json();
    if (body?.ok && body.data?.token && body.data?.refreshToken) {
      updateToken(body.data.token, body.data.refreshToken, body.data.expiresIn ?? 900);
      return true;
    }
    clear();
    return false;
  } catch {
    clear();
    return false;
  }
}

/**
 * Attempt a token refresh. If one is already in-flight, wait for it.
 * Returns true if refresh succeeded, false if session is dead.
 */
async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = performRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

// ─── Core Request Function ──────────────────────────────────────

export async function apiRaw<T = unknown>(
  path: string,
  init: RequestInit & {
    json?: unknown;
    params?: Record<string, unknown>;
    token?: string;
    skipAuth?: boolean;
    retries?: number;
  } = {},
): Promise<{ data: T; meta?: any }> {
  const { json, headers, params, token: forcedToken, skipAuth, retries = 1, ...rest } = init;

  // Proactive refresh: if token is about to expire, refresh before sending
  if (!skipAuth && !forcedToken) {
    const { isTokenExpired, refreshToken } = useAuthStore.getState();
    if (refreshToken && isTokenExpired()) {
      await refreshAccessToken();
    }
  }

  const token = forcedToken ?? (skipAuth ? null : useAuthStore.getState().accessToken);
  let url = `${BASE}${path}`;
  if (params) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      usp.append(k, String(v));
    }
    const qs = usp.toString();
    if (qs) url += `?${qs}`;
  }

  const isFormData = typeof FormData !== "undefined" && rest.body instanceof FormData;
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  // Handle 401 — attempt refresh and retry once
  if (res.status === 401 && !skipAuth && !forcedToken && retries > 0) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // Retry the original request with the new token
      return apiRaw<T>(path, { ...init, retries: retries - 1 });
    }
    // Refresh failed — throw the original 401
  }

  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok || (body && body.ok === false)) {
    throw new ApiError(
      body?.error?.code ?? "INTERNAL_ERROR",
      body?.error?.message ?? res.statusText,
      res.status,
      body?.error?.details,
    );
  }

  return { data: body?.data as T, meta: body?.meta };
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & {
    json?: unknown;
    params?: Record<string, unknown>;
    token?: string;
    skipAuth?: boolean;
  } = {},
): Promise<T> {
  return (await apiRaw<T>(path, init)).data;
}

// ─── Convenience Methods ────────────────────────────────────────

api.get = <T = unknown>(path: string, params?: Record<string, unknown>) =>
  api<T>(path, { method: "GET", params });

api.post = <T = unknown>(path: string, json?: unknown) =>
  api<T>(path, { method: "POST", json });

api.patch = <T = unknown>(path: string, json?: unknown) =>
  api<T>(path, { method: "PATCH", json });

api.put = <T = unknown>(path: string, json?: unknown) =>
  api<T>(path, { method: "PUT", json });

api.del = <T = unknown>(path: string) =>
  api<T>(path, { method: "DELETE" });

api.delete = api.del;

// ─── Auth-Specific Methods ──────────────────────────────────────

/**
 * Login and store tokens.
 */
api.login = async (email: string, password: string) => {
  const data = await api<{
    token: string;
    refreshToken: string;
    expiresIn: number;
    user: any;
    mfa_required?: boolean;
    mfaToken?: string;
  }>("/auth/login", {
    method: "POST",
    json: { email, password },
    skipAuth: true,
  });

  if (data.mfa_required) {
    return data; // MFA flow — caller handles
  }

  useAuthStore.getState().setAuth(data.token, data.refreshToken, data.user, data.expiresIn);
  return data;
};

/**
 * Register a new account.
 */
api.register = async (input: {
  email: string;
  password: string;
  displayName: string;
  organizationName: string;
}) => {
  return api<{ userId: string; role: string }>("/auth/register", {
    method: "POST",
    json: input,
    skipAuth: true,
  });
};

/**
 * Logout and clear all tokens.
 */
api.logout = async (allSessions = false) => {
  const { refreshToken, clear } = useAuthStore.getState();
  try {
    await api("/auth/logout", {
      method: "POST",
      json: allSessions ? { allSessions: true } : { refreshToken },
    });
  } catch {
    // Ignore logout errors — clear local state regardless
  }
  clear();
};

/**
 * Complete MFA login after TOTP challenge.
 */
api.completeMfa = async (mfaToken: string, totp: string) => {
  const data = await api<{
    token: string;
    refreshToken: string;
    expiresIn: number;
    user: any;
  }>("/auth/mfa/complete", {
    method: "POST",
    json: { mfaToken, totp },
    skipAuth: true,
  });

  useAuthStore.getState().setAuth(data.token, data.refreshToken, data.user, data.expiresIn);
  return data;
};
