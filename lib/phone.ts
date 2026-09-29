/**
 * Turns any way a phone number might be typed or received — with or
 * without a leading "+", spaces, dashes, or the country code itself — into
 * one canonical digits-only string that always includes a country code.
 *
 * This is the single source of truth every part of the app uses so the
 * same real-world number always produces the exact same string, whether it
 * came from a Contact someone typed as "9818186876", Meta's webhook
 * reporting that same person as "919818186876", or a manual reply typed
 * either way. Without this, the same customer could end up with two
 * separate Conversation rows (one from an outbound campaign send, one from
 * their inbound reply) instead of one real-WhatsApp-style single chat.
 *
 * A number with more than 10 digits is assumed to already include a
 * country code and is used as-is — mirrors the identical rule already used
 * for WhatsApp chat buttons (lib/whatsappMessage.ts's toWaMeUrl) and Call
 * buttons (lib/metaTemplates.ts's sanitizePhoneNumber).
 */
export function normalizePhone(raw: string, defaultCallingCode = "91"): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits : `${defaultCallingCode}${digits}`;
}
