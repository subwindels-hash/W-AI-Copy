/**
 * Session 94 — Social Platform dashboard.
 *
 * Enterprise collaboration feed: posts, comments and a real reactions
 * ledger from which engagement is computed (never stored). Fresh orgs start
 * empty; everything shown is computed from stored records.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { socialPlatformApi } from "@/lib/socialPlatform";
import type {
  SpRollup,
  SpFeedItem,
  SpPostDetail,
  SpPost,
  SpReactionGroup,
} from "@/lib/socialPlatform";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Megaphone, MessageCircle, ThumbsUp, Users, Hash, PenLine, Send, Rocket, Archive, Trash2 } from "lucide-react";

const REACTION_EMOJIS = ["👍", "❤️", "🎉", "🚀", "👏", "🤝", "💡", "🔥"];

const KIND_BADGE: Record<SpPost["kind"], "default" | "azure" | "violet"> = {
  post: "default", announcement: "azure", update: "violet",
};

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-azure shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-text-muted uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-black text-text-bright truncate">{value}</div>
          {sub ? <div className="text-xs text-text-muted truncate">{sub}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function SocialPlatformPage() {
  const [rollup, setRollup] = useState<SpRollup | null>(null);
  const [feed, setFeed] = useState<SpFeedItem[]>([]);
  const [hashtags, setHashtags] = useState<Array<{ tag: string; count: number }>>([]);
  const [selected, setSelected] = useState<SpPostDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<SpPost["kind"]>("post");
  const [filterTag, setFilterTag] = useState("");

  const [commentDraft, setCommentDraft] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, f, h] = await Promise.all([
        socialPlatformApi.rollup(),
        socialPlatformApi.feed(filterTag ? { hashtag: filterTag } : undefined),
        socialPlatformApi.topHashtags(),
      ]);
      setRollup(r); setFeed(f); setHashtags(h);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [filterTag]);

  useEffect(() => { void load(); }, [load]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 4000); };

  const openPost = useCallback(async (id: string) => {
    try {
      setSelected(await socialPlatformApi.getPost(id));
      setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);

  const compose = useCallback(async () => {
    if (!author.trim() || !content.trim()) return;
    try {
      await socialPlatformApi.createPost({ authorName: author.trim(), content: content.trim(), kind });
      setAuthor(""); setContent("");
      setComposeOpen(false);
      flash("Post published.");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [author, content, kind, load]);

  const addComment = useCallback(async () => {
    if (!selected || !commentAuthor.trim() || !commentDraft.trim()) return;
    try {
      await socialPlatformApi.createComment(selected.id, { authorName: commentAuthor.trim(), content: commentDraft.trim() });
      setCommentDraft("");
      flash("Comment added.");
      await openPost(selected.id);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [selected, commentAuthor, commentDraft, openPost, load]);

  const react = useCallback(async (postId: string, emoji: string) => {
    try {
      const res = await socialPlatformApi.toggleReaction(postId, emoji);
      flash(res.added ? `Reacted ${emoji}.` : `Removed ${emoji}.`);
      if (selected?.id === postId) await openPost(postId);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [selected, openPost, load]);

  const archivePost = useCallback(async (id: string) => {
    try {
      await socialPlatformApi.archivePost(id);
      flash("Post archived.");
      setSelected(null);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [load]);

  const renderReactions = useCallback((reactions: SpReactionGroup[]) => {
    if (reactions.length === 0) return <span className="text-xs text-text-muted">no reactions</span>;
    return (
      <span className="flex flex-wrap gap-1">
        {reactions.map((r) => (
          <Badge key={r.emoji} variant="outline">{r.emoji} {r.count}</Badge>
        ))}
      </span>
    );
  }, []);

  const c = rollup?.counts;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-bright">Social Platform</h1>
          <p className="text-sm text-text-muted">
            Enterprise collaboration feed — Session 94. Engagement is computed from the reactions/comment ledgers, never stored.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setComposeOpen((v) => !v)}>
          <PenLine className="w-4 h-4 mr-1" /> Compose
        </Button>
      </div>

      {err ? <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-3 text-sm text-crimson">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">{notice}</div> : null}

      {composeOpen ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Your name" value={author} onChange={(e) => setAuthor(e.target.value)} />
              <Select value={kind} onChange={(e) => setKind(e.target.value as SpPost["kind"])}>
                <option value="post">Post</option>
                <option value="announcement">Announcement</option>
                <option value="update">Update</option>
              </Select>
            </div>
            <Textarea placeholder="What's happening? Use #hashtags…" value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
            <div className="flex gap-2">
              <Button onClick={compose} disabled={!author.trim() || !content.trim()}><Send className="w-4 h-4 mr-1" />Publish</Button>
              <Button variant="ghost" onClick={() => setComposeOpen(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Stat icon={<Megaphone className="w-5 h-5" />} label="Posts" value={String(c?.posts ?? 0)} sub={`${c?.publishedPosts ?? 0} published`} />
        <Stat icon={<MessageCircle className="w-5 h-5" />} label="Comments" value={String(c?.comments ?? 0)} />
        <Stat icon={<ThumbsUp className="w-5 h-5" />} label="Reactions" value={String(c?.reactions ?? 0)} />
        <Stat icon={<Users className="w-5 h-5" />} label="Posters" value={String(c?.posters ?? 0)} />
        <Stat icon={<Hash className="w-5 h-5" />} label="Top hashtag" value={rollup?.topHashtags[0]?.tag ?? "—"} />
        <Stat icon={<Megaphone className="w-5 h-5" />} label="Top author" value={rollup?.topAuthors[0]?.authorName ?? "—"} />
        <Stat icon={<Hash className="w-5 h-5" />} label="Hashtags" value={String(hashtags.length)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Feed */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2">
            <Input placeholder="Filter by hashtag (#engineering)" value={filterTag} onChange={(e) => setFilterTag(e.target.value.replace(/^#/, ""))} className="max-w-xs" />
            {filterTag ? <Button variant="ghost" size="sm" onClick={() => setFilterTag("")}>Clear</Button> : null}
          </div>
          {feed.map((f) => (
            <Card key={f.post.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-text-bright truncate">{f.post.authorName}</span>
                    <Badge variant={KIND_BADGE[f.post.kind]}>{f.post.kind}</Badge>
                    <span className="text-xs text-text-muted shrink-0">{new Date(f.post.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openPost(f.post.id)} className="text-xs text-azure hover:underline">Open</button>
                    <button onClick={() => archivePost(f.post.id)} className="text-text-muted hover:text-crimson"><Archive className="w-4 h-4" /></button>
                  </div>
                </div>
                <p className="text-sm text-text-main whitespace-pre-wrap">{f.post.content}</p>
                {f.post.hashtags.length ? (
                  <div className="flex flex-wrap gap-1">
                    {f.post.hashtags.map((t) => (
                      <button key={t} onClick={() => setFilterTag(t)} className="text-xs text-azure hover:underline">#{t}</button>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-2 pt-1">
                  {renderReactions(f.reactions)}
                  <div className="flex items-center gap-1">
                    {REACTION_EMOJIS.slice(0, 5).map((e) => (
                      <button key={e} onClick={() => react(f.post.id, e)} className="rounded hover:bg-white/10 px-1 text-sm" title={`React ${e}`}>{e}</button>
                    ))}
                  </div>
                </div>
                {f.commentPreview ? <div className="text-xs text-text-muted border-t border-white/5 pt-1">💬 {f.commentPreview.slice(0, 120)}{f.commentPreview.length > 120 ? "…" : ""} · {f.commentsCount}</div> : null}
              </CardContent>
            </Card>
          ))}
          {feed.length === 0 ? <p className="text-sm text-text-muted">No published posts in the feed.</p> : null}
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Top hashtags</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {hashtags.map((h) => (
                  <button key={h.tag} onClick={() => setFilterTag(h.tag)} className="rounded-full border border-azure/30 bg-azure/10 px-3 py-1 text-xs text-azure hover:bg-azure/20">
                    #{h.tag} <span className="text-text-muted">{h.count}</span>
                  </button>
                ))}
                {hashtags.length === 0 ? <p className="text-sm text-text-muted">No hashtags yet.</p> : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Top authors</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(rollup?.topAuthors ?? []).map((a) => (
                  <div key={a.authorName} className="flex items-center justify-between text-sm">
                    <span className="text-text-bright">{a.authorName}</span>
                    <Badge variant="outline">{a.postCount} post(s)</Badge>
                  </div>
                ))}
                {(rollup?.topAuthors ?? []).length === 0 ? <p className="text-sm text-text-muted">No authors yet.</p> : null}
              </div>
            </CardContent>
          </Card>

          {selected ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{selected.authorName}</CardTitle>
                <CardDescription>{new Date(selected.createdAt).toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-text-main whitespace-pre-wrap">{selected.content}</p>
                <div className="flex flex-wrap gap-1">
                  {selected.reactions.map((r) => <Badge key={r.emoji} variant="outline">{r.emoji} {r.count}</Badge>)}
                </div>
                <div className="space-y-2">
                  {selected.comments.map((c2) => (
                    <div key={c2.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
                      <span className="font-semibold text-text-bright">{c2.authorName}</span>
                      <span className="text-text-muted"> · {new Date(c2.createdAt).toLocaleString()}</span>
                      <div className="text-text-main">{c2.content}</div>
                    </div>
                  ))}
                  {selected.comments.length === 0 ? <p className="text-xs text-text-muted">No comments yet.</p> : null}
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Your name" value={commentAuthor} onChange={(e) => setCommentAuthor(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Add a comment…" value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} />
                  <Button onClick={addComment} disabled={!commentDraft.trim() || !commentAuthor.trim()}><Send className="w-4 h-4 mr-1" /></Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
