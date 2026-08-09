/**
 * Service-to-service auth — mTLS validation tests.
 *
 * Generates a real CA + client certificate with openssl and verifies: valid
 * certs authenticate, expired certs fail, untrusted (wrong-CA) certs fail, and
 * the expected-CN binding is enforced.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateMutualTLS } from "./serviceToServiceAuth.service.js";

function openssl(args: string[], cwd: string): string {
  return execFileSync("openssl", args, { cwd }).toString();
}

interface TestCerts {
  caPem: string;
  leafPem: string; // valid leaf (CN=svc-api)
  expiredLeafPem: string; // expired leaf (CN=svc-expired)
  otherCaLeafPem: string; // leaf from a different CA
  dir: string;
}

let certs: TestCerts;

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "windels-mtls-"));
  // CA 1
  openssl(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-days", "365", "-subj", "/CN=svc-root"], dir);
  // Leaf issued by CA 1 (CN=svc-api)
  openssl(["req", "-newkey", "rsa:2048", "-nodes", "-keyout", "leaf.key", "-out", "leaf.csr", "-subj", "/CN=svc-api"], dir);
  openssl(["x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "leaf.pem", "-days", "365"], dir);
  // Expired leaf (CN=svc-expired)
  openssl(["req", "-newkey", "rsa:2048", "-nodes", "-keyout", "exp.key", "-out", "exp.csr", "-subj", "/CN=svc-expired"], dir);
  openssl(["x509", "-req", "-in", "exp.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "exp.pem", "-days", "-1"], dir);
  // Different CA (CN=other-root), leaf CN=svc-api
  openssl(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca2.key", "-out", "ca2.pem", "-days", "365", "-subj", "/CN=other-root"], dir);
  openssl(["req", "-newkey", "rsa:2048", "-nodes", "-keyout", "leaf2.key", "-out", "leaf2.csr", "-subj", "/CN=svc-api"], dir);
  openssl(["x509", "-req", "-in", "leaf2.csr", "-CA", "ca2.pem", "-CAkey", "ca2.key", "-CAcreateserial", "-out", "leaf2.pem", "-days", "365"], dir);

  certs = {
    caPem: readFileSync(join(dir, "ca.pem"), "utf8"),
    leafPem: readFileSync(join(dir, "leaf.pem"), "utf8"),
    expiredLeafPem: readFileSync(join(dir, "exp.pem"), "utf8"),
    otherCaLeafPem: readFileSync(join(dir, "leaf2.pem"), "utf8"),
    dir,
  };
});

afterAll(() => {
  const { rmSync } = require("node:fs");
  try { rmSync(certs.dir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("validateMutualTLS", () => {
  const originalEnv = { ...process.env };
  afterAll(() => { process.env = { ...originalEnv }; });

  it("returns 'mTLS not required' when requireMutualTLS is false", async () => {
    const res = await validateMutualTLS("not-a-cert", { requireMutualTLS: false });
    expect(res.authenticated).toBe(false);
    expect(res.error).toBe("mTLS not required");
  });

  it("rejects a missing/empty certificate", async () => {
    const res = await validateMutualTLS("", { requireMutualTLS: true });
    expect(res.authenticated).toBe(false);
    expect(res.error).toMatch(/No client certificate/i);
  });

  it("rejects an unparseable certificate", async () => {
    const res = await validateMutualTLS("this is not a pem cert", { requireMutualTLS: true });
    expect(res.authenticated).toBe(false);
    expect(res.error).toMatch(/Invalid client certificate/i);
  });

  it("authenticates a valid certificate issued by the trusted CA", async () => {
    process.env.S2S_MTLS_CA_CERT = certs.caPem;
    delete process.env.S2S_MTLS_EXPECTED_CN;
    const res = await validateMutualTLS(certs.leafPem, { requireMutualTLS: true });
    expect(res.authenticated).toBe(true);
    expect(res.serviceId).toBe("svc-api");
  });

  it("rejects an expired certificate", async () => {
    process.env.S2S_MTLS_CA_CERT = certs.caPem;
    delete process.env.S2S_MTLS_EXPECTED_CN;
    const res = await validateMutualTLS(certs.expiredLeafPem, { requireMutualTLS: true });
    expect(res.authenticated).toBe(false);
    expect(res.error).toMatch(/expired|valid/i);
  });

  it("rejects a certificate not issued by the trusted CA", async () => {
    process.env.S2S_MTLS_CA_CERT = certs.caPem;
    delete process.env.S2S_MTLS_EXPECTED_CN;
    const res = await validateMutualTLS(certs.otherCaLeafPem, { requireMutualTLS: true });
    expect(res.authenticated).toBe(false);
    expect(res.error).toMatch(/issued by the trusted CA/i);
  });

  it("enforces the expected subject CN binding", async () => {
    process.env.S2S_MTLS_CA_CERT = certs.caPem;
    process.env.S2S_MTLS_EXPECTED_CN = "svc-expected";
    const res = await validateMutualTLS(certs.leafPem, { requireMutualTLS: true });
    expect(res.authenticated).toBe(false);
    expect(res.error).toMatch(/does not match expected/i);
  });
});
