import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

export async function GET(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 100);

  if (ids.length === 0) {
    return NextResponse.json({ statuses: {} });
  }

  const records = await prisma.messageRecord.findMany({
    where: { id: { in: ids }, clientId: auth.clientId },
    select: { id: true, status: true },
  });

  const statuses: Record<string, string> = {};
  for (const r of records as { id: string; status: string }[]) {
    statuses[r.id] = r.status;
  }

  return NextResponse.json({ statuses });
}
