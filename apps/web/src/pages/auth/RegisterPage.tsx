import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { api, ApiError } from "@/lib/api";

export function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    displayName: "",
    organizationName: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/auth/register", { method: "POST", json: form });
      navigate("/auth/login", { state: { registered: true } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="ambient-orb absolute -top-40 -left-20 h-[500px] w-[500px] rounded-full bg-azure/20 blur-3xl" />
        <div className="ambient-orb absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-violet/20 blur-3xl" />
      </div>
      <Card className="w-full max-w-md relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-azure to-violet grid place-items-center text-white font-bold">W</div>
          <div>
            <div className="font-semibold text-text-bright tracking-tight">WINDELS AI OS</div>
            <div className="text-xs text-text-muted">Create your workspace</div>
          </div>
        </div>
        <CardTitle className="text-xl">Get started</CardTitle>
        <CardDescription>Set up your organization in under a minute</CardDescription>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs text-text-muted mb-1.5 block">Your name</label>
            <Input value={form.displayName} onChange={(e) => update("displayName", e.target.value)} required />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1.5 block">Work email</label>
            <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1.5 block">Organization</label>
            <Input value={form.organizationName} onChange={(e) => update("organizationName", e.target.value)} required placeholder="Acme Inc." />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1.5 block">Password</label>
            <Input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required minLength={8} />
          </div>

          {error && (
            <div className="rounded-lg bg-crimson/10 border border-crimson/30 text-crimson text-sm px-3 py-2">{error}</div>
          )}

          <Button type="submit" loading={loading} className="w-full">Create account</Button>
        </form>

        <div className="mt-6 text-center text-sm text-text-muted">
          Already have an account? <Link to="/auth/login" className="text-azure hover:underline">Sign in</Link>
        </div>
      </Card>
    </div>
  );
}
