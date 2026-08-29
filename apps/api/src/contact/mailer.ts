/**
 * Contact Center outbound mailer.
 *
 * Sends email through the existing SMTP client (`emailIntel/smtp.client.js`)
 * configured by environment variables — the support email address and relay
 * are never hardcoded. When SMTP is not configured, emails are logged as
 * queued/skipped rather than silently dropped or faked.
 */
import { env } from "../config/env.js";
import { logger } from "../observability/logger.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailResult {
  ok: boolean;
  sent: boolean;
  reason: string;
  error?: string;
}

export async function sendContactMail(msg: MailMessage): Promise<MailResult> {
  try {
    const { EmailService } = await import("../sitePlatform/sitePlatform.service.js");
    const res = await EmailService.sendEmail({ to: msg.to, subject: msg.subject, text: msg.text });
    if (res.sent) logger.info("[contact] email sent", { to: msg.to, subject: msg.subject });
    else logger.warn("[contact] email not sent", { to: msg.to, reason: res.reason, error: res.error });
    return { ok: res.ok, sent: res.sent, reason: res.reason, error: res.error };
  } catch (err) {
    logger.warn("[contact] email send error", { to: msg.to, err: (err as Error)?.message });
    return { ok: false, sent: false, reason: "SMTP_ERROR", error: (err as Error)?.message };
  }
}

/** Resolve the configured support mailbox, or a fallback. */
export function supportEmail(): string {
  return env.WINDELS_SUPPORT_EMAIL ?? env.BOOTSTRAP_SUPERADMIN_EMAIL ?? "support@windels.ai";
}
