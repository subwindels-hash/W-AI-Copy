/**
 * Advanced Lead Discovery — dedicated console for the multi-mode discovery
 * surface (Apollo / Business / Person).
 *
 * Session 85 shipped the classic search at `/app/leads`, which embeds the
 * `AdvancedLeadDiscoveryPanel`. This page surfaces the same advanced surface
 * as its own routed, sidebar-linked console so the module has a dedicated,
 * bookmarked destination. Everything here is user-initiated: nothing contacts
 * a lead, infers missing contact data, or sends outreach automatically. The
 * panel renders the compliance notes (privacy, quality, verification) verbatim
 * from the shared contract.
 */
import { AdvancedLeadDiscoveryPanel } from "../leads/AdvancedLeadDiscoveryPanel";
import { Badge } from "@/components/ui/Badge";
import {
  LEAD_PRIVACY_NOTE,
} from "@/lib/advancedLeadDiscovery";
import { Sparkles } from "lucide-react";

export function AdvancedLeadDiscoveryPage() {
  return (
    <div className="space-y-5 p-1">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-text-bright">
          <Sparkles className="h-6 w-6 text-azure" />
          Advanced Lead Discovery
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Multi-mode Apollo, Business, and Person discovery with source
          traceability, quality scoring, verification status, tags, lead lists,
          and explicit-only outreach handoff. Discovery never sends messages
          automatically.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline">Apollo Mode</Badge>
          <Badge variant="outline">Business Mode</Badge>
          <Badge variant="outline">Person Mode</Badge>
        </div>
      </div>

      <AdvancedLeadDiscoveryPanel onRecordsChanged={async () => undefined} />

      <div className="rounded-lg border border-amber/15 bg-amber/5 p-3 text-[11px] leading-relaxed text-text-muted">
        <strong className="text-text-bright">Privacy &amp; lawful use:</strong>{" "}
        {LEAD_PRIVACY_NOTE}
      </div>
    </div>
  );
}
