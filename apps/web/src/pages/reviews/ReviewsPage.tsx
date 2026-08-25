/**
 * WINDELS AI OS — Platform Reviews page.
 *
 * Public page where customers rate the platform (1–5★) and write a review.
 * Reads are public (aggregate + published reviews); writing requires a signed-in
 * account and each account keeps one review (editable/deletable). Admins get a
 * moderation panel to publish/hide reviews. Nothing is seeded — a fresh
 * platform shows 0.0 with no reviews.
 */
import { useCallback, useEffect, useState } from "react";
import { Star, Send, Trash2, ShieldCheck, ShieldAlert, RefreshCw, Eye, EyeOff, MessageSquareQuote } from "lucide-react";
import type {
  PlatformReview,
  PlatformReviewsDashboard,
  PlatformReviewStatus,
  ReviewRating,
} from "@windels/shared";
import { reviewsApi } from "@/lib/reviews";
import { useAuthStore } from "@/store/auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

function fmtDate(s: string) { try { return new Date(s).toLocaleDateString(); } catch { return s; } }

function Stars({ value, onPick }: { value: number; onPick?: (r: ReviewRating) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onPick}
          onClick={() => onPick?.(n as ReviewRating)}
          className={onPick ? "hover:scale-110 transition-transform" : "cursor-default"}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star className={`h-6 w-6 ${n <= value ? "fill-yellow-400 text-yellow-400" : "text-text-muted/40"}`} />
        </button>
      ))}
    </div>
  );
}

function DistributionBar({ data }: { data: PlatformReviewsDashboard }) {
  const max = Math.max(1, ...Object.values(data.distribution));
  const count = (n: number) => data.distribution[`${n}` as `${number}`] ?? 0;
  return (
    <div className="space-y-1.5">
      {([5, 4, 3, 2, 1] as const).map((n) => (
        <div key={n} className="flex items-center gap-2 text-xs">
          <span className="w-6 text-text-muted flex items-center gap-0.5"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{n}</span>
          <div className="flex-1 h-2 rounded bg-white/5 overflow-hidden">
            <div className="h-full rounded bg-yellow-400/80" style={{ width: `${(count(n) / max) * 100}%` }} />
          </div>
          <span className="w-8 text-right text-text-muted">{count(n)}</span>
        </div>
      ))}
    </div>
  );
}

export function ReviewsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = !!user && (user.role === "admin" || user.role === "super_admin");

  const [data, setData] = useState<PlatformReviewsDashboard | null>(null);
  const [mine, setMine] = useState<PlatformReview | null>(null);
  const [adminReviews, setAdminReviews] = useState<PlatformReview[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // form state
  const [rating, setRating] = useState<ReviewRating>(5);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const [d, me, admin] = await Promise.all([
        reviewsApi.dashboard(),
        user ? reviewsApi.me() : Promise.resolve(null),
        isAdmin ? reviewsApi.adminDashboard() : Promise.resolve(null),
      ]);
      setData(d); setMine(me);
      setAdminReviews(admin ? admin.reviews : null);
      if (me) { setRating(me.rating); setTitle(me.title); setContent(me.content); }
    } catch (e: any) { setErr(e?.message ?? "Failed to load"); } finally { setBusy(false); }
  }, [user, isAdmin]);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    if (!content.trim()) { setErr("Please write a short review before submitting."); return; }
    setErr(null); setSaved(false);
    try {
      await reviewsApi.submit({ rating, title: title.trim() || undefined, content: content.trim() });
      setSaved(true);
      await load();
    } catch (e: any) { setErr(e?.message ?? "Submit failed"); }
  }

  async function removeMyReview() {
    setErr(null);
    try { await reviewsApi.remove(); setMine(null); setRating(5); setTitle(""); setContent(""); await load(); }
    catch (e: any) { setErr(e?.message ?? "Delete failed"); }
  }

  async function moderate(id: string, status: PlatformReviewStatus) {
    setErr(null);
    try { await reviewsApi.setStatus(id, status); await load(); } catch (e: any) { setErr(e?.message ?? "Moderate failed"); }
  }

  if (!data) {
    return <div className="p-6 text-sm text-text-muted">{err ? `Error: ${err}` : "Loading reviews…"}</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageSquareQuote className="h-6 w-6 text-azure" /> Customer Reviews
          </h1>
          <p className="text-sm text-text-muted">Rate the WINDELS AI OS platform and share your experience.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>
      </div>

      {err && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />{err}
        </div>
      )}
      {saved && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-300 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />Review saved. Thank you!
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle>Platform rating</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-3">
              <span className="text-5xl font-semibold">{data.averageRating.toFixed(1)}</span>
              <div>
                <Stars value={Math.round(data.averageRating)} />
                <div className="text-xs text-text-muted mt-1">{data.totalPublished} review{data.totalPublished === 1 ? "" : "s"}</div>
              </div>
            </div>
            <DistributionBar data={data} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{mine ? "Update your review" : "Write a review"}</CardTitle>
            <CardDescription>
              {user
                ? "You can rate once per account and edit or remove it anytime."
                : "Sign in to write a review."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Stars value={rating} onPick={(r) => { setRating(r); setSaved(false); }} />
            <Input placeholder="Review headline (optional)" value={title} disabled={!user} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} />
            <Textarea
              rows={4}
              placeholder="Tell others what you think about the platform…"
              value={content}
              disabled={!user}
              onChange={(e) => { setContent(e.target.value); setSaved(false); }}
            />
            <div className="flex items-center gap-2">
              <Button onClick={() => void submit()} disabled={!user || busy}>
                <Send className="h-4 w-4 mr-1" />{mine ? "Update review" : "Submit review"}
              </Button>
              {mine && (
                <Button variant="outline" onClick={() => void removeMyReview()}>
                  <Trash2 className="h-4 w-4 mr-1" />Remove mine
                </Button>
              )}
              {!user && <span className="text-xs text-text-muted">Please log in to write a review.</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && adminReviews && (
        <Card>
          <CardHeader><CardTitle>Moderation</CardTitle><CardDescription>Publish or hide customer reviews.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {adminReviews.length === 0 ? (
              <div className="text-sm text-text-muted">No reviews yet.</div>
            ) : adminReviews.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-b border-border/40 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{r.userName}</span>
                    <Stars value={r.rating} />
                    <Badge variant={r.status === "published" ? "emerald" : "amber"}>{r.status}</Badge>
                  </div>
                  <div className="text-xs text-text-muted truncate">{r.content}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {r.status === "published" ? (
                    <Button size="sm" variant="outline" onClick={() => void moderate(r.id, "hidden")}><EyeOff className="h-3 w-3 mr-1"/>Hide</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void moderate(r.id, "published")}><Eye className="h-3 w-3 mr-1"/>Publish</Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent reviews</CardTitle>
          <CardDescription>{busy ? "Refreshing…" : `${data.totalPublished} published`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.reviews.length === 0 ? (
            <div className="text-sm text-text-muted">No reviews yet — be the first to rate the platform.</div>
          ) : data.reviews.map((r) => (
            <div key={r.id} className="border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{r.userName}</span>
                <Stars value={r.rating} />
                <span className="text-xs text-text-muted ml-auto">{fmtDate(r.createdAt)}</span>
              </div>
              {r.title && <div className="text-sm font-medium mt-1">{r.title}</div>}
              <div className="text-sm text-text-muted mt-0.5">{r.content}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default ReviewsPage;
