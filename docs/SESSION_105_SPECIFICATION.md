# SESSION 105 SPECIFICATION — MESSAGE ATTACHMENTS COMPLETION

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S104, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Workspace & Files Platform
```

## 1. Objective

The Session 4 attachment store already enforced MIME/size limits, checksums,
organization targets and uploader deletion, and the Files page existed. The
audit still classified it as `PARTIAL` because the API/client metadata shapes
did not agree (`checksum` vs `sha256`, `extractedText` vs `previewText`), the
mobile client treated a paginated response as an array and its picker actions
were no-ops, there was no shared contract, and the route had no metadata
endpoint or expanded service tests.

Session 105 completes the module:

1. shared `Att` metadata, pagination, ID and upload-target contracts;
2. normalized upload/list/detail metadata with real SHA-256 and text preview;
3. org-scoped metadata and byte reads with uploader-only deletion;
4. full checksum storage keys to avoid short-prefix collisions;
5. additive metadata endpoint and shared route validation;
6. mobile upload actions backed by the real multipart API;
7. service tests for validation, checksums, previews, pagination, bytes,
   target isolation, deletion and attachment claims.

## 2. Storage and security

Attachment bytes remain under the configured `uploads/` root and metadata is
stored in Prisma `MessageAttachment`. New storage keys use:

```
<organizationId>/<full-sha256>-<safe-filename>
```

The service verifies a pre-existing object has the same full SHA-256 before
reusing it. New metadata reads and byte reads require the caller's resolved
organization. Upload targets (`conversationId` and `talkMessageId`) are
verified against that organization. Only the uploader can delete an unclaimed
attachment; message/talk attachments cannot be deleted independently.

## 3. API surface (`/api/v1/attachments`, authenticated)

| Method | Path | Purpose |
|---|---|---|
| POST | `/` | multipart upload with optional org-scoped conversation/talk target |
| GET | `/` | normalized metadata list/search/pagination |
| GET | `/:id/meta` | normalized metadata detail |
| GET | `/:id` | org-scoped byte stream with content headers |
| DELETE | `/:id` | uploader-only delete for unclaimed files |

The shared response shape is `AttAttachment`:
`{ id, filename, mimeType, sizeBytes, sha256, previewText, conversationId,
talkMessageId, createdAt }`.

## 4. UI

The existing `/app/files` Files page continues to render the real attachment
store. Session 105 adds the exact `/app/attachments` compatibility route and
sidebar entry, and fixes `/m/files` to use the shared paginated client and real
multipart uploads for camera/photo/document actions. Empty, loading and upload
errors remain visible rather than silently fabricating state.

## 5. Verification gate

- `apps/api/src/attachments/attachments.test.ts` now covers 10 cases:
  validation, checksum/storage scope, cross-tenant list/detail/byte access,
  normalized previews/pagination, target organization validation, uploader
  deletion and claim ownership.
- `make verify` must pass with offline Prisma generation; live Postgres,
  filesystem/object-store durability and end-to-end multipart validation remain
  runtime gates.
- The inventory may mark Attachments COMPLETE only when shared contracts,
  normalized service/routes, typed client, web/mobile surfaces and tests exist.
