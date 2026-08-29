import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny, z } from "zod";

export function validate<
  B extends ZodTypeAny = ZodTypeAny,
  Q extends ZodTypeAny = ZodTypeAny,
  P extends ZodTypeAny = ZodTypeAny,
>(schema: { body?: B; query?: Q; params?: P }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.body) req.body = schema.body.parse(req.body);
      if (schema.query) req.query = schema.query.parse(req.query) as any;
      if (schema.params) req.params = schema.params.parse(req.params) as any;
      next();
    } catch (e) {
      next(e);
    }
  };
}
