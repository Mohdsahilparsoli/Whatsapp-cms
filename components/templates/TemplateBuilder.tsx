"use client";

import { useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, MessageCircle, MessageSquareReply, Phone, Plus, Trash2, UploadCloud, X } from "lucide-react";
import { upload } from "@vercel/blob/client";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import FormField, { SelectField, TextareaField } from "@/components/ui/FormField";
import TemplatePreview from "./TemplatePreview";
import { emptyDraft, type CustomTemplateDraft, type SaveTemplateResult } from "@/lib/customTemplates";
import type { CarouselCard, CustomTemplate, TemplateButtonKind, TemplateKind } from "@/types";

const MAX_BUTTONS = 3;
const MAX_VARIABLES = 10;
// Matches app/api/templates/media/client-upload/route.ts's own per-kind
// ceilings — video gets a little more headroom since a few seconds of real
// footage routinely lands between 4–10MB.
const MAX_FILE_BYTES: Record<string, number> = {
  none: 0,
  image: 10 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 10 * 1024 * 1024,
};

const kindOptions: { label: string; value: TemplateKind }[] = [
  { label: "Standard message", value: "standard" },
  { label: "Coupon code (copy-code button)", value: "coupon" },
  { label: "Limited-time offer", value: "lto" },
  { label: "Carousel (swipeable cards)", value: "carousel" },
  { label: "Authentication / OTP", value: "authentication" },
];

const categories = [
  { label: "Marketing", value: "Marketing" },
  { label: "Utility", value: "Utility" },
  { label: "Authentication", value: "Authentication" },
];

const languages = [
  { label: "English", value: "English" },
  { label: "Hindi", value: "Hindi" },
  { label: "Marathi", value: "Marathi" },
  { label: "Tamil", value: "Tamil" },
  { label: "Bengali", value: "Bengali" },
];

const mediaOptions = [
  { label: "No media", value: "none" },
  { label: "Image", value: "image" },
  { label: "Video", value: "video" },
  { label: "Document", value: "document" },
];

const mediaAccept: Record<string, string> = {
  image: "image/jpeg,image/png,image/webp,image/gif",
  video: "video/mp4,video/webm,video/quicktime",
  document: "application/pdf",
};

const buttonMeta: Record<
  TemplateButtonKind,
  { label: string; icon: React.ComponentType<{ className?: string }>; valueLabel: string; placeholder: string }
> = {
  url: { label: "Primary button (URL)", icon: ExternalLink, valueLabel: "URL", placeholder: "https://example.com/offer" },
  call: { label: "Call button", icon: Phone, valueLabel: "Phone number", placeholder: "98110 22331" },
  whatsapp: { label: "WhatsApp chat button", icon: MessageCircle, valueLabel: "WhatsApp number", placeholder: "98110 22331" },
  quick_reply: {
    label: "Quick Reply button",
    icon: MessageSquareReply,
    valueLabel: "",
    placeholder: "",
  },
};

/**
 * The WhatsApp chat button always links to https://wa.me/<number> — there's
 * no reason to make the client type (or accidentally delete) that fixed
 * part. The UI below shows it as a locked prefix and only takes the number.
 *
 * The field stores JUST the raw digits the person types (button.url), same
 * as the Call button's phone number field — no "91" is added here, and
 * nothing is round-tripped back through a derived value on every keystroke
 * (that round-trip was what caused "91" to double up). The real
 * https://wa.me/<number> link — with the country code auto-detected and
 * added exactly once — is built on the backend only where it's actually
 * needed to send or submit (lib/whatsappMessage.ts's toWaMeUrl,
 * lib/metaTemplates.ts's toMetaButtons), exactly like the Call button's
 * number is completed with a country code only at Meta submission time.
 */
const WA_BASE_URL = "https://wa.me/";

type Errors = Partial<Record<"name" | "body" | "media" | "buttons" | "header" | "footer" | "extra", string>>;

/**
 * Meta's real hard limit for an interactive message's header/footer text
 * (60 chars) — a template with a button sends as an "interactive" message
 * (see lib/whatsappMessage.ts), and Meta rejects the whole send with
 * (#131009) "Parameter value is not valid" if either field runs over. We
 * hit this for real with a 62-character footer, so this isn't a style
 * preference — it's enforced whenever the template ends up with a button.
 */
