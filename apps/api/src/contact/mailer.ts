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
  const host = env.WINDELS_SMTP_HOST;
  const port = env.WINDELS_SMTP_PORT;
  if (!host || !port) {
    logger.warn("[contact] SMTP not configured — contact email skipped", { to: msg.to, subject: msg.subject });
    return { ok: true, sent: false, reason: "SMTP_NOT_CONFIGURED" };
  }
  try {
    const { sendSmtp } = await import("../emailIntel/smtp.client.js");
    const res = await sendSmtp({
      host,
      port,
      secure: env.WINDELS_SMTP_SECURE,
      username: env.WINDELS_SMTP_USER ?? null,
      password: env.WINDELS_SMTP_PASS ?? null,
      from: env.WINDELS_MAIL_FROM,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
    });
    if (res.ok) {
      logger.info("[contact] email sent", { to: msg.to, subject: msg.subject, response: res.response });
      return { ok: true, sent: true, reason: res.response ?? "sent" };
    }
    logger.warn("[contact] email delivery failed", { to: msg.to, errorCode: res.errorCode, error: res.error });
    return { ok: false, sent: false, reason: res.errorCode, error: res.error ?? undefined };
  } catch (err) {
    logger.warn("[contact] email send error", { to: msg.to, err: (err as Error)?.message });
    return { ok: false, sent: false, reason: "SMTP_ERROR", error: (err as Error)?.message };
  }
}

/** Resolve the configured support mailbox, or a fallback. */
export function supportEmail(): string {
  return env.WINDELS_SUPPORT_EMAIL ?? env.BOOTSTRAP_SUPERADMIN_EMAIL ?? "support@windels.ai";
}
