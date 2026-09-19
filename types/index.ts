export type Role = "super_admin" | "client_admin";

export interface NotificationPrefs {
  campaignComplete: boolean;
  deliveryFailures: boolean;
  newInboxMessage: boolean;
  weeklySummary: boolean;
}

export interface CmsPrefs {
  timezone: string;
  dateFormat: string;
  language: string;
  defaultList: string;
}

export interface User {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  /** Client Admins are scoped to exactly one client; Super Admins to none. */
  clientId?: string;
  clientName?: string;
  /** Null until the user saves that Settings tab once. */
  notifications?: NotificationPrefs | null;
  preferences?: CmsPrefs | null;
}

export type ClientStatus = "active" | "suspended" | "expired";

export interface Client {
  id: string;
  name: string;
  userId: string;
  email: string;
  phone: string;
  startDate: string;
  expiryDate: string;
  status: ClientStatus;
  messagesSent: number;
  contacts: number;
  plan: string;
}

export type PaymentStatus = "paid" | "pending" | "overdue";
export type AccessStatus = "active" | "expiring" | "expired" | "suspended";

export interface Subscription {
  id: string;
  clientId: string;
  clientName: string;
  plan: string;
  amount: number;
  startDate: string;
  expiryDate: string;
  paymentStatus: PaymentStatus;
  accessStatus: AccessStatus;
}

export type ConsentStatus = "opted_in" | "opted_out" | "pending";

export interface Contact {
  id: string;
  /** Optional — phone is the only required field for a contact. */
  name?: string;
  phone: string;
  email?: string;
  tags: string[];
  consent: ConsentStatus;
  consentSource: string;
  consentDate: string;
  createdAt: string;
  lastMessageAt?: string;
}

export type TemplateStatus = "approved" | "pending" | "rejected";

export interface Template {
  id: string;
  name: string;
  language: string;
  category: "Marketing" | "Utility" | "Authentication";
  status: TemplateStatus;
  updatedAt: string;
  body: string;
  header?: string;
  footer?: string;
  variables: string[];
}

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "completed"
  | "cancelled"
  | "failed";

export interface Campaign {
  id: string;
  name: string;
  /** "all" or a specific contact tag. */
  audienceTag: string;
  audienceSize: number;
  templateId: string;
  templateName: string;
  status: CampaignStatus;
  /** ISO datetime string, only set for scheduled campaigns. */
  scheduledAt?: string;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Shape used only by the still-mock Dashboard/Reports widgets
 * (data/campaigns.ts) — kept separate from the real `Campaign` type above so
 * migrating the real Campaigns module didn't have to touch those. */
export interface MockCampaign {
  id: string;
  name: string;
  audience: string;
  audienceSize: number;
  templateId: string;
  templateName: string;
  schedule: string;
  status: "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled";
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  createdAt: string;
}

export type MessageStatusValue = "sent" | "delivered" | "read" | "failed";

export interface MessageRecord {
  id: string;
  recipientName: string | null;
  recipientPhone: string;
  campaignName: string | null;
  templateName: string | null;
  preview: string;
  status: MessageStatusValue;
  whatsappMessageId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export type QueueJobStatus = "queued" | "processing" | "completed" | "failed";

export interface QueueJob {
  id: string;
  name: string;
  campaignId?: string | null;
  batchSize: number;
  attempts: number;
  maxAttempts: number;
  status: QueueJobStatus;
  sentCount: number;
  failedCount: number;
  errorMessage?: string | null;
  lastRunAt: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  from: "customer" | "agent";
  text: string;
  time: string;
  /** Only set for agent (outbound) messages we actually sent via the real
   * API — used to poll /api/whatsapp/message-status for tick updates. */
  messageRecordId?: string;
  /** Real send/delivery status — undefined until we know it, then
   * "sent" | "delivered" | "read" | "failed". Only meaningful for `from: "agent"`. */
  status?: "sent" | "delivered" | "read" | "failed";
  media?: {
    kind: "image" | "document";
    url: string;
    fileName?: string;
  };
}

export interface Conversation {
  id: string;
  contactName: string;
  phone: string;
  unread: number;
  lastMessageAt: string;
  consent: ConsentStatus;
  tags: string[];
  messages: ChatMessage[];
}

export interface ContactList {
  id: string;
  name: string;
  count: number;
  source: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ *
 * Subscription plans & trial
 * ------------------------------------------------------------------ */

export type PlanId = "starter" | "growth" | "business";

export interface Plan {
  id: PlanId;
  name: string;
  /** Yearly price in rupees. */
  price: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
  supportLabel?: string;
}

/** Derived status shown on badges across the app. */
export type SubscriptionStatus =
  | "trial"
  | "active"
  | "expiring"
  | "expired"
  | "suspended";

/**
 * The live subscription record for a single client. `planId` is null while the
 * client is still on the 14-day free trial.
 */
export interface ClientSubscription {
  clientId: string;
  clientName: string;
  planId: PlanId | null;
  /** Trial or paid-plan start date (yyyy-mm-dd). */
  startDate: string;
  /** Trial or paid-plan expiry date (yyyy-mm-dd). */
  expiryDate: string;
  isTrial: boolean;
  paymentStatus: PaymentStatus | "not_required";
  /** Set by Super Admin; overrides the date-derived status. */
  suspended: boolean;
}

export interface SubscriptionHistoryEntry {
  id: string;
  clientId: string;
  clientName: string;
  planId: PlanId | null;
  planName: string;
  amount: number;
  startDate: string;
  expiryDate: string;
  paymentStatus: PaymentStatus | "not_required";
  accessStatus: SubscriptionStatus;
}

/* ------------------------------------------------------------------ *
 * Custom templates
 * ------------------------------------------------------------------ */

export type TemplateSource = "meta" | "custom";
export type CustomTemplateStatus = "draft" | "custom";
export type TemplateMediaKind = "none" | "image" | "video" | "document";
export type TemplateButtonKind = "url" | "call" | "whatsapp";

export interface TemplateButton {
  id: string;
  kind: TemplateButtonKind;
  label: string;
  /** A URL for "url"/"whatsapp" buttons, or a phone number for "call". */
  url: string;
}

export interface TemplateMedia {
  kind: TemplateMediaKind;
  url: string;
  /** Filename shown for document attachments. */
  fileName?: string;
}

export interface CustomTemplate {
  id: string;
  /** Owner — used to keep one client's templates away from another's. */
  clientId: string;
  name: string;
  language: string;
  category: Template["category"];
  status: CustomTemplateStatus;
  header?: string;
  body: string;
  footer?: string;
  media: TemplateMedia;
  buttons: TemplateButton[];
  /** Friendly labels for {{1}}, {{2}}, {{3}} … */
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

/** A Meta-approved template or a custom one, normalised for shared UI. */
export interface TemplateView {
  id: string;
  source: TemplateSource;
  name: string;
  language: string;
  category: Template["category"];
  /** "approved" | "pending" | "rejected" for Meta, "draft" | "custom" for custom. */
  status: TemplateStatus | CustomTemplateStatus;
  header?: string;
  body: string;
  footer?: string;
  media: TemplateMedia;
  buttons: TemplateButton[];
  variables: string[];
  updatedAt: string;
}
