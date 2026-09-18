import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: { ids?: string[]; tag?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string") : [];
  const tag = body.tag?.trim().toLowerCase();

  if (!tag) return NextResponse.json({ error: "Enter a tag." }, { status: 400 });
  if (ids.length === 0) return NextResponse.json({ error: "No contacts selected." }, { status: 400 });

  const contacts = await prisma.contact.findMany({
    where: { id: { in: ids }, clientId: auth.clientId },
    select: { id: true, tags: true },
  });

  // Each contact already has its own tags, so this has to be a per-row
  // update (with dedupe) rather than one blanket `updateMany`.
  type Row = { id: string; tags: string[] };
  await prisma.$transaction(
    (contacts as Row[])
      .filter((c) => !c.tags.includes(tag))
      .map((c) =>
        prisma.contact.update({
          where: { id: c.id },
          data: { tags: [...c.tags, tag] },
        })
      )
  );

  return NextResponse.json({ tagged: contacts.length });
}
