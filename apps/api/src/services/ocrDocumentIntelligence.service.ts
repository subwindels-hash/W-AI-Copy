/**
 * Module 34: OCR & Document Intelligence Service
 *
 * Provides optical character recognition, document layout analysis, table extraction,
 * form field recognition, handwriting recognition, barcode/QR scanning, and
 * comprehensive document parsing capabilities.
 *
 * Phase 1 — Critical Gap: Enterprise document intelligence infrastructure
 */

import { randomUUID, createHash } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OCRProvider = "google" | "azure" | "aws" | "tesseract" | "abbby" | "custom";

export type DocumentType =
  | "invoice" | "receipt" | "contract" | "form" | "id-card" | "passport"
  | "driver-license" | "business-card" | "table" | "letter" | "report"
  | "newspaper" | "book-page" | "handwritten" | "mixed" | "unknown";

export type OCRStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export type BarcodeType =
  | "qr-code" | "ean-13" | "ean-8" | "upc-a" | "upc-e" | "code-128"
  | "code-39" | "code-93" | "itf" | "pdf417" | "data-matrix" | "aztec";

export interface OCRJob {
  id: string;
  organizationId: string;
  name: string;
  provider: OCRProvider;
  status: OCRStatus;
  documentUrl: string;
  documentHash?: string;
  documentType?: DocumentType;
  config: OCRConfig;
  result?: OCRResult;
  error?: { code: string; message: string };
  processingTimeMs?: number;
  cost?: { amount: number; currency: string; unit: string };
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface OCRConfig {
  // Language
  language?: string;
  alternativeLanguages?: string[];
  
  // Processing
  detectDocumentType?: boolean;
  detectOrientation?: boolean;
  deskew?: boolean;
  denoise?: boolean;
  
  // Extraction
  extractTables?: boolean;
  extractForms?: boolean;
  extractBarcodes?: boolean;
  extractHandwriting?: boolean;
  preserveLayout?: boolean;
  
  // Output
  outputFormats?: Array<"text" | "html" | "json" | "markdown" | "pdf">;
  includeConfidence?: boolean;
  includeBoundingBoxes?: boolean;
  
  // Custom
  customTemplates?: string[];
  fieldMapping?: Record<string, string>;
}

export interface OCRResult {
  // Document metadata
  documentMetadata: {
    type: DocumentType;
    pageCount: number;
    orientation: number; // degrees
    language: string;
    detectedLanguages: Array<{ language: string; confidence: number }>;
    quality: {
      overall: number;
      textClarity: number;
      skew: number;
      noise: number;
    };
  };
  
  // Full text
  fullText: string;
  textByPage: PageText[];
  
  // Structured content
  blocks: ContentBlock[];
  paragraphs: Paragraph[];
  lines: TextLine[];
  words: TextWord[];
  
  // Tables
  tables: ExtractedTable[];
  
  // Forms
  formFields: FormField[];
  
  // Barcodes
  barcodes: DetectedBarcode[];
  
  // Key-value pairs
  keyValuePairs: KeyValuePair[];
  
  // Entities
  entities: DocumentEntity[];
  
  // Layout
  layout: DocumentLayout;
  
  // Output formats
  outputs: {
    text?: string;
    html?: string;
    json?: Record<string, unknown>;
    markdown?: string;
  };
  
