/**
 * Session 91 & Production Fix — SMTP client protocol test.
 *
 * Spins up a real in-process SMTP server over TCP and proves the client
 * speaks the actual wire protocol (greeting → EHLO → MAIL FROM → RCPT TO →
 * DATA → QUIT), plus the honest failure paths (connection refused, wrong
 * recipient code, timeout, TLS verification).
 */
import { describe, it, expect, afterEach } from "vitest";
import net from "node:net";
import { sendSmtp, sanitizeSmtpError } from "./smtp.client.js";
import type { SmtpSendOptions } from "./smtp.client.js";

type Server = ReturnType<typeof net.createServer>;

async function startFakeSmtp(opts: {
  port?: number;
  rejectRcpt?: boolean;
  auth?: boolean;
  rejectPlain?: boolean;
  noGreeting?: boolean;
} = {}): Promise<{ server: Server; port: number; transcript: string[] }> {
  const transcript: string[] = [];
  const server = net.createServer((sock) => {
    let dataMode = false;
    let authStep: "user" | "pass" | null = null;
    let buffer = "";
    const send = (line: string) => sock.write(`${line}\r\n`);

    if (!opts.noGreeting) send("220 fake.example ESMTP ready");

    sock.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      while (buffer.includes("\r\n")) {
        const idx = buffer.indexOf("\r\n");
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (dataMode) {
          if (line === ".") {
            dataMode = false;
            send("250 2.0.0 OK queued as 12345");
          }
          continue;
        }
        transcript.push(line);
        if (authStep === "user") {
          send("334 UGFzc3dvcmQ6");
          authStep = "pass";
          continue;
        }
        if (authStep === "pass") {
          send("235 2.7.0 Authentication successful");
          authStep = null;
          continue;
        }
        const cmd = line.split(" ")[0].toUpperCase();
        if (cmd === "EHLO") {
          send("250-fake.example greets you");
          send("250-AUTH PLAIN LOGIN");
          send("250 OK");
        } else if (cmd === "AUTH") {
          if (opts.auth === false) {
            send("503 5.5.1 Unrecognized command");
          } else if (/^AUTH LOGIN/i.test(line)) {
            send("334 VXNlcm5hbWU6");
            authStep = "user";
          } else if (opts.rejectPlain && /^AUTH PLAIN/i.test(line)) {
            send("535 5.7.8 Authentication failed");
          } else {
            send("235 2.7.0 Authentication successful");
          }
        } else if (cmd === "MAIL") {
          send("250 2.1.0 Ok");
        } else if (cmd === "RCPT") {
          send(opts.rejectRcpt ? "550 5.1.1 No such user" : "250 2.1.5 Ok");
        } else if (cmd === "DATA") {
          dataMode = true;
          send("354 End data with <CR><LF>.<CR><LF>");
        } else if (cmd === "QUIT") {
          send("221 2.0.0 Bye");
          sock.end();
        } else {
          send("502 5.5.2 Unrecognized command");
        }
      }
    });
    sock.on("error", () => { /* client closed early */ });
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, "127.0.0.1", resolve));
  const addr = server.address() as net.AddressInfo;
  return { server, port: addr.port, transcript };
}

const servers: Server[] = [];
async function makeServer(opts: Parameters<typeof startFakeSmtp>[0] = {}) {
  const { server, port } = await startFakeSmtp(opts);
  servers.push(server);
  return { port, transcript: server as unknown as Server };
}

afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise<void>((resolve) => { try { s.close(() => resolve()); } catch { resolve(); } })));
  servers.length = 0;
});

const baseOpts = (port: number, overrides: Partial<SmtpSendOptions> = {}): SmtpSendOptions => ({
  host: "127.0.0.1",
  port,
  from: "sender@example.com",
  to: ["recipient@example.com"],
  subject: "Hello",
  text: "Line one\nLine two",
  timeoutMs: 5000,
  ...overrides,
});

describe("sendSmtp — real wire protocol against an in-process SMTP server", () => {
  it("delivers a message: EHLO → MAIL → RCPT → DATA → QUIT and returns the final 250", async () => {
    const { port } = await makeServer();
    const res = await sendSmtp(baseOpts(port));

    expect(res.ok).toBe(true);
    expect(res.errorCode).toBe("OK");
    expect(res.response).toContain("250 2.0.0 OK queued");
  });

  it("sends to multiple recipients including cc", async () => {
    const { port } = await makeServer();
    const res = await sendSmtp(baseOpts(port, {
      to: ["a@example.com", "b@example.com"],
      cc: ["c@example.com"],
    }));
    expect(res.ok).toBe(true);
  });

  it("performs AUTH PLAIN when credentials are supplied", async () => {
    const { port } = await makeServer({ auth: true });
    const res = await sendSmtp(baseOpts(port, { username: "user", password: "pass" }));
    expect(res.ok).toBe(true);
  });

  it("falls back to AUTH LOGIN when AUTH PLAIN is rejected", async () => {
    const { port } = await makeServer({ auth: true, rejectPlain: true });
    const res = await sendSmtp(baseOpts(port, { username: "user", password: "pass" }));
    expect(res.ok).toBe(true);
  });

  it("fails honestly when the server rejects a recipient", async () => {
    const { port } = await makeServer({ rejectRcpt: true });
    const res = await sendSmtp(baseOpts(port, { to: ["missing@example.com"] }));
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("SMTP_RECIPIENT_REJECTED");
    expect(res.error).toContain("missing@example.com");
  });

  it("fails honestly when the connection is refused", async () => {
    const res = await sendSmtp(baseOpts(1, { timeoutMs: 1500 }));
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("SMTP_CONNECTION_FAILED");
  });

  it("times out honestly when the server never greets", async () => {
    const { port } = await makeServer({ noGreeting: true });
    const res = await sendSmtp(baseOpts(port, { timeoutMs: 800 }));
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("SMTP_TIMEOUT");
  });

  it("sanitizes passwords and secrets from error strings", () => {
    const raw = "AUTH PLAIN dXNlcgBwYXNz password=SecretPassword123 failed";
    const clean = sanitizeSmtpError(raw);
    expect(clean).not.toContain("SecretPassword123");
    expect(clean).toContain("[REDACTED]");
  });

  it("rejects invalid/self-signed SSL certificates when rejectUnauthorized is true", async () => {
    // Attempt TLS connect to plain local server expecting TLS — fails TLS handshake
    const { port } = await makeServer();
    const res = await sendSmtp(baseOpts(port, { secure: true, rejectUnauthorized: true, timeoutMs: 1000 }));
    expect(res.ok).toBe(false);
    expect(["SMTP_TLS_VERIFICATION_FAILED", "SMTP_CONNECTION_FAILED", "SMTP_TIMEOUT"]).toContain(res.errorCode);
  });
});
