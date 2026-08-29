/**
 * Voice / Text-to-Speech service abstraction.
 *
 * Provider-neutral TTS pipeline:
 *   Text → Voice Selection → TTS Engine → Audio (WAV/MP3) → Storage → Playback
 *
 * Implemented providers:
 *   - "browser"      : browser SpeechSynthesis (requested client-side; server returns markup)
 *   - "openai"       : OpenAI /audio/speech (OPENAI_API_KEY; WINDELS_SPEECH_MODEL)
 *   - "elevenlabs"   : ElevenLabs API (ELEVENLABS_API_KEY required)
 *   - "playht"       : Play.ht API (PLAYHT_API_KEY + PLAYHT_USER_ID required)
 *   - "local-espeak" : local espeak-ng binary if installed (auto-detected)
 *
 * When no server-side provider is configured and the request asks for a
 * downloadable audio file, the job fails with VOICE_MODEL_NOT_CONFIGURED.
 * A placeholder beep is never written — silence is not speech.
 *
 * Browser SpeechSynthesis is the default zero-config path: the server returns
 * voice metadata; the client uses window.speechSynthesis for playback.
 *
 * Nigerian languages (Igbo, Yoruba, Hausa, Edo/Bini, Nigerian Pidgin, Nigerian
 * English) are mapped to the closest available voice on each provider or to
 * browser voices when present.
 */
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface VoiceModel {
  id: string;
  name: string;
  gender: "male" | "female" | "neutral";
  language: string;          // BCP-47
  dialect?: string;          // e.g. "en-NG", "ig", "yo", "ha", "pcm-NG"
  provider: string;
  providerVoiceId?: string;
  emotions?: string[];
  isRegional?: boolean;
  isNigerian?: boolean;
  sampleRate?: number;
}

export interface TtsJob {
  id: string;
  voiceId: string;
  text: string;
  language: string;
  status: "ready" | "queued" | "synthesizing" | "failed" | "demo";
  audioUrl?: string;
  durationMs?: number;
  error?: string;
  provider?: string;
  createdAt: string;
  /** If true, audio is produced by browser SpeechSynthesis (no file). */
  clientSide?: boolean;
}

export interface ConfiguredProviders {
  elevenlabs: boolean;
  playht: boolean;
  espeak: boolean;
  openai: boolean;
}

const AUDIO_DIR = path.resolve(process.cwd(), "audio-cache");
const PUBLIC_PREFIX = "/api/v1/voice-studio/audio";
const VOICE_MODEL_NOT_CONFIGURED =
  "VOICE_MODEL_NOT_CONFIGURED — server-side audio unavailable. Use browser speech synthesis (clientSide=true) or configure OPENAI_API_KEY, ELEVENLABS_API_KEY, or PLAYHT_API_KEY + PLAYHT_USER_ID (or install espeak-ng).";

let dirEnsured: Promise<void> | null = null;
function ensureDir(): Promise<void> {
  if (dirEnsured) return dirEnsured;
  dirEnsured = fs.mkdir(AUDIO_DIR, { recursive: true }).then(() => undefined).catch(() => undefined);
  return dirEnsured;
}

/** Cached espeak-ng probe. Null means "not probed this process". Tests may override. */
let espeakCached: boolean | null = null;

export function resetVoiceProviderCache(): void {
  espeakCached = null;
}

/** Test hook — never used in production paths. */
export function setEspeakDetectedForTests(value: boolean | null): void {
  espeakCached = value;
}

export function detectEspeak(): boolean {
  if (espeakCached !== null) return espeakCached;
  try {
    const r = spawnSync("espeak-ng", ["--version"], { timeout: 3000, encoding: "utf8" });
    espeakCached = r.status === 0;
  } catch {
    espeakCached = false;
  }
  return espeakCached;
}

const NIGERIAN_VOICES: VoiceModel[] = [
  { id: "en-ng-female", name: "Nigerian English (Female)", gender: "female", language: "en-NG", dialect: "en-NG", provider: "browser", isNigerian: true },
  { id: "en-ng-male",   name: "Nigerian English (Male)",   gender: "male",   language: "en-NG", dialect: "en-NG", provider: "browser", isNigerian: true },
  { id: "pcm-ng",       name: "Nigerian Pidgin",           gender: "neutral", language: "pcm-NG", dialect: "pcm-NG", provider: "browser", isNigerian: true, isRegional: true },
  { id: "ig-ng",        name: "Igbo",                      gender: "neutral", language: "ig", dialect: "ig-NG", provider: "browser", isNigerian: true, isRegional: true },
  { id: "yo-ng",        name: "Yoruba",                    gender: "neutral", language: "yo", dialect: "yo-NG", provider: "browser", isNigerian: true, isRegional: true },
  { id: "ha-ng",        name: "Hausa",                     gender: "neutral", language: "ha", dialect: "ha-NG", provider: "browser", isNigerian: true, isRegional: true },
  { id: "bin-ng",       name: "Edo/Bini",                  gender: "neutral", language: "bin", dialect: "bin-NG", provider: "browser", isNigerian: true, isRegional: true },
];

