"use client";

import { useMemo, useState } from "react";
import { ExternalLink, MessageCircle, Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import FormField, { SelectField, TextareaField } from "@/components/ui/FormField";
import TemplatePreview from "./TemplatePreview";
import { emptyDraft, type CustomTemplateDraft } from "@/lib/customTemplates";
import type { CustomTemplate, TemplateButtonKind, TemplateMediaKind } from "@/types";

const MAX_BUTTONS = 3;
const MAX_VARIABLES = 10;

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

export default function TemplateBuilder({
  open,
  editing,
  onClose,
  onSaveDraft,
  onSave,
  nameTaken,
}: {
  open: boolean;
  /** null when creating a new template. */
  editing: CustomTemplate | null;
  onClose: () => void;
  onSaveDraft: (draft: CustomTemplateDraft) => void;
  onSave: (draft: CustomTemplateDraft) => void;
  nameTaken: (name: string, ignoreId?: string) => boolean;
}) {
  const [draft, setDraft] = useState<CustomTemplateDraft>(emptyDraft);
  const [errors, setErrors] = useState<Errors>({});

  /** Strips the fields the store owns, leaving an editable draft. */
  function toDraft(template: CustomTemplate): CustomTemplateDraft {
    const {
      id: _id,
      clientId: _clientId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...rest
    } = template;
    void _id;
    void _clientId;
    void _createdAt;
    void _updatedAt;
    return rest;
  }

  // Load the right draft whenever the modal opens or the target changes.
  // Adjusting state during render avoids a reset effect.
  const resetKey = `${open}:${editing?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState(resetKey);
  if (resetKey !== lastKey) {
    setLastKey(resetKey);
    setErrors({});
    setDraft(editing ? toDraft(editing) : emptyDraft());
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
          label: kind === "whatsapp" ? "Chat with us" : "",
          url: kind === "whatsapp" ? "https://wa.me/" : "",
        },
      ],
    });
  }

  function validate(): Errors {
    const next: Errors = {};
    const name = draft.name.trim();

    if (!name) next.name = "Give the template a name.";
    else if (!/^[a-z0-9_]+$/.test(name))
      next.name = "Use lowercase letters, numbers, and underscores only.";
    else if (nameTaken(name, editing?.id))
      next.name = "You already have a template with this name.";

    if (!draft.body.trim()) next.body = "Write the message body.";

    if (draft.media.kind !== "none" && !draft.media.url.trim())
      next.media = "Add a URL for the attached media.";

    const badButton = draft.buttons.find(
      (button) => !button.label.trim() || !/^https?:\/\/.+/.test(button.url.trim())
    );
    if (badButton)
      next.buttons =
        "Every button needs a label and a URL starting with http:// or https://.";

    return next;
  }

  function submit(asDraft: boolean) {
    if (asDraft) {
      // Drafts only need a valid name so work in progress can be parked.
      const name = draft.name.trim();
      if (!name) {
        setErrors({ name: "Give the template a name before saving a draft." });
        return;
      }
      if (nameTaken(name, editing?.id)) {
        setErrors({ name: "You already have a template with this name." });
        return;
      }
      setErrors({});
      onSaveDraft({ ...draft, name, status: "draft" });
      return;
    }

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSave({ ...draft, name: draft.name.trim(), status: "custom" });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit custom template" : "Create custom template"}
      description="Custom templates are stored in this demo only and are not submitted to Meta for approval."
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit(true)}>Save as Draft</Button>
          <Button variant="primary" onClick={() => submit(false)}>
            Save Template
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
              onChange={(value) =>
                patch({
                  media: {
                    ...draft.media,
                    kind: value as TemplateMediaKind,
                    url: value === "none" ? "" : draft.media.url,
                  },
                })
              }
              options={mediaOptions}
            />
          </div>

          {draft.media.kind !== "none" && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
              <FormField
                label={`${draft.media.kind} URL`}
                value={draft.media.url}
                onChange={(value) =>
                  patch({ media: { ...draft.media, url: value } })
                }
                error={errors.media}
                placeholder="https://example.com/media.jpg"
              />
              {draft.media.kind === "document" && (
                <FormField
                  label="File name"
                  value={draft.media.fileName ?? ""}
                  onChange={(value) =>
                    patch({ media: { ...draft.media, fileName: value } })
                  }
                  placeholder="price-list.pdf"
                />
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
                <Button
                  size="sm"
                  onClick={() => addButton("url")}
                  disabled={draft.buttons.length >= MAX_BUTTONS}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Add primary button
                </Button>
                <Button
                  size="sm"
                  onClick={() => addButton("whatsapp")}
                  disabled={draft.buttons.length >= MAX_BUTTONS}
                >
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
                {draft.buttons.map((button, index) => (
                  <li
                    key={button.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-500">
                        {button.kind === "whatsapp"
                          ? "WhatsApp chat button"
                          : "Primary button (URL)"}
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
                        placeholder="View collection"
                      />
                      <FormField
                        label="URL"
                        value={button.url}
                        onChange={(value) =>
                          patch({
                            buttons: draft.buttons.map((item, i) =>
                              i === index ? { ...item, url: value } : item
                            ),
                          })
                        }
                        placeholder={
                          button.kind === "whatsapp"
                            ? "https://wa.me/919000000000"
                            : "https://example.com/offer"
                        }
                      />
                    </div>
                  </li>
                ))}
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
