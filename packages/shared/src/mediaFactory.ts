/**
 * Shared types — Session 77 (Part B): Autonomous AI Media & Content Factory.
 *
 * Image/audio/video generation via existing self-hosted models (Session 38/43),
 * character studio, educational cartoon/lesson builders, animal content with
 * species accuracy, and a non-bypassable Child Safety Reviewer gate.
 */

export type MfContentType = "image" | "audio" | "music" | "video" | "character" | "cartoon" | "lesson" | "quiz" | "marketing" | "podcast";
export type MfChannel = "web" | "mobile" | "social" | "podcast" | "audiobook" | "training" | "marketing" | "presentation" | "navigation" | "meeting";
export type MfSafetyState = "pending" | "approved" | "approved-child-safe" | "rejected" | "needs-review";

export interface MfCharacter {
  id: string;
  name: string;
  archetype: "hero" | "mentor" | "companion" | "narrator" | "villain" | "mascot" | "custom";
  voiceId?: string;
  avatarUrl?: string;
  emotionPalette: string[];
  ageTarget?: "children" | "teen" | "adult" | "all";
}

export interface MfContentJob {
  id: string;
  type: MfContentType;
  channel: MfChannel;
  prompt: string;
  status: "queued" | "generating" | "safety-review" | "ready" | "rejected";
  safety: MfSafetyState;
  createdAt: string;
  url?: string;
}

export interface MfCourse {
  id: string;
  title: string;
  subject: string;
  ageGroup: string;
  lessons: number;
  language: string;
}

export interface MfDashboard {
  jobs: { total: number; queued: number; ready: number; rejected: number };
  characters: number;
  courses: number;
  safetyReviews24h: number;
  channelsActive: number;
  childSafetyGateActive: boolean;
}

/* ────────────────────────────────────────────────────────────────────
 * Session 77B — Publishing pipeline (social media distribution).
 * Real OAuth connects → org-scoped publish jobs → per-platform HTTP
 * adapters (resumable/chunked uploads) with retry, scheduling and an
 * append-only audit trail. Types prefixed `Pub` per namespacing rule.
 * ──────────────────────────────────────────────────────────────────── */

export type PubPlatformId = "youtube" | "tiktok" | "instagram" | "facebook" | "x" | "pinterest";

export type PubJobStatus = "queued" | "scheduled" | "uploading" | "published" | "failed" | "cancelled";

/** Which account's OAuth token a job (or connect flow) resolves: the user's own or the org-shared one. */
export type PubTokenScope = "user" | "org";

/** Platform-reported live status of an already-uploaded post (webhook sync, S77B completion pass). */
export type PubPlatformLiveStatus = "processing" | "processed" | "available" | "uploaded" | "failed" | "rejected";

export type PubAuditKind =
  | "connect.start" | "connect.success" | "connect.failed" | "disconnect"
  | "job.created" | "job.scheduled" | "job.attempt" | "job.retry"
  | "job.published" | "job.failed" | "job.cancelled"
  | "webhook.synced";

/** One entry of the append-only per-job status history (capped, newest last). */
export interface PubStatusHistoryEntry {
  status: PubJobStatus;
  at: string;
  by: string;
  detail?: string;
}

/** Input accepted by POST /media-factory/publishing/:platform/publish. */
export interface PubPublishInput {
  title: string;
  description?: string;
  /** External http(s) media URL. */
  videoUrl?: string;
  /** External http(s) URL or internal render path (/api/v1/media-factory/render/<file>). */
  mediaUrl?: string;
  mediaType?: string;
  tags?: string[];
  /** ISO datetime; when in the future the job stays `scheduled` until due. */
  scheduledAt?: string;
  /** Client-supplied dedupe key; a second submit within 24h returns the original job. */
  idempotencyKey?: string;
  /** youtube: public|unlisted|private · tiktok: PUBLIC_TO_EVERYONE|MUTUAL_FOLLOW_FRIENDS|SELF_ONLY */
  privacyStatus?: string;
  /** pinterest board id (falls back to PINTEREST_BOARD_ID env). */
  boardId?: string;
  /** facebook page id (falls back to FACEBOOK_PAGE_ID env). */
  pageId?: string;
  /** instagram IG user id (falls back to INSTAGRAM_IG_USER_ID env or token lookup). */
  igUserId?: string;
}

