"use client";

import FormField, { SelectField } from "@/components/ui/FormField";
import { TRIAL_DAYS } from "@/data/plans";
import { addDays, startOfToday, toISODate } from "@/lib/utils";
import type { Client, ClientStatus } from "@/types";

export interface ClientFormValues {
  name: string;
  userId: string;
  password: string;
  email: string;
  phone: string;
  startDate: string;
  expiryDate: string;
  status: ClientStatus;
}

/**
 * A new client account starts on the 14-day free CMS trial, so the date fields
 * are pre-filled with today and today + 14 days.
 */
export function newClientDefaults(): ClientFormValues {
  const today = startOfToday();
  return {
    name: "",
    userId: "",
    password: "",
    email: "",
    phone: "",
    startDate: toISODate(today),
    expiryDate: toISODate(addDays(today, TRIAL_DAYS)),
    status: "active",
  };
}

/** Kept as a stable default for the form's initial render. */
export const emptyClient: ClientFormValues = {
  name: "",
  userId: "",
  password: "",
  email: "",
  phone: "",
  startDate: "",
  expiryDate: "",
  status: "active",
};

export function clientToForm(client: Client): ClientFormValues {
  return {
    name: client.name,
    userId: client.userId,
    password: "",
    email: client.email,
    phone: client.phone,
    startDate: client.startDate,
    expiryDate: client.expiryDate,
    status: client.status,
  };
}

export function validateClient(values: ClientFormValues, requirePassword: boolean) {
  const errors: Partial<Record<keyof ClientFormValues, string>> = {};
  if (!values.name.trim()) errors.name = "Client name is required.";
  if (!values.userId.trim()) errors.userId = "User ID is required.";
  else if (!/^[a-z0-9_]{4,}$/i.test(values.userId))
    errors.userId = "Use at least 4 letters, numbers, or underscores.";
  if (requirePassword && values.password.trim().length < 6)
    errors.password = "Temporary password needs at least 6 characters.";
  if (!/^\S+@\S+\.\S+$/.test(values.email)) errors.email = "Enter a valid email address.";
  if (values.phone.replace(/\D/g, "").length < 10) errors.phone = "Enter a valid phone number.";
  if (!values.startDate) errors.startDate = "Select a start date.";
  if (!values.expiryDate) errors.expiryDate = "Select an expiry date.";
  else if (values.startDate && values.expiryDate <= values.startDate)
    errors.expiryDate = "Expiry must be after the start date.";
  return errors;
}

export default function ClientForm({
  values,
  errors,
  onChange,
  requirePassword = true,
}: {
  values: ClientFormValues;
  errors: Partial<Record<keyof ClientFormValues, string>>;
  onChange: (values: ClientFormValues) => void;
  requirePassword?: boolean;
}) {
  const set = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField
        label="Client name"
        required
        value={values.name}
        error={errors.name}
        onChange={(v) => set("name", v)}
        placeholder="Sharma Electronics"
        className="sm:col-span-2"
      />
      <FormField
        label="User ID"
        required
        value={values.userId}
        error={errors.userId}
        onChange={(v) => set("userId", v)}
        placeholder="sharma_admin"
        hint="The client signs in with this ID."
      />
      <FormField
        label={requirePassword ? "Temporary password" : "New temporary password"}
        required={requirePassword}
        type="text"
        value={values.password}
        error={errors.password}
        onChange={(v) => set("password", v)}
        placeholder="At least 6 characters"
        hint="Demo only — nothing is stored or encrypted."
      />
      <FormField
        label="Email"
        required
        type="email"
        value={values.email}
        error={errors.email}
        onChange={(v) => set("email", v)}
        placeholder="admin@company.com"
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
        label="Subscription start"
        required
        type="date"
        value={values.startDate}
        error={errors.startDate}
        onChange={(v) => set("startDate", v)}
      />
      <FormField
        label="Subscription expiry"
        required
        type="date"
        value={values.expiryDate}
        error={errors.expiryDate}
        onChange={(v) => set("expiryDate", v)}
      />
      <SelectField
        label="Status"
        value={values.status}
        error={errors.status}
        onChange={(v) => set("status", v as ClientStatus)}
        options={[
          { label: "Active", value: "active" },
          { label: "Suspended", value: "suspended" },
          { label: "Expired", value: "expired" },
        ]}
        className="sm:col-span-2"
      />
    </div>
  );
}
