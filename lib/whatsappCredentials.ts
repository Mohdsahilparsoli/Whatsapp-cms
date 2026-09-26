import "server-only";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
  /** The WhatsApp Business Account id — needed for the Message Templates
   * management API (submit/list/check status), which is scoped to the WABA,
   * not the phone number. Null if we genuinely don't know it (e.g. a shared
   * test setup with no META_TEST_WABA_ID set) — template submission isn't
   * possible without it, but sending/receiving messages still works fine. */
  wabaId: string | null;
  /** "client" = this client's own connected WhatsApp Business Account.
   * "shared" = the app-wide test number from .env (META_TEST_*) — used as
   * a fallback for clients who haven't connected their own account yet. */
  source: "client" | "shared";
}

/**
 * Every real send in this app (Inbox, Bulk Sender, Campaigns/Queue) should
 * go through this instead of reading META_TEST_* directly, so connecting a
 * real account in WhatsApp Account Setup actually takes effect everywhere
 * at once.
 */
export async function getWhatsAppCredentials(clientId: string): Promise<WhatsAppCredentials | null> {
  const account = await prisma.whatsAppAccount.findUnique({ where: { clientId } });

  if (account?.connected && account.phoneNumberId && account.accessTokenEnc) {
    try {
      return {
        phoneNumberId: account.phoneNumberId,
        accessToken: decryptSecret(account.accessTokenEnc),
        wabaId: account.wabaId ?? null,
        source: "client",
      };
    } catch {
      // Stored token can't be decrypted (e.g. CREDENTIALS_ENCRYPTION_KEY
      // changed since they connected) — fall through to the shared number
      // rather than hard-failing every send for this client.
    }
  }

  const phoneNumberId = process.env.META_TEST_PHONE_NUMBER_ID;
  const accessToken = process.env.META_TEST_ACCESS_TOKEN;
  if (phoneNumberId && accessToken) {
    return {
      phoneNumberId,
      accessToken,
      wabaId: process.env.META_TEST_WABA_ID ?? null,
      source: "shared",
    };
  }

  return null;
}
