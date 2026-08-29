// WINDELS AI OS — Music Generation (single source of truth).
//
// Request contracts and record shapes for the music generator, exactly like
// `etl.ts` and `wmpcGiftCards.ts`: the route validates against these, the
// service derives its types from them, and the web client imports the same.
//
// The engine synthesizes REAL audio (16-bit PCM WAV) in pure Node — no ffmpeg
// binary required. It is honest scaffolding-to-real: it genuinely produces an
// audible, playable track (chords / bass / drums / melody per genre), which is
// what the old mediaGen "music" placeholder did not.

import { z } from "zod";

/** Genres the synthesis engine can actually render. */
export const MUSIC_GENRES = ["pop", "lofi", "cinematic", "edm", "ambient", "hiphop"] as const;
export type MusicGenre = (typeof MUSIC_GENRES)[number];

/** Root key names. Case-insensitive; "C" and "Am" accepted. */
export const MUSIC_KEYS = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
  "Am", "Bm", "Cm", "Dm", "Em", "Fm", "Gm",
] as const;
export type MusicKey = (typeof MUSIC_KEYS)[number];

export const MUSIC_STATUSES = ["queued", "rendering", "completed", "failed"] as const;
export type MusicStatus = (typeof MUSIC_STATUSES)[number];

/** Mood/energy presets that shape the intensity of the mix. */
export const MUSIC_MOODS = ["mellow", "balanced", "energetic"] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

export const GenerateMusicSchema = z.object({
  genre: z.enum(MUSIC_GENRES).default("pop"),
  key: z.enum(MUSIC_KEYS).default("C"),
  tempo: z.number().int().min(50).max(180).default(100), // BPM
  durationSec: z.number().int().min(3).max(120).default(12),
  seed: z.string().max(64).optional(),
  title: z.string().max(120).optional(),
  /** Mood/energy preset that shapes intensity of the mix. */
  mood: z.enum(MUSIC_MOODS).default("balanced"),
  /** Fade-in length in ms (smooth attack, avoids clicks). */
  fadeInMs: z.number().int().min(0).max(5000).default(300),
  /** Fade-out length in ms (0 disables). */
  fadeOutMs: z.number().int().min(0).max(5000).default(300),
  /** Snap to whole bars and skip the fade-out so the track can loop cleanly. */
  loop: z.boolean().default(false),
});
export type GenerateMusicInput = z.input<typeof GenerateMusicSchema>;

/** The synthesized track record — a real file on disk, not a placeholder URL. */
export interface MusicTrackRecord {
  id: string;
  organizationId: string;
  createdById: string;
  title: string;
  genre: MusicGenre;
  key: MusicKey;
  tempo: number;
  durationSec: number;
  mood: MusicMood;
  fadeInMs: number;
  fadeOutMs: number;
  loop: boolean;
  /** Saved by the user (favorite). */
  favorite: boolean;
  /** User-applied tags (comma list). */
  tags: string[];
  /** Times this track has been previewed/played (honest counter). */
  playCount: number;
  status: MusicStatus;
  /** Absolute path to the WAV on disk (never exposed over HTTP). */
  path?: string;
  /** Public URL under the music asset endpoint. */
  url?: string;
  bytes?: number;
  sampleRate: number;
  channels: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/** Metadata for the studio UI. */
export interface MusicCapability {
  genre: MusicGenre;
  label: string;
  blurb: string;
  defaultTempo: number;
}

/* ── Library management requests ────────────────────────────────── */

export const RenameTrackSchema = z.object({ title: z.string().min(1).max(120) });
export const FavoriteTrackSchema = z.object({ favorite: z.boolean() });
export const TagTrackSchema = z.object({ tags: z.array(z.string().max(40)).max(20) });
export const TrackIdSchema = z.object({ id: z.string().min(1).max(64) });
