import "server-only";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
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
    return { phoneNumberId, accessToken, source: "shared" };
  }

  return null;
}
