/**
 * Authenticated user's support requests.
 */
import { useCallback, useEffect, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { contactApi, type ContactRequestRow } from "@/lib/contact";
import { CONTACT_CATEGORY_LABELS } from "@windels/shared/contactCenter";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { toast } from "@/lib/toast";

const statusVariant: Record<string, "azure"|"success"|"danger"|"slate"|"warning"> = {
  new: "azure", ai_handling: "azure", awaiting_human: "warning", assigned: "warning",
  in_progress: "warning", awaiting_customer: "slate", resolved: "success", closed: "slate",
};

export function MySupportPage() {
  const [requests, setRequests] = useState<ContactRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRequests(await contactApi.myRequests()); setError(null); }
    catch (e: any) { setError(e?.message ?? "Failed to load requests."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-6 w-6 text-azure" />
          <h1 className="text-2xl font-black text-text-bright">My Support Requests</h1>
        </div>
        <p className="mt-1 text-sm text-text-muted">Track your contact and support requests.</p>
      </header>

      {error ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{error}</div> : null}

      {!loading && requests.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-text-muted">No support requests yet.</CardContent></Card>
      )}

      <div className="space-y-3">
        {requests.map((r) => (
          <Card key={r.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-text-muted">{r.requestNumber}</span>
                  <Badge variant={statusVariant[r.status] ?? "slate"}>{r.status.replace(/_/g, " ")}</Badge>
                  <Badge variant="secondary">{CONTACT_CATEGORY_LABELS[r.category] ?? r.category}</Badge>
                  <Badge variant={r.priority === "urgent" ? "danger" : "secondary"}>{r.priority}</Badge>
                </div>
                <div className="mt-1 text-sm font-medium text-text-bright">{r.subject}</div>
                <div className="text-[11px] text-text-muted">{new Date(r.createdAt).toLocaleString()} · {r.department} dept</div>
                <p className="mt-1 text-sm text-text-muted line-clamp-2">{r.message}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(r.id); toast.success("Request ID copied."); }}>Copy ID</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
