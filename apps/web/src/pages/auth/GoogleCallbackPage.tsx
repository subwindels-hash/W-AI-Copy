/**
 * Session 114 — Google OAuth return page.
 *
 * The API has always finished the Google flow by redirecting the browser to
 * `<web origin>/auth/callback#token=…`. That route did not exist in this app,
 * so a successful Google sign-in landed on the not-found page and the token in
 * the fragment was thrown away; only a user who happened to be sent to
 * `/auth/login` instead ever got in. This page is that missing route.
 *
 * It handles both outcomes the API can produce:
 *   - `#token=…&isNewUser=…&redirect=…` — adopt the session and continue;
 *   - `#error=policy_blocked&outcome=…&message=…` — show the organization's
 *     own reason for refusing, rather than a generic failure.
 *
 * The fragment is cleared from the address bar as soon as it is read, so the
 * token is not left in browser history.
 *
 * One honest limitation, stated here because the UI cannot fix it: the Google
 * callback issues an access token and no refresh token, so this session ends
 * when that token expires and the user signs in again.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { useAuthStore, type Role } from "@/store/auth";

type Phase = "working" | "refused" | "failed" | "idle";

export function GoogleCallbackPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [phase, setPhase] = useState<Phase>("working");
  const [message, setMessage] = useState<string>("Completing your Google sign-in…");
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    if (!raw) {
      setPhase("idle");
      setMessage("This page completes a Google sign-in. Start one from the sign-in screen.");
      return;
    }

    const params = new URLSearchParams(raw);
    // Clear the fragment immediately: it carries a bearer token.
    window.history.replaceState(null, "", window.location.pathname);

    const error = params.get("error");
    if (error) {
      setPhase("refused");
      setOutcome(params.get("outcome"));
      setMessage(params.get("message") || "Google sign-in was refused.");
      return;
    }

    const token = params.get("token");
    if (!token) {
      setPhase("failed");
      setMessage("The sign-in response carried no session token. Nothing was signed in.");
      return;
    }

    const redirectAfter = params.get("redirect") || "/app";
    void (async () => {
      try {
        const me = await api<{
          id: string; email: string; role: Role; displayName: string | null; organizationId: string | null;
        }>("/auth/me", { token });
        // The Google callback does not mint a refresh token; this session lasts
        // as long as the access token does.
        setAuth(token, "google-refresh", me);
        navigate(me.role === "super_admin" || me.role === "admin" ? "/admin" : redirectAfter, { replace: true });
      } catch {
        setPhase("failed");
        setMessage("The session token was rejected when loading your profile. Please sign in again.");
      }
    })();
  }, [navigate, setAuth]);

  return (
    <div className="grid min-h-screen place-items-center bg-bg-deep p-6">
      <Card className="w-full max-w-md p-6 text-center">
        {phase === "working" ? (
          <div className="flex flex-col items-center gap-3">
            <Spinner size={22} />
            <CardTitle>Signing you in</CardTitle>
            <CardDescription>{message}</CardDescription>
          </div>
        ) : (
          <div className="space-y-3">
            <CardTitle>
              {phase === "refused" ? "Google sign-in refused" : phase === "failed" ? "Google sign-in failed" : "Nothing to complete"}
            </CardTitle>
            <CardDescription>{message}</CardDescription>
            {outcome ? (
              <p className="text-xs text-text-muted">
                Reported by your organization's Google sign-in policy as <code>{outcome}</code>.
                An administrator can change it in Google Identity.
              </p>
            ) : null}
            <Link to="/auth/login" className="inline-block text-sm text-azure hover:underline">
              Back to sign in
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}

export default GoogleCallbackPage;
