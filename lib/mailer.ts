import "server-only";
import nodemailer from "nodemailer";

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
  const safeName = name.replace(/[<>&"]/g, "");
  // Email clients ignore web fonts, so the wordmark (Syne) is sent as an image.
  const logoUrl = `${new URL(link).origin}/email/growvika-logo.png`;
  return {
    subject: "Reset your password",
    text: `Hi ${safeName},\n\nUse this link to set a new password. It works once and expires in 60 minutes:\n${link}\n\nIf you didn't ask for this, you can ignore this email — your password stays the same.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0b1124">
<div style="margin-bottom:24px"><img src="${logoUrl}" alt="GrowVika" width="170" height="28" style="display:block;border:0;height:auto"></div><h2 style="margin:0 0 12px">Reset your password</h2>
<p>Hi ${safeName}, use the button below to set a new password. The link works once and expires in 60 minutes.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#3f55f0;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Set a new password</a></p>
<p style="font-size:13px;color:#5b6b66">If you didn't ask for this, ignore this email — your password stays the same.</p></div>`,
  };
}
