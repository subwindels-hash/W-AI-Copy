# SESSION 94 SPECIFICATION — SOCIAL PLATFORM (ENTERPRISE COLLABORATION FEED)

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S93, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Enterprise Applications
```

---

## 1. OBJECTIVES & ARCHITECTURE

The master specification's Phase-3 Enterprise Applications list **Social
Platform** ("CRM, ERP, Website Builder, Email Intelligence, Social Platform,
Trading Intelligence, Marketplace") — the last named application still
missing after Sessions 90–93. Session 94 adds it as the enterprise
collaboration feed:

1. **Posts** — org-scoped social posts with author attribution, content,
   hashtags, kind (`post | announcement | update`), and an honest lifecycle
   (draft → published | archived).
2. **Comments** — threaded at one level (post → comments), author-attributed.
3. **Reactions ledger** — a real reactions ledger (`sp:reaction:*`) from
   which engagement is **computed per read** (never stored as a counter).
   Toggling a reaction is idempotent (same author + post + emoji → remove).
4. **Deterministic hashtag extraction** — a pure regex extractor; top
   hashtags and engagement stats are computed from stored records.
5. **Deterministic rollup** — posts/comments/reactions counts, top authors,
   top hashtags, recent posts — computed per read, no fabricated numbers.
6. **Tenant isolation by construction** — `sp:*` org-scoped keys, fail-closed
   reads, namespaces registered in the Session 89 isolation-audit catalog.

```
                 SOCIAL PLATFORM
                 ---------------
   [posts]     ->  sp:post:i:<org>:<id>       (posts + lifecycle)
   [comments]  ->  sp:comment:i:<org>:<id>    (post → comments)
   [reactions] ->  sp:reaction:i:<org>:<id>   (ledger — engagement computed)
   [rollup]    ->  computed per read (never invented)
```

---

## 2. DATA MODEL

All types live in `packages/shared/src/socialPlatform.ts` (prefixed `Sp`).

### 2.1 Post

`id` (`spp-`), `organizationId`, `authorId` (user id \| null), `authorName`
(required, display name captured at write — stable attribution),
`content` (required, 1–4000 chars), `hashtags[]` (extracted at write by the
deterministic regex, deduped, lowercase), `kind`
(`post | announcement | update`, default `post`), `status`
(`draft | published | archived`, default `published`), `publishedAt?`
(stamped on publish transition), `createdAt`/`updatedAt`.

### 2.2 Comment

`id` (`spc-`), `organizationId`, `postId`, `authorId` (`string | null`),
`authorName`, `content` (1–2000), `createdAt`.

### 2.3 Reaction (ledger row)

`id` (`spr-`), `organizationId`, `postId`, `authorId`, `emoji` (1–16 chars,
validated against a small allowlist), `createdAt`.

**Engagement is computed**: for a post, reactions are grouped by emoji from
the ledger (count per emoji) and `commentsCount` from the comment ledger.
Toggling: `POST /posts/:id/reactions` with `{ emoji }` adds when absent,
removes when present (same author+post+emoji) — idempotent by construction.

### 2.4 Post detail

`SpPostDetail extends SpPost` — `comments: SpComment[]`,
`reactions: { emoji, count }[]`, `reactionsTotal`, `commentsCount`.

### 2.5 Feed item

`SpFeedItem` — a published post + computed `reactions` (grouped),
`reactionsTotal`, `commentsCount`, `commentPreview` (first comment content).

### 2.6 Rollup (computed per read)

`SpRollup`: `counts` (`posts`, `publishedPosts`, `draftPosts`, `archivedPosts`,
`comments`, `reactions`, `posters`), `topHashtags` (`{ tag, count }[]` up to
8), `topAuthors` (`{ authorName, postCount }[]` up to 5), `recentPosts`
(feed items up to 6), `lastUpdatedAt`.

---

## 3. STORAGE & TENANT ISOLATION

- Redis-backed, org-scoped: `sp:<entity>:i:<org>:<id>`.
- Reads re-parse the stored `organizationId` and refuse on mismatch.
- The Session 89 catalog gains `sp:post`, `sp:comment`, `sp:reaction` as
  `org_scoped`.
- Writes emit Kernel events (`sp.post.created`, `sp.post.published`,
  `sp.comment.created`, `sp.reaction.toggled`, …).

## 4. HASHTAG EXTRACTION (DETERMINISTIC)

`extractHashtags(content)`: a pure regex over `#\w{1,40}`, lowercased,
deduped, order-preserving. Used at write time to store the post's hashtags
and at rollup time to aggregate top hashtags from stored posts — never
random, never invented.

## 5. DEMO DATA POLICY

Fresh orgs start empty. `WINDELS_DEMO_DATA=true` seeds an idempotent demo
(`org-demo-sp`): 4 published posts (with hashtags), 3 comments and a few
reactions. See `apps/api/src/socialPlatform/bootstrap.ts`.

## 6. API SURFACE (`/api/v1/social-platform`, authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/rollup` | computed rollup |
| GET | `/feed` | published posts + computed engagement (filter `hashtag`, `kind`, `q`) |
| GET/POST | `/posts` | list / create (draft or published) |
| GET/PATCH/DELETE | `/posts/:id` | read (detail) / update / delete |
| POST | `/posts/:id/publish` | publish (stamp publishedAt on transition) |
| POST | `/posts/:id/archive` | archive |
| GET/POST | `/posts/:id/comments` | list / add comment |
| DELETE | `/comments/:id` | delete comment |
| POST | `/posts/:id/reactions` | toggle reaction (idempotent) |
| GET | `/posts/:id/reactions` | computed reactions for a post |
| GET | `/hashtags` | top hashtags (computed) |

## 7. DELIVERY SLICE

1. `packages/shared/src/socialPlatform.ts` (+ index export)
2. `apps/api/src/socialPlatform/socialPlatform.service.ts`
3. `apps/api/src/socialPlatform/bootstrap.ts` — demo seed (gated)
4. `apps/api/src/http/routes/socialPlatform.ts` + server/index wiring
5. `tenantIsolation.service.ts` — register `sp:*` namespaces
6. `apps/web/src/lib/socialPlatform.ts` + `pages/socialPlatform/SocialPlatformPage.tsx` + router + sidebar
7. `apps/api/src/socialPlatform/socialPlatform.test.ts`
8. Decision log, PROGRESS.md, CHANGELOG.md

## 8. DEFINITION OF DONE

- [ ] `pnpm build` + `pnpm typecheck` pass; `make verify` green.
- [ ] No `Math.random` in read paths; all guard suites pass.
- [ ] Cross-tenant test proves org B cannot read org A's posts/comments.
- [ ] Engagement is computed from the reactions/comment ledgers (never
      stored); reaction toggling is idempotent.
- [ ] Hashtag extraction is deterministic; rollup is byte-stable across reads.
- [ ] UI renders real API data with demo-honesty rules intact.
