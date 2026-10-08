import "server-only";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";
import { toWaMeUrl, type BuiltMessage } from "@/lib/whatsappMessage";
import { extractParams, fillParams } from "@/lib/templateParams";
import type { TemplateExtra, TemplateKind } from "@/types";

/**
 * The real Meta WhatsApp Message Template system — submission (including
 * media headers via the Resumable Upload API), status checks, and the
 * type:"template" send payload.
 *
 * Why this exists: free-form/interactive messages (lib/whatsappMessage.ts)
 * can only ever carry ONE button, and only a URL button — there is no
 * free-form equivalent of a Call/phone button. Meta's officially-approved
 * Message Templates support up to 3 buttons of MIXED types (URL, Call,
 * Quick Reply), which is the only real way to send a Call button alongside
 * another button. That's the whole point of this file.
 *
 * Media (image/video/document) headers are supported for submission via
 * Meta's separate Resumable Upload API (uploadMediaHandle below) — it turns
 * one of our already-uploaded template files (Vercel Blob URL, or local
 * disk in dev) into the one-time `header_handle` Meta needs at submission
 * time. Sending an approved media-header template is different again: Meta
 * wants the media re-supplied as a `link` in the header component every
 * time you send (see buildTemplateSendPayload), not the handle.
 */

export type MetaTemplateStatus =
  | "not_submitted"
  | "pending"
  | "approved"
  | "rejected"
  | "paused"
  | "disabled";

/**
 * Meta only accepts a fixed set of locale codes, not free-form language
 * names — this maps the friendly names offered in TemplateBuilder to the
 * codes Meta's Message Templates API expects. Anything not listed falls
 * back to "en_US" (safer than letting Meta reject the whole submission over
 * an unrecognized language string).
 */
const LANGUAGE_CODE_MAP: Record<string, string> = {
  english: "en_US",
  hindi: "hi",
  hinglish: "en_US",
  spanish: "es",
  portuguese: "pt_BR",
  arabic: "ar",
  french: "fr",
  german: "de",
  indonesian: "id",
};

export function toMetaLanguageCode(language: string): string {
  return LANGUAGE_CODE_MAP[language.trim().toLowerCase()] ?? "en_US";
}

export function toMetaCategory(category: "Marketing" | "Utility" | "Authentication"): string {
  return category.toUpperCase();
}

/** Any status Meta doesn't send us, or one we don't recognize (IN_APPEAL,
 * PENDING_DELETION, etc.), is treated as "pending" — still under review from
 * our side's point of view, never silently dropped to "not_submitted". */
export function normalizeMetaStatus(raw: string | null | undefined): MetaTemplateStatus {
  const s = (raw ?? "").toLowerCase();
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  if (s === "paused") return "paused";
  if (s === "disabled") return "disabled";
  return "pending";
}

type ButtonKind = "url" | "call" | "whatsapp" | "quick_reply";
interface ButtonLike {
  kind: ButtonKind;
  label: string;
  url: string;
}

/**
 * Real, best-effort lookup of this client's own WhatsApp number's country
 * calling code (e.g. "91" for a +91 number) — GET on the phone number id
 * Meta already gave us, asking only for `display_phone_number` (the same
 * field WhatsApp Account Setup already shows, e.g. "+91 87006 21883").
 * Used to auto-complete a Call button's phone number when the person typed
 * it without a country code, since a business overwhelmingly calls
 * customers in its own country — nobody should have to type "+91"
 * themselves. Returns null (no auto-fill) on any failure; the number is
 * then sent to Meta exactly as typed, which Meta may still reject.
 */
