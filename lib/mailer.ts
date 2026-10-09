import "server-only";
import nodemailer from "nodemailer";
import { renderEmail } from "@/lib/emailTemplate";

/**
 * Sends real email over SMTP. Configure these in the environment:
 *   SMTP_HOST, SMTP_PORT (465 = SSL, 587 = STARTTLS), SMTP_USER, SMTP_PASS,
 *   MAIL_FROM (e.g. "GrowVika <no-reply@growvika.com>")
 * Any SMTP mailbox works (Zoho, Hostinger, Gmail app password, Brevo, etc).
 */
export function isMailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM
  );
}

export async function sendMail(opts: { to: string; subject: string; html: string; text: string }) {
  if (!isMailConfigured()) throw new Error("MAIL_NOT_CONFIGURED");
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({ from: process.env.MAIL_FROM, ...opts });
}

export function passwordResetEmail(name: string, link: string) {
  const { html, text } = renderEmail({
    preheader: "Use this link within 60 minutes to set a new password.",
    heading: "Reset your password",
    paragraphs: [
      `Hi ${name},`,
      "We received a request to reset the password for your GrowVika account. Choose a new password with the button below. The link works once and expires in 60 minutes.",
    ],
    cta: { label: "Set a new password", url: link },
    note: "If you didn't ask for this, you can ignore this email. Your password won't change and nobody can use this link without access to your inbox.",
    origin: new URL(link).origin,
  });
  return { subject: "Reset your GrowVika password", html, text };
}
