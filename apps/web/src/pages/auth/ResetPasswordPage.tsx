import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { KeyRound, CheckCircle2 } from "lucide-react";

export function ResetPasswordPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const token = search.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) { setError("This reset link is invalid or missing a token."); return; }
    if (password.length < 10) { setError("Password must be at least 10 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await api("/auth/reset", { method: "POST", json: { token, password }, skipAuth: true });
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? "Unable to reset your password. The link may be invalid or expired.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-min-screen bg-bg-deep flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-azure to-violet grid place-items-center text-white font-bold text-xl">W</div>
        </div>
        {done ? (
          <Card className="p-8 text-center">
            <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-emerald/20 text-emerald grid place-items-center"><CheckCircle2 className="h-7 w-7" /></div>
            <CardTitle className="text-xl">Password updated</CardTitle>
            <p className="mt-3 text-sm text-text-muted">Your password has been reset. You can now sign in.</p>
            <Button className="mt-5 w-full" onClick={() => navigate("/auth/login")}>Sign in</Button>
          </Card>
        ) : (
          <Card className="p-8">
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-azure" /> Set a new password</CardTitle>
            <CardDescription className="mt-1">Choose a new password for your account.</CardDescription>
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="text-xs text-text-muted">New password</label>
                <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" />
              </div>
              <div>
                <label className="text-xs text-text-muted">Confirm password</label>
                <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" />
              </div>
              {error && <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-3 py-2 text-sm text-crimson">{error}</div>}
              <Button type="submit" loading={loading} className="w-full">Reset password</Button>
            </form>
            <div className="mt-4 text-center text-sm text-text-muted">
              <Link to="/auth/forgot" className="text-azure hover:underline">Request a new link</Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
