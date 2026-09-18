"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import FormField, { SelectField } from "@/components/ui/FormField";
import { cn } from "@/lib/utils";
import type { Contact, ConsentStatus } from "@/types";

export interface ContactFormValues {
  name: string;
  phone: string;
  email: string;
  tags: string[];
  consent: ConsentStatus;
}

export const emptyContact: ContactFormValues = {
  name: "",
  phone: "",
  email: "",
  tags: [],
  consent: "opted_in",
};

export function contactToForm(contact: Contact): ContactFormValues {
  return {
    name: contact.name ?? "",
    phone: contact.phone,
    email: contact.email ?? "",
    tags: contact.tags,
    consent: contact.consent,
  };
}

/** Phase A scope: phone is the only required field. */
export function validateContact(values: ContactFormValues) {
  const errors: Partial<Record<keyof ContactFormValues, string>> = {};
  if (values.phone.replace(/\D/g, "").length < 10)
    errors.phone = "Enter a phone number with country code.";
  if (values.email && !/^\S+@\S+\.\S+$/.test(values.email))
    errors.email = "Enter a valid email address.";
  return errors;
}

export default function ContactForm({
  values,
  errors,
  onChange,
  tagSuggestions = [],
}: {
  values: ContactFormValues;
  errors: Partial<Record<keyof ContactFormValues, string>>;
  onChange: (values: ContactFormValues) => void;
  /** Existing tags (across this client's other contacts) shown as picks. */
  tagSuggestions?: string[];
}) {
  const set = <K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField
        label="Name"
        value={values.name}
        error={errors.name}
        onChange={(v) => set("name", v)}
        placeholder="Aarav Sharma (optional)"
      />
      <FormField
        label="Phone"
        required
        value={values.phone}
        error={errors.phone}
        onChange={(v) => set("phone", v)}
        placeholder="+91 98110 22331"
      />
      <FormField
        label="Email"
        type="email"
        value={values.email}
        error={errors.email}
        onChange={(v) => set("email", v)}
        placeholder="optional"
      />
      <TagPicker
        label="Tags"
        value={values.tags}
        onChange={(v) => set("tags", v)}
        suggestions={tagSuggestions}
      />
      <SelectField
        label="Consent status"
        value={values.consent}
        onChange={(v) => set("consent", v as ConsentStatus)}
        options={[
          { label: "Opted in", value: "opted_in" },
          { label: "Pending", value: "pending" },
          { label: "Opted out", value: "opted_out" },
        ]}
        className="sm:col-span-2"
      />
    </div>
  );
}

/**
 * Multi-select tag picker: shows existing tags to pick from, and also lets
 * you type a brand-new tag (Enter or comma adds it). Selected tags render as
 * removable chips.
 */
export function TagPicker({
  label,
  value,
  onChange,
  suggestions,
  className,
}: {
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  className?: string;
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag || value.includes(tag)) {
      setInput("");
      return;
    }
    onChange([...value, tag]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  const filteredSuggestions = suggestions.filter(
    (s) => !value.includes(s) && s.toLowerCase().includes(input.trim().toLowerCase())
  );

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <label className="block text-sm font-medium text-slate-700">{label}</label>

      <div
        className="mt-1.5 flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100"
        onClick={() => setOpen(true)}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="text-indigo-400 hover:text-indigo-700"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={input}
          onFocus={() => setOpen(true)}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(input);
            } else if (e.key === "Backspace" && !input && value.length > 0) {
              removeTag(value[value.length - 1]);
            }
          }}
          placeholder={value.length === 0 ? "Pick or type a tag" : ""}
          className="min-w-[80px] flex-1 border-none bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
        />
      </div>

      {open && (filteredSuggestions.length > 0 || input.trim()) && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              {s}
            </button>
          ))}
          {input.trim() && !suggestions.includes(input.trim().toLowerCase()) && (
            <button
              type="button"
              onClick={() => addTag(input)}
              className="block w-full px-3 py-1.5 text-left text-sm text-indigo-600 hover:bg-indigo-50"
            >
              Create tag “{input.trim().toLowerCase()}”
            </button>
          )}
        </div>
      )}
      <p className="mt-1 text-xs text-slate-400">Pick from existing tags, or type a new one and press Enter.</p>
    </div>
  );
}