async function getDefaultCallingCode(phoneNumberId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}?fields=display_phone_number`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data: { display_phone_number?: string } = await res.json().catch(() => ({}));
    const raw = data.display_phone_number;
    if (!raw) return null;
    // Meta formats this with a space right after the calling code, e.g.
    // "+91 87006 21883" — the first token is the calling code.
    const firstToken = raw.trim().split(/\s+/)[0] ?? "";
    const digits = firstToken.replace(/\D/g, "");
    return digits || null;
  } catch {
    return null;
  }
}

/** Meta's Message Templates API rejects a Call button's phone_number
 * outright ((#192) "is not a valid phone number") if it's missing a
 * country code, or has spaces/dashes/parentheses in it. If the person typed
 * a "+" themselves, that's respected as-is (they may be calling a different
 * country); otherwise the client's own detected calling code
 * (`defaultCallingCode`) is prepended automatically. */
function sanitizePhoneNumber(raw: string, defaultCallingCode: string | null): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (defaultCallingCode) return `+${defaultCallingCode}${digits}`;
  return digits;
}

/** "whatsapp"-kind buttons are also URL-shaped in this app (see
 * lib/whatsappMessage.ts's ctaButton matcher) — both map to Meta's "URL"
 * button type; "call" maps to "PHONE_NUMBER"; "quick_reply" maps to
 * Meta's "QUICK_REPLY" type, which has no destination at all — it's just
 * the button's own label, and tapping it sends that text back as the
 * customer's reply in the same chat. A "whatsapp" button's `url` is just
 * the raw number the person typed (see TemplateBuilder), so it's turned
 * into the real https://wa.me/<number> link here — with the same
 * auto-detected country code as the Call button — rather than in the
 * browser on every keystroke, which is what caused the country code to
 * double up before.
 *
 * Note: Meta rejects a "url"/"whatsapp" button whose link points at
 * wa.me/whatsapp.com ("Direct links to WhatsApp aren't allowed for
 * buttons") — a template message is already inside WhatsApp, so Meta
 * doesn't allow a button that just re-opens WhatsApp. "quick_reply" is
 * the real way to get "chat"-style engagement inside an approved
 * template. */
function toMetaButtons(buttons: ButtonLike[], defaultCallingCode: string | null) {
  return buttons.slice(0, 3).map((b) => {
    if (b.kind === "call") {
      return {
        type: "PHONE_NUMBER",
        text: b.label.slice(0, 20) || "Call",
        phone_number: sanitizePhoneNumber(b.url, defaultCallingCode),
      };
    }
    if (b.kind === "quick_reply") {
      return { type: "QUICK_REPLY", text: b.label.slice(0, 25) || "Reply" };
    }
    const url = b.kind === "whatsapp" ? toWaMeUrl(b.url, defaultCallingCode) : b.url;
    return { type: "URL", text: b.label.slice(0, 20) || "Open", url };
  });
}

function variableIndices(text: string): number[] {
  const indices = new Set<number>();
  for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) indices.add(Number(match[1]));
  return Array.from(indices).sort((a, b) => a - b);
}

type MediaKind = "none" | "image" | "video" | "document";

export interface SubmittableTemplate {
  name: string;
  language: string;
  category: "Marketing" | "Utility" | "Authentication";
  header: string | null;
  body: string;
  footer: string | null;
  buttons: ButtonLike[];
  mediaKind: MediaKind;
  /** This template's saved media file — a Vercel Blob URL in production, or
   * a relative /uploads/... path in local dev (needs `origin` to resolve). */
  mediaUrl: string | null;
  /** This app's own base URL, only needed to turn a relative mediaUrl into
   * something both we and Meta can fetch over the internet. */
  origin: string;
  parameterFormat?: "positional" | "named";
  /** Parameter names (named templates) in order. */
  variables?: string[];
  templateKind?: TemplateKind;
  extra?: TemplateExtra;
}

/**
 * Real upload to Meta's Resumable Upload API — the only way to get a
 * `header_handle` Meta will accept for a media (image/video/document)
 * HEADER component at template submission time. Two real calls:
 *   1. POST /{app-id}/uploads — starts an upload session sized for this
 *      exact file, returns an "upload:..." session id.
 *   2. POST /{session-id} with the raw file bytes and `file_offset: 0` —
 *      returns the file handle ("h") to reference in the template
 *      submission's HEADER component.
 * Needs NEXT_PUBLIC_META_APP_ID (already used for Embedded Signup) — the
 * Resumable Upload API is scoped to the Meta App, not the WABA/phone number.
 *
 * Reads META_APP_ID first — a plain, server-only env var, since this call
 * only ever runs on the server (this whole file is "server-only") and
 * never needs to reach the browser. Falls back to NEXT_PUBLIC_META_APP_ID
 * (used by app/(app)/whatsapp-setup/page.tsx's client-side Embedded
 * Signup, which does need the public prefix) so either one set is enough —
 * no need to duplicate the same App ID under two keys.
 */
export type UploadMediaResult = { ok: true; handle: string } | { ok: false; error: string };

export async function uploadMediaHandle(accessToken: string, mediaUrl: string, origin: string): Promise<UploadMediaResult> {
  const fileUrl = mediaUrl.startsWith("http") ? mediaUrl : `${origin}${mediaUrl}`;
  try {
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      return {
        ok: false,
        error: `Could not fetch the template's media file from ${fileUrl} (HTTP ${fileRes.status}).`,
      };
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const contentType = fileRes.headers.get("content-type") ?? "application/octet-stream";
    return uploadBufferForHandle(accessToken, buffer, contentType);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach Meta's upload API." };
  }
}

