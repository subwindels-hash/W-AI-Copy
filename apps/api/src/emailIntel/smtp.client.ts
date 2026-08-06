/**
 * Session 91 — Minimal dependency-free SMTP client.
 *
 * Speaks the real SMTP wire protocol over `node:net` / `node:tls`:
 * greeting → EHLO → (AUTH PLAIN) → MAIL FROM → RCPT TO* → DATA → QUIT.
 * Used by the Email Intelligence outbox so "send" actually delivers when an
 * SMTP host is configured — nothing here is simulated.
 *
 * The client is deliberately small and defensive: response-code parsing,
 * line-based framing, socket timeouts, and explicit error codes so the
 * outbox can store an honest `failed` reason.
 *
 * Line handling: server responses can arrive in arbitrary TCP segment
 * boundaries and multi-line responses (250-foo / 250-bar) may land before
 * the caller has re-queued its next reader. Lines are therefore buffered in
 * order and served FIFO; a reader never misses a line.
 */
import net from "node:net";
import tls from "node:tls";

export interface SmtpSendOptions {
  host: string;
  port: number;
  /** TLS on connect (465-style implicit TLS). */
  secure?: boolean;
  username?: string | null;
  password?: string | null;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  timeoutMs?: number;
}

export interface SmtpSendResult {
  ok: boolean;
  /** Final server response line (e.g. "250 OK ..."), when reached. */
  response: string | null;
  errorCode: string;
  error: string | null;
}

const CODES = {
  CONN: "SMTP_CONNECTION_FAILED",
  TIMEOUT: "SMTP_TIMEOUT",
  PROTOCOL: "SMTP_PROTOCOL_ERROR",
  AUTH: "SMTP_AUTH_REJECTED",
  REJECTED: "SMTP_RECIPIENT_REJECTED",
};

/** Ordered line reader over a socket: buffered FIFO, never drops lines. */
function makeLineReader(sock: net.Socket) {
  let buf = "";
  let errored: Error | null = null;
  // Lines that arrived before a waiter existed are queued here.
  const pending: string[] = [];
  const waiters: Array<(line: string | typeof PromiseRejectPlaceholder) => void> = [];

  sock.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let m: number;
    while ((m = buf.search(/\r?\n/)) !== -1) {
      const eol = buf[m] === "\r" ? m + 2 : m + 1; // consume the whole CRLF / LF
      const line = buf.slice(0, m);
      buf = buf.slice(eol);
      const waiter = waiters.shift();
      if (waiter) waiter(line);
      else pending.push(line);
    }
  });
  sock.on("error", (e) => {
    errored = e;
    for (const w of waiters.splice(0)) w(PromiseRejectPlaceholder);
  });

  function nextLine(): Promise<string> {
    if (errored) return Promise.reject(errored);
    const buffered = pending.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);
    return new Promise((resolve, reject) => {
      waiters.push((line) => {
        if (line === PromiseRejectPlaceholder) reject(errored);
        else resolve(line);
      });
    });
  }
  return { nextLine, close: () => sock.destroy() };
}

// Sentinel used to reject waiters from the error handler.
const PromiseRejectPlaceholder = Symbol("reject-placeholder");

/** Expect a line starting with `code` (e.g. "250"). Multi-line (250-...) is folded. */
async function expectCode(
  next: () => Promise<string>,
  code: string,
  step: string,
  continuation: (lines: string[]) => void = () => {}
): Promise<string> {
  const lines: string[] = [];
  for (let i = 0; i < 12; i++) {
    const line = await next();
    lines.push(line);
    if (line.length < 3) throw new Error(`${CODES.PROTOCOL}: ${step} — short response "${line}"`);
    const num = line.slice(0, 3);
    const isLast = line.length === 3 || line[3] !== "-";
    if (num === code && isLast) {
      continuation(lines);
      return lines.join("\n");
    }
    if (num !== code && isLast) {
      throw new Error(`${CODES.PROTOCOL}: ${step} — expected ${code} got "${line}"`);
    }
  }
  throw new Error(`${CODES.PROTOCOL}: ${step} — response did not terminate`);
}

export async function sendSmtp(opts: SmtpSendOptions): Promise<SmtpSendResult> {
  const { host, port, secure, username, password, from, to, cc, subject, text } = opts;
  const timeoutMs = opts.timeoutMs ?? 10_000;

  return new Promise<SmtpSendResult>((resolve) => {
    const sock = secure
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: false })
      : net.connect({ host, port });
    const reader = makeLineReader(sock);
    const fail = (errorCode: string, error: string | null) => {
      try { sock.destroy(); } catch { /* ignore */ }
      resolve({ ok: false, response: null, errorCode, error });
    };
    const succeed = (response: string) => {
      try { sock.destroy(); } catch { /* ignore */ }
      resolve({ ok: true, response, errorCode: "OK", error: null });
    };

    sock.setTimeout(timeoutMs);
    sock.on("timeout", () => fail(CODES.TIMEOUT, `Timed out after ${timeoutMs}ms talking to ${host}:${port}`));
    sock.on("error", (e) => fail(CODES.CONN, `${host}:${port} — ${e.message}`));

    (async () => {
      try {
        // 1. Greeting
        await expectCode(() => reader.nextLine(), "220", "greeting");

        // 2. EHLO — the client must announce itself before expecting 250s.
        sock.write(`EHLO windels\r\n`);
        await expectCode(() => reader.nextLine(), "250", "EHLO");

        // 3. Optional AUTH PLAIN (only when credentials are supplied)
        if (username && password) {
          sock.write(`AUTH PLAIN ${Buffer.from(`\u0000${username}\u0000${password}`, "utf8").toString("base64")}\r\n`);
          try {
            await expectCode(() => reader.nextLine(), "235", "AUTH PLAIN");
          } catch (e) {
            throw new Error(`${CODES.AUTH}: ${(e as Error).message}`);
          }
        }

        // 4. MAIL FROM
        sock.write(`MAIL FROM:<${from}>\r\n`);
        await expectCode(() => reader.nextLine(), "250", "MAIL FROM");

        // 5. RCPT TO
        for (const rcpt of [...to, ...(cc ?? [])]) {
          sock.write(`RCPT TO:<${rcpt}>\r\n`);
          try {
            await expectCode(() => reader.nextLine(), "250", `RCPT TO ${rcpt}`);
          } catch (e) {
            throw new Error(`${CODES.REJECTED}: ${rcpt} — ${(e as Error).message}`);
          }
        }

        // 6. DATA
        sock.write("DATA\r\n");
        await expectCode(() => reader.nextLine(), "354", "DATA");
        const headers = [
          `From: ${from}`,
          `To: ${to.join(", ")}`,
          cc && cc.length ? `Cc: ${cc.join(", ")}` : "",
          `Subject: ${subject.replace(/\r?\n/g, " ")}`,
          "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=utf-8",
          "",
          text.replace(/\r\n/g, "\n").replace(/^\./gm, ".."),
          ".",
          "",
        ].filter((l) => l !== undefined);
        sock.write(headers.join("\r\n") + "\r\n");

        const final = await expectCode(() => reader.nextLine(), "250", "DATA completion");
        sock.write("QUIT\r\n");
        await reader.nextLine().catch(() => null); // 221 — best effort
        succeed(final);
      } catch (e) {
        fail((e as Error).message.split(":")[0], (e as Error).message);
      }
    })();
  });
}
