import { useCallback, useEffect, useState } from "react";
import { adminApi, type AdmUserRow } from "@/lib/admin";
import { siteAdminApi } from "@/lib/sitePlatform";
import type { SpAnnouncement, SpSeoSettings, SpSmtpConfigPublic } from "@/lib/sitePlatform";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { useAuthStore } from "@/store/auth";

export function SiteControlPage() {
  const me = useAuthStore((s) => s.user);
  const isSa = me?.role === "super_admin";
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ann, setAnn] = useState<SpAnnouncement | null>(null);
  const [seo, setSeo] = useState<SpSeoSettings | null>(null);
  const [smtp, setSmtp] = useState<SpSmtpConfigPublic | null>(null);
  const [admins, setAdmins] = useState<AdmUserRow[]>([]);
  const [testTo, setTestTo] = useState(me?.email ?? "");
  const [newAdmin, setNewAdmin] = useState({ email: "", password: "", displayName: "" });

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 4000); };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : String(e));

  const load = useCallback(async () => {
    try {
      setAnn(await siteAdminApi.announcement());
      if (isSa) {
        setSeo(await siteAdminApi.seo());
        setSmtp(await siteAdminApi.smtp());
        const list = await adminApi.listUsers({ role: "admin", perPage: 50 });
        setAdmins(list.users);
      }
      setErr(null);
    } catch (e) { fail(e); }
  }, [isSa]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Badge variant="crimson" className="mb-2">Super Admin / Admin</Badge>
        <h1 className="text-2xl font-black text-text-bright">Site & administration</h1>
        <p className="text-sm text-text-muted">Announcement, SEO, SMTP, and administrator accounts. Authorization is enforced by the API.</p>
      </div>
      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      {ann && (
        <Card>
          <CardHeader><CardTitle>Announcement</CardTitle><CardDescription>Public ticker. Hidden automatically when disabled or outside its dates.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <label className="text-xs">Enabled
              <Select value={ann.enabled ? "yes" : "no"} onChange={(e) => setAnn({ ...ann, enabled: e.target.value === "yes" })}>
                <option value="yes">Enabled</option><option value="no">Disabled</option>
              </Select>
            </label>
            <label className="text-xs">Animation
              <Select value={ann.animationEnabled ? "yes" : "no"} onChange={(e) => setAnn({ ...ann, animationEnabled: e.target.value === "yes" })}>
                <option value="yes">On</option><option value="no">Off</option>
              </Select>
            </label>
            <label className="text-xs md:col-span-2">Message<Input value={ann.message} onChange={(e) => setAnn({ ...ann, message: e.target.value })} /></label>
            <label className="text-xs">Link<Input value={ann.link ?? ""} onChange={(e) => setAnn({ ...ann, link: e.target.value || null })} /></label>
            <label className="text-xs">Link label<Input value={ann.linkLabel ?? ""} onChange={(e) => setAnn({ ...ann, linkLabel: e.target.value || null })} /></label>
            <Button onClick={async () => { try { setAnn(await siteAdminApi.saveAnnouncement(ann)); flash("Announcement saved."); } catch (e) { fail(e); } }}>Save announcement</Button>
          </CardContent>
        </Card>
      )}

      {isSa && seo && (
        <Card>
          <CardHeader><CardTitle>SEO settings</CardTitle><CardDescription>Applied to public pages. Do not put secrets in metadata.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {(["siteTitle", "metaDescription", "keywords", "canonicalUrl", "robots", "ogTitle", "ogDescription", "ogImage", "twitterTitle", "twitterDescription", "twitterImage", "favicon", "siteLogo", "googleVerification", "bingVerification"] as const).map((k) => (
              <label key={k} className="text-xs">
                {k}
                <Input value={(seo[k] as string | null) ?? ""} onChange={(e) => setSeo({ ...seo, [k]: e.target.value || null })} />
              </label>
            ))}
            <Button onClick={async () => { try { setSeo(await siteAdminApi.saveSeo(seo)); flash("SEO saved."); } catch (e) { fail(e); } }}>Save SEO</Button>
          </CardContent>
        </Card>
      )}

      {isSa && smtp && (
        <Card>
          <CardHeader><CardTitle>Email / SMTP</CardTitle><CardDescription>Two slots. Passwords are stored encrypted and never returned.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <label className="text-xs">Active provider
              <Select value={smtp.active} onChange={(e) => setSmtp({ ...smtp, active: e.target.value as "cpanel" | "external" })}>
                <option value="cpanel">cPanel SMTP</option>
                <option value="external">External SMTP</option>
              </Select>
            </label>
            {smtp.slots.map((slot, i) => (
              <div key={slot.id} className="grid gap-2 rounded-lg border border-white/10 p-3 md:grid-cols-2">
                <div className="md:col-span-2 text-sm text-text-bright">{slot.label} {slot.passwordSet ? <Badge variant="slate">Password •••••••••</Badge> : <Badge variant="amber">No password</Badge>}</div>
                <Input placeholder="Host" value={slot.host} onChange={(e) => {
                  const slots = smtp.slots.slice(); slots[i] = { ...slot, host: e.target.value }; setSmtp({ ...smtp, slots });
                }} />
                <Input placeholder="Port" type="number" value={slot.port} onChange={(e) => {
                  const slots = smtp.slots.slice(); slots[i] = { ...slot, port: Number(e.target.value) }; setSmtp({ ...smtp, slots });
                }} />
                <Input placeholder="Username" value={slot.username} onChange={(e) => {
                  const slots = smtp.slots.slice(); slots[i] = { ...slot, username: e.target.value }; setSmtp({ ...smtp, slots });
                }} />
                <Input placeholder="New password (leave blank to keep)" type="password" onChange={(e) => {
                  const slots = smtp.slots.slice(); (slots[i] as any).password = e.target.value; setSmtp({ ...smtp, slots });
                }} />
                <Input placeholder="From email" value={slot.fromEmail} onChange={(e) => {
                  const slots = smtp.slots.slice(); slots[i] = { ...slot, fromEmail: e.target.value }; setSmtp({ ...smtp, slots });
                }} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button onClick={async () => {
                try {
                  const cpanel = smtp.slots.find((s) => s.id === "cpanel")!;
                  const external = smtp.slots.find((s) => s.id === "external")!;
                  setSmtp(await siteAdminApi.saveSmtp({
                    active: smtp.active,
                    cpanel: { host: cpanel.host, port: cpanel.port, username: cpanel.username, fromEmail: cpanel.fromEmail, password: (cpanel as any).password },
                    external: { host: external.host, port: external.port, username: external.username, fromEmail: external.fromEmail, password: (external as any).password },
                  }));
                  flash("SMTP saved.");
                } catch (e) { fail(e); }
              }}>Save configuration</Button>
              <Input className="max-w-xs" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Test recipient" />
              <Button variant="outline" onClick={async () => {
                try {
                  const r = await siteAdminApi.testSmtp(testTo);
                  flash(r.ok && r.sent ? `✓ Test email sent via ${r.provider}` : `✕ ${r.reason}${r.error ? `: ${r.error}` : ""}`);
                } catch (e) { fail(e); }
              }}>Send test email</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isSa && (
        <Card>
          <CardHeader><CardTitle>Administrators</CardTitle><CardDescription>Create, disable, or change roles. Super Admin only. Enforced on the API.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-4">
              <Input placeholder="Name" value={newAdmin.displayName} onChange={(e) => setNewAdmin({ ...newAdmin, displayName: e.target.value })} />
              <Input placeholder="Email" value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} />
              <Input placeholder="Temporary password" type="password" value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} />
              <Button onClick={async () => {
                try { await siteAdminApi.createAdmin(newAdmin); flash("Administrator created."); setNewAdmin({ email: "", password: "", displayName: "" }); await load(); }
                catch (e) { fail(e); }
              }}>Create admin</Button>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {admins.map((u) => (
                  <tr key={u.id} className="border-t border-white/5">
                    <td className="py-2">{u.profile?.displayName || u.email}<div className="text-xs text-text-muted">{u.email}</div></td>
                    <td><Badge variant={u.isSuspended ? "crimson" : "emerald"}>{u.isSuspended ? "disabled" : "active"}</Badge></td>
                    <td className="text-right">
                      <Button size="sm" variant="outline" onClick={() => void adminApi.setSuspended(u.id, !u.isSuspended).then(load)}>{u.isSuspended ? "Reactivate" : "Disable"}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
