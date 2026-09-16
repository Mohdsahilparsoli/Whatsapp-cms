"use client";

import FormField, { SelectField } from "@/components/ui/FormField";
import type { Contact, ConsentStatus } from "@/types";

export interface ContactFormValues {
  name: string;
  phone: string;
  email: string;
  tags: string;
  consent: ConsentStatus;
}

export const emptyContact: ContactFormValues = {
  name: "",
  phone: "",
  email: "",
  tags: "",
  consent: "opted_in",
};

export function contactToForm(contact: Contact): ContactFormValues {
  return {
    name: contact.name,
    phone: contact.phone,
    email: contact.email ?? "",
    tags: contact.tags.join(", "),
    consent: contact.consent,
  };
}

export function validateContact(values: ContactFormValues) {
  const errors: Partial<Record<keyof ContactFormValues, string>> = {};
  if (!values.name.trim()) errors.name = "Contact name is required.";
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
}: {
  values: ContactFormValues;
  errors: Partial<Record<keyof ContactFormValues, string>>;
  onChange: (values: ContactFormValues) => void;
}) {
  const set = <K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField
        label="Name"
        required
        value={values.name}
        error={errors.name}
        onChange={(v) => set("name", v)}
        placeholder="Aarav Sharma"
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
      <FormField
        label="Tags"
        value={values.tags}
        onChange={(v) => set("tags", v)}
        placeholder="vip, newsletter"
        hint="Separate tags with commas."
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
