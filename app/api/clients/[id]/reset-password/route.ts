import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateTempPassword, hashPassword } from "@/lib/passwords";
import { requireSuperAdmin } from "@/lib/apiGuards";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await prisma.client.update({ where: { id }, data: { passwordHash } });

  // Force a fresh login with the new password.
  await prisma.session.deleteMany({ where: { clientId: id } });

  // The plain-text temp password is returned exactly once, here, so Super
  // Admin can copy it and share it with the client. It is never stored or
  // logged in plain text anywhere.
  return NextResponse.json({ tempPassword });
}
