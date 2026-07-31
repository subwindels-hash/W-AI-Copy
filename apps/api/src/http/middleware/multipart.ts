import type { Request, Response, NextFunction } from "express";

interface FilePart {
  fieldname: string;
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

/**
 * Minimal multipart/form-data parser for single-file uploads (Session 3).
 * Not production-grade for huge files — the enterprise upload pipeline arrives in
 * Session 18. Sufficient for attachments < 25MB.
 */
export function multipartSingle(fieldname: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const contentType = req.headers["content-type"] ?? "";
    if (!contentType.startsWith("multipart/form-data")) {
      req.body = {};
      return next();
    }
    const bm = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
    if (!bm) return next(new Error("Missing multipart boundary"));
    const boundary = "--" + (bm[1] ?? bm[2]);
    const bufBoundary = Buffer.from(boundary);
    const chunks: Buffer[] = [];
    let totalLength = 0;
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      totalLength += chunk.length;
      if (totalLength > 30 * 1024 * 1024) req.destroy(new Error("Upload too large"));
    });
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks);
        // Split on boundary.
        const parts: Buffer[] = [];
        let start = 0;
        while (true) {
          const idx = body.indexOf(bufBoundary, start);
          if (idx === -1) break;
          const after = idx + bufBoundary.length;
          // next \r\n marks end of boundary line; content starts after that.
          const contentStart = body.indexOf(Buffer.from("\r\n\r\n"), after);
          if (contentStart === -1) { start = after; continue; }
          const dataStart = contentStart + 4;
          // find next boundary after dataStart
          const nextBoundary = body.indexOf(bufBoundary, dataStart);
          const dataEnd = nextBoundary === -1 ? body.length : nextBoundary - 2; // -2 for trailing \r\n
          if (dataEnd > dataStart) {
            parts.push(body.subarray(after, dataEnd));
          }
          if (nextBoundary === -1) break;
          start = nextBoundary;
        }
        const files: Record<string, FilePart> = {};
        const fields: Record<string, string> = {};
        for (const part of parts) {
          const headerEnd = part.indexOf("\r\n\r\n");
          if (headerEnd === -1) continue;
          const header = part.subarray(0, headerEnd).toString("utf8");
          const content = part.subarray(headerEnd + 4);
          const nameMatch = /name="([^"]+)"/.exec(header);
          if (!nameMatch) continue;
          const name = nameMatch[1]!;
          const filenameMatch = /filename="([^"]*)"/.exec(header);
          if (filenameMatch) {
            const ctMatch = /Content-Type:\s*([^\r\n]+)/i.exec(header);
            const mimetype = (ctMatch?.[1] ?? "application/octet-stream").trim();
            files[name] = {
              fieldname: name,
              originalname: filenameMatch[1]!,
              mimetype,
              buffer: Buffer.from(content),
              size: content.length,
            };
          } else {
            fields[name] = content.toString("utf8");
          }
        }
        req.body = fields;
        (req as any).file = files[fieldname] ?? null;
        (req as any).files = files;
        next();
      } catch (e) {
        next(e);
      }
    });
    req.on("error", next);
  };
}
