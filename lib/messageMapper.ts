import type { MessageRecord, MessageStatusValue } from "@/types";

export function toPublicMessageRecord(row: {
  id: string;
  recipientName: string | null;
  recipientPhone: string;
  campaignName: string | null;
  templateName: string | null;
  preview: string;
  status: string;
  whatsappMessageId: string | null;
  errorMessage: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
}): MessageRecord {
  return {
    id: row.id,
    recipientName: row.recipientName,
    recipientPhone: row.recipientPhone,
    campaignName: row.campaignName,
    templateName: row.templateName,
    preview: row.preview,
    status: row.status as MessageStatusValue,
    whatsappMessageId: row.whatsappMessageId,
    errorMessage: row.errorMessage,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
