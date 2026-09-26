import "server-only";
import type { TemplateButtonKind } from "@/types";

interface TemplateButtonLike {
  kind: TemplateButtonKind;
  label: string;
  url: string;
}

/** All text fields here (header/body/footer) should already have {{1}},
 * {{2}}... variables filled in by the caller (fillTemplate) before this is
 * called — this module only decides message *shape*, not variable rendering. */
export interface TemplateLike {
  header: string | null;
  body: string;
  footer: string | null;
  mediaKind: "none" | "image" | "video" | "document";
  mediaUrl: string | null;
  buttons: unknown; // Json column — validated/narrowed below
  /** Only needed for the real Meta Message Template send path — see
   * lib/metaTemplates.ts and buildPayloadForContact in lib/queueProcessor.ts,
   * which branches to it when metaStatus is "approved". Optional here so
   * this interface still fits every existing free-form-only caller. */
  name?: string;
  metaStatus?: string;
  metaTemplateId?: string | null;
  metaLanguageCode?: string | null;
}

export interface BuiltMessage {
  /** Everything the Meta API call needs except `messaging_product` and `to`. */
  payload: Record<string, unknown>;
  /** Short plain-text summary for QueueJob.messageText / MessageRecord.preview. */
  preview: string;
}

function asButtons(value: unknown): TemplateButtonLike[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (b): b is TemplateButtonLike =>
      Boolean(b) && typeof b === "object" && typeof (b as TemplateButtonLike).url === "string"
  );
}

/**
 * Meta's real hard limits for an "interactive" message's text fields — this
 * is not our own house style, it's what the Graph API itself enforces and
 * rejects with (#131009) "Parameter value is not valid" if exceeded. We hit
 * this for real with a 62-character footer ("...Reply STOP to opt out").
 * Truncating here is a last-resort safety net so a too-long field fails
 * soft (message still sends, just slightly shortened) instead of the whole
 * send failing outright — the real fix is keeping header/footer short at
 * template-authoring time (see TemplateBuilder's char counters).
 */
const INTERACTIVE_HEADER_MAX = 60;
const INTERACTIVE_FOOTER_MAX = 60;
const INTERACTIVE_BODY_MAX = 1024;
const BUTTON_DISPLAY_TEXT_MAX = 20;

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * WhatsApp's free-form (non-template) messaging only supports ONE button,
 * via an "interactive" cta_url message — not the up-to-3-buttons a Custom
 * Template can hold, and not a text+media header together (only one header
 * type at a time). So: only the first url/whatsapp-kind button is actually
 * sent (extra buttons, and any "call"/phone button, are Meta Template-only
 * features with no free-form equivalent and are dropped here); a media
 * header wins over a text header when both are set; and a header/footer
 * with no button and no media has nowhere to go in a plain text message, so
 * it's folded into the body text instead of being silently lost.
 */
export function buildOutboundMessage(template: TemplateLike, origin: string): BuiltMessage {
  const buttons = asButtons(template.buttons);
  const ctaButton = buttons.find((b) => b.kind === "url" || b.kind === "whatsapp");

  const hasMedia = template.mediaKind !== "none" && Boolean(template.mediaUrl);
  const mediaType = template.mediaKind === "video" ? "video" : template.mediaKind === "document" ? "document" : "image";
  const absoluteMediaUrl = hasMedia
    ? template.mediaUrl!.startsWith("http")
      ? template.mediaUrl!
      : `${origin}${template.mediaUrl}`
    : null;

  // Has a button → interactive cta_url message. Header is media if present,
  // else text if present, else none.
  if (ctaButton) {
    const header = hasMedia
      ? { type: mediaType, [mediaType]: { link: absoluteMediaUrl } }
      : template.header
        ? { type: "text", text: clip(template.header, INTERACTIVE_HEADER_MAX) }
        : undefined;
    return {
      payload: {
        type: "interactive",
        interactive: {
          type: "cta_url",
          ...(header ? { header } : {}),
          body: { text: clip(template.body, INTERACTIVE_BODY_MAX) },
          ...(template.footer ? { footer: { text: clip(template.footer, INTERACTIVE_FOOTER_MAX) } } : {}),
          action: {
            name: "cta_url",
            parameters: {
              display_text: clip(ctaButton.label, BUTTON_DISPLAY_TEXT_MAX) || "Open",
              url: ctaButton.url,
            },
          },
        },
      },
      preview: template.body.slice(0, 200),
    };
  }

  // No button, but has media — plain media message. Header text (if any)
  // and footer both fold into the caption since there's no separate slot
  // for them outside an interactive/template message.
  if (hasMedia) {
    const caption = [template.header, template.body, template.footer].filter(Boolean).join("\n\n");
    return {
      payload: { type: mediaType, [mediaType]: { link: absoluteMediaUrl, caption } },
      preview: `${mediaType === "image" ? "📷" : "📄"} ${template.body}`.slice(0, 200),
    };
  }

  // Plain text — header and footer fold into the body text.
  const text = [template.header, template.body, template.footer].filter(Boolean).join("\n\n");
  return { payload: { type: "text", text: { body: text } }, preview: text.slice(0, 200) };
}
