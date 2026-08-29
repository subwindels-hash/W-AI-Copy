/**
 * GovernancePage (legacy shell).
 *
 * The Platform-page "Governance" tab (apps/web/src/pages/admin/PlatformPage.tsx)
 * is the canonical home for engineering-governance surfaces shipped in Session
 * 23. The dedicated /admin/governance route will host compliance/audit/RBAC
 * slices in later sessions; this lightweight shell renders a pointer so the
 * route type-checks and does not 404.
 */
import { Card, CardContent } from "@/components/ui/Card";
import { Scale } from "lucide-react";

export default function GovernancePage() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text-bright flex items-center gap-2">
          <Scale className="h-6 w-6 text-violet" /> Governance
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Engineering governance (coding standards, ADRs, code reviews,
          dependencies, security posture) lives on the Platform page under the
          Governance tab. Compliance, audit logs and RBAC controls ship in
          later sessions.
        </p>
      </div>
      <Card>
        <CardContent className="py-10 text-center text-text-muted">
          Open <span className="text-text-bright font-mono">Platform → Governance</span> for
          the engineering-governance dashboard.
        </CardContent>
      </Card>
    </div>
  );
}
