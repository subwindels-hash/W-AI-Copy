import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export function ImpersonationBanner() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  if (!user?.impersonatorId) return null;

  async function leave() {
    const res = await api<{ token: string; refreshToken: string; user: any; expiresIn?: number }>("/auth/impersonation/end", { method: "POST", json: {} });
    setAuth(res.token, res.refreshToken, res.user, res.expiresIn);
    window.location.href = "/admin";
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-400/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-100">
      <div>
        <strong>⚠️ Administrator Mode</strong>
        {" "}You are currently viewing this account as an administrator.
        {user.publicUserId ? <span className="ml-2 font-mono text-xs">User ID {user.publicUserId}</span> : null}
      </div>
      <button type="button" onClick={() => void leave()} className="rounded-md border border-amber-300/40 px-3 py-1 text-xs font-semibold hover:bg-amber-400/20">
        Return to Admin Dashboard
      </button>
    </div>
  );
}
