"use client";

import { useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, MessageCircle, Phone, Plus, Trash2, UploadCloud, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import FormField, { SelectField, TextareaField } from "@/components/ui/FormField";
import TemplatePreview from "./TemplatePreview";
import { emptyDraft, type CustomTemplateDraft, type SaveTemplateResult } from "@/lib/customTemplates";
import type { CustomTemplate, TemplateButtonKind } from "@/types";

const MAX_BUTTONS = 3;
const MAX_VARIABLES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

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
  call: { label: "Call button", icon: Phone, valueLabel: "Phone number", placeholder: "+91 98110 22331" },
  whatsapp: { label: "WhatsApp chat button", icon: MessageCircle, valueLabel: "URL", placeholder: "https://wa.me/919000000000" },
};

type Errors = Partial<Record<"name" | "body" | "media" | "buttons", string>>;

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
          label: kind === "whatsapp" ? "Chat with us" : kind === "call" ? "Call us" : "",
          url: kind === "whatsapp" ? "https://wa.me/" : "",
        },
      ],
    });
  }

  async function handleFileSelected(file: File | undefined) {
    setUploadError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setUploadError("That file is larger than 10MB.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("kind", draft.media.kind);
      formData.append("file", file);
      const res = await fetch("/api/templates/media", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Could not upload that file.");
        return;
      }
      patch({ media: { kind: draft.media.kind, url: data.url, fileName: data.fileName } });
    } catch {
      setUploadError("Could not reach the server. Please try again.");
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

    const badButton = draft.buttons.find((button) => {
      if (!button.label.trim()) return true;
      if (button.kind === "call") return button.url.replace(/\D/g, "").length < 7;
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
      size="lg"
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
                {draft.media.kind === "video" && "Video — mp4, webm, or mov, up to 10MB"}
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
              </div>
            </div>

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
                      </div>
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
