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
import type { CustomTemplate, TemplateButtonKind } from "@/types";

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

type Errors = Partial<Record<"name" | "body" | "media" | "buttons" | "header" | "footer", string>>;

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

  function addVariable() {
    if (draft.variables.length >= MAX_VARIABLES) return;
    const next = draft.variables.length + 1;
    patch({
      variables: [...draft.variables, ""],
      body: `${draft.body}${draft.body.endsWith(" ") || !draft.body ? "" : " "}{{${next}}}`,
    });
  }

  function removeVariable(index: number) {
    patch({
      variables: draft.variables.filter((_, i) => i !== index),
      body: removeVariableFromBody(draft.body, index),
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

    if (!draft.body.trim()) next.body = "Write the message body.";
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
              label="Template category"
              value={draft.category}
              onChange={(value) =>
                patch({ category: value as CustomTemplateDraft["category"] })
              }
              options={categories}
            />
            <SelectField
              label="Template language"
              value={draft.language}
              onChange={(value) => patch({ language: value })}
              options={languages}
            />
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
              options={mediaOptions}
            />
          </div>

          {draft.media.kind !== "none" && (
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

          <FormField
            label="Header text"
            value={draft.header ?? ""}
            onChange={(value) => patch({ header: value })}
            placeholder="You're invited"
            error={errors.header}
            hint={`${(draft.header ?? "").length}/${HEADER_FOOTER_MAX} — only enforced once this template has a button`}
          />

          <TextareaField
            label="Message body"
            value={draft.body}
            onChange={(value) => patch({ body: value })}
            rows={5}
            error={errors.body}
            placeholder="Hi {{1}}, our festive sale starts on {{2}}."
            hint="Use {{1}}, {{2}}, {{3}} for values filled in per contact."
          />

          <FormField
            label="Footer text"
            value={draft.footer ?? ""}
            onChange={(value) => patch({ footer: value })}
            placeholder="Reply STOP to opt out"
            error={errors.footer}
            hint={`${(draft.footer ?? "").length}/${HEADER_FOOTER_MAX} — only enforced once this template has a button`}
          />

          {/* Variables */}
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">
                Message variables
              </p>
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
                      {`{{${index + 1}}}`}
                    </span>
                    <FormField
                      label={`Variable ${index + 1} label`}
                      className="flex-1"
                      value={label}
                      onChange={(value) =>
                        patch({
                          variables: draft.variables.map((item, i) =>
                            i === index ? value : item
                          ),
                        })
                      }
                      placeholder="Customer name"
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

          {/* Buttons */}
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
        </div>

        {/* Live preview */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-0">
            <p className="mb-2 text-sm font-medium text-slate-700">Preview</p>
            <TemplatePreview
              header={draft.header}
              body={draft.body}
              footer={draft.footer}
              media={draft.media}
              buttons={draft.buttons}
              values={previewValues}
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
