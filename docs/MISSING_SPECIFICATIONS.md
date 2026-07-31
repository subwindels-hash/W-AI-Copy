# MISSING SPECIFICATIONS — WINDELS AI OS

**Date:** 2026-07-28  
**Scope:** Blocked Sessions 83 & 87 Requirements Audit  

Our comprehensive scan of the repository (including markdown specs, pdf, docx, and uploads) has confirmed that **Session 83 (ETL / Custom Data Pipelines)** and **Session 87 (Live Camera Intelligence)** have **zero specification or requirement files**. Consequently, their implementation is completely blocked.

Below is the exact checklist of required information needed to design and code these two modules.

---

## 1. REQUIREMENTS NEEDED FOR SESSION 83 (ETL & DATA PIPELINES)

To implement the ETL platform, the engineering team requires:

1.  **Ingestion Source Connectors**:
    *   What protocols must be supported? (e.g., FTP/SFTP, AWS S3, local directory watches, Webhook pushes, or REST polling).
    *   What are the source data formats? (e.g., raw CSV, custom JSON, XML, or binary SQL dumps).
2.  **Transformation & Mapping Logic**:
    *   Is there a custom mapping syntax needed? (e.g., JSON-to-JSON transforms, column exclusions, or datatype conversions).
    *   What mathematical or parsing helpers are required? (e.g., text splitting, timestamp normalizations, or currency conversions).
3.  **Load Targets & Storage**:
    *   Where does transformed data land? (e.g., custom PostgreSQL tables, Redis caches, or external API endpoints).
4.  **Workflow & Triggering Mechanics**:
    *   Should jobs be run manually, on cron schedules, or triggered automatically by system events (such as `file.uploaded` via Session 6)?
5.  **Failure & Recovery Policies**:
    *   What are the retry parameters? (e.g., exponential backoffs, max retries, or quarantine databases for bad rows).
6.  **Frontend Layout**:
    *   What visual elements must exist on the ETL Dashboard? (e.g., active pipeline grids, data mapper nodes, success/failure charts, or execution logs).

---

## 2. REQUIREMENTS NEEDED FOR SESSION 87 (LIVE CAMERA INTELLIGENCE)

To implement the Live Camera platform, the engineering team requires:

1.  **Video Stream Ingestion**:
    *   What stream protocols must be supported? (e.g., RTSP, RTMP, WebRTC, or HTTP live streams).
    *   What is the authentication format for stream feeds? (e.g., basic auth, ONVIF credentials, or custom JWT tokens).
2.  **Computer Vision (AI) Models**:
    *   What AI processing models must be connected? (e.g., YOLOv8 for object recognition, custom models for license plates, or OCR for equipment text scanning).
    *   Are the models hosted locally (Ollama/Custom GPUs) or queried via cloud APIs (AWS Rekognition / Azure Vision)?
3.  **Telemetry & Event Dispatches**:
    *   When an object of interest is detected, what payload must be emitted onto the AI Kernel?
    *   How does the Governance Kernel gate camera feeds to protect privacy?
4.  **Storage & Retention Policy**:
    *   Should the platform save raw video clips, processed snapshots, or metadata alerts only?
    *   What are the storage keys and directory structures?
5.  **Frontend Layout**:
    *   What visual components must exist? (e.g., live video player grids, overlay markers, active alerts sidebars, or camera health scorecards).
