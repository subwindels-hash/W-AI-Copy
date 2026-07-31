/**
 * Module 36: Text Analysis & Understanding Service
 *
 * Provides sentiment analysis, named entity recognition (NER), text classification,
 * summarization, keyword extraction, text similarity, language detection, and
 * comprehensive text preprocessing capabilities.
 *
 * Phase 1 — Critical Gap: Enterprise NLP text understanding infrastructure
 */

import { randomUUID, createHash } from "node:crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:textAnalysisUnderstanding');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type NLPProvider = "openai" | "google" | "aws" | "azure" | "huggingface" | "spacy" | "custom";

export type SentimentLabel = "positive" | "negative" | "neutral" | "mixed";

export type EntityType =
  | "person" | "organization" | "location" | "date" | "time" | "money"
  | "percent" | "product" | "event" | "work_of_art" | "law" | "language"
  | "nationality" | "religious_group" | "political_group" | "custom";

export type TextClassificationCategory =
  | "topic" | "intent" | "spam" | "toxicity" | "emotion" | "genre" | "custom";

export type SummarizationType = "extractive" | "abstractive";

export type AnalysisStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface TextAnalysisJob {
  id: string;
  organizationId: string;
  name: string;
  provider: NLPProvider;
  status: AnalysisStatus;
  text: string;
  textHash?: string;
  language?: string;
  analysisTypes: TextAnalysisType[];
  config: AnalysisConfig;
  result?: TextAnalysisResult;
  error?: { code: string; message: string };
  processingTimeMs?: number;
  cost?: { amount: number; currency: string; unit: string };
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export type TextAnalysisType =
  | "sentiment"
  | "ner"
  | "classification"
  | "summarization"
  | "keywords"
  | "similarity"
  | "language-detection"
  | "readability"
  | "preprocessing"
  | "full-analysis";

export interface AnalysisConfig {
  // Sentiment
  sentiment?: {
    granularity: "document" | "sentence" | "aspect";
    includeConfidence: boolean;
  };
  
  // NER
  ner?: {
    entityTypes?: EntityType[];
    minConfidence: number;
    includeContext: boolean;
  };
  
  // Classification
  classification?: {
    categories: string[];
    topK: number;
    multiLabel: boolean;
  };
  
  // Summarization
  summarization?: {
    type: SummarizationType;
    maxLength?: number;
    maxSentences?: number;
    ratio?: number; // 0-1 for extractive
  };
  
  // Keywords
  keywords?: {
    topK: number;
    includeKeyphrases: boolean;
    minFrequency: number;
  };
  
  // Similarity
  similarity?: {
    comparisonTexts: string[];
    method: "cosine" | "jaccard" | "semantic";
  };
  
  // General
  language?: string;
  cacheResults?: boolean;
}

export interface TextAnalysisResult {
  // Metadata
  metadata: {
    textLength: number;
    wordCount: number;
    sentenceCount: number;
    language: string;
    languageConfidence: number;
    readabilityScore: number;
    readingTimeMs: number;
  };
  
  // Sentiment
  sentiment?: SentimentResult;
  
  // Named entities
  entities: NamedEntity[];
  
  // Classification
  classifications: TextClassification[];
  
  // Summary
  summary?: TextSummary;
  
  // Keywords
  keywords: Keyword[];
  keyphrases: Keyphrase[];
  
  // Similarity
  similarities?: TextSimilarity[];
  
  // Preprocessing
  preprocessed?: PreprocessedText;
  
  // Embeddings
  embedding?: number[];
  
  // Overall metadata
  analysisMetadata: {
    provider: NLPProvider;
    model: string;
    processingTimeMs: number;
    analysisTypes: TextAnalysisType[];
  };
}

export interface SentimentResult {
  overall: SentimentLabel;
  score: number; // -1 to 1
  confidence: number;
  sentenceSentiments: Array<{
    text: string;
    sentiment: SentimentLabel;
    score: number;
    confidence: number;
    offset: number;
  }>;
  aspectSentiments?: Array<{
    aspect: string;
    sentiment: SentimentLabel;
    score: number;
    confidence: number;
  }>;
}

export interface NamedEntity {
  text: string;
  type: EntityType;
  subtype?: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
  normalizedValue?: string;
  context?: string;
  metadata?: Record<string, unknown>;
}

export interface TextClassification {
  category: TextClassificationCategory;
  label: string;
  confidence: number;
  hierarchy?: string[];
}

export interface TextSummary {
  text: string;
  type: SummarizationType;
  originalLength: number;
  summaryLength: number;
  compressionRatio: number;
  keySentences?: Array<{
    text: string;
    score: number;
    index: number;
  }>;
}

export interface Keyword {
  word: string;
  frequency: number;
  relevance: number;
  tfidf?: number;
}

export interface Keyphrase {
  phrase: string;
  frequency: number;
  relevance: number;
  words: string[];
}

export interface TextSimilarity {
  comparisonText: string;
  similarityScore: number;
  method: string;
}

export interface PreprocessedText {
  tokens: string[];
  sentences: string[];
  lemmas: string[];
  stems: string[];
  stopWordsRemoved: string[];
  normalized: string;
}

export interface TextEmbedding {
  id: string;
  organizationId: string;
  text: string;
  textHash: string;
  embedding: number[];
  dimensions: number;
  model: string;
  provider: NLPProvider;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const analysisJobs = new Map<string, TextAnalysisJob>();
const textEmbeddings = new Map<string, TextEmbedding>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Submit a text analysis job
 */
export async function submitTextAnalysisJob(params: {
  organizationId: string;
  name: string;
  text: string;
  provider?: NLPProvider;
  language?: string;
  analysisTypes?: TextAnalysisType[];
  config?: AnalysisConfig;
  createdBy: string;
}): Promise<TextAnalysisJob> {
  const now = new Date().toISOString();
  const textHash = createHash("sha256").update(params.text).digest("hex");

  const job: TextAnalysisJob = {
    id: `nlp_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    provider: params.provider ?? "openai",
    status: "processing",
    text: params.text,
    textHash,
    language: params.language,
    analysisTypes: params.analysisTypes ?? ["full-analysis"],
    config: {
      sentiment: {
        granularity: "document",
        includeConfidence: true,
        ...params.config?.sentiment,
      },
      ner: {
        minConfidence: 0.7,
        includeContext: true,
        ...params.config?.ner,
      },
      classification: {
        categories: ["topic", "intent"],
        topK: 5,
        multiLabel: true,
        ...params.config?.classification,
      },
      summarization: {
        type: "extractive",
        ratio: 0.3,
        ...params.config?.summarization,
      },
      keywords: {
        topK: 10,
        includeKeyphrases: true,
        minFrequency: 1,
        ...params.config?.keywords,
      },
      language: params.language ?? "en",
      cacheResults: params.config?.cacheResults ?? true,
      ...params.config,
    },
    createdBy: params.createdBy,
    createdAt: now,
  };

  analysisJobs.set(job.id, job);

  // Simulate processing
  await processTextAnalysis(job.id);

  return job;
}

/**
 * Get a text analysis job by ID
 */
export async function getTextAnalysisJob(jobId: string): Promise<TextAnalysisJob | null> {
  return analysisJobs.get(jobId) ?? null;
}

/**
 * List text analysis jobs for an organization
 */
export async function listTextAnalysisJobs(
  organizationId: string,
  filters?: {
    status?: AnalysisStatus;
    provider?: NLPProvider;
    language?: string;
    limit?: number;
  }
): Promise<TextAnalysisJob[]> {
  let result = Array.from(analysisJobs.values()).filter(
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
 * Analyze sentiment of text (convenience method)
 */
export async function analyzeSentiment(
  text: string,
  config?: AnalysisConfig["sentiment"]
): Promise<SentimentResult | null> {
  const job = await submitTextAnalysisJob({
    organizationId: "default",
    name: "Sentiment Analysis",
    text,
    analysisTypes: ["sentiment"],
    config: { sentiment: config },
    createdBy: "system",
  });

  return job.result?.sentiment ?? null;
}

/**
 * Extract named entities from text (convenience method)
 */
export async function extractEntities(
  text: string,
  config?: AnalysisConfig["ner"]
): Promise<NamedEntity[]> {
  const job = await submitTextAnalysisJob({
    organizationId: "default",
    name: "Entity Extraction",
    text,
    analysisTypes: ["ner"],
    config: { ner: config },
    createdBy: "system",
  });

  return job.result?.entities ?? [];
}

/**
 * Classify text (convenience method)
 */
export async function classifyText(
  text: string,
  categories: string[],
  config?: AnalysisConfig["classification"]
): Promise<TextClassification[]> {
  const job = await submitTextAnalysisJob({
    organizationId: "default",
    name: "Text Classification",
    text,
    analysisTypes: ["classification"],
    config: {
      classification: {
        categories,
        topK: config?.topK ?? 5,
        multiLabel: config?.multiLabel ?? false,
      }
    },
    createdBy: "system",
  });

  return job.result?.classifications ?? [];
}

/**
 * Summarize text (convenience method)
 */
export async function summarizeText(
  text: string,
  config?: AnalysisConfig["summarization"]
): Promise<TextSummary | null> {
  const job = await submitTextAnalysisJob({
    organizationId: "default",
    name: "Text Summarization",
    text,
    analysisTypes: ["summarization"],
    config: { summarization: config },
    createdBy: "system",
  });

  return job.result?.summary ?? null;
}

/**
 * Extract keywords from text (convenience method)
 */
export async function extractKeywords(
  text: string,
  config?: AnalysisConfig["keywords"]
): Promise<{ keywords: Keyword[]; keyphrases: Keyphrase[] }> {
  const job = await submitTextAnalysisJob({
    organizationId: "default",
    name: "Keyword Extraction",
    text,
    analysisTypes: ["keywords"],
    config: { keywords: config },
    createdBy: "system",
  });

  return {
    keywords: job.result?.keywords ?? [],
    keyphrases: job.result?.keyphrases ?? [],
  };
}

/**
 * Generate text embedding
 */
export async function generateEmbedding(
  text: string,
  organizationId: string,
  metadata?: Record<string, unknown>
): Promise<TextEmbedding> {
  const textHash = createHash("sha256").update(text).digest("hex");
  const embedding = generateSimulatedEmbedding();

  const textEmbedding: TextEmbedding = {
    id: `emb_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId,
    text,
    textHash,
    embedding,
    dimensions: embedding.length,
    model: "text-embedding-3-large",
    provider: "openai",
    metadata: metadata ?? {},
    createdAt: new Date().toISOString(),
  };

  textEmbeddings.set(textEmbedding.id, textEmbedding);
  return textEmbedding;
}

/**
 * Find similar texts using embeddings
 */
export async function findSimilarTexts(
  queryText: string,
  organizationId: string,
  limit: number = 10,
  threshold: number = 0.7
): Promise<Array<{ embedding: TextEmbedding; similarity: number }>> {
  const queryEmbedding = await generateEmbedding(queryText, organizationId);
  const results: Array<{ embedding: TextEmbedding; similarity: number }> = [];

  for (const [, stored] of textEmbeddings) {
    if (stored.organizationId !== organizationId) continue;
    if (stored.id === queryEmbedding.id) continue;

    const similarity = cosineSimilarity(queryEmbedding.embedding, stored.embedding);
    if (similarity >= threshold) {
      results.push({ embedding: stored, similarity });
    }
  }

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * Get text analysis statistics
 */
export async function getTextAnalysisStats(organizationId: string): Promise<{
  totalJobs: number;
  jobsByStatus: Record<string, number>;
  jobsByProvider: Record<string, number>;
  jobsByAnalysisType: Record<string, number>;
  jobsByLanguage: Record<string, number>;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTimeMs: number;
  totalEntitiesExtracted: number;
  totalWordsAnalyzed: number;
  sentimentDistribution: Record<string, number>;
  topEntityTypes: Array<{ type: string; count: number }>;
  totalEmbeddings: number;
}> {
  const allJobs = Array.from(analysisJobs.values()).filter(
    j => j.organizationId === organizationId
  );
  const allEmbeddings = Array.from(textEmbeddings.values()).filter(
    e => e.organizationId === organizationId
  );

  const jobsByStatus: Record<string, number> = {};
  const jobsByProvider: Record<string, number> = {};
  const jobsByAnalysisType: Record<string, number> = {};
  const jobsByLanguage: Record<string, number> = {};
  const sentimentDistribution: Record<string, number> = {};
  const entityTypes: Record<string, number> = {};
  let totalProcessing = 0;
  let completedCount = 0;
  let failedCount = 0;
  let totalEntities = 0;
  let totalWords = 0;

  for (const job of allJobs) {
    jobsByStatus[job.status] = (jobsByStatus[job.status] || 0) + 1;
    jobsByProvider[job.provider] = (jobsByProvider[job.provider] || 0) + 1;
    if (job.language) {
      jobsByLanguage[job.language] = (jobsByLanguage[job.language] || 0) + 1;
    }
    for (const type of job.analysisTypes) {
      jobsByAnalysisType[type] = (jobsByAnalysisType[type] || 0) + 1;
    }
    if (job.status === "completed") {
      completedCount++;
      if (job.processingTimeMs) totalProcessing += job.processingTimeMs;
      if (job.result) {
        totalEntities += job.result.entities.length;
        totalWords += job.result.metadata.wordCount;
        if (job.result.sentiment) {
          sentimentDistribution[job.result.sentiment.overall] =
            (sentimentDistribution[job.result.sentiment.overall] || 0) + 1;
        }
        for (const entity of job.result.entities) {
          entityTypes[entity.type] = (entityTypes[entity.type] || 0) + 1;
        }
      }
    }
    if (job.status === "failed") failedCount++;
  }

  const topEntityTypes = Object.entries(entityTypes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([type, count]) => ({ type, count }));

  return {
    totalJobs: allJobs.length,
    jobsByStatus,
    jobsByProvider,
    jobsByAnalysisType,
    jobsByLanguage,
    completedJobs: completedCount,
    failedJobs: failedCount,
    averageProcessingTimeMs: completedCount > 0 ? Math.round(totalProcessing / completedCount) : 0,
    totalEntitiesExtracted: totalEntities,
    totalWordsAnalyzed: totalWords,
    sentimentDistribution,
    topEntityTypes,
    totalEmbeddings: allEmbeddings.length,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

async function processTextAnalysis(jobId: string): Promise<void> {
  const job = analysisJobs.get(jobId);
  if (!job) return;

  const startTime = Date.now();
  const processingTimeMs = 200 + Math.floor(_rng.next() * 1500);

  // Generate simulated results based on analysis types
  const result: TextAnalysisResult = {
    metadata: {
      textLength: job.text.length,
      wordCount: job.text.split(/\s+/).length,
      sentenceCount: job.text.split(/[.!?]+/).length,
      language: job.language ?? "en",
      languageConfidence: 0.95 + _rng.next() * 0.05,
      readabilityScore: 50 + _rng.next() * 50,
      readingTimeMs: job.text.split(/\s+/).length * 250, // ~250ms per word
    },
    sentiment: job.analysisTypes.includes("sentiment") || job.analysisTypes.includes("full-analysis")
      ? generateSentimentResult(job.text, job.config.sentiment)
      : undefined,
    entities: job.analysisTypes.includes("ner") || job.analysisTypes.includes("full-analysis")
      ? generateNamedEntities(job.text, job.config.ner)
      : [],
    classifications: job.analysisTypes.includes("classification") || job.analysisTypes.includes("full-analysis")
      ? generateClassifications(job.config.classification)
      : [],
    summary: job.analysisTypes.includes("summarization") || job.analysisTypes.includes("full-analysis")
      ? generateSummary(job.text, job.config.summarization)
      : undefined,
    keywords: job.analysisTypes.includes("keywords") || job.analysisTypes.includes("full-analysis")
      ? generateKeywords(job.text, job.config.keywords)
      : [],
    keyphrases: job.analysisTypes.includes("keywords") || job.analysisTypes.includes("full-analysis")
      ? generateKeyphrases(job.text, job.config.keywords)
      : [],
    similarities: job.analysisTypes.includes("similarity") && job.config.similarity
      ? generateSimilarities(job.text, job.config.similarity)
      : undefined,
    preprocessed: job.analysisTypes.includes("preprocessing") || job.analysisTypes.includes("full-analysis")
      ? generatePreprocessedText(job.text)
      : undefined,
    embedding: job.analysisTypes.includes("similarity") ? generateSimulatedEmbedding() : undefined,
    analysisMetadata: {
      provider: job.provider,
      model: getProviderModel(job.provider),
      processingTimeMs,
      analysisTypes: job.analysisTypes,
    },
  };

  const now = new Date().toISOString();
  job.status = "completed";
  job.result = result;
  job.processingTimeMs = Date.now() - startTime;
  job.completedAt = now;
  job.cost = {
    amount: Math.round((0.0001 * result.metadata.wordCount) * 1000) / 1000,
    currency: "USD",
    unit: "word",
  };

  analysisJobs.set(jobId, job);
}

function generateSentimentResult(text: string, config?: AnalysisConfig["sentiment"]): SentimentResult {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const overallScore = _rng.next() * 2 - 1; // -1 to 1
  const overallLabel: SentimentLabel = overallScore > 0.2 ? "positive" : overallScore < -0.2 ? "negative" : "neutral";

  const sentenceSentiments = sentences.map((sentence, i) => {
    const score = _rng.next() * 2 - 1;
    return {
      text: sentence.trim(),
      sentiment: (score > 0.2 ? "positive" : score < -0.2 ? "negative" : "neutral") as SentimentLabel,
      score,
      confidence: 0.8 + _rng.next() * 0.2,
      offset: text.indexOf(sentence),
    };
  });

  return {
    overall: overallLabel,
    score: overallScore,
    confidence: 0.85 + _rng.next() * 0.15,
    sentenceSentiments: config?.granularity !== "document" ? sentenceSentiments : [],
  };
}

function generateNamedEntities(text: string, config?: AnalysisConfig["ner"]): NamedEntity[] {
  const entities: NamedEntity[] = [];
  const entityPatterns = [
    { pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, type: "person" as EntityType },
    { pattern: /\b[A-Z][a-z]+ Inc\.?\b/g, type: "organization" as EntityType },
    { pattern: /\b[A-Z][a-z]+ (?:City|State|Country)\b/g, type: "location" as EntityType },
    { pattern: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, type: "date" as EntityType },
    { pattern: /\$\d+(?:,\d{3})*(?:\.\d{2})?\b/g, type: "money" as EntityType },
    { pattern: /\b\d+(?:\.\d+)?%\b/g, type: "percent" as EntityType },
  ];

  for (const { pattern, type } of entityPatterns) {
    const matches = text.match(pattern) ?? [];
    for (const match of matches) {
      const startIndex = text.indexOf(match);
      if (startIndex !== -1) {
        entities.push({
          text: match,
          type,
          startIndex,
          endIndex: startIndex + match.length,
          confidence: 0.8 + _rng.next() * 0.2,
          normalizedValue: type === "money" ? match.replace(/[$,]/g, "") : match,
        });
      }
    }
  }

  return entities.filter(e => e.confidence >= (config?.minConfidence ?? 0.7));
}

function generateClassifications(config?: AnalysisConfig["classification"]): TextClassification[] {
  const categories = config?.categories ?? ["topic"];
  const labels: Record<string, string[]> = {
    topic: ["technology", "business", "science", "health", "sports", "entertainment"],
    intent: ["information", "question", "command", "feedback", "complaint"],
    spam: ["spam", "not-spam"],
    toxicity: ["toxic", "non-toxic"],
    emotion: ["joy", "sadness", "anger", "fear", "surprise"],
  };

  return categories.map(category => ({
    category: category as TextClassificationCategory,
    label: (labels[category] ?? ["unknown"])[Math.floor(_rng.next() * (labels[category] ?? ["unknown"]).length)],
    confidence: 0.7 + _rng.next() * 0.3,
  }));
}

function generateSummary(text: string, config?: AnalysisConfig["summarization"]): TextSummary {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const ratio = config?.ratio ?? 0.3;
  const numSentences = Math.max(1, Math.floor(sentences.length * ratio));

  const keySentences = sentences
    .map((sentence, index) => ({
      text: sentence.trim(),
      score: _rng.next(),
      index,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, numSentences)
    .sort((a, b) => a.index - b.index);

  const summaryText = keySentences.map(s => s.text).join(". ") + ".";

  return {
    text: summaryText,
    type: config?.type ?? "extractive",
    originalLength: text.length,
    summaryLength: summaryText.length,
    compressionRatio: summaryText.length / text.length,
    keySentences,
  };
}

function generateKeywords(text: string, config?: AnalysisConfig["keywords"]): Keyword[] {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const wordFreq: Record<string, number> = {};

  for (const word of words) {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  }

  return Object.entries(wordFreq)
    .map(([word, frequency]) => ({
      word,
      frequency,
      relevance: frequency / words.length,
      tfidf: frequency * Math.log(words.length / (Object.keys(wordFreq).length || 1)),
    }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, config?.topK ?? 10);
}

function generateKeyphrases(text: string, config?: AnalysisConfig["keywords"]): Keyphrase[] {
  const phrases = [
    { phrase: "artificial intelligence", words: ["artificial", "intelligence"] },
    { phrase: "machine learning", words: ["machine", "learning"] },
    { phrase: "natural language processing", words: ["natural", "language", "processing"] },
  ];

  return phrases
    .filter(p => text.toLowerCase().includes(p.phrase))
    .map(p => ({
      ...p,
      frequency: (text.toLowerCase().match(new RegExp(p.phrase, "g")) ?? []).length,
      relevance: 0.8 + _rng.next() * 0.2,
    }));
}

function generateSimilarities(text: string, config?: AnalysisConfig["similarity"]): TextSimilarity[] {
  if (!config || !config.comparisonTexts) return [];
  return config.comparisonTexts.map(comparisonText => ({
    comparisonText,
    similarityScore: 0.5 + _rng.next() * 0.5,
    method: config.method ?? "cosine",
  }));
}

function generatePreprocessedText(text: string): PreprocessedText {
  const tokens = text.split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const stopWords = new Set(["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by"]);

  return {
    tokens,
    sentences: sentences.map(s => s.trim()),
    lemmas: tokens.map(t => t.toLowerCase().replace(/ing$|ed$|s$/, "")),
    stems: tokens.map(t => t.toLowerCase().slice(0, Math.max(3, t.length - 2))),
    stopWordsRemoved: tokens.filter(t => !stopWords.has(t.toLowerCase())),
    normalized: text.toLowerCase().replace(/[^\w\s]/g, ""),
  };
}

function generateSimulatedEmbedding(): number[] {
  // Generate 1536-dimensional embedding vector (OpenAI text-embedding-3-large)
  return Array.from({ length: 1536 }, () => _rng.next() * 2 - 1);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, Math.min(1, similarity));
}

function getProviderModel(provider: NLPProvider): string {
  const models: Record<NLPProvider, string> = {
    openai: "gpt-4-turbo",
    google: "gemini-pro",
    aws: "comprehend-v2",
    azure: "text-analytics-v4",
    huggingface: "bert-large-uncased",
    spacy: "en_core_web_lg",
    custom: "custom-nlp-v1",
  };
  return models[provider] || "default";
}
