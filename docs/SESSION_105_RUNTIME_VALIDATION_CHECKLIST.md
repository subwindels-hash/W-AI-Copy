# Session 105 Runtime Validation Checklist — Message Attachments

> **Status:** 🟡 pending target-environment execution. Run with live
> PostgreSQL 17 and the configured filesystem/object-storage volume.

- [ ] Upload allowed text/image/PDF files; verify normalized metadata returns
      `sha256`, `previewText`, size, MIME and org-safe timestamps.
- [ ] Upload empty, oversized and disallowed-MIME files; verify validation
      errors and no metadata/object row is created.
- [ ] Verify new objects use the full SHA-256 in their organization-prefixed
      storage key and a repeated identical object does not create a collision.
- [ ] List/search/paginate attachments and read `/:id/meta`; values persist
      after API restart and match the database row.
- [ ] Stream `/:id` bytes and verify content type, length, disposition and
      byte content match the stored checksum.
- [ ] Authenticate as organization B and prove B cannot list, read metadata,
      stream, delete, target or claim organization A's attachments.
- [ ] Verify only the uploader can delete an unclaimed attachment; claimed
      message/talk attachments are protected from standalone deletion.
- [ ] Upload from `/app/files`, `/app/attachments` and `/m/files`; confirm
      mobile camera/photo/document controls perform real multipart uploads and
      refresh from the paginated API.
- [ ] Capture request IDs, checksum/file-volume evidence and this checklist
      before marking Session 105 🟢.

**Operator:** ____________________  **Environment:** ____________________

**Executed at (UTC):** ___________  **Release/commit:** ____________________
