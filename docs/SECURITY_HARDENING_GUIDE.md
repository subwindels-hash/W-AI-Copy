# SECURITY HARDENING MANUAL — WINDELS AI OS

**Version:** v2.0.0-staging  
**Classification:** Enterprise Security  

---

## 1. STRATEGIC HARDENING PROCEDURES

Protect the operating system and data nodes with the following security filters:

---

## 2. ADVANCED DATA PROTECTION

*   **AES-256-GCM Envelope Encryption**: Sensitive environment values (e.g. database credentials, partner API keys) are encrypted before committing transactions.
*   **Recursive PII Redaction**: The custom pino logging system scans and scrubs emails, passwords, and tokens.

---

## 3. ACCESS CONTROL

*   **TOTP Verification**: Mandatory multi-factor authentication for administrators.
*   **JSON Web Token Rotation**: Short-lived (15 minute) access tokens with secure-only refresh cookies (7 days).
*   **IP Whitelists**: Lock SSH, PG, and Redis connection layers to local networks.
