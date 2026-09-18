import { toISODate } from "@/lib/utils";
import type { Contact, ConsentStatus } from "@/types";

export function toPublicContact(contact: {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  tags: string[];
  consent: string;
  consentSource: string;
  consentDate: Date;
  createdAt: Date;
}): Contact {
  return {
    id: contact.id,
    name: contact.name ?? undefined,
    phone: contact.phone,
    email: contact.email ?? undefined,
    tags: contact.tags,
    consent: contact.consent as ConsentStatus,
    consentSource: contact.consentSource,
    consentDate: toISODate(contact.consentDate),
    createdAt: toISODate(contact.createdAt),
  };
}
