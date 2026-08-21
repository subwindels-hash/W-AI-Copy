import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Fingerprint, Lock, Mail } from "lucide-react";
import { MButton } from "@/components/mobile/MButton";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/cn";
import { registerBiometric, verifyBiometric, isBiometricAvailable } from "@/lib/mobile/biometrics";
import { useHaptics } from "@/app/mobile/hooks/useHaptics";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function MobileAuthPage({ mode = "login" }: { mode?: "login" | "register" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const setDevice = useAuthStore((s) => s.setDevice);
  const navigate = useNavigate();
  const h = useHaptics();

  useEffect(() => { isBiometricAvailable().then(setBioAvailable); }, []);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email)) { setError("Please enter a valid email"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (mode === "register" && name.trim().length < 2) { setError("Enter your name"); return; }
    setLoading(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const res = await api.post<{ token: string; refreshToken: string; user: any }>(path, {
        email: email.trim(), password,
        ...(mode === "register" ? { name: name.trim() } : {}),
      });
      setAuth(res.token, res.refreshToken || "mobile-refresh", res.user);
      h.success();

      // Register device as PWA
      try {
        const dev = await api.post<{ id: string }>("/mobile/devices/register", {
          platform: "web-pwa",
          deviceName: navigator.platform || "Mobile",
          osVersion: navigator.userAgent.slice(0, 80),
          appVersion: "0.15.0",
        });
        setDevice(dev.id);
      } catch { /* ignore */ }

      navigate("/m", { replace: true });
    } catch (e: any) {
      h.error();
      setError(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const tryBiometric = async () => {
    try {
      await verifyBiometric();
      // After biometric verification the device is trusted; if a session exists in localStorage already,
      // we just return. Otherwise fall through to login form.
      const t = localStorage.getItem("windels:accessToken");
      if (t) { navigate("/m", { replace: true }); return; }
      setError("Please sign in once to enable biometric unlock.");
    } catch {
      setError("Biometric verification failed");
    }
  };

  return (
    <div className="app-min-screen w-full flex flex-col bg-gradient-to-b from-bg-dark via-bg-deep to-black px-6 pt-[max(48px,var(--sat))] pb-8">
      <div className="flex items-center justify-center mb-8 mt-8">
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-azure-500 to-violet-500 grid place-items-center shadow-2xl shadow-azure-500/30">
            <span className="text-white font-black text-2xl tracking-tighter">W</span>
          </div>
          <div className="absolute -inset-6 rounded-full bg-azure-500/20 blur-2xl -z-10" />
        </div>
      </div>

      <h1 className="text-[28px] font-bold text-text-bright text-center leading-tight">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="text-text-muted text-center text-sm mt-2 mb-8">
        {mode === "login" ? "Sign in to continue to WINDELS AI OS" : "Your AI workforce, in your pocket."}
      </p>

      <form onSubmit={submit} className="space-y-3">
        {mode === "register" && (
          <Field
            icon={<span className="text-text-muted"><Lock size={18} /></span>}
            placeholder="Full name"
            value={name}
            onChange={setName}
            autoComplete="name"
          />
        )}
        <Field
          icon={<Mail size={18} />}
          placeholder="Email address"
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
        />
        <Field
          icon={<Lock size={18} />}
          placeholder="Password"
          value={password}
          onChange={setPassword}
          type={showPw ? "text" : "password"}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          trailing={
            <button type="button" className="text-text-muted p-2" onClick={() => setShowPw((v) => !v)}>
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
        />
        {error && <p className="text-crimson text-sm text-center">{error}</p>}
        <MButton size="lg" fullWidth type="submit" disabled={loading}>
          {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
        </MButton>
      </form>

      {bioAvailable && (
        <button
          type="button"
          onClick={tryBiometric}
          className="mt-6 mx-auto flex flex-col items-center gap-2 text-text-muted active:text-azure-400"
        >
          <span className="h-14 w-14 rounded-full bg-white/5 border border-white/10 grid place-items-center">
            <Fingerprint size={26} />
          </span>
          <span className="text-xs">Sign in with biometrics</span>
        </button>
      )}

      <div className="mt-auto pt-8 text-center text-sm text-text-muted">
        {mode === "login" ? (
          <>
            Don't have an account?{" "}
            <Link to="/m/auth/register" className="text-azure-400 font-medium">Sign up</Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link to="/m/auth" className="text-azure-400 font-medium">Sign in</Link>
          </>
        )}
        <div className="mt-4 text-xs">
          <Link to="/auth/login" className="underline">Desktop sign in</Link>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon, placeholder, value, onChange, type = "text", trailing, autoComplete, inputMode, autoCapitalize,
}: {
  icon?: React.ReactNode; placeholder: string; value: string; onChange: (v: string) => void;
  type?: string; trailing?: React.ReactNode; autoComplete?: string; inputMode?: any; autoCapitalize?: string;
}) {
  return (
    <label className={cn(
      "flex items-center gap-3 h-14 px-4 rounded-2xl bg-white/5 border border-white/10",
      "focus-within:border-azure-400 focus-within:ring-2 focus-within:ring-azure-400/30"
    )}>
      <span className="text-text-muted flex-shrink-0">{icon}</span>
      <input
        className="flex-1 bg-transparent outline-none text-text-main text-[15px] placeholder:text-text-muted"
        placeholder={placeholder}
        value={value}
        type={type}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
      />
      {trailing}
    </label>
  );
}
