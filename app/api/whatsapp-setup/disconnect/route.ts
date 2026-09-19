import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

export async function POST() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const existing = await prisma.whatsAppAccount.findUnique({ where: { clientId: auth.clientId } });
  if (!existing) {
    return NextResponse.json({ error: "No account connected." }, { status: 400 });
  }

  await prisma.whatsAppAccount.update({
    where: { clientId: auth.clientId },
    data: {
      connected: false,
      businessName: null,
      wabaId: null,
      phoneNumberId: null,
      displayNumber: null,
      qualityRating: null,
      accessTokenEnc: null,
      connectedAt: null,
    },
  });

  return NextResponse.json({ ok: true });
}
