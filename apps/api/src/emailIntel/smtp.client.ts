/**
 * Session 91 & Production Fix — Minimal dependency-free SMTP client.
 *
 * Speaks the real SMTP wire protocol over `node:net` / `node:tls`:
 * greeting → EHLO → (STARTTLS if supported/required) → EHLO → (AUTH PLAIN) → MAIL FROM → RCPT TO* → DATA → QUIT.
 *
 * Guarantees:
 *   - Certificate validation & hostname verification enforced by default in production.
 *   - Rejection of invalid/self-signed certificates unless explicitly allowed via WINDELS_SMTP_ALLOW_SELF_SIGNED=true.
 *   - Credentials (passwords, tokens) are never included in logs or error messages.
 *   - STARTTLS support when advertised or required.
 */
import net from "node:net";
import tls from "node:tls";

export interface SmtpSendOptions {
  host: string;
  port: number;
  /** TLS on connect (465-style implicit TLS). */
  secure?: boolean;
  /** Require or attempt STARTTLS upgrade on plain 587/25 ports. */
  requireStartTls?: boolean;
  /** Enforce strict TLS certificate verification (defaults to true in production). */
  rejectUnauthorized?: boolean;
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
  TLS: "SMTP_TLS_VERIFICATION_FAILED",
};

/** Mask sensitive credentials from error messages. */
export function sanitizeSmtpError(msg: string): string {
  if (!msg) return msg;
  return msg
    .replace(/(AUTH PLAIN\s+)[A-Za-z0-9+/=]+/gi, "$1[REDACTED]")
    .replace(/(password|passwd|pass|pwd)\s*[:=]\s*[^\s,]+/gi, "$1=[REDACTED]");
}

/** Ordered line reader over a socket: buffered FIFO, never drops lines. */
function makeLineReader(sock: net.Socket) {
  let buf = "";
  let errored: Error | null = null;
  const pending: string[] = [];
  const waiters: Array<(line: string | typeof PromiseRejectPlaceholder) => void> = [];

  sock.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let m: number;
    while ((m = buf.search(/\r?\n/)) !== -1) {
      const eol = buf[m] === "\r" ? m + 2 : m + 1;
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

const PromiseRejectPlaceholder = Symbol("reject-placeholder");

async function expectCode(
  next: () => Promise<string>,
  code: string,
  step: string,
  continuation: (lines: string[]) => void = () => {},
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
  const { host, port, secure, requireStartTls, username, password, from, to, cc, subject, text } = opts;
  const timeoutMs = opts.timeoutMs ?? 10_000;

  // Enforce certificate validation by default in production
  const isProd = process.env.NODE_ENV === "production" || process.env.WINDELS_RUNTIME_MODE === "production";
  const allowSelfSigned = process.env.WINDELS_SMTP_ALLOW_SELF_SIGNED === "true";
  const rejectUnauthorized =
    opts.rejectUnauthorized ?? (isProd ? !allowSelfSigned : true);

  return new Promise<SmtpSendResult>((resolve) => {
    let currentSocket: net.Socket = secure
      ? tls.connect({
          host,
          port,
          servername: host,
          rejectUnauthorized,
        })
      : net.connect({ host, port });

    let reader = makeLineReader(currentSocket);

    const fail = (errorCode: string, rawError: string | null) => {
      const sanitized = rawError ? sanitizeSmtpError(rawError) : null;
      try {
        currentSocket.destroy();
      } catch {
        /* ignore */
      }
      resolve({ ok: false, response: null, errorCode, error: sanitized });
    };

    const succeed = (response: string) => {
      try {
        currentSocket.destroy();
      } catch {
        /* ignore */
      }
      resolve({ ok: true, response, errorCode: "OK", error: null });
    };

    currentSocket.setTimeout(timeoutMs);
    currentSocket.on("timeout", () =>
      fail(CODES.TIMEOUT, `Timed out after ${timeoutMs}ms talking to ${host}:${port}`),
    );
    currentSocket.on("error", (e) => {
      const isCertErr =
        e.message.includes("CERT_HAS_EXPIRED") ||
        e.message.includes("UNABLE_TO_VERIFY_LEAF_SIGNATURE") ||
        e.message.includes("SELF_SIGNED_CERT_IN_CHAIN") ||
        e.message.includes("certificate") ||
        e.message.includes("IP/Host mismatch");
      fail(isCertErr ? CODES.TLS : CODES.CONN, `${host}:${port} — ${e.message}`);
    });

    (async () => {
      try {
        // 1. Greeting
        await expectCode(() => reader.nextLine(), "220", "greeting");

        // 2. EHLO — initial greeting
        currentSocket.write(`EHLO windels\r\n`);
        const ehloResp = await expectCode(() => reader.nextLine(), "250", "EHLO");

        // 3. STARTTLS if required or supported over plain socket
        const supportsStartTls = /STARTTLS/i.test(ehloResp);
        if (!secure && (requireStartTls || supportsStartTls)) {
          currentSocket.write(`STARTTLS\r\n`);
          await expectCode(() => reader.nextLine(), "220", "STARTTLS");

          // Upgrade plain socket to TLS
          const tlsSocket = tls.connect({
            socket: currentSocket,
            servername: host,
            rejectUnauthorized,
          });

          currentSocket = tlsSocket;
          reader = makeLineReader(tlsSocket);

          tlsSocket.setTimeout(timeoutMs);
          tlsSocket.on("timeout", () =>
            fail(CODES.TIMEOUT, `Timed out during TLS handshake with ${host}:${port}`),
          );
          tlsSocket.on("error", (e) => fail(CODES.TLS, `TLS handshake error: ${e.message}`));

          // Re-EHLO after TLS upgrade
          tlsSocket.write(`EHLO windels\r\n`);
          await expectCode(() => reader.nextLine(), "250", "EHLO after STARTTLS");
        } else if (!secure && requireStartTls && !supportsStartTls) {
          throw new Error(`${CODES.TLS}: Server does not support STARTTLS but requireStartTls is true`);
        }

        // 4. Optional AUTH PLAIN
        if (username && password) {
          currentSocket.write(
            `AUTH PLAIN ${Buffer.from(`\u0000${username}\u0000${password}`, "utf8").toString("base64")}\r\n`,
          );
          try {
            await expectCode(() => reader.nextLine(), "235", "AUTH PLAIN");
          } catch (e) {
            throw new Error(`${CODES.AUTH}: ${(e as Error).message}`);
          }
        }

        // 5. MAIL FROM
        currentSocket.write(`MAIL FROM:<${from}>\r\n`);
        await expectCode(() => reader.nextLine(), "250", "MAIL FROM");

        // 6. RCPT TO
        for (const rcpt of [...to, ...(cc ?? [])]) {
          currentSocket.write(`RCPT TO:<${rcpt}>\r\n`);
          try {
            await expectCode(() => reader.nextLine(), "250", `RCPT TO ${rcpt}`);
          } catch (e) {
            throw new Error(`${CODES.REJECTED}: ${rcpt} — ${(e as Error).message}`);
          }
        }

        // 7. DATA
        currentSocket.write("DATA\r\n");
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
        currentSocket.write(headers.join("\r\n") + "\r\n");

        const final = await expectCode(() => reader.nextLine(), "250", "DATA completion");
        currentSocket.write("QUIT\r\n");
        await reader.nextLine().catch(() => null);
        succeed(final);
      } catch (e) {
        fail((e as Error).message.split(":")[0]!, (e as Error).message);
      }
    })();
  });
}
