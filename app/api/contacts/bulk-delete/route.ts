import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No contacts selected." }, { status: 400 });
  }

  // The clientId filter here is what stops one client from deleting another
  // client's contacts by guessing/sending their ids.
  const result = await prisma.contact.deleteMany({
    where: { id: { in: ids }, clientId: auth.clientId },
  });

  return NextResponse.json({ deleted: result.count });
}
