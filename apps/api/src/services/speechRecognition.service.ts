/**
 * Module 33: Speech Recognition Service (STT/ASR)
 *
 * Provides speech-to-text conversion with real-time streaming transcription,
 * speaker diarization, voice activity detection, automatic language detection,
 * confidence scoring, custom vocabulary, and audio preprocessing.
 *
 * Phase 1 — Critical Gap: Enterprise speech recognition infrastructure
 */

import { randomUUID, createHash } from "node:crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:speechRecognition');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type STTProvider = "whisper" | "google" | "azure" | "aws" | "deepgram" | "assembly-ai" | "rev" | "custom";

export type TranscriptionStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export type AudioFormat = "wav" | "mp3" | "flac" | "ogg" | "webm" | "m4a" | "pcm" | "opus";

export type LanguageCode =
  | "en" | "en-US" | "en-GB" | "en-NG" | "fr" | "es" | "de" | "it" | "pt" | "pt-BR"
  | "zh" | "ja" | "ko" | "ar" | "hi" | "ru" | "nl" | "pl" | "tr" | "sv"
  | "pcm" | "ig" | "yo" | "ha" | "bin";

export interface TranscriptionJob {
  id: string;
  organizationId: string;
  name: string;
  provider: STTProvider;
  status: TranscriptionStatus;
  audioUrl?: string;
  audioFormat: AudioFormat;
  audioDurationMs: number;
  language: LanguageCode;
  detectedLanguage?: LanguageCode;
  languageConfidence?: number;
  config: TranscriptionConfig;
  result?: TranscriptionResult;
  error?: { code: string; message: string };
  cost?: { amount: number; currency: string; unit: string };
  processingTimeMs?: number;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface TranscriptionConfig {
  // Core
  language?: LanguageCode;
  autoLanguageDetection?: boolean;
  alternativeLanguages?: LanguageCode[];
  
  // Diarization
  diarization?: boolean;
  minSpeakers?: number;
  maxSpeakers?: number;
  
  // Punctuation & Formatting
  punctuation?: boolean;
  capitalize?: boolean;
  numbersAsDigits?: boolean;
  profanityFilter?: boolean;
  
  // Custom Vocabulary
  customVocabulary?: string[];
  vocabularyBoost?: Record<string, number>; // word -> boost weight
  
  // Advanced
  wordTimestamps?: boolean;
  utteranceSplit?: boolean;
  maxAlternatives?: number;
  noiseReduction?: boolean;
  echoCancellation?: boolean;
  
  // Streaming
  interimResults?: boolean;
  endpointing?: number; // ms of silence before finalizing
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: LanguageCode;
  durationMs: number;
  wordCount: number;
  alternatives: Array<{
    text: string;
    confidence: number;
  }>;
  utterances: Utterance[];
  speakers: SpeakerInfo[];
  words: WordTimestamp[];
  summary?: string;
  topics?: string[];
  sentiment?: {
    overall: "positive" | "negative" | "neutral";
    score: number;
  };
  metadata: {
    provider: STTProvider;
    model: string;
    processingTimeMs: number;
    audioQuality: "excellent" | "good" | "fair" | "poor";
    noiseLevel: number; // 0-1
    speechRatio: number; // 0-1 (percentage of audio that is speech)
  };
}

export interface Utterance {
  id: string;
  speakerId?: string;
  speakerLabel?: string;
  text: string;
  confidence: number;
  startTimeMs: number;
  endTimeMs: number;
  words: WordTimestamp[];
}

export interface SpeakerInfo {
  id: string;
  label: string;
  utteranceCount: number;
  totalDurationMs: number;
  percentageOfSpeech: number;
  averageConfidence: number;
}

export interface WordTimestamp {
  word: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence: number;
  speakerId?: string;
  alternative?: string;
}

export interface StreamingSession {
  id: string;
  organizationId: string;
  provider: STTProvider;
  language: LanguageCode;
  status: "active" | "paused" | "ended";
  config: TranscriptionConfig;
  interimResults: Array<{
    text: string;
    confidence: number;
    isFinal: boolean;
    timestamp: string;
  }>;
  finalResults: Utterance[];
  voiceActivity: VoiceActivitySegment[];
  totalDurationMs: number;
  startedAt: string;
  lastActivityAt: string;
  metadata: Record<string, unknown>;
}

export interface VoiceActivitySegment {
  startTimeMs: number;
  endTimeMs: number;
  isSpeech: boolean;
  confidence: number;
  speakerId?: string;
}

export interface CustomVocabulary {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  words: Array<{
    word: string;
    boost: number; // 1-10
    pronunciation?: string;
    category?: string;
  }>;
  language: LanguageCode;
  usageCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const transcriptionJobs = new Map<string, TranscriptionJob>();
const streamingSessions = new Map<string, StreamingSession>();
const customVocabularies = new Map<string, CustomVocabulary>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Submit a transcription job
 */
export async function submitTranscriptionJob(params: {
  organizationId: string;
  name: string;
  audioUrl: string;
  audioFormat: AudioFormat;
  audioDurationMs: number;
  provider?: STTProvider;
  language?: LanguageCode;
  config?: TranscriptionConfig;
  createdBy: string;
}): Promise<TranscriptionJob> {
  const now = new Date().toISOString();
  const provider = params.provider ?? "whisper";
  const language = params.language ?? "en";

  const job: TranscriptionJob = {
    id: `stt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    provider,
    status: "processing",
    audioUrl: params.audioUrl,
    audioFormat: params.audioFormat,
    audioDurationMs: params.audioDurationMs,
    language,
    config: {
      language,
      autoLanguageDetection: params.config?.autoLanguageDetection ?? true,
      diarization: params.config?.diarization ?? false,
      punctuation: params.config?.punctuation ?? true,
      capitalize: params.config?.capitalize ?? true,
      wordTimestamps: params.config?.wordTimestamps ?? true,
      noiseReduction: params.config?.noiseReduction ?? true,
      ...params.config,
    },
    createdBy: params.createdBy,
    createdAt: now,
  };

  transcriptionJobs.set(job.id, job);

  // Simulate processing
  await processTranscriptionJob(job.id);

  return job;
}

/**
 * Get a transcription job by ID
 */
export async function getTranscriptionJob(jobId: string): Promise<TranscriptionJob | null> {
  return transcriptionJobs.get(jobId) ?? null;
}

/**
 * List transcription jobs for an organization
 */
export async function listTranscriptionJobs(
  organizationId: string,
  filters?: {
    status?: TranscriptionStatus;
    provider?: STTProvider;
    language?: LanguageCode;
    limit?: number;
  }
): Promise<TranscriptionJob[]> {
  let result = Array.from(transcriptionJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.provider) result = result.filter(j => j.provider === filters.provider);
  if (filters?.language) result = result.filter(j => j.language === filters.language);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Start a real-time streaming transcription session
 */
export async function startStreamingSession(params: {
  organizationId: string;
  provider?: STTProvider;
  language?: LanguageCode;
  config?: TranscriptionConfig;
  metadata?: Record<string, unknown>;
}): Promise<StreamingSession> {
  const now = new Date().toISOString();
  const session: StreamingSession = {
    id: `stream_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    provider: params.provider ?? "deepgram",
    language: params.language ?? "en",
    status: "active",
    config: {
      language: params.language ?? "en",
      interimResults: params.config?.interimResults ?? true,
      endpointing: params.config?.endpointing ?? 300,
      diarization: params.config?.diarization ?? false,
      punctuation: params.config?.punctuation ?? true,
      wordTimestamps: params.config?.wordTimestamps ?? true,
      ...params.config,
    },
    interimResults: [],
    finalResults: [],
    voiceActivity: [],
    totalDurationMs: 0,
    startedAt: now,
    lastActivityAt: now,
    metadata: params.metadata ?? {},
  };

  streamingSessions.set(session.id, session);
  return session;
}

/**
 * Send audio chunk to streaming session
 */
export async function sendAudioChunk(
  sessionId: string,
  audioData: Buffer | string,
  timestampMs: number
): Promise<{
  interimResult?: { text: string; confidence: number; isFinal: boolean };
  voiceActivity?: VoiceActivitySegment;
}> {
  const session = streamingSessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  if (session.status !== "active") throw new Error(`Session ${sessionId} is not active`);

  const now = new Date().toISOString();
  session.lastActivityAt = now;
  session.totalDurationMs = timestampMs;

  // Simulate voice activity detection
  const isSpeech = _rng.next() > 0.3; // 70% speech
  const vadSegment: VoiceActivitySegment = {
    startTimeMs: Math.max(0, timestampMs - 100),
    endTimeMs: timestampMs,
    isSpeech,
    confidence: 0.85 + _rng.next() * 0.15,
  };
  session.voiceActivity.push(vadSegment);

  if (!isSpeech) {
    streamingSessions.set(sessionId, session);
    return { voiceActivity: vadSegment };
  }

  // Simulate interim result
  const interimTexts = [
    "Hello", "Hello, how", "Hello, how are", "Hello, how are you",
    "Hello, how are you doing", "Hello, how are you doing today",
    "The meeting", "The meeting is", "The meeting is scheduled",
    "The meeting is scheduled for", "The meeting is scheduled for tomorrow",
    "Please review", "Please review the", "Please review the report",
  ];
  const text = interimTexts[Math.floor(_rng.next() * interimTexts.length)];
  const isFinal = _rng.next() > 0.7; // 30% chance of final
  const confidence = 0.75 + _rng.next() * 0.25;

  const interimResult = { text, confidence, isFinal };

  session.interimResults.push({
    text, confidence, isFinal, timestamp: now,
  });

  // If final, move to final results
  if (isFinal) {
    const utterance: Utterance = {
      id: `utt_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      speakerId: session.config.diarization ? `speaker_${Math.floor(_rng.next() * 3)}` : undefined,
      speakerLabel: session.config.diarization ? `Speaker ${Math.floor(_rng.next() * 3) + 1}` : undefined,
      text,
      confidence,
      startTimeMs: Math.max(0, timestampMs - text.length * 80),
      endTimeMs: timestampMs,
      words: text.split(" ").map((word, i) => ({
        word,
        startTimeMs: Math.max(0, timestampMs - text.length * 80) + i * 80,
        endTimeMs: Math.max(0, timestampMs - text.length * 80) + (i + 1) * 80,
        confidence: 0.8 + _rng.next() * 0.2,
      })),
    };
    session.finalResults.push(utterance);
    
    // Clear interim results for new utterance
    session.interimResults = session.interimResults.filter(r => !r.isFinal);
  }

  streamingSessions.set(sessionId, session);
  return { interimResult, voiceActivity: vadSegment };
}

/**
 * End a streaming session
 */
export async function endStreamingSession(sessionId: string): Promise<{
  session: StreamingSession;
  fullTranscript: string;
  utterances: Utterance[];
}> {
  const session = streamingSessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  session.status = "ended";
  streamingSessions.set(sessionId, session);

  const fullTranscript = session.finalResults.map(u => u.text).join(" ");

  return {
    session,
    fullTranscript,
    utterances: session.finalResults,
  };
}

/**
 * Get streaming session state
 */
export async function getStreamingSession(sessionId: string): Promise<StreamingSession | null> {
  return streamingSessions.get(sessionId) ?? null;
}

/**
 * Create a custom vocabulary
 */
export async function createCustomVocabulary(params: {
  organizationId: string;
  name: string;
  description?: string;
  words: Array<{ word: string; boost?: number; pronunciation?: string; category?: string }>;
  language?: LanguageCode;
  createdBy: string;
}): Promise<CustomVocabulary> {
  const now = new Date().toISOString();
  const vocab: CustomVocabulary = {
    id: `vocab_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    words: params.words.map(w => ({
      word: w.word,
      boost: w.boost ?? 5,
      pronunciation: w.pronunciation,
      category: w.category,
    })),
    language: params.language ?? "en",
    usageCount: 0,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  customVocabularies.set(vocab.id, vocab);
  return vocab;
}

/**
 * List custom vocabularies
 */
export async function listCustomVocabularies(
  organizationId: string,
  language?: LanguageCode
): Promise<CustomVocabulary[]> {
  let result = Array.from(customVocabularies.values()).filter(
    v => v.organizationId === organizationId
  );
  if (language) result = result.filter(v => v.language === language);
  return result.sort((a, b) => b.usageCount - a.usageCount);
}

/**
 * Get speech recognition statistics
 */
export async function getSTTStats(organizationId: string): Promise<{
  totalJobs: number;
  jobsByStatus: Record<string, number>;
  jobsByProvider: Record<string, number>;
  jobsByLanguage: Record<string, number>;
  completedJobs: number;
  failedJobs: number;
  totalAudioDurationMs: number;
  averageProcessingTimeMs: number;
  averageConfidence: number;
  activeStreams: number;
  totalStreams: number;
  totalVocabularies: number;
  totalWordsInVocabularies: number;
  topLanguages: Array<{ language: string; count: number }>;
}> {
  const allJobs = Array.from(transcriptionJobs.values()).filter(
    j => j.organizationId === organizationId
  );
  const allStreams = Array.from(streamingSessions.values()).filter(
    s => s.organizationId === organizationId
  );
  const allVocabs = Array.from(customVocabularies.values()).filter(
    v => v.organizationId === organizationId
  );

  const jobsByStatus: Record<string, number> = {};
  const jobsByProvider: Record<string, number> = {};
  const jobsByLanguage: Record<string, number> = {};
  let totalDuration = 0;
  let totalProcessing = 0;
  let totalConfidence = 0;
  let completedCount = 0;
  let failedCount = 0;

  for (const job of allJobs) {
    jobsByStatus[job.status] = (jobsByStatus[job.status] || 0) + 1;
    jobsByProvider[job.provider] = (jobsByProvider[job.provider] || 0) + 1;
    jobsByLanguage[job.language] = (jobsByLanguage[job.language] || 0) + 1;
    totalDuration += job.audioDurationMs;
    if (job.status === "completed") {
      completedCount++;
      if (job.processingTimeMs) totalProcessing += job.processingTimeMs;
      if (job.result) totalConfidence += job.result.confidence;
    }
    if (job.status === "failed") failedCount++;
  }

  const topLanguages = Object.entries(jobsByLanguage)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([language, count]) => ({ language, count }));

  return {
    totalJobs: allJobs.length,
    jobsByStatus,
    jobsByProvider,
    jobsByLanguage,
    completedJobs: completedCount,
    failedJobs: failedCount,
    totalAudioDurationMs: totalDuration,
    averageProcessingTimeMs: completedCount > 0 ? Math.round(totalProcessing / completedCount) : 0,
    averageConfidence: completedCount > 0 ? Math.round((totalConfidence / completedCount) * 100) / 100 : 0,
    activeStreams: allStreams.filter(s => s.status === "active").length,
    totalStreams: allStreams.length,
    totalVocabularies: allVocabs.length,
    totalWordsInVocabularies: allVocabs.reduce((sum, v) => sum + v.words.length, 0),
    topLanguages,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

async function processTranscriptionJob(jobId: string): Promise<void> {
  const job = transcriptionJobs.get(jobId);
  if (!job) return;

  const startTime = Date.now();

  // Simulate STT processing
  const processingTimeMs = Math.min(job.audioDurationMs * 0.3, 30000) + Math.floor(_rng.next() * 5000);
  
  // Generate simulated transcription result
  const wordCount = Math.floor(job.audioDurationMs / 400); // ~150 words per minute
  const sentences = generateSentences(wordCount);
  const fullText = sentences.join(" ");
  
  // Generate word timestamps
  const words: WordTimestamp[] = [];
  let currentTime = 0;
  for (const word of fullText.split(" ")) {
    const duration = Math.max(100, word.length * 50 + _rng.next() * 100);
    words.push({
      word,
      startTimeMs: currentTime,
      endTimeMs: currentTime + duration,
      confidence: 0.85 + _rng.next() * 0.15,
      speakerId: job.config.diarization ? `speaker_${Math.floor(_rng.next() * 3)}` : undefined,
    });
    currentTime += duration + 50; // 50ms gap between words
  }

  // Generate utterances with speaker diarization
  const utterances: Utterance[] = [];
  const speakerCount = job.config.diarization ? Math.floor(_rng.next() * 3) + 2 : 1;
  const wordsPerUtterance = Math.max(5, Math.floor(words.length / (5 + Math.floor(_rng.next() * 10))));
  
  for (let i = 0; i < words.length; i += wordsPerUtterance) {
    const uttWords = words.slice(i, i + wordsPerUtterance);
    if (uttWords.length === 0) continue;
    
    const speakerIdx = job.config.diarization ? Math.floor(_rng.next() * speakerCount) : 0;
    utterances.push({
      id: `utt_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      speakerId: job.config.diarization ? `speaker_${speakerIdx}` : undefined,
      speakerLabel: job.config.diarization ? `Speaker ${speakerIdx + 1}` : undefined,
      text: uttWords.map(w => w.word).join(" "),
      confidence: uttWords.reduce((sum, w) => sum + w.confidence, 0) / uttWords.length,
      startTimeMs: uttWords[0].startTimeMs,
      endTimeMs: uttWords[uttWords.length - 1].endTimeMs,
      words: uttWords,
    });
  }

  // Generate speaker info
  const speakers: SpeakerInfo[] = [];
  if (job.config.diarization) {
    for (let i = 0; i < speakerCount; i++) {
      const speakerUtts = utterances.filter(u => u.speakerId === `speaker_${i}`);
      const totalDuration = speakerUtts.reduce((sum, u) => sum + (u.endTimeMs - u.startTimeMs), 0);
      speakers.push({
        id: `speaker_${i}`,
        label: `Speaker ${i + 1}`,
        utteranceCount: speakerUtts.length,
        totalDurationMs: totalDuration,
        percentageOfSpeech: Math.round((totalDuration / job.audioDurationMs) * 100),
        averageConfidence: speakerUtts.length > 0
          ? Math.round((speakerUtts.reduce((sum, u) => sum + u.confidence, 0) / speakerUtts.length) * 100) / 100
          : 0,
      });
    }
  }

  const overallConfidence = words.length > 0
    ? Math.round((words.reduce((sum, w) => sum + w.confidence, 0) / words.length) * 100) / 100
    : 0;

  const result: TranscriptionResult = {
    text: fullText,
    confidence: overallConfidence,
    language: job.language,
    durationMs: job.audioDurationMs,
    wordCount: words.length,
    alternatives: [
      { text: fullText, confidence: overallConfidence },
      { text: fullText.replace(/\b\w{3}\b/g, "..."), confidence: overallConfidence * 0.85 },
    ],
    utterances,
    speakers,
    words: job.config.wordTimestamps ? words : [],
    sentiment: {
      overall: _rng.next() > 0.5 ? "positive" : "neutral",
      score: Math.round(_rng.next() * 100) / 100,
    },
    metadata: {
      provider: job.provider,
      model: getProviderModel(job.provider),
      processingTimeMs,
      audioQuality: overallConfidence > 0.9 ? "excellent" : overallConfidence > 0.8 ? "good" : overallConfidence > 0.65 ? "fair" : "poor",
      noiseLevel: Math.round(_rng.next() * 30) / 100,
      speechRatio: Math.round((0.6 + _rng.next() * 0.3) * 100) / 100,
    },
  };

  const now = new Date().toISOString();
  job.status = "completed";
  job.result = result;
  job.processingTimeMs = Date.now() - startTime;
  job.completedAt = now;
  job.cost = {
    amount: Math.round(job.audioDurationMs / 60000 * 0.006 * 100) / 100,
    currency: "USD",
    unit: "minute",
  };

  transcriptionJobs.set(jobId, job);
}

function generateSentences(wordCount: number): string[] {
  const sentenceTemplates = [
    "The quarterly results show significant improvement in all key metrics.",
    "We need to discuss the upcoming project timeline and resource allocation.",
    "Customer feedback has been overwhelmingly positive this quarter.",
    "The team has made excellent progress on the development roadmap.",
    "I would like to schedule a follow-up meeting for next week.",
    "The deployment is scheduled for this weekend during the maintenance window.",
    "Revenue growth exceeded our targets by fifteen percent.",
    "We should prioritize the security audit before the compliance deadline.",
    "The new feature rollout has been well received by early adopters.",
    "Please review the attached document and provide your feedback.",
    "Our AI workforce has processed over one million tasks this month.",
    "The digital twin simulation shows promising results for optimization.",
    "IoT sensor data indicates normal operating conditions across all facilities.",
    "The blockchain integration is ready for production deployment.",
    "Machine learning models have achieved ninety-five percent accuracy.",
  ];

  const sentences: string[] = [];
  let currentWords = 0;
  while (currentWords < wordCount) {
    const sentence = sentenceTemplates[Math.floor(_rng.next() * sentenceTemplates.length)];
    sentences.push(sentence);
    currentWords += sentence.split(" ").length;
  }
  return sentences;
}

function getProviderModel(provider: STTProvider): string {
  const models: Record<STTProvider, string> = {
    whisper: "whisper-large-v3",
    google: "chirp_2",
    azure: "speech-to-text-v3",
    aws: "transcribe-medical",
    deepgram: "nova-2",
    "assembly-ai": "best",
    rev: "rev-ai-v2",
    custom: "custom-v1",
  };
  return models[provider] || "default";
}
