# Session 104 Runtime Validation Checklist — API Key Management

> **Status:** 🟡 pending target-environment execution. Run with live
> PostgreSQL 17 and a reachable Prisma runtime engine.

- [ ] Create an API key through `/api/v1/apikeys`; verify the plaintext starts
      with `wnd_`, is shown once, and the database stores only its SHA-256 hash.
- [ ] List and detail endpoints expose prefix/scopes/expiry/last-used metadata
      but never expose the hash or plaintext.
- [ ] Verify a valid bearer key authenticates the public REST gateway; malformed,
      bogus, expired and revoked tokens are rejected.
- [ ] Two organizations create keys with identical names; each organization
      lists, reads, updates and revokes only its own key.
- [ ] Update name/scopes and revoke a key; verify corresponding `AuditLog`
      records and that a revoked key cannot be reactivated or changed.
- [ ] Verify `includeRevoked=true` is required to see revoked metadata and the
      default list contains active keys only.
- [ ] Confirm Developer Portal API-key actions and the dedicated `/app/api-keys`
      page use the same persisted service state.
- [ ] Capture request IDs, database hash checks, bearer-token results and this
      checklist before marking Session 104 🟢.

**Operator:** ____________________  **Environment:** ____________________

**Executed at (UTC):** ___________  **Release/commit:** ____________________
