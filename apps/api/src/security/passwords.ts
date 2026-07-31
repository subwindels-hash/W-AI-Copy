/**
 * Security — Password policy (Slice 110).
 */
import { z } from "zod";

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: "very weak" | "weak" | "fair" | "strong" | "very strong";
  issues: string[];
  meetsPolicy: boolean;
}

const MIN_LENGTH = 10;
const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty", "qwerty123", "letmein", "admin", "welcome", "monkey", "dragon",
  "windels", "windelsai", "changeme", "changeme!", "changeme!234",
]);

export function assessPassword(pw: string): PasswordStrength {
  const issues: string[] = [];
  if (pw.length < MIN_LENGTH) issues.push(`at least ${MIN_LENGTH} characters`);
  if (!/[A-Z]/.test(pw)) issues.push("an uppercase letter");
  if (!/[a-z]/.test(pw)) issues.push("a lowercase letter");
  if (!/\d/.test(pw)) issues.push("a digit");
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push("a symbol (e.g. !@#$%)");
  if (COMMON.has(pw.toLowerCase())) issues.push("not be a common password");
  let score = 0;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 14 && !COMMON.has(pw.toLowerCase())) score = Math.min(4, score + 1);
  if (issues.length === 0) score = 4;
  if (COMMON.has(pw.toLowerCase())) score = 0;
  const finalScore = Math.max(0, Math.min(4, score)) as PasswordStrength["score"];
  const labels: Record<number, PasswordStrength["label"]> = {
    0: "very weak", 1: "weak", 2: "fair", 3: "strong", 4: "very strong",
  };
  return { score: finalScore, label: labels[finalScore], issues, meetsPolicy: issues.length === 0 };
}

export const PasswordSchema = z.string().min(MIN_LENGTH).max(200).refine(
  (pw) => assessPassword(pw).meetsPolicy,
  (pw) => ({ message: "Password does not meet policy: " + assessPassword(pw).issues.join(", ") })
);

export function hashPassword(pw: string): Promise<string> {
  return BunHash(pw);
}
export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return BunVerify(pw, hash);
}

// We use bcryptjs (already used elsewhere? check) — fall back to a safe hash wrapper.
import bcrypt from "bcryptjs";
async function BunHash(pw: string) { return bcrypt.hash(pw, 12); }
async function BunVerify(pw: string, hash: string) { return bcrypt.compare(pw, hash); }
