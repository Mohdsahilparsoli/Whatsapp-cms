export interface CampaignInputBody {
  name?: string;
  audienceTag?: string;
  templateId?: string;
  /** "draft" saves without sending. "now" sends immediately. "schedule"
   * saves with scheduledAt for the scheduler to pick up later. */
  mode?: "draft" | "now" | "schedule";
  scheduledAt?: string;
}

export interface NormalizedCampaignInput {
  name: string;
  audienceTag: string;
  templateId: string;
  mode: "draft" | "now" | "schedule";
  scheduledAt: Date | null;
}

export function normalizeCampaignInput(body: CampaignInputBody): NormalizedCampaignInput {
  return {
    name: body.name?.trim() ?? "",
    audienceTag: body.audienceTag?.trim() || "all",
    templateId: body.templateId?.trim() ?? "",
    mode: body.mode === "now" || body.mode === "schedule" ? body.mode : "draft",
    scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
  };
}

export function validateCampaignInput(c: NormalizedCampaignInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!c.name) errors.name = "Give the campaign a name.";
  if (!c.templateId) errors.template = "Select a template.";

  if (c.mode === "schedule") {
    if (!c.scheduledAt || Number.isNaN(c.scheduledAt.getTime())) {
      errors.scheduledAt = "Pick a valid date and time.";
    } else if (c.scheduledAt.getTime() <= Date.now()) {
      errors.scheduledAt = "Scheduled time must be in the future.";
    }
  }

  return errors;
}
