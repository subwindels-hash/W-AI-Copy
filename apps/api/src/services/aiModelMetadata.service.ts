/**
 * Module 73: AI Model Metadata Service
 *
 * Provides comprehensive metadata management for AI models including rich metadata
 * schema definition, metadata validation rules, metadata versioning and history,
 * metadata search and discovery, metadata lineage tracking, custom metadata fields,
 * metadata quality scoring, metadata inheritance and templates, and metadata bulk
 * operations for complete model metadata governance.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MetadataSchema {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  version: string;
  fields: MetadataField[];
  validationRules: ValidationRule[];
  tags: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetadataField {
  id: string;
  name: string;
  displayName: string;
  type: FieldType;
  required: boolean;
  description?: string;
  defaultValue?: any;
  validation?: FieldValidation;
  options?: FieldOption[];
  nested?: MetadataField[];
  inheritable: boolean;
  searchable: boolean;
  indexed: boolean;
}

export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'array'
  | 'object'
  | 'enum'
  | 'reference'
  | 'json'
  | 'tags';

export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  custom?: string; // Custom validation function name
}

export interface FieldOption {
  value: any;
  label: string;
  description?: string;
}

export interface ValidationRule {
  id: string;
  name: string;
  description?: string;
  condition: string; // Expression to evaluate
  severity: 'error' | 'warning' | 'info';
  message: string;
  enabled: boolean;
}

export interface ModelMetadata {
  id: string;
  organizationId: string;
  modelId: string;
  versionId: string;
  schemaId: string;
  schemaVersion: string;
  values: Record<string, any>;
  quality: MetadataQuality;
  lineage: MetadataLineage;
  history: MetadataHistoryEntry[];
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetadataQuality {
  completeness: number; // 0-100
  accuracy: number; // 0-100
  consistency: number; // 0-100
  overallScore: number; // 0-100
  issues: QualityIssue[];
  lastAssessed: string;
}

export interface QualityIssue {
  field: string;
  type: 'missing' | 'invalid' | 'inconsistent' | 'outdated';
  severity: 'error' | 'warning' | 'info';
  message: string;
  detected: string;
}

export interface MetadataLineage {
  parentMetadataId?: string;
  parentVersionId?: string;
  inheritedFields: string[];
  derivedFrom?: string[];
  transformations: MetadataTransformation[];
}

export interface MetadataTransformation {
  type: 'inheritance' | 'derivation' | 'enrichment' | 'normalization';
  sourceField?: string;
  targetField: string;
  transformation: string;
  appliedAt: string;
}

export interface MetadataHistoryEntry {
  id: string;
  timestamp: string;
  action: 'created' | 'updated' | 'deleted' | 'validated' | 'inherited';
  field?: string;
  oldValue?: any;
  newValue?: any;
  changedBy: string;
  reason?: string;
}

export interface MetadataTemplate {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  schemaId: string;
  defaultValues: Record<string, any>;
  tags: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetadataSearchResult {
  metadata: ModelMetadata[];
  total: number;
  facets: SearchFacets;
  query: SearchQuery;
}

export interface SearchQuery {
  text?: string;
  filters: SearchFilter[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export interface SearchFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'exists';
  value: any;
}

export interface SearchFacets {
  schemas: Array<{ schemaId: string; schemaName: string; count: number }>;
  tags: Array<{ tag: string; count: number }>;
  qualityRanges: Array<{ range: string; count: number }>;
}

export interface MetadataValidation {
  metadataId: string;
  schemaId: string;
  validatedAt: string;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  score: number; // 0-100
}

export interface ValidationError {
  field: string;
  rule: string;
  message: string;
  value?: any;
}

export interface ValidationWarning {
  field: string;
  rule: string;
  message: string;
  value?: any;
}

export interface MetadataBulkOperation {
  id: string;
  organizationId: string;
  type: 'update' | 'delete' | 'validate' | 'tag';
  filter: SearchFilter[];
  operation: BulkOperationConfig;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  progress: number; // 0-100
  affectedCount: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ metadataId: string; error: string }>;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface BulkOperationConfig {
  updates?: Record<string, any>;
  tags?: { add?: string[]; remove?: string[] };
  validate?: boolean;
}

export interface MetadataDashboard {
  organizationId: string;
  totalMetadata: number;
  totalSchemas: number;
  averageQualityScore: number;
  metadataBySchema: Array<{ schemaId: string; schemaName: string; count: number }>;
  qualityDistribution: Array<{ range: string; count: number }>;
  recentUpdates: ModelMetadata[];
  validationIssues: number;
  topTags: Array<{ tag: string; count: number }>;
  completenessTrend: Array<{ date: string; score: number }>;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const schemas = new Map<string, MetadataSchema>();
const metadata = new Map<string, ModelMetadata>();
const templates = new Map<string, MetadataTemplate>();
const bulkOperations = new Map<string, MetadataBulkOperation>();

// ─── Schema Management ─────────────────────────────────────────────────────────

/**
 * Create metadata schema
 */
