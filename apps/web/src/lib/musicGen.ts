/** WINDELS AI OS — Music Generation client. */
import { api } from "./api";

export type MusicGenre = "pop" | "lofi" | "cinematic" | "edm" | "ambient" | "hiphop";
export type MusicKey = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B" | "Am" | "Bm" | "Cm" | "Dm" | "Em" | "Fm" | "Gm";
export type MusicStatus = "queued" | "rendering" | "completed" | "failed";

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

export const musicApi = {
  capabilities: () => api<MusicCapability[]>("/music/capabilities"),
  tracks: () => api<MusicTrackRecord[]>("/music/tracks"),
  track: (id: string) => api<MusicTrackRecord>(`/music/tracks/${id}`),
  generate: (input: { genre: MusicGenre; key: MusicKey; tempo: number; durationSec: number; title?: string; seed?: string }) =>
    api<MusicTrackRecord>("/music/tracks", { method: "POST", json: input }),
  render: (id: string) => api<MusicTrackRecord>(`/music/tracks/${id}/render`, { method: "POST" }),
};
