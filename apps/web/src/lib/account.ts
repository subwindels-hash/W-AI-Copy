import { api } from "./api";
import type { AccountSnapshot } from "@windels/shared/account";

export type { AccountSnapshot };

export const accountApi = {
  get: () => api<AccountSnapshot>("/account"),
  changeUsername: (username: string) => api<AccountSnapshot>("/account/username", { method: "PATCH", json: { username } }),
  changeEmail: (email: string) => api<AccountSnapshot & { verificationSent: boolean }>("/account/email", { method: "PATCH", json: { email } }),
  confirmEmail: (token: string) => api<AccountSnapshot>("/account/email/confirm", { method: "POST", json: { token } }),
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    api<{ ok: true }>("/account/password", { method: "POST", json: { currentPassword, newPassword, confirmPassword } }),
  setPin: (input: { currentPin?: string; newPin: string; confirmPin: string }) =>
    api<AccountSnapshot>("/account/pin", { method: "POST", json: input }),
  updateProfile: (patch: { displayName?: string; avatarUrl?: string | null; bio?: string }) =>
    api<AccountSnapshot>("/account/profile", { method: "PATCH", json: patch }),
  uploadAvatar: (mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif", dataBase64: string) =>
    api<AccountSnapshot>("/account/avatar", { method: "POST", json: { mime, dataBase64 } }),
};
