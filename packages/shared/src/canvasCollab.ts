// Session 22 / 109 — Canvas Collaboration contracts.

import { z } from "zod";

export interface CcPresence {
  userId: string;
  displayName: string;
  avatarColor: string;
  joinedAt: string;
  lastSeenAt: string;
}

export interface CcCursor {
  userId: string;
  displayName: string;
  x: number;
  y: number;
  at: string;
}

export const CcCanvasIdSchema = z.object({ id: z.string().cuid() });
export const CcPresenceSchema = z.object({ displayName: z.string().trim().min(1).max(120), avatarColor: z.string().max(16).optional() });
export const CcCursorSchema = z.object({ displayName: z.string().trim().min(1).max(120), x: z.number().finite(), y: z.number().finite() });
