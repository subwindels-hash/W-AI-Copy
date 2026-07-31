import { create } from "zustand";

export type Role = "user" | "admin" | "super_admin";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  displayName?: string | null;
  organizationId?: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  deviceId: string | null;
  expiresAt: number | null; // Unix timestamp in ms when access token expires
  setAuth: (token: string, refreshToken: string, user: AuthUser, expiresIn?: number) => void;
  setDevice: (deviceId: string) => void;
  updateToken: (token: string, refreshToken: string, expiresIn?: number) => void;
  clear: () => void;
  isTokenExpired: () => boolean;
}

const TOKEN_KEY = "windels:accessToken";
const REFRESH_KEY = "windels:refreshToken";
const USER_KEY = "windels:user";
const DEVICE_KEY = "windels:deviceId";
const EXPIRES_KEY = "windels:expiresAt";

const savedToken = localStorage.getItem(TOKEN_KEY);
const savedRefresh = localStorage.getItem(REFRESH_KEY);
const savedUser = localStorage.getItem(USER_KEY);
const savedDevice = localStorage.getItem(DEVICE_KEY);
const savedExpires = localStorage.getItem(EXPIRES_KEY);

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: savedToken,
  refreshToken: savedRefresh,
  user: savedUser ? (JSON.parse(savedUser) as AuthUser) : null,
  deviceId: savedDevice,
  expiresAt: savedExpires ? parseInt(savedExpires, 10) : null,
  setAuth: (accessToken, refreshToken, user, expiresIn = 900) => {
    const expiresAt = Date.now() + expiresIn * 1000;
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(EXPIRES_KEY, String(expiresAt));
    set({ accessToken, refreshToken, user, expiresAt });
  },
  setDevice: (deviceId) => {
    localStorage.setItem(DEVICE_KEY, deviceId);
    set({ deviceId });
  },
  updateToken: (accessToken, refreshToken, expiresIn = 900) => {
    const expiresAt = Date.now() + expiresIn * 1000;
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(EXPIRES_KEY, String(expiresAt));
    set({ accessToken, refreshToken, expiresAt });
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EXPIRES_KEY);
    set({ accessToken: null, refreshToken: null, user: null, expiresAt: null });
  },
  isTokenExpired: () => {
    const { expiresAt } = get();
    if (!expiresAt) return true;
    // Consider expired 30 seconds before actual expiry (buffer for clock skew)
    return Date.now() >= expiresAt - 30_000;
  },
}));
