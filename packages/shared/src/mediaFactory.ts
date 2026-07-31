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

export type PubAuditKind =
  | "connect.start" | "connect.success" | "connect.failed" | "disconnect"
  | "job.created" | "job.scheduled" | "job.attempt" | "job.retry"
  | "job.published" | "job.failed" | "job.cancelled";

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
  attempts: number;
  maxAttempts: number;
  /** epoch ms of next processing attempt (jobs are due when <= now). */
  nextAttemptAt: number;
  result?: PubJobResult;
  error?: PubJobError;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface PubPlatformInfo {
  id: PubPlatformId;
  /** OAuth client id/secret configured in server env. */
  configured: boolean;
  /** A connected account exists for the requesting user. */
  connected: boolean;
  /** Token present but refresh failed — reconnect required. */
  needsReauth: boolean;
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
