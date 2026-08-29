import type { Request, Response, NextFunction } from "express";
import Busboy from "busboy";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { AppError } from "../../utils/result.js";

export interface StreamedModuleUpload {
  tempPath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  fields: Record<string, string>;
}

declare global {
  namespace Express {
    interface Request { moduleUpload?: StreamedModuleUpload }
  }
}

function storageRoot(): string {
  return path.resolve(process.env.MODULE_PACKAGE_STORAGE_PATH || path.join(process.cwd(), "module-packages"));
}

/** Streaming, bounded multipart intake for one .wmod/.zip package. */
export function streamModulePackage(fieldName = "package") {
  const maxBytes = Math.max(1, Number(process.env.MODULE_MAX_PACKAGE_MB ?? 50)) * 1024 * 1024;
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!String(req.headers["content-type"] ?? "").startsWith("multipart/form-data")) {
      return res.status(415).json({ ok: false, error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "multipart/form-data with a package file is required" } });
    }
    const intakeDir = path.join(storageRoot(), "intake");
    try { await fs.mkdir(intakeDir, { recursive: true, mode: 0o700 }); await fs.chmod(intakeDir, 0o700); }
    catch (error) { return next(error); }
    const tempPath = path.join(intakeDir, `${randomUUID()}.upload`);
    const fields: Record<string, string> = {};
    let selected = false;
    let fileDone: Promise<void> | null = null;
    let originalName = "";
    let mimeType = "application/octet-stream";
    let sizeBytes = 0;
    const hash = createHash("sha256");
    let rejected: Error | null = null;
    let parserFailed = false;

    const cleanup = () => fs.unlink(tempPath).catch(() => undefined);
    let parser: Busboy.Busboy;
    try {
      parser = Busboy({ headers: req.headers, limits: { fileSize: maxBytes, files: 1, fields: 8, fieldSize: 16 * 1024, parts: 10 } });
    } catch (error) { return next(error); }

    parser.on("field", (name, value) => { fields[name] = value; });
    parser.on("file", (name, stream, info) => {
      if (name !== fieldName || selected) { stream.resume(); return; }
      selected = true;
      originalName = path.basename(info.filename || "module.wmod").slice(0, 255);
      mimeType = info.mimeType;
      if (!/\.(wmod|zip)$/i.test(originalName)) {
        rejected = AppError.validation("Module package must use the .wmod or .zip extension");
        stream.resume(); return;
      }
      const output = createWriteStream(tempPath, { flags: "wx", mode: 0o600 });
      fileDone = new Promise<void>((resolve, reject) => {
        stream.on("data", (chunk: Buffer) => { sizeBytes += chunk.length; hash.update(chunk); });
        stream.on("limit", () => { rejected = AppError.validation(`Module package exceeds ${maxBytes} bytes`); output.destroy(rejected); });
        stream.on("error", reject); output.on("error", reject); output.on("finish", resolve);
      });
      stream.pipe(output);
    });
    parser.on("filesLimit", () => { rejected = AppError.validation("Exactly one module package is allowed"); });
    parser.on("partsLimit", () => { rejected = AppError.validation("Multipart request has too many parts"); });
    parser.on("error", async (error) => { parserFailed = true; await cleanup(); next(AppError.validation("Malformed module upload", { cause: error instanceof Error ? error.message : String(error) })); });
    parser.on("finish", async () => {
      if (parserFailed) return;
      try {
        if (fileDone) await fileDone;
        if (rejected) throw rejected;
        if (!selected || !sizeBytes) throw AppError.validation("Module package file is required and cannot be empty");
        req.moduleUpload = { tempPath, originalName, mimeType, sizeBytes, checksum: hash.digest("hex"), fields };
        next();
      } catch (error) { await cleanup(); next(error); }
    });
    req.on("aborted", () => { void cleanup(); });
    req.pipe(parser);
  };
}
