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

export const GenerateMusicSchema = z.object({
  genre: z.enum(MUSIC_GENRES).default("pop"),
  key: z.enum(MUSIC_KEYS).default("C"),
  tempo: z.number().int().min(50).max(180).default(100), // BPM
  durationSec: z.number().int().min(3).max(120).default(12),
  seed: z.string().max(64).optional(),
  title: z.string().max(120).optional(),
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
