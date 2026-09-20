import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const existing = await prisma.contactList.findFirst({ where: { id, clientId: auth.clientId } });
  if (!existing) return NextResponse.json({ error: "List not found." }, { status: 404 });

  await prisma.contactList.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
