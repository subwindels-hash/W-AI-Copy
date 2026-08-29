import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { Mail, CheckCircle2 } from "lucide-react";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/auth/forgot", { method: "POST", json: { email }, skipAuth: true });
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Please try again.");
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
        {sent ? (
          <Card className="p-8 text-center">
            <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-emerald/20 text-emerald grid place-items-center"><CheckCircle2 className="h-7 w-7" /></div>
            <CardTitle className="text-xl">Check your email</CardTitle>
            <p className="mt-3 text-sm text-text-muted">
              If an account exists for <span className="text-text-bright">{email}</span>, we've sent a password reset link.
              It expires in 60 minutes.
            </p>
            <Link to="/auth/login" className="mt-5 inline-block text-sm text-azure hover:underline">Back to sign in</Link>
          </Card>
        ) : (
          <Card className="p-8">
            <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-azure" /> Reset your password</CardTitle>
            <CardDescription className="mt-1">Enter your account email and we'll send you a reset link.</CardDescription>
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="text-xs text-text-muted">Email</label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              {error && <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-3 py-2 text-sm text-crimson">{error}</div>}
              <Button type="submit" loading={loading} className="w-full">Send reset link</Button>
            </form>
            <div className="mt-4 text-center text-sm text-text-muted">
              Remembered it? <Link to="/auth/login" className="text-azure hover:underline">Sign in</Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
