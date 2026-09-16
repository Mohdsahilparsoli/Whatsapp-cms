import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toPublicClient } from "@/lib/session";
import { requireSuperAdmin } from "@/lib/apiGuards";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const { id } = await params;

  let body: { status?: "active" | "suspended" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.status !== "active" && body.status !== "suspended") {
    return NextResponse.json({ error: "status must be 'active' or 'suspended'." }, { status: 400 });
  }

  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const client = await prisma.client.update({
    where: { id },
    data: { status: body.status },
  });

  // Suspending a client should also kill any session they're currently
  // logged in with.
  if (body.status === "suspended") {
    await prisma.session.deleteMany({ where: { clientId: id } });
  }

  return NextResponse.json({ client: toPublicClient(client) });
}