export interface PubJobResult {
  postId?: string;
  url?: string;
  warnings?: string[];
}

export interface PubJobError {
  code: string;
  message: string;
  detail?: string;
}

export interface PubJob {
  id: string;
  orgId: string;
  ownerUserId: string;
  platform: PubPlatformId;
  input: PubPublishInput;
  status: PubJobStatus;
  /** Which OAuth token scope this job executes with — "user" (owner's account) or "org" (org-shared account). */
  tokenScope: PubTokenScope;
  attempts: number;
  maxAttempts: number;
  /** epoch ms of next processing attempt (jobs are due when <= now). */
  nextAttemptAt: number;
  result?: PubJobResult;
  error?: PubJobError;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  /** Latest status reported by the platform after upload (webhook sync), e.g. "processing" or "available". */
  platformStatus?: string;
  /** ISO time the platform reported the post fully available. */
  platformAvailableAt?: string;
  /** Append-only transition log (capped at 50), newest last. */
  statusHistory?: PubStatusHistoryEntry[];
}

export interface PubPlatformInfo {
  id: PubPlatformId;
  /** OAuth client id/secret configured in server env. */
  configured: boolean;
  /** A connected account exists for the requesting user. */
  connected: boolean;
  /** Token present but refresh failed — reconnect required. */
  needsReauth: boolean;
  /** An org-shared (org-scoped) account is connected for this platform. */
  orgConnected: boolean;
  /** Org-shared token present but refresh failed — reconnect required. */
  orgNeedsReauth: boolean;
  scope: string;
  expiresAt?: string;
  requiresMedia: boolean;
  maxTitle: number;
  maxDescription: number;
  maxMediaMB: number;
}

export interface PubAuditEvent {
  id: string;
  at: string;
  kind: PubAuditKind;
  actor: string;
  jobId?: string;
  platform?: PubPlatformId;
  detail?: string;
}

export interface PubOAuthStart {
  authUrl?: string;
  state: string;
  redirectUri: string;
  error?: string;
}

export interface PubConnectionStatus {
  connected: boolean;
  needsReauth: boolean;
  scope?: string;
  expiresAt?: string;
  hasRefreshToken: boolean;
}

/* ── Webhook status sync (platform → WINDELS job state) ─────────────── */

/** Inbound platform callback payload accepted by POST /media-factory/publishing/webhooks/:platform/callback. */
export interface PubPlatformCallbackUpdate {
  /** Platform post/video id (matches the job's result.postId). */
  postId?: string;
  /** YouTube-style alias for postId. */
  videoId?: string;
  status: PubPlatformLiveStatus;
  reason?: string;
  /** ISO time the platform reported the post available (optional). */
  availableAt?: string;
}

export interface PubWebhookConfig {
  platform: PubPlatformId;
  /** Public callback URL to register with the platform's hub (includes ?oid=<orgId>). */
  callbackUrl: string;
  /** HMAC secret — full value on registration, masked in list responses. */
  secret: string;
  enabled: boolean;
  createdAt: string;
}

export interface PubWebhookRegistration extends PubWebhookConfig {}

/* ── Browser-side direct media upload ──────────────────────────────── */

export interface PubUploadRecord {
  /** Storage file name on the server. */
  file: string;
  /** URL the publish endpoint accepts (served by /media-factory/render/<file>). */
  url: string;
  /** Original client file name (for display). */
  fileName: string;
  contentType: string;
  sizeBytes: number;
  ownerUserId: string;
  createdAt: string;
}

export interface PubUploadResult extends PubUploadRecord {}