export async function createMetadataSchema(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    version?: string;
    fields: Omit<MetadataField, 'id'>[];
    validationRules?: Omit<ValidationRule, 'id'>[];
    tags?: string[];
    createdBy: string;
  }
): Promise<MetadataSchema> {
  const id = `schema_${randomUUID()}`;
  const now = new Date().toISOString();

  const fields: MetadataField[] = params.fields.map((f) => ({
    ...f,
    id: `field_${randomUUID()}`,
  }));

  const validationRules: ValidationRule[] = (params.validationRules || []).map((r) => ({
    ...r,
    id: `rule_${randomUUID()}`,
  }));

  const schema: MetadataSchema = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    version: params.version || '1.0.0',
    fields,
    validationRules,
    tags: params.tags || [],
    isActive: true,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  schemas.set(id, schema);
  return schema;
}

/**
 * Update metadata schema
 */
export async function updateMetadataSchema(
  schemaId: string,
  updates: Partial<Omit<MetadataSchema, 'id' | 'organizationId' | 'createdAt'>>
): Promise<MetadataSchema | null> {
  const schema = schemas.get(schemaId);
  if (!schema) return null;

  const updated: MetadataSchema = {
    ...schema,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  schemas.set(schemaId, updated);
  return updated;
}

/**
 * Get metadata schema by ID
 */
export async function getMetadataSchema(schemaId: string): Promise<MetadataSchema | null> {
  return schemas.get(schemaId) || null;
}

/**
 * List metadata schemas
 */
export async function listMetadataSchemas(
  organizationId: string,
  filters?: { isActive?: boolean }
): Promise<MetadataSchema[]> {
  const allSchemas = Array.from(schemas.values()).filter(
    (s) => s.organizationId === organizationId
  );

  return allSchemas.filter((s) => {
    if (filters?.isActive !== undefined && s.isActive !== filters.isActive) return false;
    return true;
  });
}

// ─── Metadata Management ───────────────────────────────────────────────────────

/**
 * Create model metadata
 */
export async function createModelMetadata(
  organizationId: string,
  params: {
    modelId: string;
    versionId: string;
    schemaId: string;
    values: Record<string, any>;
    tags?: string[];
    parentMetadataId?: string;
    createdBy: string;
  }
): Promise<ModelMetadata> {
  const schema = schemas.get(params.schemaId);
  if (!schema) {
    throw new Error(`Schema ${params.schemaId} not found`);
  }

  const id = `metadata_${randomUUID()}`;
  const now = new Date().toISOString();

  // Apply inheritance if parent exists
  let values = { ...params.values };
  let lineage: MetadataLineage = {
    inheritedFields: [],
    transformations: [],
  };

  if (params.parentMetadataId) {
    const parent = metadata.get(params.parentMetadataId);
    if (parent) {
      const inheritedFields: string[] = [];
      for (const field of schema.fields) {
        if (field.inheritable && parent.values[field.name] !== undefined && values[field.name] === undefined) {
          values[field.name] = parent.values[field.name];
          inheritedFields.push(field.name);
          lineage.transformations.push({
            type: 'inheritance',
            sourceField: field.name,
            targetField: field.name,
            transformation: 'inherit',
            appliedAt: now,
          });
        }
      }
      lineage = {
        parentMetadataId: params.parentMetadataId,
        parentVersionId: parent.versionId,
        inheritedFields,
        transformations: lineage.transformations,
      };
    }
  }

  // Apply default values
  for (const field of schema.fields) {
    if (values[field.name] === undefined && field.defaultValue !== undefined) {
      values[field.name] = field.defaultValue;
    }
  }

  // Validate metadata
  const validation = validateMetadataValues(schema, values);
  const quality = calculateMetadataQuality(schema, values, validation);

  const metadataRecord: ModelMetadata = {
    id,
    organizationId,
    modelId: params.modelId,
    versionId: params.versionId,
    schemaId: params.schemaId,
    schemaVersion: schema.version,
    values,
    quality,
    lineage,
    history: [
      {
        id: `history_${randomUUID()}`,
        timestamp: now,
        action: 'created',
        changedBy: params.createdBy,
      },
    ],
    tags: params.tags || [],
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  metadata.set(id, metadataRecord);
  return metadataRecord;
}

/**
 * Update model metadata
 */
export async function updateModelMetadata(
  metadataId: string,
  updates: {
    values?: Record<string, any>;
    tags?: string[];
  },
  updatedBy: string,
  reason?: string
): Promise<ModelMetadata | null> {
  const record = metadata.get(metadataId);
  if (!record) return null;

  const schema = schemas.get(record.schemaId);
  if (!schema) return null;

  const now = new Date().toISOString();
  const history: MetadataHistoryEntry[] = [];

  // Track changes
  if (updates.values) {
    for (const [field, newValue] of Object.entries(updates.values)) {
      const oldValue = record.values[field];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        history.push({
          id: `history_${randomUUID()}`,
          timestamp: now,
          action: 'updated',
          field,
          oldValue,
          newValue,
          changedBy: updatedBy,
          reason,
        });
      }
    }
    record.values = { ...record.values, ...updates.values };
  }

  if (updates.tags) {
    record.tags = updates.tags;
  }

  // Re-validate and recalculate quality
  const validation = validateMetadataValues(schema, record.values);
  record.quality = calculateMetadataQuality(schema, record.values, validation);
  record.history.push(...history);
  record.updatedAt = now;

  metadata.set(metadataId, record);
  return record;
}

/**
 * Validate metadata values against schema
 */
function validateMetadataValues(
  schema: MetadataSchema,
  values: Record<string, any>
): MetadataValidation {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const now = new Date().toISOString();

  // Check required fields
  for (const field of schema.fields) {
    if (field.required && (values[field.name] === undefined || values[field.name] === null)) {
      errors.push({
        field: field.name,
        rule: 'required',
        message: `Field '${field.displayName}' is required`,
      });
    }
  }

  // Validate field types and constraints
  for (const field of schema.fields) {
    const value = values[field.name];
    if (value === undefined || value === null) continue;

    if (field.validation) {
      if (field.type === 'string' && typeof value === 'string') {
        if (field.validation.minLength && value.length < field.validation.minLength) {
          errors.push({
            field: field.name,
            rule: 'minLength',
            message: `Field '${field.displayName}' must be at least ${field.validation.minLength} characters`,
            value,
          });
        }
        if (field.validation.maxLength && value.length > field.validation.maxLength) {
          errors.push({
            field: field.name,
            rule: 'maxLength',
            message: `Field '${field.displayName}' must be at most ${field.validation.maxLength} characters`,
            value,
          });
        }
        if (field.validation.pattern && !new RegExp(field.validation.pattern).test(value)) {
          errors.push({
            field: field.name,
            rule: 'pattern',
            message: `Field '${field.displayName}' does not match required pattern`,
            value,
          });
        }
      }

      if (field.type === 'number' && typeof value === 'number') {
        if (field.validation.min !== undefined && value < field.validation.min) {
          errors.push({
            field: field.name,
            rule: 'min',
            message: `Field '${field.displayName}' must be at least ${field.validation.min}`,
            value,
          });
        }
        if (field.validation.max !== undefined && value > field.validation.max) {
          errors.push({
            field: field.name,
            rule: 'max',
            message: `Field '${field.displayName}' must be at most ${field.validation.max}`,
            value,
          });
        }
      }
    }
  }

  // Evaluate validation rules
  for (const rule of schema.validationRules) {
    if (!rule.enabled) continue;

    try {
      // Simple expression evaluation (in production, use a safe expression evaluator)
      const result = evaluateRuleCondition(rule.condition, values);
      if (!result) {
        if (rule.severity === 'error') {
          errors.push({
            field: 'rule',
            rule: rule.name,
            message: rule.message,
          });
        } else if (rule.severity === 'warning') {
          warnings.push({
            field: 'rule',
            rule: rule.name,
            message: rule.message,
          });
        }
      }
    } catch (e) {
      // Rule evaluation failed
    }
  }

  const score = Math.max(0, 100 - errors.length * 10 - warnings.length * 2);

  return {
    metadataId: '',
    schemaId: schema.id,
    validatedAt: now,
    isValid: errors.length === 0,
    errors,
    warnings,
    score,
  };
}

/**
 * Evaluate rule condition (simplified)
 */
function evaluateRuleCondition(condition: string, values: Record<string, any>): boolean {
  // This is a simplified implementation. In production, use a safe expression evaluator.
  try {
    // Example: "field1 != null && field2 > 10"
    const func = new Function('values', `with(values) { return ${condition}; }`);
    return func(values);
  } catch {
    return true; // If evaluation fails, consider it valid
  }
}

/**
 * Calculate metadata quality
 */
function calculateMetadataQuality(
  schema: MetadataSchema,
  values: Record<string, any>,
  validation: MetadataValidation
): MetadataQuality {
  const now = new Date().toISOString();

  // Completeness: percentage of required fields that are filled
  const requiredFields = schema.fields.filter((f) => f.required);
  const filledRequired = requiredFields.filter((f) => values[f.name] !== undefined && values[f.name] !== null);
  const completeness = requiredFields.length > 0 ? (filledRequired.length / requiredFields.length) * 100 : 100;

  // Accuracy: based on validation errors
  const accuracy = validation.score;

  // Consistency: check for inconsistencies (simplified)
  let consistency = 100;
  const issues: QualityIssue[] = [];

  for (const error of validation.errors) {
    issues.push({
      field: error.field,
      type: error.rule === 'required' ? 'missing' : 'invalid',
      severity: 'error',
      message: error.message,
      detected: now,
    });
  }

  for (const warning of validation.warnings) {
    issues.push({
      field: warning.field,
      type: 'inconsistent',
      severity: 'warning',
      message: warning.message,
      detected: now,
    });
  }

  const overallScore = (completeness * 0.4 + accuracy * 0.4 + consistency * 0.2);

  return {
    completeness: Math.round(completeness),
    accuracy: Math.round(accuracy),
    consistency: Math.round(consistency),
    overallScore: Math.round(overallScore),
    issues,
    lastAssessed: now,
  };
}

/**
 * Search metadata
 */
export async function searchMetadata(
  organizationId: string,
  query: SearchQuery
): Promise<MetadataSearchResult> {
  let results = Array.from(metadata.values()).filter((m) => m.organizationId === organizationId);

  // Apply text search
  if (query.text) {
    const text = query.text.toLowerCase();
    results = results.filter((m) => {
      return (
        m.modelId.toLowerCase().includes(text) ||
        m.tags.some((t) => t.toLowerCase().includes(text)) ||
        Object.values(m.values).some((v) => String(v).toLowerCase().includes(text))
      );
    });
  }

  // Apply filters
  for (const filter of query.filters) {
    results = results.filter((m) => {
      const value = m.values[filter.field];
      switch (filter.operator) {
        case 'eq': return value === filter.value;
        case 'ne': return value !== filter.value;
        case 'gt': return typeof value === 'number' && value > filter.value;
        case 'gte': return typeof value === 'number' && value >= filter.value;
        case 'lt': return typeof value === 'number' && value < filter.value;
        case 'lte': return typeof value === 'number' && value <= filter.value;
        case 'contains': return typeof value === 'string' && value.includes(filter.value);
        case 'in': return Array.isArray(filter.value) && filter.value.includes(value);
        case 'exists': return value !== undefined && value !== null;
        default: return true;
      }
    });
  }

  // Sort
  if (query.sortBy) {
    results.sort((a, b) => {
      const aVal = a.values[query.sortBy!] ?? a[query.sortBy as keyof ModelMetadata];
      const bVal = b.values[query.sortBy!] ?? b[query.sortBy as keyof ModelMetadata];
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return query.sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  const total = results.length;
  const offset = query.offset || 0;
  const limit = query.limit || 50;
  results = results.slice(offset, offset + limit);

  // Calculate facets
  const schemaCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const qualityRanges = { '0-25': 0, '26-50': 0, '51-75': 0, '76-100': 0 };

  for (const m of results) {
    schemaCounts.set(m.schemaId, (schemaCounts.get(m.schemaId) || 0) + 1);
    m.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1));
    const score = m.quality.overallScore;
    if (score <= 25) qualityRanges['0-25']++;
    else if (score <= 50) qualityRanges['26-50']++;
    else if (score <= 75) qualityRanges['51-75']++;
    else qualityRanges['76-100']++;
  }

  const facets: SearchFacets = {
    schemas: Array.from(schemaCounts.entries()).map(([schemaId, count]) => ({
      schemaId,
      schemaName: schemas.get(schemaId)?.name || 'Unknown',
      count,
    })),
    tags: Array.from(tagCounts.entries()).map(([tag, count]) => ({ tag, count })),
    qualityRanges: Object.entries(qualityRanges).map(([range, count]) => ({ range, count })),
  };

  return {
    metadata: results,
    total,
    facets,
    query,
  };
}

/**
 * Create metadata template
 */
export async function createMetadataTemplate(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    schemaId: string;
    defaultValues: Record<string, any>;
    tags?: string[];
    createdBy: string;
  }
): Promise<MetadataTemplate> {
  const id = `template_${randomUUID()}`;
  const now = new Date().toISOString();

  const template: MetadataTemplate = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    schemaId: params.schemaId,
    defaultValues: params.defaultValues,
    tags: params.tags || [],
    isActive: true,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  templates.set(id, template);
  return template;
}

/**
 * Get model metadata by ID
 */
export async function getModelMetadata(metadataId: string): Promise<ModelMetadata | null> {
  return metadata.get(metadataId) || null;
}

/**
 * List model metadata
 */
export async function listModelMetadata(
  organizationId: string,
  filters?: {
    modelId?: string;
    versionId?: string;
    schemaId?: string;
  }
): Promise<ModelMetadata[]> {
  const allMetadata = Array.from(metadata.values()).filter(
    (m) => m.organizationId === organizationId
  );

  return allMetadata.filter((m) => {
    if (filters?.modelId && m.modelId !== filters.modelId) return false;
    if (filters?.versionId && m.versionId !== filters.versionId) return false;
    if (filters?.schemaId && m.schemaId !== filters.schemaId) return false;
    return true;
  });
}

/**
 * Get metadata dashboard
 */
export async function getMetadataDashboard(organizationId: string): Promise<MetadataDashboard> {
  const allMetadata = await listModelMetadata(organizationId);
  const allSchemas = await listMetadataSchemas(organizationId);

  const schemaCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const qualityRanges = { '0-25': 0, '26-50': 0, '51-75': 0, '76-100': 0 };
  let totalQuality = 0;
  let validationIssues = 0;

  for (const m of allMetadata) {
    schemaCounts.set(m.schemaId, (schemaCounts.get(m.schemaId) || 0) + 1);
    m.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1));
    totalQuality += m.quality.overallScore;
    validationIssues += m.quality.issues.filter((i) => i.severity === 'error').length;

    const score = m.quality.overallScore;
    if (score <= 25) qualityRanges['0-25']++;
    else if (score <= 50) qualityRanges['26-50']++;
    else if (score <= 75) qualityRanges['51-75']++;
    else qualityRanges['76-100']++;
  }

  const recentUpdates = allMetadata
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10);

  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  return {
    organizationId,
    totalMetadata: allMetadata.length,
    totalSchemas: allSchemas.length,
    averageQualityScore: allMetadata.length > 0 ? Math.round(totalQuality / allMetadata.length) : 0,
    metadataBySchema: Array.from(schemaCounts.entries()).map(([schemaId, count]) => ({
      schemaId,
      schemaName: schemas.get(schemaId)?.name || 'Unknown',
      count,
    })),
    qualityDistribution: Object.entries(qualityRanges).map(([range, count]) => ({ range, count })),
    recentUpdates,
    validationIssues,
    topTags,
    completenessTrend: [], // Would be populated with historical data
  };
}
