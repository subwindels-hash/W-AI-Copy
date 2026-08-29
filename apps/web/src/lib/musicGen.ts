/** WINDELS AI OS — Music Generation client. */
import { api } from "./api";

export type MusicGenre = "pop" | "lofi" | "cinematic" | "edm" | "ambient" | "hiphop";
export type MusicKey = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B" | "Am" | "Bm" | "Cm" | "Dm" | "Em" | "Fm" | "Gm";
export type MusicStatus = "queued" | "rendering" | "completed" | "failed";
export type MusicMood = "mellow" | "balanced" | "energetic";

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
  favorite: boolean;
  tags: string[];
  playCount: number;
  status: MusicStatus;
  url?: string;
  bytes?: number;
  sampleRate: number;
  channels: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MusicCapability {
  genre: MusicGenre;
  label: string;
  blurb: string;
  defaultTempo: number;
}

export const MUSIC_KEYS: MusicKey[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "Am", "Bm", "Cm", "Dm", "Em", "Fm", "Gm"];
export const MUSIC_MOODS: { value: MusicMood; label: string }[] = [
  { value: "mellow", label: "Mellow" },
  { value: "balanced", label: "Balanced" },
  { value: "energetic", label: "Energetic" },
];

export const musicApi = {
  capabilities: () => api<MusicCapability[]>("/music/capabilities"),
  tracks: () => api<MusicTrackRecord[]>("/music/tracks"),
  track: (id: string) => api<MusicTrackRecord>(`/music/tracks/${id}`),
  generate: (input: { genre: MusicGenre; key: MusicKey; tempo: number; durationSec: number; mood?: MusicMood; fadeInMs?: number; fadeOutMs?: number; loop?: boolean; title?: string; seed?: string }) =>
    api<MusicTrackRecord>("/music/tracks", { method: "POST", json: input }),
  render: (id: string) => api<MusicTrackRecord>(`/music/tracks/${id}/render`, { method: "POST" }),
  rename: (id: string, title: string) => api<MusicTrackRecord>(`/music/tracks/${id}`, { method: "PATCH", json: { title } }),
  favorite: (id: string, favorite: boolean) => api<MusicTrackRecord>(`/music/tracks/${id}/favorite`, { method: "POST", json: { favorite } }),
  tags: (id: string, tags: string[]) => api<MusicTrackRecord>(`/music/tracks/${id}/tags`, { method: "POST", json: { tags } }),
  play: (id: string) => api<MusicTrackRecord>(`/music/tracks/${id}/play`, { method: "POST" }),
  remove: (id: string) => api<void>(`/music/tracks/${id}`, { method: "DELETE" }),
  regenerate: (id: string) => api<MusicTrackRecord>(`/music/tracks/${id}/regenerate`, { method: "POST" }),
};