const BUILTIN_VOICES: VoiceModel[] = [
  { id: "en-us-female", name: "English (US) Female", gender: "female", language: "en-US", provider: "browser" },
  { id: "en-us-male",   name: "English (US) Male",   gender: "male",   language: "en-US", provider: "browser" },
  { id: "en-gb-female", name: "English (UK) Female", gender: "female", language: "en-GB", provider: "browser" },
  { id: "en-gb-male",   name: "English (UK) Male",   gender: "male",   language: "en-GB", provider: "browser" },
  { id: "fr-fr",        name: "Français",            gender: "female", language: "fr-FR", provider: "browser" },
  { id: "es-es",        name: "Español",             gender: "female", language: "es-ES", provider: "browser" },
  { id: "pt-br",        name: "Português (Brasil)",  gender: "female", language: "pt-BR", provider: "browser" },
  { id: "zh-cn",        name: "中文 (普通话)",         gender: "female", language: "zh-CN", provider: "browser" },
  { id: "ar-sa",        name: "العربية",              gender: "male",   language: "ar-SA", provider: "browser" },
  { id: "hi-in",        name: "हिन्दी",                gender: "female", language: "hi-IN", provider: "browser" },
  ...NIGERIAN_VOICES,
];

function openaiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function openaiSpeechModel(): string {
  return process.env.WINDELS_SPEECH_MODEL || "gpt-4o-mini-tts";
}

