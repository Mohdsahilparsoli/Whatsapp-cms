export const CATEGORIES = ["Marketing", "Utility", "Authentication"] as const;
export const MEDIA_KINDS = ["none", "image", "video", "document"] as const;
export const BUTTON_KINDS = ["url", "call", "whatsapp"] as const;
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
}

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
}

/** Normalizes raw request body into typed, trimmed fields (no validation yet). */
export function normalizeTemplateInput(body: TemplateInputBody): NormalizedTemplate {
  const name = body.name?.trim() ?? "";
  const isDraft = body.status === "draft";
  const category: Category = body.category && CATEGORIES.includes(body.category) ? body.category : "Marketing";
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
  };
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
    if (!t.body) errors.body = "Write the message body.";

    if (t.mediaKind !== "none" && !t.mediaUrl) {
      errors.media = "Upload a file for the attached media.";
    }

    const badButton = t.buttons.find((b) => {
      if (!b.label) return true;
      if (b.kind === "call") return b.url.replace(/\D/g, "").length < 7;
      return !/^https?:\/\/.+/.test(b.url);
    });
    if (badButton) {
      errors.buttons =
        "Every button needs a label, and a URL (starting with http:// or https://) or a phone number for Call buttons.";
    }
  }

  return errors;
}