/** The two Resumable Upload calls themselves, for bytes we already hold
 * (also used for the business profile photo). */
export async function uploadBufferForHandle(
  accessToken: string,
  buffer: Buffer,
  contentType: string
): Promise<UploadMediaResult> {
  const appId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID;
  if (!appId) {
    return { ok: false, error: "META_APP_ID (or NEXT_PUBLIC_META_APP_ID) is not set in this environment." };
  }

  try {
    const sessionRes = await fetch(
      `https://graph.facebook.com/v25.0/${appId}/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(
        contentType
      )}&access_token=${encodeURIComponent(accessToken)}`,
      { method: "POST" }
    );
    const session: { id?: string; error?: { message?: string; error_user_msg?: string } } = await sessionRes
      .json()
      .catch(() => ({}));
    if (!sessionRes.ok || !session.id) {
      return {
        ok: false,
        error:
          session.error?.error_user_msg ??
          session.error?.message ??
          `Meta rejected starting the upload session (HTTP ${sessionRes.status}).`,
      };
    }

    const uploadRes = await fetch(`https://graph.facebook.com/v25.0/${session.id}`, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${accessToken}`,
        file_offset: "0",
      },
      body: new Uint8Array(buffer),
    });
    const uploaded: { h?: string; error?: { message?: string; error_user_msg?: string } } = await uploadRes
      .json()
      .catch(() => ({}));
    if (!uploadRes.ok || !uploaded.h) {
      return {
        ok: false,
        error:
          uploaded.error?.error_user_msg ??
          uploaded.error?.message ??
          `Meta rejected the file upload itself (HTTP ${uploadRes.status}).`,
      };
    }
    return { ok: true, handle: uploaded.h };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach Meta's upload API." };
  }
}

export type BuildComponentsResult =
  | { ok: true; components: Record<string, unknown>[] }
  | { ok: false; error: string };

/** Meta example values for a template text's placeholders. */
function exampleFor(index: number, name?: string): string {
  if (name) return name === "first_name" || name === "name" ? "Sahil" : `Sample ${name}`;
  return index === 1 ? "Sahil" : `Sample ${index}`;
}

/** Body/header `example` block in whichever format the template uses. */
function textExample(
  kind: "body" | "header",
  text: string,
  named: boolean
): Record<string, unknown> {
  if (named) {
    const names = extractParams(text);
    if (names.length === 0) return {};
    const list = names.map((n, i) => ({ param_name: n, example: exampleFor(i + 1, n) }));
    return { example: kind === "body" ? { body_text_named_params: list } : { header_text_named_params: list } };
  }
  const indices = variableIndices(text);
  if (indices.length === 0) return {};
  const examples = indices.map((i) => exampleFor(i));
  return { example: kind === "body" ? { body_text: [examples] } : { header_text: examples } };
}

/** Builds the `components` array Meta's Message Templates API expects.
 * {{1}} is always the recipient's own name by this app's convention (see
 * lib/personalize.ts) — Meta doesn't know that, it just needs a plausible
 * example value for each placeholder to accept the submission. Async
 * because a media header needs a real round-trip to Meta first
 * (uploadMediaHandle) to get its header_handle. Handles every template kind:
 * standard, coupon (copy-code button), limited-time offer, carousel and
 * authentication (OTP). */
export async function buildTemplateComponents(
  t: SubmittableTemplate,
  accessToken: string,
  defaultCallingCode: string | null
): Promise<BuildComponentsResult> {
  const kind = t.templateKind ?? "standard";
  const extra = t.extra ?? {};
  const named = t.parameterFormat === "named";

  // Authentication (OTP): Meta writes the body itself; we only choose the
  // security-recommendation line, the code's expiry and the copy-code button.
  if (kind === "authentication") {
    return {
      ok: true,
      components: [
        { type: "BODY", add_security_recommendation: extra.securityRecommendation !== false },
        { type: "FOOTER", code_expiration_minutes: extra.expiryMinutes ?? 10 },
        { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copy code" }] },
      ],
    };
  }

  const components: Record<string, unknown>[] = [];

  if (t.mediaKind !== "none" && t.mediaUrl) {
    const uploaded = await uploadMediaHandle(accessToken, t.mediaUrl, t.origin);
    if (!uploaded.ok) {
      return {
        ok: false,
        error: `Could not upload this template's media to Meta — ${uploaded.error}`,
      };
    }
    components.push({
      type: "HEADER",
      format: t.mediaKind.toUpperCase(),
      example: { header_handle: [uploaded.handle] },
    });
  } else if (t.header) {
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: t.header,
      ...textExample("header", t.header, named),
    });
  }

  if (kind === "lto") {
    components.push({
      type: "LIMITED_TIME_OFFER",
      limited_time_offer: { text: (extra.offerText ?? "").slice(0, 16), has_expiration: true },
    });
  }

  components.push({
    type: "BODY",
    text: t.body,
    ...textExample("body", t.body, named),
  });

  if (kind === "carousel") {
    const cards: Record<string, unknown>[] = [];
    for (const card of extra.cards ?? []) {
      const uploaded = await uploadMediaHandle(accessToken, card.mediaUrl, t.origin);
      if (!uploaded.ok) {
        return { ok: false, error: `Could not upload a carousel card's media to Meta — ${uploaded.error}` };
      }
      const cardComponents: Record<string, unknown>[] = [
        { type: "HEADER", format: card.mediaKind.toUpperCase(), example: { header_handle: [uploaded.handle] } },
        { type: "BODY", text: card.body },
      ];
      if (card.buttons.length > 0) {
        cardComponents.push({
          type: "BUTTONS",
          buttons: card.buttons.map((b) =>
            b.kind === "quick_reply"
              ? { type: "QUICK_REPLY", text: b.label.slice(0, 25) }
              : { type: "URL", text: b.label.slice(0, 20), url: b.url }
          ),
        });
      }
      cards.push({ components: cardComponents });
    }
    components.push({ type: "CAROUSEL", cards });
    // Carousel templates carry their buttons on the cards, never at the top level.
    return { ok: true, components };
  }

  if (t.footer) {
    components.push({ type: "FOOTER", text: t.footer });
  }

  const buttons: Record<string, unknown>[] = [];
  if ((kind === "coupon" || kind === "lto") && extra.couponCode) {
    buttons.push({ type: "COPY_CODE", example: extra.couponCode });
  }
  if (t.buttons.length > 0) buttons.push(...toMetaButtons(t.buttons, defaultCallingCode));
  if (buttons.length > 0) components.push({ type: "BUTTONS", buttons });

  return { ok: true, components };
}

