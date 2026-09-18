import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const contacts = await prisma.contact.findMany({
    where: { clientId: auth.clientId },
    select: { tags: true },
  });

  const tags = Array.from(
    new Set(contacts.flatMap((c: { tags: string[] }) => c.tags))
  ).sort();
  return NextResponse.json({ tags });
}