function openaiBaseUrl(): string {
  return (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
}

function espeakLang(lang: string): string {
  const map: Record<string, string> = {
    "en": "en", "en-US": "en-us", "en-GB": "en-gb", "en-NG": "en",
    "nl": "nl", "es": "es", "es-ES": "es", "fr": "fr", "fr-FR": "fr",
    "de": "de", "de-DE": "de", "it": "it", "pt": "pt", "pt-BR": "pt-br",
    "zh": "cmn", "zh-CN": "cmn", "ja": "ja", "ko": "ko", "ru": "ru",
    "hi": "hi", "ar": "ar", "ar-SA": "ar", "tr": "tr", "pl": "pl",
    "sv": "sv", "el": "el", "he": "he", "th": "th", "uk": "uk",
    "id": "id", "vi": "vi", "af": "af", "sw": "sw",
  };
  return map[lang] ?? map[lang.split("-")[0] ?? ""] ?? "en";
}

export const VoiceService = {
  listVoices(): VoiceModel[] {
    const prov = this.configuredProviders();
    const dynamic: VoiceModel[] = [];
    if (prov.openai) {
      dynamic.push(
        { id: "openai-alloy", name: "OpenAI Alloy", gender: "neutral", language: "multi", provider: "openai", providerVoiceId: "alloy" },
        { id: "openai-nova", name: "OpenAI Nova", gender: "female", language: "multi", provider: "openai", providerVoiceId: "nova" },
        { id: "openai-onyx", name: "OpenAI Onyx", gender: "male", language: "multi", provider: "openai", providerVoiceId: "onyx" },
      );
    }
    if (prov.elevenlabs) {
      dynamic.push(
        { id: "elevenlabs-multilingual", name: "ElevenLabs Multilingual v2", gender: "neutral", language: "multi", provider: "elevenlabs" },
        { id: "elevenlabs-rachel", name: "Rachel (ElevenLabs, en-US)", gender: "female", language: "en-US", provider: "elevenlabs" },
        { id: "elevenlabs-anthoni", name: "Antoni (ElevenLabs, en-US)", gender: "male", language: "en-US", provider: "elevenlabs" },
      );
    }
    if (prov.playht) {
      dynamic.push({ id: "playht-default", name: "Play.ht Default", gender: "neutral", language: "multi", provider: "playht" });
    }
    if (prov.espeak) {
      dynamic.push({ id: "espeak-default", name: "eSpeak-NG (Local)", gender: "neutral", language: "multi", provider: "local-espeak" });
    }
    return [...dynamic, ...BUILTIN_VOICES];
  },

  configuredProviders(): ConfiguredProviders {
    return {
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
      playht: !!(process.env.PLAYHT_API_KEY && process.env.PLAYHT_USER_ID),
      espeak: detectEspeak(),
      openai: openaiConfigured(),
    };
  },

  async synthesize(input: {
    text: string;
    voiceId: string;
    emotion?: string;
    speed?: number;
    clientSide?: boolean;
  }): Promise<TtsJob> {
    await ensureDir();
    const id = "tts-" + randomUUID().slice(0, 8);
    // Resolve voice. Built-in WINDELS voices (win-*) default to client-side SpeechSynthesis.
    let voice = this.listVoices().find((v) => v.id === input.voiceId);
    const isWinBuiltin = input.voiceId.startsWith("win-") || input.voiceId.startsWith("bv-");
    if (!voice && isWinBuiltin) {
      voice = BUILTIN_VOICES.find((v) => v.id === "en-us-female")!;
    }
    if (!voice) voice = BUILTIN_VOICES[0]!;
    const forceClientSide = input.clientSide !== false && (voice.provider === "browser" || isWinBuiltin);
    const job: TtsJob = {
      id, voiceId: input.voiceId, text: input.text, language: voice.language,
      status: "queued", createdAt: new Date().toISOString(),
      clientSide: !!forceClientSide,
      provider: voice.provider,
    };
    if (job.clientSide) {
      // Client-side playback via window.speechSynthesis: no file to generate.
      job.status = "ready";
      job.durationMs = Math.max(800, Math.ceil(input.text.length / 14) * 1000);
      return job;
    }
    try {
      job.status = "synthesizing";
      const out = await this._synthesizeFile(input, voice, id);
      job.audioUrl = `${PUBLIC_PREFIX}/${path.basename(out.path)}`;
      job.status = "ready";
      job.durationMs = Math.max(800, Math.ceil(input.text.length / 14) * 1000);
      job.provider = out.provider;
    } catch (e: any) {
      job.status = "failed";
      job.error = e?.message ?? String(e);
      delete job.audioUrl;
      delete job.durationMs;
    }
    return job;
  },

  async _synthesizeFile(input: { text: string; speed?: number }, voice: VoiceModel, jobId: string): Promise<{ path: string; provider: string }> {
    const prov = this.configuredProviders();
    const wavPath = path.join(AUDIO_DIR, `${jobId}.wav`);
    const mp3Path = path.join(AUDIO_DIR, `${jobId}.mp3`);

    if (voice.provider === "elevenlabs" && prov.elevenlabs) {
      const voiceId = voice.providerVoiceId ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY!,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({ text: input.text, model_id: "eleven_multilingual_v2" }),
      });
      if (!r.ok) throw new Error(`ElevenLabs HTTP ${r.status}`);
      await fs.writeFile(mp3Path, Buffer.from(await r.arrayBuffer()));
      return { path: mp3Path, provider: "elevenlabs" };
    }

    if (voice.provider === "playht" && prov.playht) {
      const r = await fetch("https://api.play.ht/api/v2/tts", {
        method: "POST",
        headers: {
          "AUTHORIZATION": process.env.PLAYHT_API_KEY!,
          "X-USER-ID": process.env.PLAYHT_USER_ID!,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({ text: input.text, voice: "PlayHT-default" }),
      });
      if (!r.ok) throw new Error(`Play.ht HTTP ${r.status}`);
      await fs.writeFile(mp3Path, Buffer.from(await r.arrayBuffer()));
      return { path: mp3Path, provider: "playht" };
    }

    if ((voice.provider === "openai" || (!["elevenlabs", "playht", "local-espeak"].includes(voice.provider) && prov.openai)) && prov.openai) {
      const mapped = voice.providerVoiceId
        ?? (voice.gender === "female" ? "nova" : voice.gender === "male" ? "onyx" : "alloy");
      const r = await fetch(`${openaiBaseUrl()}/audio/speech`, {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: openaiSpeechModel(),
          input: input.text,
          voice: mapped,
          response_format: "mp3",
          speed: input.speed,
        }),
      });
      if (!r.ok) throw new Error(`OpenAI TTS HTTP ${r.status}`);
      await fs.writeFile(mp3Path, Buffer.from(await r.arrayBuffer()));
      return { path: mp3Path, provider: "openai" };
    }

    if ((voice.provider === "local-espeak" || prov.espeak) && prov.espeak) {
      const r = spawnSync("espeak-ng", [
        "-v", espeakLang(voice.language),
        "-w", wavPath,
        input.text.slice(0, 4000),
      ], { timeout: 30_000, encoding: "utf8" });
      if (r.status !== 0) {
        throw new Error(`espeak-ng failed${r.stderr ? `: ${String(r.stderr).slice(0, 200)}` : ""}`);
      }
      return { path: wavPath, provider: "local-espeak" };
    }

    throw new Error(VOICE_MODEL_NOT_CONFIGURED);
  },
};
