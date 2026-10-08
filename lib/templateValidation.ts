import { NAMED_PARAM_PATTERN, extractParams } from "@/lib/templateParams";
import type { TemplateExtra, TemplateKind } from "@/types";

export const CATEGORIES = ["Marketing", "Utility", "Authentication"] as const;
export const MEDIA_KINDS = ["none", "image", "video", "document"] as const;
export const BUTTON_KINDS = ["url", "call", "whatsapp", "quick_reply"] as const;
export const MAX_BUTTONS = 3;
export const MAX_VARIABLES = 10;

export type Category = (typeof CATEGORIES)[number];
export type MediaKind = (typeof MEDIA_KINDS)[number];
export type ButtonKind = (typeof BUTTON_KINDS)[number];

export interface ButtonInput {
  id?: string;
  kind?: ButtonKind;
  label?: string;
  url?: string;
}

export interface MediaInput {
  kind?: MediaKind;
  url?: string;
  fileName?: string;
}

export interface TemplateInputBody {
  name?: string;
  language?: string;
  category?: Category;
  /** "draft" only requires a name; "custom" is fully validated. */
  status?: "draft" | "custom";
  header?: string;
  body?: string;
  footer?: string;
  media?: MediaInput;
  buttons?: ButtonInput[];
  variables?: string[];
  parameterFormat?: "positional" | "named";
  templateKind?: TemplateKind;
  extra?: TemplateExtra;
}

export const TEMPLATE_KINDS = ["standard", "coupon", "lto", "carousel", "authentication"] as const;

export interface NormalizedTemplate {
  name: string;
  isDraft: boolean;
  category: Category;
  language: string;
  header: string | null;
  body: string;
  footer: string | null;
  mediaKind: MediaKind;
  mediaUrl: string | null;
  mediaFileName: string | null;
  buttons: { id: string; kind: ButtonKind; label: string; url: string }[];
  variables: string[];
  parameterFormat: "positional" | "named";
  templateKind: TemplateKind;
  extra: TemplateExtra;
}

/** Normalizes raw request body into typed, trimmed fields (no validation yet). */
export function normalizeTemplateInput(body: TemplateInputBody): NormalizedTemplate {
  const name = body.name?.trim() ?? "";
  const isDraft = body.status === "draft";
  const templateKind: TemplateKind =
    body.templateKind && TEMPLATE_KINDS.includes(body.templateKind) ? body.templateKind : "standard";
  const parameterFormat = body.parameterFormat === "named" ? "named" : "positional";
  const category: Category =
    templateKind === "authentication"
      ? "Authentication"
      : body.category && CATEGORIES.includes(body.category)
        ? body.category
        : "Marketing";
  const extra = normalizeExtra(templateKind, body.extra);
  const language = body.language?.trim() || "English";
  const header = body.header?.trim() || null;
  const bodyText = body.body?.trim() ?? "";
  const footer = body.footer?.trim() || null;

  const mediaKind: MediaKind =
    body.media?.kind && MEDIA_KINDS.includes(body.media.kind) ? body.media.kind : "none";
  const mediaUrl = body.media?.url?.trim() || null;
  const mediaFileName = body.media?.fileName?.trim() || null;

  const rawButtons = Array.isArray(body.buttons) ? body.buttons.slice(0, MAX_BUTTONS) : [];
  const buttons = rawButtons.map((b, i) => ({
    id: b.id || `btn-${i}`,
    kind: (b.kind && BUTTON_KINDS.includes(b.kind) ? b.kind : "url") as ButtonKind,
    label: b.label?.trim() ?? "",
    url: b.url?.trim() ?? "",
  }));

  const variables = (Array.isArray(body.variables) ? body.variables : [])
    .slice(0, MAX_VARIABLES)
    .map((v) => (typeof v === "string" ? v : ""));

  return {
    name,
    isDraft,
    category,
    language,
    header,
    body: bodyText,
    footer,
    mediaKind,
    mediaUrl,
    mediaFileName,
    buttons,
    variables,
    parameterFormat,
    templateKind,
    extra,
  };
}