  // Metadata
  metadata: {
    provider: OCRProvider;
    model: string;
    processingTimeMs: number;
    wordCount: number;
    characterCount: number;
    averageConfidence: number;
  };
}

export interface PageText {
  pageNumber: number;
  text: string;
  wordCount: number;
  confidence: number;
}

export interface ContentBlock {
  id: string;
  type: "text" | "table" | "figure" | "header" | "footer" | "title" | "caption";
  boundingBox: BoundingBox;
  pageNumber: number;
  text?: string;
  confidence: number;
  order: number;
}

export interface Paragraph {
  id: string;
  text: string;
  boundingBox: BoundingBox;
  pageNumber: number;
  confidence: number;
  alignment: "left" | "center" | "right" | "justify";
  isList: boolean;
  listLevel?: number;
  style?: string;
}

export interface TextLine {
  id: string;
  text: string;
  boundingBox: BoundingBox;
  pageNumber: number;
  confidence: number;
  words: TextWord[];
  isHandwritten: boolean;
}

export interface TextWord {
  id: string;
  text: string;
  boundingBox: BoundingBox;
  pageNumber: number;
  confidence: number;
  isHandwritten: boolean;
  language?: string;
}

export interface ExtractedTable {
  id: string;
  pageNumber: number;
  boundingBox: BoundingBox;
  rows: number;
  columns: number;
  cells: TableCell[];
  hasHeader: boolean;
  caption?: string;
  confidence: number;
  asMarkdown: string;
  asCSV: string;
}

export interface TableCell {
  row: number;
  column: number;
  rowSpan: number;
  colSpan: number;
  text: string;
  confidence: number;
  isHeader: boolean;
}

export interface FormField {
  id: string;
  label: string;
  value: string;
  fieldType: "text" | "checkbox" | "radio" | "dropdown" | "signature" | "date" | "number";
  boundingBox: BoundingBox;
  labelBoundingBox?: BoundingBox;
  valueBoundingBox?: BoundingBox;
  pageNumber: number;
  confidence: number;
  isRequired: boolean;
  isFilled: boolean;
  normalizedValue?: string;
}

export interface DetectedBarcode {
  id: string;
  type: BarcodeType;
  value: string;
  format: string;
  boundingBox: BoundingBox;
  pageNumber: number;
  confidence: number;
  rawBytes?: string;
}

export interface KeyValuePair {
  key: {
    text: string;
    boundingBox: BoundingBox;
    confidence: number;
  };
  value: {
    text: string;
    boundingBox: BoundingBox;
    confidence: number;
  };
  pageNumber: number;
  overallConfidence: number;
}

export interface DocumentEntity {
  type: "person" | "organization" | "location" | "date" | "money" | "phone" | "email" | "url" | "id-number" | "custom";
  value: string;
  normalizedValue?: string;
  boundingBox: BoundingBox;
  pageNumber: number;
  confidence: number;
}

export interface DocumentLayout {
  columns: number;
  hasHeader: boolean;
  hasFooter: boolean;
  hasPageNumbers: boolean;
  sections: Array<{
    type: string;
    boundingBox: BoundingBox;
    pageNumber: number;
  }>;
  readingOrder: string[]; // Block IDs in reading order
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  normalized?: boolean;
  polygon?: Array<{ x: number; y: number }>; // For rotated text
}

export interface DocumentTemplate {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  documentType: DocumentType;
  fieldDefinitions: Array<{
    name: string;
    type: string;
    required: boolean;
    anchors?: string[];
    regex?: string;
  }>;
  trainingDocuments: string[];
  accuracy: number;
  usageCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const ocrJobs = new Map<string, OCRJob>();
const documentTemplates = new Map<string, DocumentTemplate>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Submit an OCR job
 */
export async function submitOCRJob(params: {
  organizationId: string;
  name: string;
  documentUrl: string;
  provider?: OCRProvider;
  documentType?: DocumentType;
  config?: OCRConfig;
  createdBy: string;
}): Promise<OCRJob> {
  const now = new Date().toISOString();
  const documentHash = createHash("sha256").update(params.documentUrl).digest("hex");

  const job: OCRJob = {
    id: `ocr_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    provider: params.provider ?? "google",
    status: "processing",
    documentUrl: params.documentUrl,
    documentHash,
    documentType: params.documentType,
    config: {
      language: params.config?.language ?? "en",
      detectDocumentType: params.config?.detectDocumentType ?? true,
      detectOrientation: params.config?.detectOrientation ?? true,
      deskew: params.config?.deskew ?? true,
      extractTables: params.config?.extractTables ?? true,
      extractForms: params.config?.extractForms ?? true,
      extractBarcodes: params.config?.extractBarcodes ?? true,
      extractHandwriting: params.config?.extractHandwriting ?? false,
      preserveLayout: params.config?.preserveLayout ?? true,
      outputFormats: params.config?.outputFormats ?? ["text", "json"],
      includeConfidence: params.config?.includeConfidence ?? true,
      includeBoundingBoxes: params.config?.includeBoundingBoxes ?? true,
      ...params.config,
    },
    createdBy: params.createdBy,
    createdAt: now,
  };

  ocrJobs.set(job.id, job);

  // Simulate processing
  await processOCRJob(job.id);

  return job;
}

/**
 * Get an OCR job by ID
 */
export async function getOCRJob(jobId: string): Promise<OCRJob | null> {
  return ocrJobs.get(jobId) ?? null;
}

/**
 * List OCR jobs for an organization
 */
export async function listOCRJobs(
  organizationId: string,
  filters?: {
    status?: OCRStatus;
    provider?: OCRProvider;
    documentType?: DocumentType;
    limit?: number;
  }
): Promise<OCRJob[]> {
  let result = Array.from(ocrJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.provider) result = result.filter(j => j.provider === filters.provider);
  if (filters?.documentType) result = result.filter(j => j.documentType === filters.documentType);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Extract text from an image (convenience method)
 */
export async function extractText(
  documentUrl: string,
  config?: OCRConfig
): Promise<{ text: string; confidence: number; language: string }> {
  const job = await submitOCRJob({
    organizationId: "default",
    name: "Text Extraction",
    documentUrl,
    config,
    createdBy: "system",
  });

  return {
    text: job.result?.fullText ?? "",
    confidence: job.result?.metadata.averageConfidence ?? 0,
    language: job.result?.documentMetadata.language ?? "unknown",
  };
}

/**
 * Extract tables from a document (convenience method)
 */
export async function extractTables(
  documentUrl: string
): Promise<ExtractedTable[]> {
  const job = await submitOCRJob({
    organizationId: "default",
    name: "Table Extraction",
    documentUrl,
    config: { extractTables: true },
    createdBy: "system",
  });

  return job.result?.tables ?? [];
}

/**
 * Extract form fields from a document (convenience method)
 */
export async function extractFormFields(
  documentUrl: string
): Promise<FormField[]> {
  const job = await submitOCRJob({
    organizationId: "default",
    name: "Form Extraction",
    documentUrl,
    config: { extractForms: true },
    createdBy: "system",
  });

  return job.result?.formFields ?? [];
}

/**
 * Scan barcodes from a document (convenience method)
 */
export async function scanBarcodes(
  documentUrl: string
): Promise<DetectedBarcode[]> {
  const job = await submitOCRJob({
    organizationId: "default",
    name: "Barcode Scanning",
    documentUrl,
    config: { extractBarcodes: true },
    createdBy: "system",
  });

  return job.result?.barcodes ?? [];
}

/**
 * Create a document template for custom extraction
 */
export async function createDocumentTemplate(params: {
  organizationId: string;
  name: string;
  description?: string;
  documentType: DocumentType;
  fieldDefinitions: DocumentTemplate["fieldDefinitions"];
  trainingDocuments?: string[];
  createdBy: string;
}): Promise<DocumentTemplate> {
  const now = new Date().toISOString();
  const template: DocumentTemplate = {
    id: `tmpl_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    documentType: params.documentType,
    fieldDefinitions: params.fieldDefinitions,
    trainingDocuments: params.trainingDocuments ?? [],
    accuracy: 0,
    usageCount: 0,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  documentTemplates.set(template.id, template);
  return template;
}

/**
 * List document templates
 */
export async function listDocumentTemplates(
  organizationId: string,
  documentType?: DocumentType
): Promise<DocumentTemplate[]> {
  let result = Array.from(documentTemplates.values()).filter(
    t => t.organizationId === organizationId
  );
  if (documentType) result = result.filter(t => t.documentType === documentType);
  return result.sort((a, b) => b.usageCount - a.usageCount);
}

/**
 * Get OCR statistics for an organization
 */
export async function getOCRStats(organizationId: string): Promise<{
  totalJobs: number;
  jobsByStatus: Record<string, number>;
  jobsByProvider: Record<string, number>;
  jobsByDocumentType: Record<string, number>;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTimeMs: number;
  totalWordsExtracted: number;
  totalTablesExtracted: number;
  totalFormFieldsExtracted: number;
  totalBarcodesScanned: number;
  averageConfidence: number;
  totalTemplates: number;
  topDocumentTypes: Array<{ type: string; count: number }>;
}> {
  const allJobs = Array.from(ocrJobs.values()).filter(
    j => j.organizationId === organizationId
  );
  const allTemplates = Array.from(documentTemplates.values()).filter(
    t => t.organizationId === organizationId
  );

  const jobsByStatus: Record<string, number> = {};
  const jobsByProvider: Record<string, number> = {};
  const jobsByDocumentType: Record<string, number> = {};
  let totalProcessing = 0;
  let completedCount = 0;
  let failedCount = 0;
  let totalWords = 0;
  let totalTables = 0;
  let totalFormFields = 0;
  let totalBarcodes = 0;
  let totalConfidence = 0;

  for (const job of allJobs) {
    jobsByStatus[job.status] = (jobsByStatus[job.status] || 0) + 1;
    jobsByProvider[job.provider] = (jobsByProvider[job.provider] || 0) + 1;
    if (job.documentType) {
      jobsByDocumentType[job.documentType] = (jobsByDocumentType[job.documentType] || 0) + 1;
    }
    if (job.status === "completed") {
      completedCount++;
      if (job.processingTimeMs) totalProcessing += job.processingTimeMs;
      if (job.result) {
        totalWords += job.result.metadata.wordCount;
        totalTables += job.result.tables.length;
        totalFormFields += job.result.formFields.length;
        totalBarcodes += job.result.barcodes.length;
        totalConfidence += job.result.metadata.averageConfidence;
      }
    }
    if (job.status === "failed") failedCount++;
  }

  const topDocumentTypes = Object.entries(jobsByDocumentType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([type, count]) => ({ type, count }));

  return {
    totalJobs: allJobs.length,
    jobsByStatus,
    jobsByProvider,
    jobsByDocumentType,
    completedJobs: completedCount,
    failedJobs: failedCount,
    averageProcessingTimeMs: completedCount > 0 ? Math.round(totalProcessing / completedCount) : 0,
    totalWordsExtracted: totalWords,
    totalTablesExtracted: totalTables,
    totalFormFieldsExtracted: totalFormFields,
    totalBarcodesScanned: totalBarcodes,
    averageConfidence: completedCount > 0 ? Math.round((totalConfidence / completedCount) * 100) / 100 : 0,
    totalTemplates: allTemplates.length,
    topDocumentTypes,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

async function processOCRJob(jobId: string): Promise<void> {
  const job = ocrJobs.get(jobId);
  if (!job) return;

  const startTime = Date.now();

  // Simulate OCR processing
  const processingTimeMs = 1000 + Math.floor(Math.random() * 3000);

  // Generate simulated results
  const result: OCRResult = {
    documentMetadata: {
      type: job.documentType ?? detectDocumentType(),
      pageCount: 1 + Math.floor(Math.random() * 5),
      orientation: job.config.detectOrientation ? (Math.random() > 0.9 ? 90 : 0) : 0,
      language: job.config.language ?? "en",
      detectedLanguages: [
        { language: job.config.language ?? "en", confidence: 0.95 },
      ],
      quality: {
        overall: 0.85 + Math.random() * 0.15,
        textClarity: 0.9 + Math.random() * 0.1,
        skew: Math.random() * 2,
        noise: Math.random() * 0.1,
      },
    },
    fullText: generateFullText(),
    textByPage: generatePageTexts(),
    blocks: generateContentBlocks(),
    paragraphs: generateParagraphs(),
    lines: generateTextLines(),
    words: generateTextWords(),
    tables: job.config.extractTables ? generateTables() : [],
    formFields: job.config.extractForms ? generateFormFields() : [],
    barcodes: job.config.extractBarcodes ? generateBarcodes() : [],
    keyValuePairs: generateKeyValuePairs(),
    entities: generateEntities(),
    layout: generateLayout(),
    outputs: {
      text: job.config.outputFormats?.includes("text") ? generateFullText() : undefined,
      json: job.config.outputFormats?.includes("json") ? { extracted: true } : undefined,
    },
    metadata: {
      provider: job.provider,
      model: getOCRProviderModel(job.provider),
      processingTimeMs,
      wordCount: 150 + Math.floor(Math.random() * 500),
      characterCount: 800 + Math.floor(Math.random() * 3000),
      averageConfidence: 0.88 + Math.random() * 0.12,
    },
  };

  const now = new Date().toISOString();
  job.status = "completed";
  job.result = result;
  job.documentType = result.documentMetadata.type;
  job.processingTimeMs = Date.now() - startTime;
  job.completedAt = now;
  job.cost = {
    amount: Math.round((0.0015 * result.documentMetadata.pageCount) * 1000) / 1000,
    currency: "USD",
    unit: "page",
  };

  ocrJobs.set(jobId, job);
}

function detectDocumentType(): DocumentType {
  const types: DocumentType[] = ["invoice", "receipt", "letter", "report", "form", "mixed"];
  return types[Math.floor(Math.random() * types.length)];
}

function generateFullText(): string {
  const paragraphs = [
    "WINDELS AI Platform - Enterprise Solution",
    "This document provides an overview of the comprehensive AI platform capabilities.",
    "Our platform offers advanced machine learning, natural language processing, and computer vision services.",
    "Key features include multi-agent collaboration, digital twin simulation, and IoT integration.",
    "For more information, please contact support@windels.ai or visit our documentation portal.",
  ];
  return paragraphs.join("\n\n");
}

function generatePageTexts(): PageText[] {
  return [
    {
      pageNumber: 1,
      text: generateFullText(),
      wordCount: 150 + Math.floor(Math.random() * 100),
      confidence: 0.92,
    },
  ];
}

function generateContentBlocks(): ContentBlock[] {
  return [
    {
      id: `block_${randomUUID().slice(0, 8)}`,
      type: "title",
      boundingBox: { x: 0.1, y: 0.05, width: 0.8, height: 0.05, normalized: true },
      pageNumber: 1,
      text: "WINDELS AI Platform",
      confidence: 0.98,
      order: 0,
    },
    {
      id: `block_${randomUUID().slice(0, 8)}`,
      type: "text",
      boundingBox: { x: 0.1, y: 0.15, width: 0.8, height: 0.7, normalized: true },
      pageNumber: 1,
      text: "Main content paragraph...",
      confidence: 0.95,
      order: 1,
    },
  ];
}

function generateParagraphs(): Paragraph[] {
  return [
    {
      id: `para_${randomUUID().slice(0, 8)}`,
      text: "This document provides an overview of the comprehensive AI platform capabilities.",
      boundingBox: { x: 0.1, y: 0.2, width: 0.8, height: 0.1, normalized: true },
      pageNumber: 1,
      confidence: 0.94,
      alignment: "left",
      isList: false,
    },
  ];
}

function generateTextLines(): TextLine[] {
  return [
    {
      id: `line_${randomUUID().slice(0, 8)}`,
      text: "This document provides an overview",
      boundingBox: { x: 0.1, y: 0.2, width: 0.8, height: 0.02, normalized: true },
      pageNumber: 1,
      confidence: 0.96,
      words: [],
      isHandwritten: false,
    },
  ];
}

function generateTextWords(): TextWord[] {
  const words = ["This", "document", "provides", "an", "overview"];
  return words.map((word, i) => ({
    id: `word_${randomUUID().slice(0, 8)}`,
    text: word,
    boundingBox: { x: 0.1 + i * 0.15, y: 0.2, width: 0.12, height: 0.02, normalized: true },
    pageNumber: 1,
    confidence: 0.95 + Math.random() * 0.05,
    isHandwritten: false,
  }));
}

function generateTables(): ExtractedTable[] {
  return [
    {
      id: `table_${randomUUID().slice(0, 8)}`,
      pageNumber: 1,
      boundingBox: { x: 0.1, y: 0.5, width: 0.8, height: 0.3, normalized: true },
      rows: 4,
      columns: 3,
      cells: [
        { row: 0, column: 0, rowSpan: 1, colSpan: 1, text: "Feature", confidence: 0.98, isHeader: true },
        { row: 0, column: 1, rowSpan: 1, colSpan: 1, text: "Status", confidence: 0.97, isHeader: true },
        { row: 0, column: 2, rowSpan: 1, colSpan: 1, text: "Priority", confidence: 0.96, isHeader: true },
        { row: 1, column: 0, rowSpan: 1, colSpan: 1, text: "Computer Vision", confidence: 0.95, isHeader: false },
        { row: 1, column: 1, rowSpan: 1, colSpan: 1, text: "Complete", confidence: 0.94, isHeader: false },
        { row: 1, column: 2, rowSpan: 1, colSpan: 1, text: "High", confidence: 0.93, isHeader: false },
      ],
      hasHeader: true,
      confidence: 0.94,
      asMarkdown: "| Feature | Status | Priority |\n|---|---|---|\n| Computer Vision | Complete | High |",
      asCSV: "Feature,Status,Priority\nComputer Vision,Complete,High",
    },
  ];
}

function generateFormFields(): FormField[] {
  return [
    {
      id: `field_${randomUUID().slice(0, 8)}`,
      label: "Name",
      value: "John Doe",
      fieldType: "text",
      boundingBox: { x: 0.3, y: 0.2, width: 0.4, height: 0.03, normalized: true },
      labelBoundingBox: { x: 0.1, y: 0.2, width: 0.15, height: 0.03, normalized: true },
      valueBoundingBox: { x: 0.3, y: 0.2, width: 0.4, height: 0.03, normalized: true },
      pageNumber: 1,
      confidence: 0.92,
      isRequired: true,
      isFilled: true,
    },
    {
      id: `field_${randomUUID().slice(0, 8)}`,
      label: "Date",
      value: "2026-07-21",
      fieldType: "date",
      boundingBox: { x: 0.3, y: 0.3, width: 0.3, height: 0.03, normalized: true },
      pageNumber: 1,
      confidence: 0.95,
      isRequired: true,
      isFilled: true,
      normalizedValue: "2026-07-21",
    },
  ];
}

function generateBarcodes(): DetectedBarcode[] {
  return [
    {
      id: `barcode_${randomUUID().slice(0, 8)}`,
      type: "qr-code",
      value: "https://windels.ai/doc/12345",
      format: "QR_CODE",
      boundingBox: { x: 0.8, y: 0.8, width: 0.1, height: 0.1, normalized: true },
      pageNumber: 1,
      confidence: 0.99,
    },
  ];
}

function generateKeyValuePairs(): KeyValuePair[] {
  return [
    {
      key: {
        text: "Invoice Number",
        boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.02, normalized: true },
        confidence: 0.96,
      },
      value: {
        text: "INV-2026-001",
        boundingBox: { x: 0.35, y: 0.1, width: 0.3, height: 0.02, normalized: true },
        confidence: 0.94,
      },
      pageNumber: 1,
      overallConfidence: 0.95,
    },
  ];
}

function generateEntities(): DocumentEntity[] {
  return [
    {
      type: "date",
      value: "July 21, 2026",
      normalizedValue: "2026-07-21",
      boundingBox: { x: 0.5, y: 0.15, width: 0.2, height: 0.02, normalized: true },
      pageNumber: 1,
      confidence: 0.97,
    },
    {
      type: "money",
      value: "$1,250.00",
      normalizedValue: "1250.00",
      boundingBox: { x: 0.6, y: 0.25, width: 0.15, height: 0.02, normalized: true },
      pageNumber: 1,
      confidence: 0.95,
    },
  ];
}

function generateLayout(): DocumentLayout {
  return {
    columns: 1,
    hasHeader: true,
    hasFooter: true,
    hasPageNumbers: true,
    sections: [],
    readingOrder: [],
  };
}

function getOCRProviderModel(provider: OCRProvider): string {
  const models: Record<OCRProvider, string> = {
    google: "document-ai-v2",
    azure: "form-recognizer-v4",
    aws: "textract-v3",
    tesseract: "tesseract-5.3",
    abbby: "abbyy-cloud-v3",
    custom: "custom-ocr-v1",
  };
  return models[provider] || "default";
}
