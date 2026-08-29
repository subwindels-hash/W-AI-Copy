import { useEffect, useState } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Shield, Users as UsersIcon, Building2, Activity, Ban, ArrowUpDown } from "lucide-react";

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  organizations: number;
  suspendedUsers: number;
}

interface UserRow {
  id: string;
  email: string;
  role: "user" | "admin" | "super_admin";
  isActive: boolean;
  isSuspended: boolean;
  profile?: { displayName?: string | null };
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<AdminStats>("/admin/stats"),
      api<{ users: UserRow[] }>("/admin/users"),
    ])
      .then(([s, u]) => {
        setStats(s);
        setUsers(u.users);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="violet" className="mb-2"><Shield className="h-3 w-3 mr-1" /> Admin Console</Badge>
        <h1 className="text-2xl font-bold text-text-bright">Organization & User Management</h1>
        <p className="text-text-muted text-sm mt-1">Manage users, roles, and organizations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={<UsersIcon className="h-5 w-5" />} label="Total users" value={stats?.totalUsers ?? "…"} tint="azure" />
        <StatCard icon={<Activity className="h-5 w-5" />} label="Active users" value={stats?.activeUsers ?? "…"} tint="emerald" />
        <StatCard icon={<Building2 className="h-5 w-5" />} label="Organizations" value={stats?.organizations ?? "…"} tint="violet" />
        <StatCard icon={<Ban className="h-5 w-5" />} label="Suspended" value={stats?.suspendedUsers ?? 0} tint="crimson" />
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>Session 1 baseline — full RBAC in Session 11.</CardDescription>
          </div>
          <Button size="sm" variant="secondary"><ArrowUpDown className="h-4 w-4" /> Sort</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-white/5">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="py-6 text-center text-text-muted">Loading…</td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 pr-4 text-text-bright">{u.profile?.displayName ?? "—"}</td>
                  <td className="py-3 pr-4 text-slate-300">{u.email}</td>
                  <td className="py-3 pr-4">
                    <Badge variant={u.role === "super_admin" ? "crimson" : u.role === "admin" ? "violet" : "default"}>{u.role}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    {u.isSuspended ? <Badge variant="crimson">Suspended</Badge> : u.isActive ? <Badge variant="emerald">Active</Badge> : <Badge>Inactive</Badge>}
                  </td>
                  <td className="py-3 text-right">
                    <Button size="sm" variant="ghost">Manage</Button>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-text-muted">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, tint }: { icon: React.ReactNode; label: string; value: React.ReactNode; tint: "azure" | "emerald" | "violet" | "crimson" }) {
  const tints: Record<string, string> = {
    azure: "text-sky bg-azure/15",
    emerald: "text-emerald bg-emerald/15",
    violet: "text-violet bg-violet/15",
    crimson: "text-crimson bg-crimson/15",
  };
  return (
    <Card>
      <div className={`h-9 w-9 rounded-lg grid place-items-center ${tints[tint]} mb-3`}>{icon}</div>
      <div className="text-2xl font-bold text-text-bright">{value}</div>
      <div className="text-xs text-text-muted mt-0.5">{label}</div>
    </Card>
  );
}
