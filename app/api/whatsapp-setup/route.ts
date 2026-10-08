import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { decryptSecret, maskSecret } from "@/lib/crypto";
import { refreshAccountHealth } from "@/lib/sendPolicy";

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  // Re-reads Meta's live quality rating + messaging tier (cached ~10 min) so
  // this page — and the send gate that uses the same values — isn't showing
  // whatever was true back when the number was first connected.
  await refreshAccountHealth(auth.clientId);

  const account = await prisma.whatsAppAccount.findUnique({ where: { clientId: auth.clientId } });

  let maskedToken: string | null = null;
  if (account?.accessTokenEnc) {
    try {
      maskedToken = maskSecret(decryptSecret(account.accessTokenEnc));
    } catch {
      maskedToken = "••••"; // key rotated/misconfigured — don't 500 the whole page over it
    }
  }

  return NextResponse.json({
    checklistDone: account?.checklistDone ?? [],
    connected: account?.connected ?? false,
    businessName: account?.businessName ?? null,
    wabaId: account?.wabaId ?? null,
    phoneNumberId: account?.phoneNumberId ?? null,
    displayNumber: account?.displayNumber ?? null,
    qualityRating: account?.qualityRating ?? null,
    messagingTier: account?.messagingTier ?? null,
    connectedAt: account?.connectedAt ? account.connectedAt.toISOString() : null,
    maskedToken,
  });
}
