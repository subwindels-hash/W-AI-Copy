import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/result.js";
import { Role, hasRole, type Role as RoleType } from "@windels/shared/permissions";
import type { PublicRole } from "../../services/auth.service.js";

// Minimal authenticated-user shape attached to req.user.
// Note: JWT carries lowercase PublicRole; mapping to the shared Role constants.
export interface AuthUser {
  id: string;
  email: string;
  role: PublicRole;
  organizationId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(AppError.unauthorized());
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: env.JWT_ISSUER,
    }) as AuthUser & { iat: number; exp: number };
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
    };
    next();
  } catch {
    next(AppError.unauthorized("Invalid or expired token"));
  }
}

export function requireRole(role: RoleType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!hasRole(req.user.role, role)) return next(AppError.forbidden());
    next();
  };
}

export const requireAdmin = requireRole(Role.ADMIN);
export const requireSuperAdmin = requireRole(Role.SUPER_ADMIN);
