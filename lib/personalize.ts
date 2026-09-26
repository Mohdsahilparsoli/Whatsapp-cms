/**
 * By convention, a template's first placeholder — {{1}} — is always the
 * recipient's own name, auto-filled per contact from the Contacts list.
 * That's what makes "Hi {{1}}," actually personalize per recipient instead
 * of either showing the literal "{{1}}" (nobody typed a value) or sending
 * the exact same name/value to every single contact (one shared value
 * entered once in the Bulk Sender/Campaign form).
 *
 * Any other placeholder ({{2}}, {{3}}, ...) is NOT recipient-specific — it
 * keeps whatever shared value was provided in `sharedVariables`, same as
 * before, since those are for things like a shared date/offer/link that's
 * the same for the whole send.
 *
 * No "server-only" import here on purpose — the Bulk Sender page's preview
 * uses this too, to show what a real send will actually look like.
 */
export function personalizeVariables(sharedVariables: string[], contact: { name?: string | null }): string[] {
  const merged = [...sharedVariables];
  merged[0] = contact.name?.trim() || "there";
  return merged;
}
