import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startedAt: number;
    }
  }
}

export function requestId() {
  return (req: Request, res: Response, next: NextFunction) => {
    req.requestId =
      (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
    req.startedAt = Date.now();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  };
}
