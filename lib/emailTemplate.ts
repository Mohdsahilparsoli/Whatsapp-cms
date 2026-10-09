import "server-only";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface EmailContent {
  /** Short line shown in the inbox list next to the subject. */
  preheader: string;
  heading: string;
  /** Plain paragraphs; escaped for you. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Small print under the button (e.g. why they got this). */
  note?: string;
  origin: string;
}

/** One branded, table-based layout for every transactional email — works in
 * Gmail, Outlook and Apple Mail (inline CSS, no web fonts, image wordmark). */
export function renderEmail(c: EmailContent): { html: string; text: string } {
  const font = "'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif";
  const paras = c.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#2f3752;">${esc(p)}</p>`)
    .join("");
  const button = c.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td align="center" bgcolor="#3f55f0" style="border-radius:10px;">
<a href="${esc(c.cta.url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${font};font-size:15px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(c.cta.label)}</a>
</td></tr></table>
<p style="margin:0 0 4px;font-size:12px;line-height:18px;color:#667089;">Button not working? Copy this link into your browser:</p>
<p style="margin:0 0 24px;font-size:12px;line-height:18px;word-break:break-all;"><a href="${esc(c.cta.url)}" style="color:#3f55f0;text-decoration:underline;">${esc(c.cta.url)}</a></p>`
    : "";
  const note = c.note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #e6e8f0;padding-top:20px;font-size:13px;line-height:20px;color:#667089;">${esc(c.note)}</td></tr></table>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>:root{color-scheme:light only;supported-color-schemes:light only;}</style><title>${esc(c.heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f3ee;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(c.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f3ee"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td bgcolor="#050a1a" style="background:#050a1a;border-radius:16px 16px 0 0;line-height:0;font-size:0;">
<img src="${c.origin}/email/email-header.png" alt="GrowVika" width="560" height="84" style="display:block;border:0;outline:none;width:100%;max-width:560px;height:auto;background:#050a1a;border-radius:16px 16px 0 0;">
</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:36px 36px 28px;font-family:${font};">
<h1 style="margin:0 0 16px;font-size:24px;line-height:32px;font-weight:800;color:#0b1124;letter-spacing:-0.3px;">${esc(c.heading)}</h1>
${paras}${button}${note}
</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:0 0 16px 16px;padding:0 36px 28px;font-family:${font};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #e6e8f0;padding-top:20px;font-size:12px;line-height:18px;color:#8f96ae;">
<strong style="color:#667089;">GrowVika</strong> &middot; WhatsApp Marketing CMS<br>
Need help? Write to <a href="mailto:sahil@growvika.com" style="color:#667089;text-decoration:underline;">sahil@growvika.com</a>
</td></tr></table>
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:${font};font-size:11px;line-height:16px;color:#8f96ae;">This is an automated message from app.growvika.com.</p>
</td></tr></table>
</body></html>`;

  const text = [
    c.heading,
    "",
    ...c.paragraphs.flatMap((p) => [p, ""]),
    ...(c.cta ? [`${c.cta.label}: ${c.cta.url}`, ""] : []),
    ...(c.note ? [c.note, ""] : []),
    "— GrowVika · WhatsApp Marketing CMS",
    "Need help? sahil@growvika.com",
  ].join("\n");

  return { html, text };
}
