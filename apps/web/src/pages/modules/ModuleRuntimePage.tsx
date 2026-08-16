import { useEffect, useMemo, useState } from "react";
import { ExternalLink, PackageCheck, ShieldCheck } from "lucide-react";
import { useLocation, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { moduleRuntimeApi } from "@/lib/moduleCenter";
import type { ModuleRuntimeRegistration } from "@windels/shared/moduleCenter";

export function ModuleRuntimePage() {
  const { moduleId } = useParams();
  const location = useLocation();
  const [registration, setRegistration] = useState<ModuleRuntimeRegistration | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { moduleRuntimeApi.registrations().then((rows) => setRegistration(rows.find((row) => row.moduleId === moduleId) ?? null)).catch((err) => setError(err instanceof Error ? err.message : String(err))); }, [moduleId]);
  const pagePath = useMemo(() => {
    const prefix = `/app/modules/${moduleId}`;
    const remainder = location.pathname.slice(prefix.length);
    return remainder || "/";
  }, [location.pathname, moduleId]);
  const page = registration?.frontend.pages.find((item) => item.path === pagePath) ?? registration?.frontend.pages.find((item) => item.path === "/");
  if (error) return <div className="rounded-xl border border-crimson/30 bg-crimson/10 p-4 text-sm text-crimson">{error}</div>;
  if (!registration) return <div className="py-20 text-center text-sm text-text-muted">Module is not active, enabled, or available to your role.</div>;
  return <div className="mx-auto max-w-6xl space-y-6"><header><div className="flex flex-wrap items-center gap-2"><PackageCheck className="h-7 w-7 text-violet" /><h1 className="text-2xl font-black text-text-bright">{page?.title ?? registration.name}</h1><Badge variant="emerald">v{registration.version}</Badge><Badge variant="secondary">{registration.packageType}</Badge></div><p className="mt-1 text-sm text-text-muted">{page?.description ?? `${registration.name} is rendered through the WINDELS declarative module host.`}</p></header><div className="flex items-start gap-2 rounded-xl border border-emerald/20 bg-emerald/5 p-3 text-xs text-text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald" />This page uses the existing WINDELS layout, design system, authentication and permissions. Uploaded frontend JavaScript is not imported into the core browser process.</div><div className="grid gap-4 md:grid-cols-2">{page?.sections.map((section, index) => <Card key={`${section.title}-${index}`} className={section.type === "markdown" ? "md:col-span-2" : ""}><CardHeader><CardTitle>{section.title}</CardTitle></CardHeader><CardContent><div className="whitespace-pre-wrap text-sm leading-relaxed text-text-main">{section.body}</div>{section.links?.length ? <div className="mt-3 flex flex-wrap gap-2">{section.links.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-2 text-sm text-azure hover:bg-white/5">{link.label}<ExternalLink className="h-3 w-3" /></a>)}</div> : null}</CardContent></Card>)}{!page?.sections.length && <Card className="md:col-span-2"><CardHeader><CardTitle>Module active</CardTitle><CardDescription>No declarative content was supplied for this route.</CardDescription></CardHeader></Card>}</div></div>;
}
