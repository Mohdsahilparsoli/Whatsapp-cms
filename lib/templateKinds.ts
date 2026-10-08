/**
 * Coupon, limited-time-offer, carousel and authentication templates only
 * exist as real Meta templates — there is no free-form message that looks
 * like them — so they can't be sent until Meta has approved them. (Standard
 * templates fall back to a free-form message while pending.)
 */
export function advancedTemplateBlock(template: {
  templateKind?: string | null;
  metaStatus?: string | null;
  name?: string | null;
}): string | null {
  const kind = template.templateKind ?? "standard";
  if (kind === "standard") return null;
  if (kind === "authentication") {
    return "Authentication (OTP) templates are sent through the OTP API, not campaigns.";
  }
  if (template.metaStatus !== "approved") {
    return `“${template.name ?? "This template"}” is a ${kind === "lto" ? "limited-time-offer" : kind} template, which can only be sent once Meta has approved it. Submit it for approval on the Templates page first.`;
  }
  return null;
}
