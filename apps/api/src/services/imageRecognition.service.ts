/**
 * Module 34: Image Recognition & Analysis Service
 *
 * Provides object detection, image classification, face detection, scene understanding,
 * image tagging, visual similarity, and comprehensive image analysis capabilities.
 *
 * Phase 1 — Critical Gap: Enterprise computer vision infrastructure
 */

import { randomUUID, createHash } from "node:crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:imageRecognition');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type CVProvider = "openai" | "google" | "aws" | "azure" | "custom" | "yolo" | "clip";

export type AnalysisType =
  | "object-detection"
  | "classification"
  | "face-detection"
  | "face-recognition"
  | "scene-understanding"
  | "tagging"
  | "color-analysis"
  | "quality-assessment"
  | "similarity"
  | "full-analysis";

export type AnalysisStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface ImageAnalysisJob {
  id: string;
  organizationId: string;
  name: string;
  provider: CVProvider;
  status: AnalysisStatus;
  imageUrl: string;
  imageHash?: string;
  analysisTypes: AnalysisType[];
  config: AnalysisConfig;
  result?: ImageAnalysisResult;
  error?: { code: string; message: string };
  processingTimeMs?: number;
  cost?: { amount: number; currency: string; unit: string };
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface AnalysisConfig {
  // Object detection
  objectDetection?: {
    confidenceThreshold: number;
    maxObjects: number;
    classes?: string[]; // Filter to specific classes
  };
  
  // Face detection
  faceDetection?: {
    detectLandmarks: boolean;
    detectEmotions: boolean;
    detectAge: boolean;
    detectGender: boolean;
    minConfidence: number;
  };
  
  // Classification
  classification?: {
    topK: number;
    includeHierarchy: boolean;
  };
  
  // General
  language?: string;
  returnBoundingBoxes?: boolean;
  returnEmbeddings?: boolean;
  cacheResults?: boolean;
}

export interface ImageAnalysisResult {
  // Metadata
  imageMetadata: {
    width: number;
    height: number;
    format: string;
    fileSizeBytes: number;
    dominantColors: ColorInfo[];
    qualityScore: number;
    isNsfw: boolean;
    hasText: boolean;
  };
  
  // Object detection
  objects: DetectedObject[];
  
  // Classification
  labels: ImageLabel[];
  categories: ImageCategory[];
  
  // Face detection
  faces: DetectedFace[];
  
  // Scene understanding
  scene: SceneDescription;
  
  // Tags
  tags: ImageTag[];
  
  // Text in image
  textRegions: TextRegion[];
  
  // Embeddings (for similarity search)
  embedding?: number[];
  
  // Overall metadata
  metadata: {
    provider: CVProvider;
    model: string;
    processingTimeMs: number;
    analysisTypes: AnalysisType[];
  };
}

export interface DetectedObject {
  id: string;
  label: string;
  confidence: number;
  boundingBox: BoundingBox;
  attributes?: Record<string, unknown>;
  trackingId?: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  normalized?: boolean; // Whether coordinates are 0-1 or pixel values
}

export interface ImageLabel {
  label: string;
  confidence: number;
  category?: string;
  hierarchy?: string[];
}

export interface ImageCategory {
  name: string;
  confidence: number;
  parentId?: string;
  level: number;
}

export interface DetectedFace {
  id: string;
  boundingBox: BoundingBox;
  confidence: number;
  landmarks?: FaceLandmarks;
  emotions?: Record<string, number>;
  age?: { estimated: number; range: { min: number; max: number } };
  gender?: { label: string; confidence: number };
  identity?: { personId: string; confidence: number; name?: string };
  quality: {
    blur: number;
    exposure: number;
    noise: number;
    overall: number;
  };
}

export interface FaceLandmarks {
  leftEye: { x: number; y: number };
  rightEye: { x: number; y: number };
  noseTip: { x: number; y: number };
  mouthLeft: { x: number; y: number };
  mouthRight: { x: number; y: number };
  additionalPoints?: Array<{ x: number; y: number }>;
}

export interface SceneDescription {
  primaryScene: string;
  confidence: number;
  secondaryScenes: Array<{ scene: string; confidence: number }>;
  indoorOutdoor: "indoor" | "outdoor" | "unknown";
  timeOfDay?: "morning" | "afternoon" | "evening" | "night";
  weather?: string;
  description: string;
}

export interface ImageTag {
  tag: string;
  confidence: number;
  category?: string;
  hint?: string;
}

export interface ColorInfo {
  hex: string;
  rgb: { r: number; g: number; b: number };
  percentage: number;
  name: string;
  isDominant: boolean;
}

export interface TextRegion {
  text: string;
  boundingBox: BoundingBox;
  confidence: number;
  language?: string;
}

export interface ImageSimilarityResult {
  imageUrl: string;
  imageId?: string;
  similarityScore: number;
  metadata?: Record<string, unknown>;
}

export interface FaceCollection {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  personCount: number;
  faceCount: number;
  persons: FacePerson[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FacePerson {
  id: string;
  collectionId: string;
  name: string;
  metadata: Record<string, unknown>;
  faceIds: string[];
  faceCount: number;
  createdAt: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const analysisJobs = new Map<string, ImageAnalysisJob>();
const faceCollections = new Map<string, FaceCollection>();
const imageEmbeddings = new Map<string, { url: string; embedding: number[]; metadata: Record<string, unknown> }>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Submit an image analysis job
 */
export async function submitImageAnalysisJob(params: {
  organizationId: string;
  name: string;
  imageUrl: string;
  provider?: CVProvider;
  analysisTypes?: AnalysisType[];
  config?: AnalysisConfig;
  createdBy: string;
}): Promise<ImageAnalysisJob> {
  const now = new Date().toISOString();
  const imageHash = createHash("sha256").update(params.imageUrl).digest("hex");

  const job: ImageAnalysisJob = {
    id: `img_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    provider: params.provider ?? "openai",
    status: "processing",
    imageUrl: params.imageUrl,
    imageHash,
    analysisTypes: params.analysisTypes ?? ["full-analysis"],
    config: {
      objectDetection: {
        confidenceThreshold: 0.5,
        maxObjects: 50,
        ...params.config?.objectDetection,
      },
      faceDetection: {
        detectLandmarks: true,
        detectEmotions: true,
        detectAge: true,
        detectGender: true,
        minConfidence: 0.7,
        ...params.config?.faceDetection,
      },
      classification: {
        topK: 10,
        includeHierarchy: true,
        ...params.config?.classification,
      },
      language: params.config?.language ?? "en",
      returnBoundingBoxes: params.config?.returnBoundingBoxes ?? true,
      returnEmbeddings: params.config?.returnEmbeddings ?? false,
      cacheResults: params.config?.cacheResults ?? true,
      ...params.config,
    },
    createdBy: params.createdBy,
    createdAt: now,
  };

  analysisJobs.set(job.id, job);

  // Simulate processing
  await processImageAnalysis(job.id);

  return job;
}

/**
 * Get an image analysis job by ID
 */
export async function getImageAnalysisJob(jobId: string): Promise<ImageAnalysisJob | null> {
  return analysisJobs.get(jobId) ?? null;
}

/**
 * List image analysis jobs for an organization
 */
export async function listImageAnalysisJobs(
  organizationId: string,
  filters?: {
    status?: AnalysisStatus;
    provider?: CVProvider;
    limit?: number;
  }
): Promise<ImageAnalysisJob[]> {
  let result = Array.from(analysisJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.provider) result = result.filter(j => j.provider === filters.provider);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Detect objects in an image (convenience method)
 */
export async function detectObjects(
  imageUrl: string,
  config?: AnalysisConfig["objectDetection"]
): Promise<DetectedObject[]> {
  const job = await submitImageAnalysisJob({
    organizationId: "default",
    name: "Object Detection",
    imageUrl,
    analysisTypes: ["object-detection"],
    config: { objectDetection: config },
    createdBy: "system",
  });

  return job.result?.objects ?? [];
}

/**
 * Classify an image (convenience method)
 */
export async function classifyImage(
  imageUrl: string,
  config?: AnalysisConfig["classification"]
): Promise<ImageLabel[]> {
  const job = await submitImageAnalysisJob({
    organizationId: "default",
    name: "Image Classification",
    imageUrl,
    analysisTypes: ["classification"],
    config: { classification: config },
    createdBy: "system",
  });

  return job.result?.labels ?? [];
}

/**
 * Detect faces in an image (convenience method)
 */
export async function detectFaces(
  imageUrl: string,
  config?: AnalysisConfig["faceDetection"]
): Promise<DetectedFace[]> {
  const job = await submitImageAnalysisJob({
    organizationId: "default",
    name: "Face Detection",
    imageUrl,
    analysisTypes: ["face-detection"],
    config: { faceDetection: config },
    createdBy: "system",
  });

  return job.result?.faces ?? [];
}

/**
 * Find similar images using embeddings
 */
export async function findSimilarImages(
  imageUrl: string,
  limit: number = 10,
  threshold: number = 0.7
): Promise<ImageSimilarityResult[]> {
  // Get embedding for query image
  const job = await submitImageAnalysisJob({
    organizationId: "default",
    name: "Similarity Search",
    imageUrl,
    analysisTypes: ["similarity"],
    config: { returnEmbeddings: true },
    createdBy: "system",
  });

  const queryEmbedding = job.result?.embedding;
  if (!queryEmbedding) return [];

  // Compare with stored embeddings
  const results: ImageSimilarityResult[] = [];
  for (const [id, stored] of imageEmbeddings) {
    const similarity = cosineSimilarity(queryEmbedding, stored.embedding);
    if (similarity >= threshold) {
      results.push({
        imageUrl: stored.url,
        imageId: id,
        similarityScore: Math.round(similarity * 1000) / 1000,
        metadata: stored.metadata,
      });
    }
  }

  return results
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);
}

/**
 * Create a face collection for face recognition
 */
export async function createFaceCollection(params: {
  organizationId: string;
  name: string;
  description?: string;
  createdBy: string;
}): Promise<FaceCollection> {
  const now = new Date().toISOString();
  const collection: FaceCollection = {
    id: `fc_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    personCount: 0,
    faceCount: 0,
    persons: [],
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  faceCollections.set(collection.id, collection);
  return collection;
}

/**
 * Add a person to a face collection
 */
export async function addPersonToCollection(
  collectionId: string,
  params: {
    name: string;
    faceImageUrls: string[];
    metadata?: Record<string, unknown>;
  }
): Promise<FacePerson | null> {
  const collection = faceCollections.get(collectionId);
  if (!collection) return null;

  const now = new Date().toISOString();
  const person: FacePerson = {
    id: `person_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    collectionId,
    name: params.name,
    metadata: params.metadata ?? {},
    faceIds: params.faceImageUrls.map(() => `face_${randomUUID().slice(0, 8)}`),
    faceCount: params.faceImageUrls.length,
    createdAt: now,
  };

  collection.persons.push(person);
  collection.personCount++;
  collection.faceCount += person.faceCount;
  collection.updatedAt = now;
  faceCollections.set(collectionId, collection);

  return person;
}

/**
 * Recognize faces against a collection
 */
export async function recognizeFaces(
  imageUrl: string,
  collectionId: string,
  minConfidence: number = 0.7
): Promise<Array<{ face: DetectedFace; person?: FacePerson; confidence: number }>> {
  const collection = faceCollections.get(collectionId);
  if (!collection) return [];

  // Detect faces in image
  const faces = await detectFaces(imageUrl);

  // Match against collection (simulated)
  const results: Array<{ face: DetectedFace; person?: FacePerson; confidence: number }> = [];
  for (const face of faces) {
    // Simulate matching
    const match = _rng.next() > 0.3 ? collection.persons[Math.floor(_rng.next() * collection.persons.length)] : undefined;
    const confidence = match ? 0.7 + _rng.next() * 0.3 : 0;

    if (confidence >= minConfidence && match) {
      results.push({ face, person: match, confidence });
    } else {
      results.push({ face, confidence: 0 });
    }
  }

  return results;
}

/**
 * Get image analysis statistics
 */
export async function getImageAnalysisStats(organizationId: string): Promise<{
  totalJobs: number;
  jobsByStatus: Record<string, number>;
  jobsByProvider: Record<string, number>;
  jobsByAnalysisType: Record<string, number>;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTimeMs: number;
  totalObjectsDetected: number;
  totalFacesDetected: number;
  totalLabelsGenerated: number;
  faceCollections: number;
  totalPersons: number;
  totalStoredFaces: number;
}> {
  const allJobs = Array.from(analysisJobs.values()).filter(
    j => j.organizationId === organizationId
  );
  const allCollections = Array.from(faceCollections.values()).filter(
    c => c.organizationId === organizationId
  );

  const jobsByStatus: Record<string, number> = {};
  const jobsByProvider: Record<string, number> = {};
  const jobsByAnalysisType: Record<string, number> = {};
  let totalProcessing = 0;
  let completedCount = 0;
  let failedCount = 0;
  let totalObjects = 0;
  let totalFaces = 0;
  let totalLabels = 0;

  for (const job of allJobs) {
    jobsByStatus[job.status] = (jobsByStatus[job.status] || 0) + 1;
    jobsByProvider[job.provider] = (jobsByProvider[job.provider] || 0) + 1;
    for (const type of job.analysisTypes) {
      jobsByAnalysisType[type] = (jobsByAnalysisType[type] || 0) + 1;
    }
    if (job.status === "completed") {
      completedCount++;
      if (job.processingTimeMs) totalProcessing += job.processingTimeMs;
      if (job.result) {
        totalObjects += job.result.objects.length;
        totalFaces += job.result.faces.length;
        totalLabels += job.result.labels.length;
      }
    }
    if (job.status === "failed") failedCount++;
  }

  return {
    totalJobs: allJobs.length,
    jobsByStatus,
    jobsByProvider,
    jobsByAnalysisType,
    completedJobs: completedCount,
    failedJobs: failedCount,
    averageProcessingTimeMs: completedCount > 0 ? Math.round(totalProcessing / completedCount) : 0,
    totalObjectsDetected: totalObjects,
    totalFacesDetected: totalFaces,
    totalLabelsGenerated: totalLabels,
    faceCollections: allCollections.length,
    totalPersons: allCollections.reduce((sum, c) => sum + c.personCount, 0),
    totalStoredFaces: allCollections.reduce((sum, c) => sum + c.faceCount, 0),
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

async function processImageAnalysis(jobId: string): Promise<void> {
  const job = analysisJobs.get(jobId);
  if (!job) return;

  const startTime = Date.now();

  // Simulate image analysis
  const processingTimeMs = 500 + Math.floor(_rng.next() * 2000);

  // Generate simulated results based on analysis types
  const result: ImageAnalysisResult = {
    imageMetadata: {
      width: 1920,
      height: 1080,
      format: "jpeg",
      fileSizeBytes: 245760,
      dominantColors: generateDominantColors(),
      qualityScore: 0.85 + _rng.next() * 0.15,
      isNsfw: false,
      hasText: _rng.next() > 0.5,
    },
    objects: job.analysisTypes.includes("object-detection") || job.analysisTypes.includes("full-analysis")
      ? generateDetectedObjects(job.config.objectDetection?.maxObjects ?? 10)
      : [],
    labels: job.analysisTypes.includes("classification") || job.analysisTypes.includes("full-analysis")
      ? generateImageLabels(job.config.classification?.topK ?? 10)
      : [],
    categories: job.analysisTypes.includes("classification") || job.analysisTypes.includes("full-analysis")
      ? generateCategories()
      : [],
    faces: job.analysisTypes.includes("face-detection") || job.analysisTypes.includes("full-analysis")
      ? generateDetectedFaces(job.config.faceDetection)
      : [],
    scene: job.analysisTypes.includes("scene-understanding") || job.analysisTypes.includes("full-analysis")
      ? generateSceneDescription()
      : { primaryScene: "unknown", confidence: 0, secondaryScenes: [], indoorOutdoor: "unknown", description: "" },
    tags: job.analysisTypes.includes("tagging") || job.analysisTypes.includes("full-analysis")
      ? generateImageTags()
      : [],
    textRegions: [],
    embedding: job.config.returnEmbeddings ? generateEmbedding() : undefined,
    metadata: {
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
    amount: Math.round((0.001 + _rng.next() * 0.005) * 1000) / 1000,
    currency: "USD",
    unit: "image",
  };

  // Store embedding if generated
  if (result.embedding) {
    imageEmbeddings.set(job.id, {
      url: job.imageUrl,
      embedding: result.embedding,
      metadata: { jobId: job.id, name: job.name },
    });
  }

  analysisJobs.set(jobId, job);
}

function generateDominantColors(): ColorInfo[] {
  const colors = [
    { hex: "#2C3E50", rgb: { r: 44, g: 62, b: 80 }, name: "Midnight Blue" },
    { hex: "#E74C3C", rgb: { r: 231, g: 76, b: 60 }, name: "Alizarin" },
    { hex: "#ECF0F1", rgb: { r: 236, g: 240, b: 241 }, name: "Clouds" },
    { hex: "#3498DB", rgb: { r: 52, g: 152, b: 219 }, name: "Peter River" },
    { hex: "#2ECC71", rgb: { r: 46, g: 204, b: 113 }, name: "Emerald" },
  ];

  return colors.slice(0, 3 + Math.floor(_rng.next() * 2)).map((c, i) => ({
    ...c,
    percentage: i === 0 ? 40 + _rng.next() * 20 : 10 + _rng.next() * 15,
    isDominant: i === 0,
  }));
}

function generateDetectedObjects(maxObjects: number): DetectedObject[] {
  const objectTypes = [
    "person", "car", "dog", "chair", "table", "laptop", "phone", "book",
    "bottle", "cup", "keyboard", "monitor", "plant", "window", "door"
  ];

  const count = Math.min(maxObjects, 3 + Math.floor(_rng.next() * 8));
  const objects: DetectedObject[] = [];

  for (let i = 0; i < count; i++) {
    objects.push({
      id: `obj_${randomUUID().slice(0, 8)}`,
      label: objectTypes[Math.floor(_rng.next() * objectTypes.length)],
      confidence: 0.6 + _rng.next() * 0.4,
      boundingBox: {
        x: _rng.next() * 0.7,
        y: _rng.next() * 0.7,
        width: 0.1 + _rng.next() * 0.3,
        height: 0.1 + _rng.next() * 0.3,
        normalized: true,
      },
    });
  }

  return objects;
}

function generateImageLabels(topK: number): ImageLabel[] {
  const labelTypes = [
    { label: "indoor", category: "scene" },
    { label: "office", category: "scene" },
    { label: "technology", category: "object" },
    { label: "furniture", category: "object" },
    { label: "modern", category: "style" },
    { label: "workspace", category: "scene" },
    { label: "professional", category: "style" },
    { label: "clean", category: "style" },
    { label: "bright", category: "lighting" },
    { label: "organized", category: "style" },
  ];

  return labelTypes.slice(0, topK).map(l => ({
    ...l,
    confidence: 0.7 + _rng.next() * 0.3,
    hierarchy: [l.category, l.label],
  }));
}

function generateCategories(): ImageCategory[] {
  return [
    { name: "Indoor Scene", confidence: 0.92, level: 0 },
    { name: "Office", confidence: 0.88, parentId: "indoor", level: 1 },
    { name: "Modern Office", confidence: 0.75, parentId: "office", level: 2 },
  ];
}

function generateDetectedFaces(config?: AnalysisConfig["faceDetection"]): DetectedFace[] {
  const count = Math.floor(_rng.next() * 3);
  const faces: DetectedFace[] = [];

  for (let i = 0; i < count; i++) {
    faces.push({
      id: `face_${randomUUID().slice(0, 8)}`,
      boundingBox: {
        x: 0.2 + _rng.next() * 0.6,
        y: 0.1 + _rng.next() * 0.3,
        width: 0.15 + _rng.next() * 0.1,
        height: 0.2 + _rng.next() * 0.1,
        normalized: true,
      },
      confidence: 0.85 + _rng.next() * 0.15,
      landmarks: config?.detectLandmarks ? {
        leftEye: { x: 0.3, y: 0.3 },
        rightEye: { x: 0.4, y: 0.3 },
        noseTip: { x: 0.35, y: 0.4 },
        mouthLeft: { x: 0.3, y: 0.5 },
        mouthRight: { x: 0.4, y: 0.5 },
      } : undefined,
      emotions: config?.detectEmotions ? {
        happy: 0.7 + _rng.next() * 0.3,
        neutral: _rng.next() * 0.3,
        sad: _rng.next() * 0.1,
        angry: _rng.next() * 0.05,
        surprised: _rng.next() * 0.1,
      } : undefined,
      age: config?.detectAge ? {
        estimated: 25 + Math.floor(_rng.next() * 40),
        range: { min: 20, max: 65 },
      } : undefined,
      gender: config?.detectGender ? {
        label: _rng.next() > 0.5 ? "male" : "female",
        confidence: 0.8 + _rng.next() * 0.2,
      } : undefined,
      quality: {
        blur: _rng.next() * 0.2,
        exposure: 0.8 + _rng.next() * 0.2,
        noise: _rng.next() * 0.15,
        overall: 0.85 + _rng.next() * 0.15,
      },
    });
  }

  return faces;
}

function generateSceneDescription(): SceneDescription {
  const scenes = [
    { primary: "office", description: "A modern office workspace with desks and computers" },
    { primary: "living room", description: "A comfortable living room with furniture" },
    { primary: "kitchen", description: "A well-equipped kitchen with appliances" },
    { primary: "outdoor park", description: "A green park with trees and pathways" },
    { primary: "street", description: "An urban street with buildings and vehicles" },
  ];

  const scene = scenes[Math.floor(_rng.next() * scenes.length)];
  return {
    primaryScene: scene.primary,
    confidence: 0.8 + _rng.next() * 0.2,
    secondaryScenes: [
      { scene: "indoor", confidence: 0.7 },
      { scene: "modern", confidence: 0.6 },
    ],
    indoorOutdoor: scene.primary.includes("outdoor") || scene.primary === "street" ? "outdoor" : "indoor",
    timeOfDay: "afternoon",
    description: scene.description,
  };
}

function generateImageTags(): ImageTag[] {
  const tags = [
    { tag: "workspace", category: "scene", hint: "environment" },
    { tag: "technology", category: "object", hint: "items" },
    { tag: "professional", category: "style", hint: "atmosphere" },
    { tag: "modern", category: "style", hint: "design" },
    { tag: "clean", category: "style", hint: "appearance" },
    { tag: "bright", category: "lighting", hint: "illumination" },
    { tag: "organized", category: "style", hint: "arrangement" },
    { tag: "productive", category: "mood", hint: "feeling" },
  ];

  return tags.map(t => ({
    ...t,
    confidence: 0.7 + _rng.next() * 0.3,
  }));
}

function generateEmbedding(): number[] {
  // Generate 512-dimensional embedding vector
  return Array.from({ length: 512 }, () => _rng.next() * 2 - 1);
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

function getProviderModel(provider: CVProvider): string {
  const models: Record<CVProvider, string> = {
    openai: "gpt-4-vision",
    google: "gemini-pro-vision",
    aws: "rekognition-v3",
    azure: "computer-vision-v4",
    custom: "custom-cnn-v1",
    yolo: "yolov8-x",
    clip: "clip-vit-large",
  };
  return models[provider] || "default";
}
