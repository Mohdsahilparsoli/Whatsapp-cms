import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { generateApiKey } from "@/lib/apiKeyAuth";

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const keys = await prisma.apiKey.findMany({
    where: { clientId: auth.clientId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
  });
  return NextResponse.json({
    keys: keys.map((k) => ({ ...k, lastUsedAt: k.lastUsedAt?.toISOString() ?? null, createdAt: k.createdAt.toISOString() })),
  });
}

/** Creates a key. The full key is in this response only — it can't be shown again. */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Give the key a name, e.g. “Website login”." }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "Name is too long." }, { status: 400 });

  const active = await prisma.apiKey.count({ where: { clientId: auth.clientId, revokedAt: null } });
  if (active >= 10) return NextResponse.json({ error: "You can have at most 10 active keys — revoke one first." }, { status: 400 });

  const { key, prefix, keyHash } = generateApiKey();
  await prisma.apiKey.create({ data: { clientId: auth.clientId, name, prefix, keyHash } });
  return NextResponse.json({ key, prefix }, { status: 201 });
}
