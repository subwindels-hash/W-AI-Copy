# SESSION 83 SPECIFICATION — ENTERPRISE ETL & DATA PIPELINE PLATFORM

```
WINDELS AI OS Enterprise Documentation
Version: 2.0
Documentation Release: 2026 Edition
Repository Version: 0e0bc27
Last Updated: 2026-07-30
Status: AUTHORITATIVE
Applies To: WINDELS AI OS Monorepo

Document Owner: Lead ETL Engineer
Review Status: APPROVED / PRODUCTION-READY
Change Approval: Enterprise Architecture Board (EAB)
Supersedes: SESSION_83_SPECIFICATION.md (v2.0)
Next Scheduled Review: 2027-01-30
```

---

## 1. OBJECTIVES & ARCHITECTURE

The WINDELS AI OS ETL (Extract, Transform, Load) platform provides a high-throughput, fault-tolerant ingestion engine designed to process structured enterprise datasets (CSV, JSON, XML, SQL) from distributed networks and dispatch them safely to transactional databases, Redis caching layers, and the core AI Event Bus.

```
                      ETL PLATFORM SCHEMATIC
                      
   [SFTP/S3/Webhooks] ──► [Pipeline Ingestion] ──► [DLP & Secret Scanner (S84)]
                                                         │
                                                         ▼
   [Dead Letter Queue] ◄── [Schema Validation] ◄── [Zod & Mapping Transform]
           │                                             │
           ▼                                             ▼
   [Alert Dispatches]                             [Prisma Bulk Load]
```

---

## 2. CORE COMPONENTS

### 2.1 Pipeline Builder & Visual Interface
The **Pipeline Builder** exposes a drag-and-drop workspace layout within the web canvas (`PlatformPage.tsx`), allowing system operators to:
*   Configure raw source columns.
*   Draw visual edges routing source fields to transactional PostgreSQL database columns.
*   Set transformation rules (such as string truncating, type casting, or default bindings).

### 2.2 Ingestion Connectors
*   **SFTP Connector**: Connects to remote servers via SSH, downloads files matching wildcards (e.g., `*.csv`), and parses streams line-by-line using `readline` modules to prevent memory leaks.
*   **S3 Connector**: Standard AWS SDK integration. Pulls chunks of raw files from S3 buckets using signed URLs.
*   **Webhook Ingestion**: Exposes a public, HMAC-signed REST endpoint (`POST /api/v1/etl/pipelines/:id/webhook`) to receive real-time JSON payloads.

---

## 3. SCHEDULING, STREAMING, AND TRANSFORMATIONS

### 3.1 Advanced Scheduling
Integrated scheduling supports standard Cron configurations (e.g., `0 0 * * *` for daily midnight runs). The scheduler checks background runs on a 1-minute event tick.

### 3.2 In-Flight Stream Processing
For large datasets, the engine processes streams without memory bloating:
*   Utilizes Node stream buffers for CSV parsing.
*   Parses incoming rows sequentially.

### 3.3 Data Transformations
*   **Type Casting**: Converts string representations to `Date`, `Float`, `Int`, or `Boolean`.
*   **Field Conversions**: String operations like `uppercase`, `lowercase`, and `trim`.
*   **Currency Conversion**: Converts prices based on real-time currency rates via Frankfurter.app.

---

## 4. SCHEMA VALIDATION, DEAD LETTER QUEUE (DLQ), AND RETRIES

### 4.1 Zod Constraint Validation
Every row is parsed through Zod schema validators before committing transactions. Valid rows are written to database tables, while invalid rows are flagged.

### 4.2 Dead Letter Queue (DLQ)
Failed rows are separated and written to the pipeline's error table:
*   **Row Metadata**: Logs the original row index, raw payload string, and validation failure traceback.
*   **Operator Interface**: Supports editing the raw JSON payloads inside the dashboard to correct typos and trigger individual manual re-runs.

### 4.3 Exponential Backoff Retries
If connection timeouts or database locks are encountered, the pipeline scheduler attempts up to 5 retries:
$$\text{Delay}(n) = 1000 \times 2^n \text{ ms} + \text{jitter}$$

---

## 5. MONITORING, LINEAGE, AND DATA CATALOG

### 5.1 Lineage & Data Traceability
Every database record imported via ETL contains internal traceability keys:
*   `_etl_pipeline_id`: References the pipeline origin.
*   `_etl_run_id`: References the exact cron execution run.

### 5.2 Data Catalog
Exposes automatic data dictionary parsing. When files are imported, schema headers are stored in a metadata ledger to allow AI employees to read data patterns.

---

## 6. SYSTEM SCHEMAS (PRISMA SCHEMA)

```prisma
enum EtlFormat {
  CSV
  JSON
  XML
  SQL
}

enum EtlStatus {
  DRAFT
  ACTIVE
  PAUSED
  ARCHIVED
}

enum EtlRunStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
  PARTIAL
}

model EtlPipeline {
  id              String         @id @default(cuid())
  organizationId  String
  organization    Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  name            String
  description     String?
  sourceFormat    EtlFormat      @default(CSV)
  sourceConfig    Json           @default("{}") // { sftpHost, s3Bucket, webhookSecret }
  mappingSchema   Json           @default("[]") // [{ sourceColumn, targetColumn, type, transformRule }]
  status          EtlStatus      @default(DRAFT)
  cronSchedule    String?        // e.g. "0 12 * * *"
  createdById     String
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  runs            EtlRun[]
}

model EtlRun {
  id              String         @id @default(cuid())
  pipelineId      String
  pipeline        EtlPipeline    @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  status          EtlRunStatus   @default(QUEUED)
  startedAt       DateTime?
  completedAt     DateTime?
  rowsProcessed   Int            @default(0)
  rowsSucceeded   Int            @default(0)
  rowsFailed      Int            @default(0)
  errorSummary    String?        @db.Text
  errorLog        Json           @default("[]") // [{ rowIndex, rawRow, error }]
  createdAt       DateTime       @default(now())
}
```

---

## 7. API ENDPOINT SPECIFICATIONS

### 7.1 OpenAPI Specification
*   **`GET /api/v1/etl/pipelines`**: Lists all active and draft pipelines.
*   **`POST /api/v1/etl/pipelines`**: Creates a pipeline.
*   **`POST /api/v1/etl/pipelines/:id/run`**: Triggers immediate run of pipeline.
*   **`GET /api/v1/etl/pipelines/:id/runs`**: Retrieve log histories.

### 7.2 GraphQL API Configuration
```graphql
type EtlPipeline {
  id: ID!
  name: String!
  sourceFormat: String!
  status: String!
  runs: [EtlRun!]!
}

type Query {
  getEtlPipelines: [EtlPipeline!]!
}
```

---

## 8. AUTHENTICATION, RBAC, TESTING & CERTIFICATION

### 8.1 Authentication & RBAC Requirements
All endpoints require JWT access tokens. Write operations are gated behind RBAC flags:
*   Users must possess `ETL_WRITE` or `ADMIN` roles.

### 8.2 Testing Strategy
Every pipeline parser must pass test assertions verifying:
1.  **Empty Files**: Gracefully exits with `0` processed rows and logs warning.
2.  **Schema Mismatches**: Rejects files and quarantines them when column sizes or headers deviate from `mappingSchema`.
3.  **PII Scrubbing**: Verifies that custom CSV logs are scrubbed by `security/piiRedact.ts` before being printed to stdout.

### 8.3 Certification Gate
To transition to production, the pipeline builder must be compiled successfully under `@windels/web` and demonstrate zero typescript errors on backend routes.
