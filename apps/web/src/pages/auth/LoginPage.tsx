import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { api, ApiError } from "@/lib/api";
import { useAuthStore, type Role } from "@/store/auth";

type MfaChallenge = { mfaToken: string; challengeId: string } | null;

export function LoginPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);

  // Handle ?token=... from Google OAuth callback fragment
  useEffect(() => {
    if (window.location.hash) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const tok = params.get("token");
      const isNew = params.get("isNewUser");
      const redirect = params.get("redirect") || "/app";
      if (tok) {
        // Fetch user info with the token
        (async () => {
          try {
            const me = await api<{ id: string; email: string; role: Role; displayName: string | null; organizationId: string | null }>("/auth/me", { token: tok });
            setAuth(tok, "google-refresh", me);
            navigate(me.role === "super_admin" || me.role === "admin" ? "/admin" : redirect);
          } catch {
            setError("Google sign-in failed. Please try again.");
          }
        })();
      }
      void isNew;
    }
  }, [navigate, setAuth]);

  useEffect(() => {
    api<{ enabled: boolean }>("/auth/google/status")
      .then((r) => setGoogleEnabled(r.enabled))
      .catch(() => setGoogleEnabled(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mfaChallenge) {
        const res = await api<{ token: string; refreshToken: string; user: any }>("/auth/mfa/complete", {
          method: "POST",
          json: { mfaToken: mfaChallenge.mfaToken, totp: mfaCode },
        });
        setAuth(res.token, res.refreshToken, res.user);
        navigate(res.user.role === "super_admin" ? "/admin" : res.user.role === "admin" ? "/admin" : "/app");
        return;
      }
      const res = await api<any>("/auth/login", {
        method: "POST",
        json: { email, password },
      });
      if (res.mfa_required) {
        setMfaChallenge({ mfaToken: res.mfaToken, challengeId: res.challengeId });
        return;
      }
      setAuth(res.token, res.refreshToken, res.user);
      navigate(res.user.role === "super_admin" ? "/admin" : res.user.role === "admin" ? "/admin" : "/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-min-screen grid place-items-center p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="ambient-orb absolute -top-40 -left-20 h-[500px] w-[500px] rounded-full bg-azure/20 blur-3xl" />
        <div className="ambient-orb absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-violet/20 blur-3xl" />
      </div>

      <Card className="w-full max-w-md relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-azure to-violet grid place-items-center text-white font-bold">W</div>
          <div>
            <div className="font-semibold text-text-bright tracking-tight">WINDELS AI OS</div>
            <div className="text-xs text-text-muted">
              {mfaChallenge ? "Two-factor authentication" : "Sign in to continue"}
            </div>
          </div>
        </div>

        <CardTitle className="text-xl">{mfaChallenge ? "Enter 6-digit code" : "Welcome back"}</CardTitle>
        <CardDescription>
          {mfaChallenge ? "Open your authenticator app and enter the code." : "Sign in to your workspace"}
        </CardDescription>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {!mfaChallenge ? (
            <>
              <div>
                <label className="text-xs text-text-muted mb-1.5 block">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@company.com" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-text-muted">Password</label>
                  <Link to="/auth/forgot" className="text-xs text-azure hover:underline">Forgot?</Link>
                </div>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs text-text-muted mb-1.5 block">Authenticator code</label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                autoFocus
                placeholder="123456"
                className="tracking-[0.5em] text-center text-lg"
              />
              <button type="button" onClick={() => { setMfaChallenge(null); setMfaCode(""); }} className="mt-2 text-xs text-azure hover:underline">Use a different account</button>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-crimson/10 border border-crimson/30 text-crimson text-sm px-3 py-2">{error}</div>
          )}

          <Button type="submit" loading={loading} className="w-full">
            {mfaChallenge ? "Verify" : "Sign in"}
          </Button>
        </form>

        {!mfaChallenge && googleEnabled && (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className="h-px bg-white/10 flex-1" />
              <span className="text-xs text-text-muted">OR</span>
              <div className="h-px bg-white/10 flex-1" />
            </div>
            <a
              href="/api/v1/auth/google"
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium hover:bg-white/5 transition"
            >
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.8 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.7 2.9l5.7-5.7C33.8 6.1 29.1 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10 0 18.7-7.3 19.8-17 .2-1.2.2-2.3.2-3.5 0-.9 0-1.5-.4-3z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.7 2.9l5.7-5.7C33.8 6.1 29.1 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5 0 9.5-1.9 12.9-5.1l-6-5c-1.9 1.4-4.3 2.2-6.9 2.2-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6 5c-.4.4 6.7-4.9 6.7-14.7 0-1-.1-2-.2-3.5z"/></svg>
              Sign in with Google
            </a>
          </>
        )}
        {!mfaChallenge && googleEnabled === false && (
          <div className="mt-5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs px-3 py-2">
            Google sign-in is not configured on this instance.
          </div>
        )}

        <div className="mt-6 text-center text-sm text-text-muted">
          Don't have an account?{" "}
          <Link to="/auth/register" className="text-azure hover:underline">Create one</Link>
        </div>
      </Card>
    </div>
  );
}