function normalizeExtra(kind: TemplateKind, raw: TemplateExtra | undefined): TemplateExtra {
  const e = raw ?? {};
  if (kind === "coupon") return { couponCode: e.couponCode?.trim() ?? "" };
  if (kind === "lto") {
    return {
      offerText: e.offerText?.trim() ?? "",
      expiresInHours: Math.min(Math.max(Math.round(Number(e.expiresInHours) || 48), 1), 24 * 30),
      couponCode: e.couponCode?.trim() || undefined,
    };
  }
  if (kind === "authentication") {
    return {
      expiryMinutes: Math.min(Math.max(Math.round(Number(e.expiryMinutes) || 10), 1), 90),
      securityRecommendation: e.securityRecommendation !== false,
    };
  }
  if (kind === "carousel") {
    const cards = (Array.isArray(e.cards) ? e.cards : []).slice(0, 10).map((c) => ({
      mediaKind: (c.mediaKind === "video" ? "video" : "image") as "image" | "video",
      mediaUrl: c.mediaUrl?.trim() ?? "",
      mediaFileName: c.mediaFileName?.trim() || undefined,
      body: c.body?.trim() ?? "",
      buttons: (Array.isArray(c.buttons) ? c.buttons : []).slice(0, 2).map((b) => ({
        kind: (b.kind === "quick_reply" ? "quick_reply" : "url") as "url" | "quick_reply",
        label: b.label?.trim() ?? "",
        url: b.url?.trim() ?? "",
      })),
    }));
    return { cards };
  }
  return {};
}

/** Field-level validation for a normalized template (name uniqueness is
 * checked separately by the caller, since that needs a DB query). */
export function validateTemplateFields(t: NormalizedTemplate): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!t.name) errors.name = "Give the template a name.";
  else if (!/^[a-z0-9_]+$/.test(t.name))
    errors.name = "Use lowercase letters, numbers, and underscores only.";

  // Drafts only need a valid, unique name — everything else can be
  // half-finished. "custom" (published) needs the rest to actually be usable.
  if (!t.isDraft) {
    if (t.templateKind === "authentication") {
      // Meta writes the body itself ("<code> is your verification code…").
      return errors;
    }
    if (!t.body) errors.body = "Write the message body.";

    if (t.parameterFormat === "named") {
      const bad = extractParams(`${t.header ?? ""} ${t.body}`).find((p) => !NAMED_PARAM_PATTERN.test(p));
      if (bad) errors.body = `Named variables must be lowercase letters, numbers and underscores, starting with a letter ("${bad}" isn't).`;
    }

    if (t.templateKind === "coupon" && !t.extra.couponCode) {
      errors.extra = "Enter the coupon code customers will copy.";
    }
    if (t.templateKind === "lto") {
      if (!t.extra.offerText) errors.extra = "Enter the offer text (up to 16 characters), e.g. “Summer Sale”.";
      else if (t.extra.offerText.length > 16) errors.extra = "Offer text can be at most 16 characters.";
      else if (t.mediaKind !== "image" && t.mediaKind !== "video") errors.media = "A limited-time-offer template needs an image or video header.";
    }
    if (t.templateKind === "carousel") {
      const cards = t.extra.cards ?? [];
      if (cards.length < 2) errors.extra = "A carousel needs at least 2 cards.";
      else if (cards.some((c) => !c.mediaUrl || !c.body)) errors.extra = "Every card needs an image/video and a text.";
      else if (cards.some((c) => c.mediaKind !== cards[0].mediaKind)) errors.extra = "All cards must use the same media type.";
      else if (cards.some((c) => c.buttons.length !== cards[0].buttons.length)) errors.extra = "All cards must have the same number of buttons.";
      else if (cards.some((c) => c.buttons.some((b) => !b.label || (b.kind === "url" && !/^https?:\/\/.+/.test(b.url))))) {
        errors.extra = "Every card button needs a label, and URL buttons need a full link (https://…).";
      }
    }

    if (t.mediaKind !== "none" && !t.mediaUrl) {
      errors.media = "Upload a file for the attached media.";
    }

    // No country code required here on purpose — a Call button's number
    // doesn't need a leading "+91" typed in. At Meta submission time,
    // lib/metaTemplates.ts auto-detects this client's own WhatsApp number's
    // country calling code and prepends it to any number typed without one
    // (see getDefaultCallingCode/sanitizePhoneNumber there). This is just a
    // sanity check that enough digits were typed at all.
    const badButton = t.buttons.find((b) => {
      if (!b.label) return true;
      if (b.kind === "call") return b.url.replace(/\D/g, "").length < 7;
      // A WhatsApp chat button is always "https://wa.me/<number>" (the
      // builder's UI only lets the number be typed — see
      // components/templates/TemplateBuilder.tsx), so "enough digits" is
      // the real check here, not just "looks like a URL" — an empty number
      // still leaves a string that matches the URL regex below.
      if (b.kind === "whatsapp") return b.url.replace(/\D/g, "").length < 7;
      // A Quick Reply button has no destination at all — the label is the
      // whole button (see buttonMeta in TemplateBuilder.tsx).
      if (b.kind === "quick_reply") return false;
      return !/^https?:\/\/.+/.test(b.url);
    });
    if (badButton) {
      errors.buttons =
        "Every button needs a label, and a URL (starting with http:// or https://) or a phone number for Call buttons.";
    }
  }

  return errors;
}
