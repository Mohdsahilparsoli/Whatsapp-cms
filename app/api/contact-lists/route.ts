import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const lists = await prisma.contactList.findMany({
    where: { clientId: auth.clientId },
    orderBy: { updatedAt: "desc" },
  });

  // Membership is live — count real contacts with each list's tag right now,
  // rather than a frozen snapshot that could go stale.
  const withCounts = await Promise.all(
    lists.map(async (list: { id: string; name: string; tag: string; source: string; updatedAt: Date }) => ({
      id: list.id,
      name: list.name,
      tag: list.tag,
      source: list.source,
      updatedAt: list.updatedAt.toISOString(),
      count: await prisma.contact.count({
        where: { clientId: auth.clientId, tags: { has: list.tag } },
      }),
    }))
  );

  return NextResponse.json({ lists: withCounts });
}

export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: { name?: string; tag?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const tag = body.tag?.trim();
  const errors: Record<string, string> = {};
  if (!name) errors.name = "Give the list a name.";
  if (!tag) errors.tag = "Pick a tag for this list.";
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const existing = await prisma.contactList.findFirst({
    where: { clientId: auth.clientId, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    return NextResponse.json({ errors: { name: "You already have a list with this name." } }, { status: 400 });
  }

  const list = await prisma.contactList.create({
    data: {
      clientId: auth.clientId,
      name: name!,
      tag: tag!,
      source: body.source?.trim() || "Manual",
    },
  });

  const count = await prisma.contact.count({ where: { clientId: auth.clientId, tags: { has: list.tag } } });

  return NextResponse.json(
    { list: { id: list.id, name: list.name, tag: list.tag, source: list.source, updatedAt: list.updatedAt.toISOString(), count } },
    { status: 201 }
  );
}
