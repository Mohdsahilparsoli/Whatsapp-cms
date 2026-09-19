import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

export async function PUT(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: { checklistDone?: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const checklistDone = Array.isArray(body.checklistDone)
    ? body.checklistDone.filter((n) => typeof n === "number")
    : [];

  const account = await prisma.whatsAppAccount.upsert({
    where: { clientId: auth.clientId },
    update: { checklistDone },
    create: { clientId: auth.clientId, checklistDone },
  });

  return NextResponse.json({ checklistDone: account.checklistDone });
}
