import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

type Params = { params: Promise<{ id: string }> };

/** Removes an extra number. Its existing conversations fall back to the primary number for replies. */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const number = await prisma.additionalWhatsAppNumber.findFirst({ where: { id, clientId: auth.clientId } });
  if (!number) return NextResponse.json({ error: "Number not found." }, { status: 404 });

  await prisma.conversation.updateMany({
    where: { clientId: auth.clientId, phoneNumberId: number.phoneNumberId },
    data: { phoneNumberId: null },
  });
  await prisma.additionalWhatsAppNumber.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
