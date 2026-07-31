/**
 * ClamAV adapter — INSTREAM protocol against a real in-process clamd stub.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import net from "node:net";
import { scanBufferWithClamav, clamdTarget, clamavConfigured } from "./clamav.service.js";

afterEach(() => { vi.unstubAllEnvs(); });

/** Minimal clamd INSTREAM stub: skips the zINSTREAM preamble, reads length-prefixed chunks until 0, then replies. */
function startClamd(reply: string): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = net.createServer((sock) => {
      const chunks: Buffer[] = [];
      let body = Buffer.alloc(0);
      let preamble = true;
      sock.on("data", (d) => {
        if (preamble) {
          // Strip "zINSTREAM\0" (10 bytes) on first contact.
          body = d.subarray(10);
          preamble = false;
        } else {
          body = Buffer.concat([body, d]);
        }
        while (body.length >= 4) {
          const len = body.readUInt32BE(0);
          if (len === 0) {
            sock.write(reply + "\n");
            sock.end();
            body = Buffer.alloc(0);
            continue;
          }
          if (body.length < 4 + len) break;
          chunks.push(body.subarray(4, 4 + len));
          body = body.subarray(4 + len);
        }
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ port: addr.port, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

describe("scanBufferWithClamav", () => {
  it("reports not_configured when no target is available", async () => {
    vi.stubEnv("CLAMD_HOST", "");
    const r = await scanBufferWithClamav(Buffer.from("x"));
    expect(r.configured).toBe(false);
    expect(r.status).toBe("not_configured");
  });

  it("parses a clean verdict", async () => {
    const { port, close } = await startClamd("stream: OK");
    try {
      const r = await scanBufferWithClamav(Buffer.from("hello world"), { host: "127.0.0.1", port });
      expect(r.status).toBe("clean");
      expect(r.configured).toBe(true);
    } finally { await close(); }
  });

  it("parses an infected verdict with signature", async () => {
    const { port, close } = await startClamd("stream: Eicar-Test-Signature FOUND");
    try {
      const r = await scanBufferWithClamav(Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR"), { host: "127.0.0.1", port });
      expect(r.status).toBe("infected");
      expect(r.signature).toBe("Eicar-Test-Signature");
    } finally { await close(); }
  });

  it("parses an error reply", async () => {
    const { port, close } = await startClamd("ERROR: Can't scan");
    try {
      const r = await scanBufferWithClamav(Buffer.from("x"), { host: "127.0.0.1", port });
      expect(r.status).toBe("error");
    } finally { await close(); }
  });

  it("clamdTarget parses env", () => {
    vi.stubEnv("CLAMD_HOST", "tcp://clamd.internal:3310");
    expect(clamdTarget()).toEqual({ host: "clamd.internal", port: 3310 });
    expect(clamavConfigured()).toBe(true);
  });
});
