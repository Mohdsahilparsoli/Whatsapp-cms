import type { Campaign, CampaignStatus } from "@/types";

export function toPublicCampaign(row: {
  id: string;
  name: string;
  audienceTag: string | null;
  templateId: string;
  templateName: string;
  status: string;
  scheduledAt: Date | null;
  audienceSize: number;
  sentCount: number;
  failedCount: number;
  createdAt: Date;
  updatedAt: Date;
}): Campaign {
  return {
    id: row.id,
    name: row.name,
    audienceTag: row.audienceTag ?? "all",
    audienceSize: row.audienceSize,
    templateId: row.templateId,
    templateName: row.templateName,
    status: row.status as CampaignStatus,
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : undefined,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