const HEADER_FOOTER_MAX = 60;

/** Drops {{n}} and renumbers the placeholders above it so the body stays valid. */
function removeVariableFromBody(body: string, index: number) {
  return body
    .replace(new RegExp(`\\s*\\{\\{${index + 1}\\}\\}`, "g"), "")
    .replace(/\{\{(\d+)\}\}/g, (match, raw) => {
      const number = Number(raw);
      return number > index + 1 ? `{{${number - 1}}}` : match;
    });
}

/** var_1, var_2 … — the first one not already used. */
function uniqueName(existing: string[]): string {
  let n = existing.length + 1;
  while (existing.includes(`var_${n}`)) n += 1;
  return `var_${n}`;
}

function draftFromTemplate(template: CustomTemplate): CustomTemplateDraft {
  return {
    name: template.name,
    language: template.language,
    category: template.category,
    status: template.status,
    header: template.header ?? "",
    body: template.body,
    footer: template.footer ?? "",
    media: template.media,
    buttons: template.buttons,
    variables: template.variables,
    parameterFormat: template.parameterFormat,
    templateKind: template.templateKind,
    extra: template.extra,
  };
}

export default function TemplateBuilder({
  open,
  onClose,
  onSubmit,
  nameTaken,
  editing = null,
}: {
  open: boolean;
  onClose: () => void;
  /** Called for both "Save as Draft" and "Save Template" — draft.status is
   * already set to "draft" or "custom" before this is called. When editing,
   * the template's id is passed as the second argument. */
  onSubmit: (draft: CustomTemplateDraft, editingId?: string) => Promise<SaveTemplateResult>;
  nameTaken: (name: string, ignoreId?: string) => boolean;
  /** Pass an existing template to edit it; omit/null to create a new one. */
  editing?: CustomTemplate | null;
}) {
  const [draft, setDraft] = useState<CustomTemplateDraft>(() =>
    editing ? draftFromTemplate(editing) : emptyDraft()
  );
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState<"draft" | "custom" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset the draft fresh every time the modal opens — adjusting state
  // during render avoids a separate reset effect.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setErrors({});
      setUploadError(null);
      setDraft(editing ? draftFromTemplate(editing) : emptyDraft());
    }
  }

  const patch = (changes: Partial<CustomTemplateDraft>) =>
    setDraft((prev) => ({ ...prev, ...changes }));

  /** Preview substitutes each variable with its friendly label. */
  const previewValues = useMemo(
    () => draft.variables.map((label, index) => label.trim() || `Value ${index + 1}`),
    [draft.variables]
  );

  const named = draft.parameterFormat === "named";

  function addVariable() {
    if (draft.variables.length >= MAX_VARIABLES) return;
    const token = named ? uniqueName(draft.variables) : String(draft.variables.length + 1);
    patch({
      variables: [...draft.variables, named ? token : ""],
      body: `${draft.body}${draft.body.endsWith(" ") || !draft.body ? "" : " "}{{${token}}}`,
    });
  }

  function removeVariable(index: number) {
    if (named) {
      const token = draft.variables[index];
      patch({
        variables: draft.variables.filter((_, i) => i !== index),
        body: draft.body.replace(new RegExp(`\\s*\\{\\{${token}\\}\\}`, "g"), ""),
        header: (draft.header ?? "").replace(new RegExp(`\\s*\\{\\{${token}\\}\\}`, "g"), ""),
      });
      return;
    }
    patch({
      variables: draft.variables.filter((_, i) => i !== index),
      body: removeVariableFromBody(draft.body, index),
    });
  }

  /** Named templates: renaming a variable rewrites its {{placeholder}} everywhere. */
  function renameVariable(index: number, rawName: string) {
    const nextName = rawName.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const prevName = draft.variables[index];
    const swap = (text: string) => text.split(`{{${prevName}}}`).join(`{{${nextName}}}`);
    patch({
      variables: draft.variables.map((item, i) => (i === index ? nextName : item)),
      body: swap(draft.body),
      header: swap(draft.header ?? ""),
    });
  }

  // ---- carousel cards ----
  const cards = draft.extra.cards ?? [];
  const setCards = (next: CarouselCard[]) => patch({ extra: { ...draft.extra, cards: next } });
  const carouselMediaKind = cards[0]?.mediaKind ?? "image";

  function addCard() {
    if (cards.length >= 10) return;
    const template = cards[0];
    setCards([
      ...cards,
      {
        mediaKind: carouselMediaKind,
        mediaUrl: "",
        body: "",
        buttons: (template?.buttons ?? []).map((b) => ({ ...b, url: b.kind === "url" ? "" : b.url })),
      },
    ]);
  }

  function updateCard(index: number, changes: Partial<CarouselCard>) {
    setCards(cards.map((c, i) => (i === index ? { ...c, ...changes } : c)));
  }

  function setKind(kind: TemplateKind) {
    setUploadError(null);
    if (kind === "carousel" && cards.length === 0) {
      patch({
        templateKind: kind,
        media: { kind: "none", url: "" },
        buttons: [],
        extra: {
          cards: [0, 1].map(() => ({ mediaKind: "image" as const, mediaUrl: "", body: "", buttons: [] })),
        },
      });
      return;
    }
    patch({
      templateKind: kind,
      ...(kind === "authentication" ? { category: "Authentication" as const } : {}),
      ...(kind !== "authentication" && draft.category === "Authentication" ? { category: "Marketing" as const } : {}),
      extra:
        kind === "coupon"
          ? { couponCode: draft.extra.couponCode ?? "" }
          : kind === "lto"
            ? { offerText: draft.extra.offerText ?? "", expiresInHours: draft.extra.expiresInHours ?? 48, couponCode: draft.extra.couponCode }
            : kind === "authentication"
              ? { expiryMinutes: draft.extra.expiryMinutes ?? 10, securityRecommendation: draft.extra.securityRecommendation !== false }
              : kind === "carousel"
                ? draft.extra
                : {},
    });
  }

  function addButton(kind: TemplateButtonKind) {
    if (draft.buttons.length >= MAX_BUTTONS) return;
    patch({
      buttons: [
        ...draft.buttons,
        {
          id: `btn-${Date.now()}-${draft.buttons.length}`,
          kind,
          label:
            kind === "whatsapp"
              ? "Chat with us"
              : kind === "call"
                ? "Call us"
                : kind === "quick_reply"
                  ? "Yes, I'm interested"
                  : "",
          url: "",
        },
      ],
    });
  }

  /** Direct browser → Vercel Blob upload; returns the public URL. */
  async function uploadToBlob(file: File, kind: string): Promise<string> {
    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const pathname = `templates/${crypto.randomUUID()}${ext}`;
    const blob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/templates/media/client-upload",
      clientPayload: kind,
      contentType: file.type || undefined,
    });
    return blob.url;
  }

  async function handleCardFile(index: number, file: File | undefined) {
    setUploadError(null);
    if (!file) return;
    const kind = cards[index]?.mediaKind ?? "image";
    const maxBytes = MAX_FILE_BYTES[kind];
    if (file.size > maxBytes) {
      setUploadError(`That file is larger than ${Math.round(maxBytes / (1024 * 1024))}MB.`);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadToBlob(file, kind);
      updateCard(index, { mediaUrl: url, mediaFileName: file.name });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not upload the card media.");
    } finally {
      setUploading(false);
    }
  }

  async function handleFileSelected(file: File | undefined) {
    setUploadError(null);
    if (!file) return;
    const kind = draft.media.kind;
    const maxBytes = MAX_FILE_BYTES[kind] ?? MAX_FILE_BYTES.image;
    if (file.size > maxBytes) {
      setUploadError(`That file is larger than ${Math.round(maxBytes / (1024 * 1024))}MB.`);
      return;
    }

    setUploading(true);
    try {
      // Uploads straight from the browser to Vercel Blob — see
      // app/api/templates/media/client-upload/route.ts, which only
      // authorizes the transfer (no file bytes pass through our own
      // Next.js route, so there's no Serverless Function body-size limit
      // in the way, unlike the old proxied upload this replaced).
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const pathname = `templates/${crypto.randomUUID()}${ext}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/templates/media/client-upload",
        clientPayload: kind,
        contentType: file.type || undefined,
      });
      patch({ media: { kind, url: blob.url, fileName: file.name } });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not reach the server. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function validate(asDraft: boolean): Errors {
    const name = draft.name.trim();
    const next: Errors = {};

    if (!name) next.name = "Give the template a name.";
    else if (!/^[a-z0-9_]+$/.test(name))
      next.name = "Use lowercase letters, numbers, and underscores only.";
    else if (nameTaken(name, editing?.id)) next.name = "You already have a template with this name.";

    if (asDraft) return next;

    if (draft.templateKind === "authentication") return next;

    if (!draft.body.trim()) next.body = "Write the message body.";
    if (draft.templateKind === "coupon" && !(draft.extra.couponCode ?? "").trim()) {
      next.extra = "Enter the coupon code customers will copy.";
    }
    if (draft.templateKind === "lto") {
      const offer = (draft.extra.offerText ?? "").trim();
      if (!offer || offer.length > 16) next.extra = "Enter the offer text (1–16 characters), e.g. “Summer Sale”.";
      else if (draft.media.kind !== "image" && draft.media.kind !== "video") {
        next.media = "A limited-time-offer template needs an image or video header.";
      } else if (!(draft.extra.couponCode ?? "").trim() && !draft.buttons.some((b) => b.kind === "url")) {
        next.extra = "Add a coupon code or a URL button — Meta requires one for limited-time offers.";
      }
    }
    if (draft.templateKind === "carousel") {
      if (cards.length < 2) next.extra = "A carousel needs at least 2 cards.";
      else if (cards.some((c) => !c.mediaUrl || !c.body.trim())) next.extra = "Every card needs media and text.";
      else if (cards.some((c) => /\{\{/.test(c.body))) next.extra = "Card text can't contain {{variables}}.";
      else if (cards.some((c) => c.buttons.some((b) => !b.label.trim() || (b.kind === "url" && !/^https?:\/\/.+/.test(b.url.trim())))))
        next.extra = "Every card button needs a label, and URL buttons need a full link (https://…).";
    }
    if (named) {
      const bad = draft.variables.find((v) => !/^[a-z][a-z0-9_]*$/.test(v));
      if (bad !== undefined) next.body = "Every named variable needs a name: lowercase letters, numbers and underscores, starting with a letter.";
    }
    if (draft.media.kind !== "none" && !draft.media.url.trim())
      next.media = "Upload a file for the attached media.";

    // Only bites once a button is added (that's what turns this into an
    // "interactive" send — see lib/whatsappMessage.ts) — but we warn
    // unconditionally so it's caught before a button gets added, not after.
    if ((draft.header ?? "").length > HEADER_FOOTER_MAX)
      next.header = `Header is too long for a button message — Meta allows up to ${HEADER_FOOTER_MAX} characters.`;
    if ((draft.footer ?? "").length > HEADER_FOOTER_MAX)
      next.footer = `Footer is too long for a button message — Meta allows up to ${HEADER_FOOTER_MAX} characters.`;

    // No country code required here on purpose — at Meta submission time
    // (lib/metaTemplates.ts), a Call button number typed without one gets
    // this client's own WhatsApp number's country calling code auto-
    // prepended, so nobody has to type "+91" etc themselves.
    const badButton = draft.buttons.find((button) => {
      if (!button.label.trim()) return true;
      if (button.kind === "call") return button.url.replace(/\D/g, "").length < 7;
      // A WhatsApp chat button's url is always the fixed "https://wa.me/"
      // prefix + whatever number was typed above — so "enough digits" is
      // the real check, since an empty number still passes the URL regex.
      if (button.kind === "whatsapp") return button.url.replace(/\D/g, "").length < 7;
      // A Quick Reply button has no destination — the label is the button.
      if (button.kind === "quick_reply") return false;
      return !/^https?:\/\/.+/.test(button.url.trim());
    });
    if (badButton)
      next.buttons =
        "Every button needs a label, and a URL (http:// or https://) or a phone number for Call buttons.";

    return next;
  }

  async function submit(asDraft: boolean) {
    const found = validate(asDraft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(asDraft ? "draft" : "custom");
    try {
      const result = await onSubmit(
        {
          ...draft,
          name: draft.name.trim(),
          status: asDraft ? "draft" : "custom",
        },
        editing?.id
      );
      if (!result.ok) {
        setErrors((prev) => ({ ...prev, ...result.errors }));
        if (result.error) setUploadError(result.error);
        return;
      }
      onClose();
    } finally {
      setSubmitting(null);
    }
  }

  const busy = submitting !== null;

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={editing ? `Edit ${editing.name}` : "Create custom template"}
      description="Custom templates are your own — not submitted to Meta for approval."
      size="xl"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => submit(true)} disabled={busy}>
            {submitting === "draft" ? "Saving…" : "Save as Draft"}
          </Button>
          <Button variant="primary" onClick={() => submit(false)} disabled={busy}>
            {submitting === "custom" ? "Saving…" : editing ? "Save changes" : "Save Template"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              label="Template name"
              required
              value={draft.name}
              onChange={(value) => patch({ name: value })}
              error={errors.name}
              placeholder="diwali_store_invite"
              hint="Lowercase letters, numbers, and underscores."
            />
            <SelectField
              label="Template type"
              value={draft.templateKind}
              onChange={(value) => setKind(value as TemplateKind)}
              options={kindOptions}
            />
            {draft.templateKind !== "authentication" && (
              <SelectField
                label="Template category"
                value={draft.category}
                onChange={(value) =>
                  patch({ category: value as CustomTemplateDraft["category"] })
                }
                options={categories.filter((c) => c.value !== "Authentication")}
              />
            )}
            <SelectField
              label="Template language"
              value={draft.language}
              onChange={(value) => patch({ language: value })}
              options={languages}
            />
            {draft.templateKind !== "carousel" && draft.templateKind !== "authentication" && (
            <SelectField
              label="Media"
              value={draft.media.kind}
              onChange={(value) => {
                setUploadError(null);
                patch({
                  media:
                    value === "none"
                      ? { kind: "none", url: "" }
                      : { kind: value as CustomTemplateDraft["media"]["kind"], url: "" },
                });
              }}
              options={draft.templateKind === "lto" ? mediaOptions.filter((o) => o.value === "image" || o.value === "video") : mediaOptions}
            />
            )}
          </div>

          {draft.templateKind === "coupon" && (
            <FormField
              label="Coupon code"
              required
              value={draft.extra.couponCode ?? ""}
              onChange={(value) => patch({ extra: { ...draft.extra, couponCode: value.toUpperCase() } })}
              error={errors.extra}
              placeholder="SAVE20"
              hint="Customers see a Copy code button that copies this."
            />
          )}

          {draft.templateKind === "lto" && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
              <FormField
                label="Offer text"
                required
                value={draft.extra.offerText ?? ""}
                onChange={(value) => patch({ extra: { ...draft.extra, offerText: value.slice(0, 16) } })}
                placeholder="Summer Sale"
                hint={`${(draft.extra.offerText ?? "").length}/16`}
              />
              <FormField
                label="Offer lasts (hours)"
                value={String(draft.extra.expiresInHours ?? 48)}
                onChange={(value) => patch({ extra: { ...draft.extra, expiresInHours: Number(value.replace(/\D/g, "")) || 48 } })}
                hint="Countdown starts when the message is sent."
              />
              <FormField
                label="Coupon code (optional)"
                value={draft.extra.couponCode ?? ""}
                onChange={(value) => patch({ extra: { ...draft.extra, couponCode: value.toUpperCase() || undefined } })}
                placeholder="SAVE20"
              />
              {errors.extra && <p role="alert" className="text-xs text-red-600 sm:col-span-3">{errors.extra}</p>}
              <p className="text-xs text-slate-500 sm:col-span-3">
                Needs an image or video header (choose it in Media above) and a coupon code or a URL button.
              </p>
            </div>
          )}

          {draft.templateKind === "authentication" && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm text-slate-700">
                Meta writes the message itself (“<code>123456</code> is your verification code.”) and adds a Copy code
                button. Send these through the OTP API (API keys page) — not from campaigns.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  label="Code expires after (minutes)"
                  value={String(draft.extra.expiryMinutes ?? 10)}
                  onChange={(value) => patch({ extra: { ...draft.extra, expiryMinutes: Math.min(Number(value.replace(/\D/g, "")) || 10, 90) } })}
                  hint="1–90 minutes."
                />
                <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={draft.extra.securityRecommendation !== false}
                    onChange={(e) => patch({ extra: { ...draft.extra, securityRecommendation: e.target.checked } })}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  Add “Do not share this code” line
                </label>
              </div>
            </div>
          )}

          {draft.templateKind !== "carousel" && draft.templateKind !== "authentication" && draft.media.kind !== "none" && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-600">
                {draft.media.kind === "image" && "Image — jpg, png, webp, or gif, up to 10MB"}
                {draft.media.kind === "video" && "Video — mp4, webm, or mov, up to 16MB"}
                {draft.media.kind === "document" && "Document — PDF, up to 10MB"}
              </p>

              {draft.media.url ? (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="min-w-0 flex-1 truncate text-sm text-slate-700">
                    {draft.media.fileName || "Uploaded file"}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => patch({ media: { kind: draft.media.kind, url: "" } })}
                  >
                    <X className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              ) : (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={mediaAccept[draft.media.kind]}
                    className="sr-only"
                    id="template-media-upload"
                    onChange={(e) => handleFileSelected(e.target.files?.[0])}
                  />
                  <label
                    htmlFor="template-media-upload"
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-4 w-4" /> Choose a file to upload
                      </>
                    )}
                  </label>
                </div>
              )}

              {(errors.media || uploadError) && (
                <p role="alert" className="text-xs text-red-600">
                  {errors.media || uploadError}
                </p>
              )}
            </div>
          )}

          {draft.templateKind !== "authentication" && draft.templateKind !== "carousel" && (
          <FormField
            label="Header text"
            value={draft.header ?? ""}
            onChange={(value) => patch({ header: value })}
            placeholder="You're invited"
            error={errors.header}
            hint={`${(draft.header ?? "").length}/${HEADER_FOOTER_MAX} — only enforced once this template has a button`}
          />
          )}

          {draft.templateKind !== "authentication" && (
          <TextareaField
            label="Message body"
            value={draft.body}
            onChange={(value) => patch({ body: value })}
            rows={5}
            error={errors.body}
            placeholder={named ? "Hi {{first_name}}, our festive sale starts on {{sale_date}}." : "Hi {{1}}, our festive sale starts on {{2}}."}
            hint={named ? "Use {{name}}-style variables, e.g. {{first_name}}." : "Use {{1}}, {{2}}, {{3}} for values filled in per contact."}
          />
          )}

          {draft.templateKind !== "authentication" && draft.templateKind !== "carousel" && (
          <FormField
            label="Footer text"
            value={draft.footer ?? ""}
            onChange={(value) => patch({ footer: value })}
            placeholder="Reply STOP to opt out"
            error={errors.footer}
            hint={`${(draft.footer ?? "").length}/${HEADER_FOOTER_MAX} — only enforced once this template has a button`}
          />
          )}

          {/* Carousel cards */}
          {draft.templateKind === "carousel" && (
            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">Cards ({cards.length}/10)</p>
                <div className="flex items-center gap-2">
                  <select
                    value={carouselMediaKind}
                    onChange={(e) =>
                      setCards(cards.map((c) => ({ ...c, mediaKind: e.target.value as "image" | "video", mediaUrl: "" })))
                    }
                    className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                    aria-label="Card media type"
                  >
                    <option value="image">Image cards</option>
                    <option value="video">Video cards</option>
                  </select>
                  <Button size="sm" onClick={addCard} disabled={cards.length >= 10}>
                    <Plus className="h-3.5 w-3.5" /> Add card
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      setCards(
                        cards.map((c) =>
                          c.buttons.length >= 2 ? c : { ...c, buttons: [...c.buttons, { kind: "url" as const, label: "", url: "" }] }
                        )
                      )
                    }
                    disabled={(cards[0]?.buttons.length ?? 0) >= 2}
                  >
                    <Plus className="h-3.5 w-3.5" /> Button on every card
                  </Button>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                All cards must use the same media type and the same number of buttons. Card text can&apos;t contain variables.
              </p>
              <ul className="space-y-3">
                {cards.map((card, index) => (
                  <li key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-500">Card {index + 1}</p>
                      <Button
                        size="sm"
                        variant="danger"
                        aria-label={`Remove card ${index + 1}`}
                        onClick={() => setCards(cards.filter((_, i) => i !== index))}
                        disabled={cards.length <= 2}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      {card.mediaUrl ? (
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{card.mediaFileName || "Uploaded"}</span>
                      ) : (
                        <span className="flex-1 text-xs text-slate-400">No {card.mediaKind} yet</span>
                      )}
                      <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        {uploading ? "Uploading…" : card.mediaUrl ? "Replace" : "Upload"}
                        <input
                          type="file"
                          accept={mediaAccept[card.mediaKind]}
                          className="hidden"
                          onChange={(e) => {
                            handleCardFile(index, e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    <TextareaField
                      label="Card text"
                      rows={2}
                      value={card.body}
                      onChange={(value) => updateCard(index, { body: value })}
                      className="mt-2"
                    />
                    {card.buttons.map((b, bi) => (
                      <div key={bi} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[110px_1fr_1fr]">
                        <select
                          value={b.kind}
                          onChange={(e) =>
                            setCards(
                              cards.map((c) => ({
                                ...c,
                                buttons: c.buttons.map((x, xi) => (xi === bi ? { ...x, kind: e.target.value as "url" | "quick_reply" } : x)),
                              }))
                            )
                          }
                          className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                        >
                          <option value="url">URL</option>
                          <option value="quick_reply">Quick reply</option>
                        </select>
                        <input
                          value={b.label}
                          onChange={(e) =>
                            updateCard(index, { buttons: card.buttons.map((x, xi) => (xi === bi ? { ...x, label: e.target.value } : x)) })
                          }
                          placeholder="Button label"
                          className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm"
                        />
                        {b.kind === "url" && (
                          <input
                            value={b.url}
                            onChange={(e) =>
                              updateCard(index, { buttons: card.buttons.map((x, xi) => (xi === bi ? { ...x, url: e.target.value } : x)) })
                            }
                            placeholder="https://…"
                            className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm"
                          />
                        )}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
              {(errors.extra || uploadError) && (
                <p role="alert" className="text-xs text-red-600">{errors.extra || uploadError}</p>
              )}
            </div>
          )}

          {/* Variables */}
          {draft.templateKind !== "authentication" && (
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">
                Message variables
              </p>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={named}
                  disabled={draft.variables.length > 0}
                  onChange={(e) => patch({ parameterFormat: e.target.checked ? "named" : "positional" })}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                />
                Named variables {"{{first_name}}"}
              </label>
              <Button
                size="sm"
                onClick={addVariable}
                disabled={draft.variables.length >= MAX_VARIABLES}
              >
                <Plus className="h-3.5 w-3.5" /> Add variable
              </Button>
            </div>
            {draft.variables.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">
                No variables yet. Adding one inserts the next {"{{n}}"} placeholder
                into the body.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {draft.variables.map((label, index) => (
                  <li key={index} className="flex items-end gap-2">
                    <span className="mb-2 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                      {named ? `{{${label}}}` : `{{${index + 1}}}`}
                    </span>
                    <FormField
                      label={named ? `Variable ${index + 1} name` : `Variable ${index + 1} label`}
                      className="flex-1"
                      value={label}
                      onChange={(value) =>
                        named
                          ? renameVariable(index, value)
                          : patch({
                              variables: draft.variables.map((item, i) =>
                                i === index ? value : item
                              ),
                            })
                      }
                      placeholder={named ? "first_name" : "Customer name"}
                      hint={named && index === 0 ? "The first variable is filled with each contact's name." : undefined}
                    />
                    <Button
                      size="sm"
                      variant="danger"
                      className="mb-0.5"
                      aria-label={`Remove variable ${index + 1}`}
                      onClick={() => removeVariable(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          )}

          {/* Buttons */}
          {draft.templateKind !== "carousel" && draft.templateKind !== "authentication" && (
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">Buttons</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => addButton("url")} disabled={draft.buttons.length >= MAX_BUTTONS}>
                  <ExternalLink className="h-3.5 w-3.5" /> Add URL button
                </Button>
                <Button size="sm" onClick={() => addButton("call")} disabled={draft.buttons.length >= MAX_BUTTONS}>
                  <Phone className="h-3.5 w-3.5" /> Add Call button
                </Button>
                <Button size="sm" onClick={() => addButton("whatsapp")} disabled={draft.buttons.length >= MAX_BUTTONS}>
                  <MessageCircle className="h-3.5 w-3.5" /> Add WhatsApp chat
                </Button>
                <Button size="sm" onClick={() => addButton("quick_reply")} disabled={draft.buttons.length >= MAX_BUTTONS}>
                  <MessageSquareReply className="h-3.5 w-3.5" /> Add Quick Reply
                </Button>
              </div>
            </div>

            {draft.buttons.some((b) => b.kind === "whatsapp") && (
              <p className="mt-2 text-xs text-amber-600">
                Heads up: Meta doesn&apos;t allow a WhatsApp chat (wa.me) button in a
                template submitted for approval — it only works if this stays a
                Custom/Draft template you send yourself. Use Quick Reply instead for an
                approved template.
              </p>
            )}

            {draft.buttons.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">
                No buttons yet. You can add up to {MAX_BUTTONS}.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {draft.buttons.map((button, index) => {
                  const meta = buttonMeta[button.kind];
                  return (
                    <li
                      key={button.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                          <meta.icon className="h-3.5 w-3.5" /> {meta.label}
                        </p>
                        <Button
                          size="sm"
                          variant="danger"
                          aria-label={`Remove button ${index + 1}`}
                          onClick={() =>
                            patch({
                              buttons: draft.buttons.filter((_, i) => i !== index),
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <FormField
                          label="Button label"
                          value={button.label}
                          onChange={(value) =>
                            patch({
                              buttons: draft.buttons.map((item, i) =>
                                i === index ? { ...item, label: value } : item
                              ),
                            })
                          }
                          placeholder={meta.label === "Call button" ? "Call us" : "View collection"}
                        />
                        {button.kind === "whatsapp" ? (
                          <div>
                            <label className="block text-sm font-medium text-slate-700">{meta.valueLabel}</label>
                            <div className="mt-1.5 flex h-9 items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
                              <span className="flex items-center bg-slate-50 px-2.5 text-xs text-slate-500">
                                {WA_BASE_URL}
                              </span>
                              <input
                                type="text"
                                value={button.url.replace(/\D/g, "")}
                                placeholder={meta.placeholder}
                                onChange={(e) => {
                                  const digits = e.target.value.replace(/\D/g, "");
                                  patch({
                                    buttons: draft.buttons.map((item, i) =>
                                      i === index ? { ...item, url: digits } : item
                                    ),
                                  });
                                }}
                                className="h-full min-w-0 flex-1 px-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                              />
                            </div>
                          </div>
                        ) : button.kind === "quick_reply" ? null : (
                          <FormField
                            label={meta.valueLabel}
                            value={button.url}
                            onChange={(value) =>
                              patch({
                                buttons: draft.buttons.map((item, i) =>
                                  i === index ? { ...item, url: value } : item
                                ),
                              })
                            }
                            placeholder={meta.placeholder}
                          />
                        )}
                      </div>
                      {button.kind === "quick_reply" && (
                        <p className="mt-2 text-xs text-slate-400">
                          No destination needed — tapping this sends the label above
                          back as the customer&apos;s reply, right in the chat.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {errors.buttons && (
              <p role="alert" className="mt-2 text-xs text-red-600">
                {errors.buttons}
              </p>
            )}
          </div>
          )}
        </div>

        {/* Live preview */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-0">
            <p className="mb-2 text-sm font-medium text-slate-700">Preview</p>
            <TemplatePreview
              header={draft.header}
              body={draft.templateKind === "authentication" ? "123456 is your verification code. For your security, do not share this code." : draft.body}
              footer={draft.templateKind === "authentication" ? `This code expires in ${draft.extra.expiryMinutes ?? 10} minutes.` : draft.footer}
              media={draft.media}
              buttons={draft.templateKind === "carousel" || draft.templateKind === "authentication" ? [] : draft.buttons}
              values={previewValues}
              format={draft.parameterFormat}
              names={draft.variables}
              extraButtons={
                draft.templateKind === "authentication"
                  ? ["Copy code"]
                  : (draft.templateKind === "coupon" || draft.templateKind === "lto") && draft.extra.couponCode
                    ? [`Copy code: ${draft.extra.couponCode}`]
                    : []
              }
              offerText={draft.templateKind === "lto" ? draft.extra.offerText : undefined}
              cards={draft.templateKind === "carousel" ? cards : []}
            />
            <InlineAlert tone="info" className="mt-3">
              Variables are shown with their labels here. Real values are filled in
              per contact when a campaign runs.
            </InlineAlert>
          </div>
        </div>
      </div>
    </Modal>
  );
}