export type MetaSubmitResult =
  | { ok: true; metaTemplateId: string; status: MetaTemplateStatus }
  | { ok: false; error: string };

/** Real POST to Meta's WhatsApp Business Management API — submits this
 * template for review. Requires the client's WABA id (from their connected
 * WhatsAppAccount, or META_TEST_WABA_ID for the shared test setup) and the
 * `whatsapp_business_management` permission on the access token. */
export async function submitTemplateToMeta(
  clientId: string,
  t: SubmittableTemplate
): Promise<MetaSubmitResult> {
  const credentials = await getWhatsAppCredentials(clientId);
  if (!credentials) {
    return {
      ok: false,
      error:
        "No WhatsApp number available — connect one in WhatsApp Account Setup, or configure META_TEST_PHONE_NUMBER_ID / META_TEST_ACCESS_TOKEN in .env.",
    };
  }
  if (!credentials.wabaId) {
    return {
      ok: false,
      error:
        "No WhatsApp Business Account (WABA) id on file — reconnect in WhatsApp Account Setup, or set META_TEST_WABA_ID in .env.",
    };
  }

  const languageCode = toMetaLanguageCode(t.language);
  const defaultCallingCode = await getDefaultCallingCode(credentials.phoneNumberId, credentials.accessToken);
  const built = await buildTemplateComponents(t, credentials.accessToken, defaultCallingCode);
  if (!built.ok) return { ok: false, error: built.error };
  const components = built.components;

  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${credentials.wabaId}/message_templates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: t.name,
        language: languageCode,
        category: toMetaCategory(t.category),
        ...(t.parameterFormat === "named" ? { parameter_format: "NAMED" } : {}),
        components,
      }),
    });
    const data: { id?: string; status?: string; error?: { message?: string; error_user_msg?: string } } = await res
      .json()
      .catch(() => ({}));

    if (!res.ok || !data.id) {
      return {
        ok: false,
        error: data.error?.error_user_msg ?? data.error?.message ?? "Meta rejected the template submission.",
      };
    }
    return { ok: true, metaTemplateId: data.id, status: normalizeMetaStatus(data.status) };
  } catch {
    return { ok: false, error: "Could not reach Meta's API." };
  }
}

