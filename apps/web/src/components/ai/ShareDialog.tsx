import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { shareApi, type ConversationShare } from "@/lib/shares";
import { toast } from "@/lib/toast";
import { Copy, Lock, Share2, Trash2 } from "lucide-react";

const ACCESS_LABELS: Record<string, string> = {
  anyone_with_link: "Anyone with the link",
  organization: "Organization members",
  restricted: "Restricted (org + named)",
  specific: "Specific people",
};

interface Props {
  open: boolean;
  conversationId: string;
  conversationTitle: string;
  onClose: () => void;
}

/**
 * Share-link management for a conversation. Creates a controlled share with an
 * access tier (anyone_with_link / organization / restricted / specific),
 * optional password and expiry, then lets the owner copy, disable/enable and
 * revoke links, and inspect access history.
 */
export function ShareDialog({ open, conversationId, conversationTitle, onClose }: Props) {
  const [shares, setShares] = useState<ConversationShare[]>([]);
  const [access, setAccess] = useState("anyone_with_link");
  const [permissions, setPermissions] = useState("view");
  const [allowed, setAllowed] = useState("");
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!open || !conversationId) return;
    try {
      setShares(await shareApi.list(conversationId));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load shares.");
    }
  }, [open, conversationId]);

  useEffect(() => { void load(); }, [load]);

  function fullUrl(share: ConversationShare) {
    return `${window.location.origin}${share.url}`;
  }

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const share = await shareApi.create(conversationId, {
        access: access as any,
        permissions: permissions as any,
        allowed: allowed.split(",").map((s) => s.trim()).filter(Boolean),
        ...(password ? { password } : {}),
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      });
      toast.success("Share link created.");
      setPassword("");
      setExpiresAt("");
      setAllowed("");
      setShares((s) => [share, ...s]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create share link.");
    } finally {
      setCreating(false);
    }
  }

  async function copy(share: ConversationShare) {
    try {
      await navigator.clipboard.writeText(fullUrl(share));
      toast.success("Link copied to clipboard.");
    } catch {
      // Clipboard API may be unavailable — fall back to a prompt.
      window.prompt("Copy this share link:", fullUrl(share));
    }
  }

  async function disable(share: ConversationShare) {
    setBusyId(share.id);
    try {
      const updated = await shareApi.disable(conversationId, share.id);
      setShares((s) => s.map((x) => (x.id === share.id ? updated : x)));
      toast.success("Share link disabled.");
    } catch (e: any) { toast.error(e?.message ?? "Failed to disable link."); }
    finally { setBusyId(null); }
  }

  async function enable(share: ConversationShare) {
    setBusyId(share.id);
    try {
      const updated = await shareApi.enable(conversationId, share.id);
      setShares((s) => s.map((x) => (x.id === share.id ? updated : x)));
      toast.success("Share link enabled.");
    } catch (e: any) { toast.error(e?.message ?? "Failed to enable link."); }
    finally { setBusyId(null); }
  }

  async function revoke(share: ConversationShare) {
    if (!window.confirm("Revoke this share link permanently? Anyone with it will lose access immediately.")) return;
    setBusyId(share.id);
    try {
      await shareApi.revoke(conversationId, share.id);
      setShares((s) => s.filter((x) => x.id !== share.id));
      toast.success("Share link revoked.");
    } catch (e: any) { toast.error(e?.message ?? "Failed to revoke link."); }
    finally { setBusyId(null); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Share conversation — ${conversationTitle}`} size="lg">
      <div className="space-y-5">
        {/* Create a share */}
        <div className="rounded-xl border border-white/10 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-bright">
            <ShareIcon /> Create a share link
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] text-text-muted">Who can access</span>
              <Select value={access} onChange={(e) => setAccess(e.target.value)}>
                {Object.entries(ACCESS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </label>
            <label className="block">
              <span className="text-[11px] text-text-muted">Permissions</span>
              <Select value={permissions} onChange={(e) => setPermissions(e.target.value)}>
                <option value="view">View only</option>
                <option value="comment">Comment</option>
                <option value="edit">Edit</option>
              </Select>
            </label>
          </div>
          {(access === "specific" || access === "restricted") && (
            <label className="block">
              <span className="text-[11px] text-text-muted">Allow (user ids or emails, comma-separated)</span>
              <Input value={allowed} onChange={(e) => setAllowed(e.target.value)} placeholder="name@company.com, user:cuid" />
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] text-text-muted">Password (optional)</span>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Protect with a password" />
            </label>
            <label className="block">
              <span className="text-[11px] text-text-muted">Expires (optional)</span>
              <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </label>
          </div>
          {error && <div className="text-xs text-crimson">{error}</div>}
          <Button onClick={() => void create()} loading={creating} className="w-full sm:w-auto">
            Create share link
          </Button>
        </div>

        {/* Existing shares */}
        <div className="space-y-2">
          <div className="text-sm font-semibold text-text-bright">Manage links</div>
          {shares.length === 0 && <p className="text-xs text-text-muted">No share links yet.</p>}
          {shares.map((share) => {
            const disabled = Boolean(share.revokedAt);
            const expired = share.expiresAt ? new Date(share.expiresAt).getTime() < Date.now() : false;
            return (
              <div key={share.id} className="rounded-xl border border-white/10 p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={disabled ? "slate" : "azure"}>{disabled ? "Disabled" : "Active"}</Badge>
                  <Badge variant="secondary">{ACCESS_LABELS[share.access] ?? share.access}</Badge>
                  <Badge variant="secondary">{share.permissions}</Badge>
                  {share.hasPassword && <Badge variant="warning"><Lock className="mr-1 h-3 w-3" />Password</Badge>}
                  {expired && <Badge variant="warning">Expired</Badge>}
                </div>
                <code className="block truncate rounded bg-bg-deep/60 px-2 py-1 text-[11px] text-text-muted">{fullUrl(share)}</code>
                <div className="text-[11px] text-text-muted">
                  Created {new Date(share.createdAt).toLocaleString()} · {share.accessCount} access(es)
                  {share.expiresAt ? ` · expires ${new Date(share.expiresAt).toLocaleString()}` : ""}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void copy(share)} disabled={busyId === share.id}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  {!disabled ? (
                    <Button size="sm" variant="outline" onClick={() => void disable(share)} disabled={busyId === share.id}>
                      Disable
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void enable(share)} disabled={busyId === share.id}>
                      Enable
                    </Button>
                  )}
                  <Button size="sm" variant="danger" onClick={() => void revoke(share)} disabled={busyId === share.id}>
                    <Trash2 className="h-3.5 w-3.5" /> Revoke
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-text-muted">
          Share links respect your organization's access controls and audit trail. Shared conversations never
          expose participant management or admin data.
        </p>
      </div>
    </Modal>
  );
}

function ShareIcon() {
  return <Share2 className="h-4 w-4 text-azure" />;
}
