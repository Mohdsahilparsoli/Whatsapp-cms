/**
 * WhatsApp's 24-hour customer-service window. A business may send
 * free-form messages (text, media, buttons, lists) to a customer ONLY
 * within 24 hours of that customer's last message to them. Outside it,
 * only an approved Message Template can start the conversation again —
 * Meta rejects anything else (error 131047).
 *
 * Pure helpers, safe for both server and client code. The window is
 * measured from the customer's last INBOUND message — our own outbound
 * messages never open or extend it.
 */
export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SessionWindow {
  /** True while a free-form message may still be sent. */
  open: boolean;
  /** When the window closes (null if the customer has never messaged). */
  expiresAt: Date | null;
  /** Milliseconds left, 0 once closed. */
  msLeft: number;
}

export function getSessionWindow(lastInboundAt: Date | string | null | undefined, now = Date.now()): SessionWindow {
  if (!lastInboundAt) return { open: false, expiresAt: null, msLeft: 0 };
  const last = new Date(lastInboundAt).getTime();
  if (Number.isNaN(last)) return { open: false, expiresAt: null, msLeft: 0 };
  const expires = last + SESSION_WINDOW_MS;
  const msLeft = Math.max(expires - now, 0);
  return { open: msLeft > 0, expiresAt: new Date(expires), msLeft };
}

/** "5h 12m", "42m", "under a minute" — for the countdown shown in the Inbox. */
export function formatWindowLeft(msLeft: number): string {
  const totalMinutes = Math.floor(msLeft / 60_000);
  if (totalMinutes < 1) return "under a minute";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export const SESSION_CLOSED_MESSAGE =
  "WhatsApp's 24-hour window is closed — this customer hasn't messaged you in the last 24 hours, so a free-form message can't be sent. Send an approved template (Bulk Sender / Campaigns) to start the conversation again; once they reply, you can chat freely.";