export type MetaStatusCheckResult =
  | { ok: true; status: MetaTemplateStatus; rejectionReason: string | null }
  | { ok: false; error: string };

/** Real GET against Meta for this template's current review status —
 * used by the "Check status" action and as a manual alternative to (or
 * backstop for) the message_template_status_update webhook. */
export async function fetchTemplateStatusFromMeta(
  clientId: string,
  metaTemplateId: string
): Promise<MetaStatusCheckResult> {
  const credentials = await getWhatsAppCredentials(clientId);
  if (!credentials) return { ok: false, error: "No WhatsApp credentials available." };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${metaTemplateId}?fields=status,rejected_reason`,
      { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
    );
    const data: { status?: string; rejected_reason?: string; error?: { message?: string } } = await res
      .json()
      .catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error?.message ?? "Could not check status with Meta." };
    }
    return {
      ok: true,
      status: normalizeMetaStatus(data.status),
      rejectionReason: data.rejected_reason && data.rejected_reason !== "NONE" ? data.rejected_reason : null,
    };
  } catch {
    return { ok: false, error: "Could not reach Meta's API." };
  }
}

/**
 * Builds the real `type: "template"` send payload for an APPROVED Meta
 * template — the only way to send multiple mixed-type buttons (e.g. Call +
 * URL together), since free-form/interactive messages support just one URL
 * button (see lib/whatsappMessage.ts).
 *
 * Critically different from the free-form path: the header/body text here
 * must be the ORIGINAL text with its {{n}} placeholders intact — Meta
 * substitutes them server-side from the `parameters` we send, using the
 * approved template it has on file. We must NOT fillTemplate() first, or
 * Meta will reject the send because the text no longer matches what it
 * approved.
 *
 * A media-header template is different again: unlike the one-time
 * `header_handle` used at submission (uploadMediaHandle), Meta wants the
 * actual media re-supplied as a `link` in the header component on EVERY
 * send — the approved handle isn't reusable for sending.
 */
export function buildTemplateSendPayload(
  t: {
    name: string;
    metaLanguageCode: string;
    header: string | null;
    body: string;
    mediaKind?: "none" | "image" | "video" | "document";
    mediaUrl?: string | null;
    parameterFormat?: "positional" | "named";
    /** Parameter names, in order, for a named template. */
    variables?: string[];
    templateKind?: TemplateKind;
    extra?: TemplateExtra;
  },
  values: string[],
  origin?: string
): BuiltMessage {
  const components: Record<string, unknown>[] = [];
  const kind = t.templateKind ?? "standard";
  const extra = t.extra ?? {};
  const named = t.parameterFormat === "named";
  const names = t.variables ?? [];
  const absolute = (url: string) => (url.startsWith("http") ? url : `${origin ?? ""}${url}`);

  /** The text parameters for one component's placeholders. */
  const textParameters = (text: string) =>
    named
      ? extractParams(text).map((n) => ({
          type: "text",
          parameter_name: n,
          text: values[names.indexOf(n)] ?? "",
        }))
      : variableIndices(text).map((i) => ({ type: "text", text: values[i - 1] ?? "" }));

  if (t.mediaKind && t.mediaKind !== "none" && t.mediaUrl) {
    components.push({
      type: "header",
      parameters: [{ type: t.mediaKind, [t.mediaKind]: { link: absolute(t.mediaUrl) } }],
    });
  } else if (t.header) {
    const parameters = textParameters(t.header);
    if (parameters.length > 0) components.push({ type: "header", parameters });
  }

  if (kind === "lto") {
    const hours = extra.expiresInHours ?? 48;
    components.push({
      type: "limited_time_offer",
      parameters: [
        { type: "limited_time_offer", limited_time_offer: { expiration_time_ms: Date.now() + hours * 60 * 60 * 1000 } },
      ],
    });
  }

  const bodyParameters = textParameters(t.body);
  if (bodyParameters.length > 0) components.push({ type: "body", parameters: bodyParameters });

  // The copy-code button is always the first button (see buildTemplateComponents).
  if ((kind === "coupon" || kind === "lto") && extra.couponCode) {
    components.push({
      type: "button",
      sub_type: "copy_code",
      index: "0",
      parameters: [{ type: "coupon_code", coupon_code: extra.couponCode }],
    });
  }

  if (kind === "carousel") {
    components.push({
      type: "carousel",
      cards: (extra.cards ?? []).map((card, cardIndex) => ({
        card_index: cardIndex,
        components: [
          {
            type: "header",
            parameters: [{ type: card.mediaKind, [card.mediaKind]: { link: absolute(card.mediaUrl) } }],
          },
          ...card.buttons.flatMap((b, buttonIndex) =>
            b.kind === "quick_reply"
              ? [
                  {
                    type: "button",
                    sub_type: "quick_reply",
                    index: String(buttonIndex),
                    parameters: [{ type: "payload", payload: b.label }],
                  },
                ]
              : []
          ),
        ],
      })),
    });
  }

  const previewText = fillParams(t.body, values, named ? "named" : "positional", names);

  return {
    payload: {
      type: "template",
      template: {
        name: t.name,
        language: { code: t.metaLanguageCode },
        ...(components.length > 0 ? { components } : {}),
      },
    },
    preview: previewText.slice(0, 200),
  };
}
