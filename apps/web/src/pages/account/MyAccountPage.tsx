import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { accountApi, type AccountSnapshot } from "@/lib/account";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export function MyAccountPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.accessToken);
  const refresh = useAuthStore((s) => s.refreshToken);
  const sessionUser = useAuthStore((s) => s.user);
  const [search] = useSearchParams();
  const [acct, setAcct] = useState<AccountSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pin, setPin] = useState({ current: "", next: "", confirm: "" });

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 4500); };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : String(e));

  const syncSession = useCallback((next: AccountSnapshot) => {
    setAcct(next);
    setUsername(next.username);
    setEmail(next.email);
    setDisplayName(next.displayName ?? "");
    if (sessionUser && token && refresh) {
      setAuth(token, refresh, {
        ...sessionUser,
        email: next.email,
        displayName: next.displayName,
        publicUserId: next.publicUserId,
        username: next.username,
        pinExpired: next.pinExpired,
        pinExpiresAt: next.pinExpiresAt,
      });
    }
  }, [refresh, sessionUser, setAuth, token]);

  const load = useCallback(async () => {
    try {
      const data = await accountApi.get();
      syncSession(data);
      setErr(null);
    } catch (e) { fail(e); }
  }, [syncSession]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const tokenParam = search.get("verifyEmail");
    if (!tokenParam) return;
    void accountApi.confirmEmail(tokenParam).then((data) => {
      syncSession(data);
      flash("Email confirmed.");
    }).catch(fail);
  }, [search, syncSession]);

  async function onAvatar(file: File) {
    const mime = file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime)) {
      setErr("Use PNG, JPEG, WebP, or GIF.");
      return;
    }
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ""));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    try { syncSession(await accountApi.uploadAvatar(mime, dataBase64)); flash("Profile image saved."); }
    catch (e) { fail(e); }
  }

  if (!acct) {
    return <div className="text-sm text-text-muted">{err ?? "Loading account…"}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-text-bright">My Account</h1>
        <p className="text-sm text-text-muted">Profile, security, and account information. Your six-digit User ID never changes.</p>
      </div>
      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}
      {acct.pinExpired ? (
        <div className="rounded-lg border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber-200">
          Your security PIN has expired. Please create a new 4-digit PIN.
        </div>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Account information</CardTitle><CardDescription>Identifiers used to sign in. The User ID is assigned by the server.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div><div className="text-xs text-text-muted">User ID</div><div className="font-mono text-lg text-text-bright">User ID: {acct.publicUserId}</div></div>
          <div><div className="text-xs text-text-muted">Username</div><div className="text-text-bright">{acct.username}</div></div>
          <div><div className="text-xs text-text-muted">Email</div><div className="text-text-bright">{acct.email}</div></div>
          <div>
            <div className="text-xs text-text-muted">Status</div>
            {acct.isSuspended ? <Badge variant="crimson">Suspended</Badge> : acct.isActive ? <Badge variant="emerald">Active</Badge> : <Badge variant="slate">Inactive</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            {acct.avatarUrl ? <img src={acct.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" /> : <div className="grid h-16 w-16 place-items-center rounded-full bg-white/10 text-lg">{(acct.displayName || acct.username || "?").slice(0, 1).toUpperCase()}</div>}
            <label className="cursor-pointer text-sm text-azure">
              Change image
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onAvatar(f); }} />
            </label>
          </div>
          <label className="block text-xs">Display name<Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
          <Button onClick={async () => { try { syncSession(await accountApi.updateProfile({ displayName })); flash("Profile saved."); } catch (e) { fail(e); } }}>Save profile</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Username</CardTitle><CardDescription>Used to sign in. Your six-digit User ID stays the same.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input className="max-w-xs" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Button onClick={async () => { try { syncSession(await accountApi.changeUsername(username)); flash("Username saved."); } catch (e) { fail(e); } }}>Save username</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Email</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input className="max-w-md" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {acct.emailPending ? <p className="text-xs text-amber-200">Pending confirmation: {acct.emailPending}</p> : null}
          <Button onClick={async () => {
            try {
              const r = await accountApi.changeEmail(email);
              syncSession(r);
              flash(r.verificationSent ? "Confirmation sent to the new address." : "Email saved.");
            } catch (e) { fail(e); }
          }}>Save email</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
        <CardContent className="grid max-w-md gap-2">
          <label className="text-xs">Current password<Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
          <label className="text-xs">New password<Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
          <label className="text-xs">Confirm new password<Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label>
          <Button onClick={async () => {
            try {
              await accountApi.changePassword(pw.current, pw.next, pw.confirm);
              setPw({ current: "", next: "", confirm: "" });
              flash("Password changed.");
            } catch (e) { fail(e); }
          }}>Change password</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4-digit security PIN</CardTitle>
          <CardDescription>Separate from your User ID. Expires 24 hours after it is set. The current PIN is never shown.</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-md gap-2">
          <div className="text-xs text-text-muted">
            {acct.pinSet ? (acct.pinExpired ? "PIN expired." : `Expires ${acct.pinExpiresAt ? new Date(acct.pinExpiresAt).toLocaleString() : "soon"}.`) : "No PIN set."}
          </div>
          {acct.pinSet && !acct.pinExpired ? (
            <label className="text-xs">Current PIN<Input inputMode="numeric" maxLength={4} value={pin.current} onChange={(e) => setPin({ ...pin, current: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></label>
          ) : null}
          <label className="text-xs">New PIN<Input inputMode="numeric" maxLength={4} value={pin.next} onChange={(e) => setPin({ ...pin, next: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></label>
          <label className="text-xs">Confirm new PIN<Input inputMode="numeric" maxLength={4} value={pin.confirm} onChange={(e) => setPin({ ...pin, confirm: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></label>
          <Button onClick={async () => {
            try {
              syncSession(await accountApi.setPin({ currentPin: pin.current || undefined, newPin: pin.next, confirmPin: pin.confirm }));
              setPin({ current: "", next: "", confirm: "" });
              flash("PIN saved. It will expire in 24 hours.");
            } catch (e) { fail(e); }
          }}>{acct.pinSet && !acct.pinExpired ? "Change PIN" : "Create PIN"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default MyAccountPage;
