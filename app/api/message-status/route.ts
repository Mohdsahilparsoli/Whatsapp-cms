import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { toPublicMessageRecord } from "@/lib/messageMapper";

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const records = await prisma.messageRecord.findMany({
    where: { clientId: auth.clientId },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json({ messages: records.map(toPublicMessageRecord) });
}
