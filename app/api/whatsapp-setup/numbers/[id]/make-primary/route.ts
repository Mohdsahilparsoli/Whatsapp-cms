import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

type Params = { params: Promise<{ id: string }> };

/**
 * Makes an extra number the primary one — the number campaigns and bulk
 * sends go out from (and whose quality rating / messaging limit gate them).
 * The two numbers simply trade places, so the old primary becomes an extra
 * number and nothing is lost. Existing chats keep replying from the line the
 * customer wrote to: chats that were implicitly on the old primary are pinned
 * to its phone-number id before the swap.
 */
export async function POST(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const extra = await prisma.additionalWhatsAppNumber.findFirst({ where: { id, clientId: auth.clientId } });
  if (!extra) return NextResponse.json({ error: "Number not found." }, { status: 404 });

  const primary = await prisma.whatsAppAccount.findUnique({ where: { clientId: auth.clientId } });
  if (!primary?.connected || !primary.phoneNumberId || !primary.accessTokenEnc || !primary.wabaId) {
    return NextResponse.json({ error: "There is no connected primary number to swap with." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.conversation.updateMany({
      where: { clientId: auth.clientId, phoneNumberId: null },
      data: { phoneNumberId: primary.phoneNumberId },
    }),
    prisma.additionalWhatsAppNumber.update({
      where: { id: extra.id },
      data: {
        wabaId: primary.wabaId,
        phoneNumberId: primary.phoneNumberId,
        displayNumber: primary.displayNumber,
        businessName: primary.businessName,
        qualityRating: primary.qualityRating,
        accessTokenEnc: primary.accessTokenEnc,
        label: extra.label,
      },
    }),
    prisma.whatsAppAccount.update({
      where: { clientId: auth.clientId },
      data: {
        wabaId: extra.wabaId,
        phoneNumberId: extra.phoneNumberId,
        displayNumber: extra.displayNumber,
        businessName: extra.businessName,
        qualityRating: extra.qualityRating,
        accessTokenEnc: extra.accessTokenEnc,
        // The cached health belonged to the old number — force a fresh read.
        messagingTier: null,
        qualityCheckedAt: null,
        connectedAt: new Date(),
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
