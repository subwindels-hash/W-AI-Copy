import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Activity, Server, Database, Cpu, Globe } from "lucide-react";

export function SuperAdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <Badge variant="crimson" className="mb-2"><Activity className="h-3 w-3 mr-1" /> Super Admin</Badge>
        <h1 className="text-2xl font-bold text-text-bright">Platform Control Plane</h1>
        <p className="text-text-muted text-sm mt-1">Global platform health, tenants, and infrastructure.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><IconStat icon={<Server className="h-5 w-5" />} label="API" value="Online" tint="emerald" /></Card>
        <Card><IconStat icon={<Database className="h-5 w-5" />} label="Database" value="Healthy" tint="emerald" /></Card>
        <Card><IconStat icon={<Cpu className="h-5 w-5" />} label="GPU Clusters" value="Provisioned" tint="azure" /></Card>
        <Card><IconStat icon={<Globe className="h-5 w-5" />} label="Region" value="single" tint="violet" /></Card>
      </div>

      <Card>
        <CardTitle>Site control</CardTitle>
        <CardDescription>
          Manage the public announcement ticker, SEO, dual SMTP, and administrator accounts.
          Role changes are enforced on the API.
        </CardDescription>
        <a href="/platform/site" className="mt-3 inline-block text-sm text-azure">Open site administration →</a>
      </Card>
    </div>
  );
}

function IconStat({ icon, label, value, tint }: { icon: React.ReactNode; label: string; value: string; tint: "emerald" | "azure" | "violet" }) {
  const tints: Record<string, string> = {
    emerald: "text-emerald bg-emerald/15",
    azure: "text-sky bg-azure/15",
    violet: "text-violet bg-violet/15",
  };
  return (
    <div>
      <div className={`h-9 w-9 rounded-lg grid place-items-center ${tints[tint]} mb-3`}>{icon}</div>
      <div className="text-lg font-bold text-text-bright">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}
