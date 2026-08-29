/**
 * Session 84 — optional ClamAV malware scanning.
 *
 * When CLAMD_HOST (e.g. "tcp://127.0.0.1:3310" or "127.0.0.1:3310") is set, the
 * archive is streamed to clamd over the INSTREAM protocol and "stream: OK" /
 * "<signature> FOUND" / "ERROR" is parsed. When unset, scans report
 * `configured: false` honestly — no fake clean bill.
 */
import net from "node:net";

export interface ClamavScanResult {
  configured: boolean;
  status: "clean" | "infected" | "error" | "not_configured";
  signature?: string;
  detail?: string;
}

export function clamdTarget(): { host: string; port: number } | null {
  const raw = (process.env.CLAMD_HOST ?? "").trim();
  if (!raw) return null;
  const noProto = raw.replace(/^tcp:\/\//, "");
  const [host, portStr] = noProto.split(":");
  const port = Number(portStr ?? 3310);
  if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) return null;
  return { host, port };
}

export function clamavConfigured(): boolean {
  return clamdTarget() !== null;
}

/** Streams a buffer to clamd (INSTREAM) and returns the verdict. */
export function scanBufferWithClamav(buffer: Buffer, target?: { host: string; port: number }, timeoutMs = 30_000): Promise<ClamavScanResult> {
  const t = target ?? clamdTarget();
  if (!t) return Promise.resolve({ configured: false, status: "not_configured" });

  return new Promise((resolve) => {
    const sock = net.createConnection({ host: t.host, port: t.port });
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (res: ClamavScanResult) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(res);
    };
    const timer = setTimeout(() => finish({ configured: true, status: "error", detail: "clamd connection timed out" }), timeoutMs);

    sock.on("connect", () => {
      sock.write(Buffer.from("zINSTREAM\0"));
      let offset = 0;
      const MAX_CHUNK = 32 * 1024;
      while (offset < buffer.length) {
        const len = Math.min(MAX_CHUNK, buffer.length - offset);
        const head = Buffer.alloc(4);
        head.writeUInt32BE(len, 0);
        sock.write(head);
        sock.write(buffer.subarray(offset, offset + len));
        offset += len;
      }
      sock.write(Buffer.from([0, 0, 0, 0])); // EOF
    });
    sock.on("data", (d) => {
      chunks.push(d);
      const text = Buffer.concat(chunks).toString("utf8");
      if (text.includes("\n") || text.includes("stream:")) {
        clearTimeout(timer);
        const line = text.split("\n")[0] ?? text;
        if (/stream: OK/i.test(line)) finish({ configured: true, status: "clean", detail: line.trim() });
        else if (/stream: (.+?) FOUND/i.exec(line)) finish({ configured: true, status: "infected", signature: /stream: (.+?) FOUND/i.exec(line)?.[1], detail: line.trim() });
        else finish({ configured: true, status: "error", detail: line.trim() });
      }
    });
    sock.on("error", (e) => { clearTimeout(timer); finish({ configured: true, status: "error", detail: e.message }); });
    sock.on("close", () => { clearTimeout(timer); if (!settled) finish({ configured: true, status: "error", detail: "connection closed without a verdict" }); });
  });
}
