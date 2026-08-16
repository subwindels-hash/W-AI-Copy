# WINDELS AI OS — NFC Card Manager

## Release posture

The NFC capability is additive and integrated into the existing WINDELS web, desktop, API, Prisma, IAM/RBAC, audit, AI, Identity, Marketplace API-product, and developer-platform layers.

**Production hardware support is not declared by this repository alone.** No physical NFC reader was attached to the implementation environment for this change, so the qualification matrix begins empty. The software deliberately reports reader/card pairs as `UNVERIFIED` and blocks mutations until an administrator records a successful real-hardware test run for the exact reader interface, driver/OS stack, and card technology.

This is a safety property, not a missing mock. The manager never substitutes simulated hardware results for qualification evidence.

## Architecture

```text
WINDELS AI OS frontend
  ├─ authenticated /api/v1/nfc (JWT + NFC RBAC)
  ├─ developer /api/rest/v1/nfc (API key + granular NFC scopes)
  ├─ Web NFC adapter (secure-context, user-gesture read only)
  └─ Electron preload (narrow, context-isolated NFC IPC)
       ↓
WINDELS Desktop PC/SC hardware adapter
       ↓
OS PC/SC service + CCID/vendor driver
       ↓
USB NFC reader
       ↓
NFC card/tag
```

The backend creates short-lived, idempotent operation plans. Hardware I/O remains local. A write, update, erase, lock, or protection request is not marked successful until the adapter reads the card again and `/nfc/verify` compares the exact SHA-256 read-back hash with the intended NDEF message.

## Implemented capabilities

- Automatic PC/SC reader and card-present/card-removed events in WINDELS Desktop.
- Web NFC scanning on compatible secure-context browsers. Browser reads are intentionally reported read-only because Web NFC does not expose reliable tag capacity, product identity, or lock bytes.
- NFC Forum Type 2 Capability Container inspection.
- Protocol-level NXP `GET_VERSION` recognition for NTAG213, NTAG215, and NTAG216. An ATR alone is never used to claim a product model.
- Strict NDEF encode/decode for URI, text, vCard MIME, Wi-Fi Simple Configuration, custom MIME/external/unknown records, and multi-record messages.
- NFC Forum Type 2 NDEF TLV encoding, including extended lengths.
- Capacity calculation including Type 2 TLV overhead.
- Safe Type 2 writes: publish an empty TLV, write trailing pages, commit the final TLV header last, read the full area back, and compare exact bytes.
- Type 2 erase with read-back verification.
- Permanent static and dynamic lock-bit programming for protocol-identified NTAG213/215/216 only. It remains blocked unless that exact combination has a real lock test recorded and the user types `LOCK PERMANENTLY`.
- Password protection is surfaced as unsupported by the generic PC/SC adapter. It requires a card-specific qualified SDK/adapter; WINDELS does not guess configuration pages or keys.
- Tenant-scoped card library, encrypted-at-rest NDEF payload details, profiles/assignments, reader inventory, operation history, and diagnostics.
- Raw card UIDs and local reader IDs are accepted only in transit. The server stores HMAC-derived identifiers and an optional masked UID suffix.
- WINDELS profile, Marketplace/vendor/product, business-card, contact, event, social, website, and custom templates.
- QR fallback for URI/profile records.
- AI-assisted record preparation through the existing AI provider registry. AI cannot invoke destructive NFC operations.

## Capability truth table

| Interface / card | Detect | NDEF read | Capacity | NDEF write | Erase | Lock | Protect | Declared status |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Web NFC / browser-supported NDEF tag | Yes, after user gesture | Yes | Not exposed | Blocked by WINDELS safety gate | No | No | No | Read only |
| PC/SC / unknown technology | Reader/card event | Only when a valid Type 2 CC is observed | From CC when present | Blocked | Blocked | Blocked | Blocked | Unverified or unsupported |
| PC/SC / protocol-identified NTAG213 | Implemented | Implemented | 144-byte user/CC observation | Implemented, qualification-gated | Implemented, qualification-gated | Implemented, qualification-gated and irreversible | No | **Unverified until physical test** |
| PC/SC / protocol-identified NTAG215 | Implemented | Implemented | 504-byte physical user memory; writable NDEF area from CC | Implemented, qualification-gated | Implemented, qualification-gated | Implemented, qualification-gated and irreversible | No | **Unverified until physical test** |
| PC/SC / protocol-identified NTAG216 | Implemented | Implemented | 888-byte physical user memory; writable NDEF area from CC | Implemented, qualification-gated | Implemented, qualification-gated | Implemented, qualification-gated and irreversible | No | **Unverified until physical test** |
| MIFARE Ultralight (unidentified variant) | Reader/card event | Only if Type 2 CC is readable | From CC when present | Blocked until exact variant qualification | Blocked | Blocked | Blocked | Unverified |
| MIFARE Classic | Reader/card event | Not implemented (sector authentication/layout required) | Unknown | No | No | No | No | Unsupported by generic adapter |
| MIFARE DESFire | Reader/card event | Not implemented (DESFire NDEF application/authentication required) | Unknown | No | No | No | No | Unsupported by generic adapter |

The matrix must be updated only from physical test evidence. Detection of an ISO 14443 family is not equivalent to product or operation support.

## Desktop prerequisites

### Windows

1. Enable the Windows Smart Card service.
2. Install the reader vendor's signed CCID/PC/SC driver where Windows does not provide one.
3. Build `@pokusew/pcsclite` for the Electron/Node ABI used by the packaged desktop application.
4. Confirm the reader appears in a PC/SC diagnostic utility before opening WINDELS Desktop.

### macOS

