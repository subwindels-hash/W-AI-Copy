import { useEffect, useState } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Activity, Mail, MessageCircle, Globe, KeyRound, MapPin } from "lucide-react";
import { siteAdminApi, type SpControlSummary } from "@/lib/sitePlatform";
import { SiteControlPage } from "@/pages/admin/SiteControlPage";

export function SuperAdminDashboard() {
  const [sum, setSum] = useState<SpControlSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void siteAdminApi.summary().then(setSum).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="crimson" className="mb-2"><Activity className="mr-1 h-3 w-3" /> Super Admin</Badge>
        <h1 className="text-2xl font-bold text-text-bright">Platform Control Plane</h1>
        <p className="mt-1 text-sm text-text-muted">Every public-site and integration setting below is enforced on the API. Stats are live reads, not placeholders.</p>
      </div>

      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card><IconStat icon={<Globe className="h-5 w-5" />} label="Announcement" value={sum ? (sum.announcementLive ? "Live" : "Off") : "…"} tint="azure" /></Card>
        <Card><IconStat icon={<Mail className="h-5 w-5" />} label="SMTP" value={sum?.smtpConfigured ? (sum.smtpProvider ?? "set") : "Not set"} tint="emerald" /></Card>
        <Card><IconStat icon={<KeyRound className="h-5 w-5" />} label="APIs configured" value={sum ? `${sum.apisConfigured}/${sum.apisTotal}` : "…"} tint="violet" /></Card>
        <Card><IconStat icon={<MessageCircle className="h-5 w-5" />} label="Visitor chat" value={sum ? (sum.chatConfigured ? "Provider" : "Knowledge") : "…"} tint="azure" /></Card>
        <Card><IconStat icon={<MapPin className="h-5 w-5" />} label="Contact map" value={sum ? (sum.mapEnabled ? "Pinned" : "Unset") : "…"} tint="emerald" /></Card>
        <Card><IconStat icon={<Globe className="h-5 w-5" />} label="Editable pages" value={sum ? String(sum.pagesEditable) : "…"} tint="violet" /></Card>
      </div>

      <Card>
        <CardTitle>Control center</CardTitle>
        <CardDescription>
          Change logo, favicon, chat avatar, page copy, review images, the contact map, and API keys from this dashboard.
          Developer marketplace products remain at /admin/api-platform.
        </CardDescription>
      </Card>

      <SiteControlPage embedded />
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
      <div className={`mb-3 grid h-9 w-9 place-items-center rounded-lg ${tints[tint]}`}>{icon}</div>
      <div className="text-lg font-bold text-text-bright">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}
