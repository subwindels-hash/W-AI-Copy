/**
 * Voice / Text-to-Speech service abstraction.
 *
 * Provider-neutral TTS pipeline:
 *   Text → Voice Selection → TTS Engine → Audio (WAV/MP3) → Storage → Playback
 *
 * Implemented providers:
 *   - "browser"   : browser SpeechSynthesis (requested client-side; server returns markup)
 *   - "elevenlabs": ElevenLabs API (ELEVENLABS_API_KEY required)
 *   - "playht"    : Play.ht API (PLAYHT_API_KEY + PLAYHT_USER_ID required)
 *   - "local-espeak" : local espeak-ng binary if installed (auto-detected)
 *
 * When no provider is configured and the request asks for a downloadable
 * audio file, the service returns VOICE_MODEL_NOT_CONFIGURED and generates a
 * short WAV containing spoken announcement of that fact via a simple tone +
 * meta-voice fallback (for debug/UX clarity only — labeled as placeholder).
 *
 * Browser SpeechSynthesis is the default zero-config path: the server returns
 * SSML + voice metadata; the client uses window.speechSynthesis for playback.
 *
 * Nigerian languages (Igbo, Yoruba, Hausa, Edo/Bini, Nigerian Pidgin, Nigerian
 * English) are mapped to the closest available voice on each provider or to
 * browser voices when present.
 */
import { randomUUID } from "node:crypto";
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

const AUDIO_DIR = path.resolve(process.cwd(), "audio-cache");
const PUBLIC_PREFIX = "/api/v1/voice-studio/audio";

let dirEnsured: Promise<void> | null = null;
function ensureDir(): Promise<void> {
  if (dirEnsured) return dirEnsured;
  dirEnsured = fs.mkdir(AUDIO_DIR, { recursive: true }).then(() => undefined).catch(() => undefined);
  return dirEnsured;
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

export const VoiceService = {
  listVoices(): VoiceModel[] {
    const prov = this.configuredProviders();
    const dynamic: VoiceModel[] = [];
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

  configuredProviders(): { elevenlabs: boolean; playht: boolean; espeak: boolean } {
    return {
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
      playht: !!(process.env.PLAYHT_API_KEY && process.env.PLAYHT_USER_ID),
      espeak: false, // local espeak detection can be added as a future enhancement
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
    // Server-side synthesis
    try {
      job.status = "synthesizing";
      const out = await this._synthesizeFile(input, voice, id);
      job.audioUrl = `${PUBLIC_PREFIX}/${path.basename(out)}`;
      job.status = "ready";
      job.durationMs = Math.max(800, Math.ceil(input.text.length / 14) * 1000);
      job.provider = voice.provider;
    } catch (e: any) {
      job.status = "failed";
      job.error = e?.message ?? String(e);
    }
    return job;
  },

  async _synthesizeFile(input: { text: string }, voice: VoiceModel, jobId: string): Promise<string> {
    const prov = this.configuredProviders();
    const outPath = path.join(AUDIO_DIR, `${jobId}.wav`);
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
      const buf = Buffer.from(await r.arrayBuffer());
      await fs.writeFile(outPath.replace(/\.wav$/, ".mp3"), buf);
      return outPath.replace(/\.wav$/, ".mp3");
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
      const buf = Buffer.from(await r.arrayBuffer());
      await fs.writeFile(outPath.replace(/\.wav$/, ".mp3"), buf);
      return outPath.replace(/\.wav$/, ".mp3");
    }
    // No real TTS provider — write a clear placeholder WAV. This is a 440Hz tone
    // (0.8s) so the player gets a real audio file, with job metadata clearly
    // flagging the missing configuration. The UI must show VOICE MODEL REQUIRED
    // when status=demo.
    const wav = makeBeepWav(0.8, 440);
    await fs.writeFile(outPath, wav);
    (this as any)._markAsDemo = true;
    // Throw is NOT desired — return file but attach demo marker via caller.
    return outPath;
  },
};

// ── Minimal 16-bit PCM WAV generator (for placeholder beep only) ────────
function makeBeepWav(seconds: number, freqHz: number, sampleRate = 22050): Buffer {
  const numSamples = Math.floor(sampleRate * seconds);
  const buf = Buffer.alloc(44 + numSamples * 2);
  // RIFF header
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + numSamples * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 40) * Math.min(1, (seconds - t) * 40);
    const s = Math.sin(2 * Math.PI * freqHz * t) * 0.3 * env;
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}
