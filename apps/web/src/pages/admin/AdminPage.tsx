/**
 * Session 101 — Admin Console.
 *
 * Real organization-scoped admin data and actions. The API remains the
 * authority for RBAC; the UI only disables obviously unsafe self-actions and
 * still handles server-side authorization failures honestly.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Ban, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, Search, Shield, ShieldCheck, UserCog, Users, Building2 } from "lucide-react";
import { adminApi, type AdmRole, type AdmStats, type AdmUserList, type AdmUserRow, type AdmUserStatus } from "@/lib/admin";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const ROLES: AdmRole[] = ["user", "admin", "super_admin"];
const STATUSES: AdmUserStatus[] = ["all", "active", "suspended", "inactive"];

function roleVariant(role: AdmRole): "slate" | "violet" | "crimson" {
  return role === "super_admin" ? "crimson" : role === "admin" ? "violet" : "slate";
}

function Stat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number | string; tone: "azure" | "emerald" | "violet" | "crimson" }) {
  const tones = {
    azure: "bg-azure/10 text-azure border-azure/20",
    emerald: "bg-emerald/10 text-emerald border-emerald/20",
    violet: "bg-violet/10 text-violet border-violet/20",
    crimson: "bg-crimson/10 text-crimson border-crimson/20",
  };
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className={`rounded-lg border p-2 ${tones[tone]}`}>{icon}</div><div><div className="text-2xl font-black text-text-bright">{value}</div><div className="text-xs text-text-muted">{label}</div></div></CardContent></Card>;
}

export function AdminPage() {
  const currentUser = useAuthStore((state) => state.user);
  const canChangeRole = currentUser?.role === "super_admin";
  const [stats, setStats] = useState<AdmStats | null>(null);
  const [list, setList] = useState<AdmUserList | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<AdmRole | "">("");
  const [status, setStatus] = useState<AdmUserStatus>("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextStats, nextUsers] = await Promise.all([
        adminApi.stats(),
        adminApi.listUsers({ q: query || undefined, role: role || undefined, status, page, perPage: 25 }),
      ]);
      setStats(nextStats); setList(nextUsers); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [page, query, role, status]);

  useEffect(() => { void load(); }, [load]);

  function flash(message: string) { setNotice(message); window.setTimeout(() => setNotice(null), 3500); }

  async function suspend(user: AdmUserRow) {
    const next = !user.isSuspended;
    setBusy(user.id);
    try {
      await adminApi.setSuspended(user.id, next);
      flash(next ? "User suspended." : "User reactivated.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  async function changeRole(user: AdmUserRow, nextRole: AdmRole) {
    if (!canChangeRole || nextRole === user.role) return;
    setBusy(user.id);
    try {
      await adminApi.setRole(user.id, nextRole);
      flash(`Role updated to ${nextRole}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  const pagination = list?.pagination;
  const users = list?.users ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><UserCog className="h-6 w-6 text-azure" /><h1 className="text-2xl font-black text-text-bright">Admin Console</h1><Badge variant="violet">RBAC protected</Badge></div>
          <p className="mt-1 text-sm text-text-muted">Manage users within your organization. Super admins can manage roles across the platform; organization admins remain organization-scoped.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
      </div>

      {error ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{error}<button className="float-right" onClick={() => setError(null)}>✕</button></div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Users className="h-5 w-5" />} label="Users in scope" value={stats?.totalUsers ?? "—"} tone="azure" />
        <Stat icon={<CheckCircle2 className="h-5 w-5" />} label="Active users" value={stats?.activeUsers ?? "—"} tone="emerald" />
        <Stat icon={<Building2 className="h-5 w-5" />} label="Organizations in scope" value={stats?.organizations ?? "—"} tone="violet" />
        <Stat icon={<Ban className="h-5 w-5" />} label="Suspended users" value={stats?.suspendedUsers ?? "—"} tone="crimson" />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-azure" />User directory</CardTitle><CardDescription>Search and filter real user records. Actions are audited by the API.</CardDescription></CardHeader>
        <CardContent>
          <form className="mb-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(searchInput.trim()); }}>
            <div className="relative min-w-60 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><Input className="pl-9" placeholder="Search email or display name" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></div>
            <Select className="w-40" value={role} onChange={(event) => { setPage(1); setRole(event.target.value as AdmRole | ""); }}><option value="">All roles</option>{ROLES.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
            <Select className="w-36" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value as AdmUserStatus); }}>{STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
            <Button type="submit" variant="secondary"><Search className="h-4 w-4" />Search</Button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-text-muted"><th className="px-3 py-3">User</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Joined</th><th className="px-3 py-3 text-right">Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={5} className="px-3 py-10 text-center text-text-muted">Loading user records…</td></tr> : null}
                {!loading && users.map((user) => <tr key={user.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-3 py-3"><div className="font-medium text-text-bright">{user.profile?.displayName || "Unnamed user"}</div><div className="text-xs text-text-muted">{user.email}</div></td>
                  <td className="px-3 py-3">{canChangeRole && user.id !== currentUser?.id ? <Select className="w-36" value={user.role} disabled={busy === user.id} onChange={(event) => void changeRole(user, event.target.value as AdmRole)}>{ROLES.map((item) => <option key={item} value={item}>{item}</option>)}</Select> : <Badge variant={roleVariant(user.role)}>{user.role}</Badge>}</td>
                  <td className="px-3 py-3">{user.isSuspended ? <Badge variant="crimson">Suspended</Badge> : user.isActive ? <Badge variant="emerald">Active</Badge> : <Badge variant="slate">Inactive</Badge>}</td>
                  <td className="px-3 py-3 text-xs text-text-muted">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-3 text-right"><Button size="sm" variant={user.isSuspended ? "success" : "outline"} disabled={busy === user.id || user.id === currentUser?.id || user.role === "super_admin"} onClick={() => void suspend(user)}>{busy === user.id ? "Saving…" : user.isSuspended ? "Reactivate" : "Suspend"}</Button></td>
                </tr>)}
                {!loading && users.length === 0 ? <tr><td colSpan={5} className="px-3 py-10 text-center text-text-muted">No users match the current filters.</td></tr> : null}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-xs text-text-muted"><span>{pagination ? `${pagination.total} users · page ${pagination.page} of ${Math.max(1, pagination.totalPages)}` : ""}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!pagination || page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" />Previous</Button><Button size="sm" variant="outline" disabled={!pagination || page >= pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight className="h-4 w-4" /></Button></div></div>
        </CardContent>
      </Card>

      <Card><CardContent className="flex items-start gap-3 p-4 text-xs text-text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald" /><span>Admin actions are enforced server-side and recorded in the audit log. You cannot suspend or change your own role, and super admin accounts cannot be suspended.</span></CardContent></Card>
    </div>
  );
}