1. Use a macOS-compatible CCID/PC/SC reader/driver.
2. Build the native `pcsclite` dependency for the packaged architecture (arm64 or x64).
3. Ensure hardened-runtime signing includes the native addon. Electron Builder unpacks the addon from ASAR.

### Linux

Install the distribution equivalents of `pcscd`, `libpcsclite`, development headers for packaging, and the reader's CCID driver. Start `pcscd`, verify the reader with `pcsc_scan`, then launch WINDELS Desktop.

`nfc-pcsc` is an optional desktop dependency so web/API deployments that have no local hardware do not fail. A desktop package intended for NFC must include a successfully built native PC/SC addon.

## Real-hardware qualification protocol

Create a separate test run for every reader model/firmware, OS/driver version, application version, and card technology/lot that will be declared supported.

1. Record reader model, firmware, USB identifiers, OS version, driver/PCSC version, WINDELS Desktop version, and card manufacturer/technology/lot.
2. Disconnect/reconnect the reader and verify automatic reader recovery.
3. Present/remove/re-present the card and verify automatic card events without duplicate mutation operations.
4. Confirm technology identification is protocol/SDK verified. If only ATR family data is available, retain `Unknown NFC Technology`.
5. Read an empty card and a known multi-record NDEF card.
6. Compare reported writable capacity with the card datasheet and observed Capability Container.
7. Write URL + text + vCard test records below capacity.
8. Read back with WINDELS and an independent NFC device/application. Compare exact content.
9. Update existing content; verify the stale-hash gate cancels after swapping cards or changing content.
10. Attempt an oversized write and confirm no hardware write command occurs.
11. Interrupt a write, remove the card, and confirm failure with no success status. Re-present and inspect recovery.
12. Erase only a disposable test card and verify empty NDEF read-back.
13. If lock support will be offered, use a disposable tag. Confirm the irreversible warning, lock, power-cycle, and prove writes fail while reads remain correct.
14. Test invalid/unsupported cards, reader loss, driver loss, malformed NDEF, and locked cards.
15. Verify RBAC denial for missing `NFC_WRITE` / `NFC_DESTRUCTIVE` and API-key denial for missing `nfc:write` / `nfc:admin`.
16. Verify tenant isolation, audit events, idempotency behavior, and absence of raw UIDs/secrets in database rows and logs.
17. Store the immutable test-run identifier and evidence, then call the administrator qualification endpoint. Grant only operations that passed.

Qualification endpoint:

```http
POST /api/v1/nfc/readers/:readerId/qualify
Authorization: Bearer <admin JWT>
Content-Type: application/json

{
  "technology": "NTAG215",
  "hardwareTestRunId": "lab-run-2026-08-16-readerA-lot42",
  "testedAt": "2026-08-16T18:00:00.000Z",
  "readerDetectionPassed": true,
  "cardDetectionPassed": true,
  "readPassed": true,
  "writePassed": true,
  "verifyPassed": true,
  "erasePassed": true,
  "lockPassed": false,
  "protectPassed": false,
  "notes": "ACR reader firmware ..., Windows driver ..., independent Android read-back ..."
}
```

This endpoint requires `NFC_ADMIN`. A failed read cannot be qualified. A write cannot be qualified without successful read-back verification.

## API surface

Authenticated application API:

```text
GET    /api/v1/nfc/readers
POST   /api/v1/nfc/readers/report
POST   /api/v1/nfc/readers/:id/qualify
GET    /api/v1/nfc/cards
GET    /api/v1/nfc/cards/:id
PATCH  /api/v1/nfc/cards/:id
POST   /api/v1/nfc/read
POST   /api/v1/nfc/write
POST   /api/v1/nfc/update
POST   /api/v1/nfc/erase
POST   /api/v1/nfc/lock
POST   /api/v1/nfc/protect
POST   /api/v1/nfc/verify
GET    /api/v1/nfc/operations
GET    /api/v1/nfc/templates
GET    /api/v1/nfc/profiles
POST   /api/v1/nfc/profiles
GET    /api/v1/nfc/diagnostics
```

API-key gateway equivalents are under `/api/rest/v1/nfc`. They use `nfc:read`, `nfc:write`, and `nfc:admin`, existing key restrictions, gateway rate limiting, and usage metering. API calls still require a local authorized hardware adapter; the API is not a remote USB tunnel.

## Security and audit

- `NFC_READ`: inspect readers/cards, templates, profiles, operations, and diagnostics.
- `NFC_WRITE`: report hardware reads, create/update profiles and cards, prepare writes/updates, and submit verification.
- `NFC_DESTRUCTIVE`: prepare erase, lock, and protection operations in the application API.
- `NFC_ADMIN`: record real-hardware qualifications.
- `nfc:read`, `nfc:write`, `nfc:admin`: developer API equivalents.
- Operation plans expire after five minutes and are idempotent per organization.
- The local bridge accepts NFC IPC only from the trusted top-level WINDELS renderer origin.
- Existing NDEF content must be read, displayed, hash-matched, and explicitly confirmed before replacement.
- Lock/protection plans require the exact phrase `LOCK PERMANENTLY`.
- NDEF payload details are AES-256-GCM encrypted at rest through the existing WINDELS encryption service.
- Audit events include reader detection/qualification, card reads, mutation requests, verification success/failure, and hardware errors.

## Automated validation

The automated suite covers strict NDEF parsing, multiple records, URI/text/vCard/custom encoding, Wi-Fi credential display masking, Type 2 TLV lengths, malformed input, qualification gating, capacity rejection, overwrite confirmation, exact read-back success, and mismatch failure.

Automated tests do not replace the real-hardware qualification protocol above.
