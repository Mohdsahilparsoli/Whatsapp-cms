import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { passwordProblem } from "@/lib/clientAccounts";

export async function POST(request: Request) {
  let body: { token?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const token = body.token ?? "";
  const password = body.password ?? "";
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: createHash("sha256").update(token).digest("hex") },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This reset link has expired or was already used. Request a new one." },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(password);
  // Mark used first-writer-wins so a double submit can't reuse the link.
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "This reset link was already used." }, { status: 400 });
  }
  if (row.adminId) {
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: row.adminId }, data: { passwordHash } }),
      prisma.adminSession.deleteMany({ where: { adminId: row.adminId } }),
      prisma.passwordResetToken.updateMany({
        where: { adminId: row.adminId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
  } else if (row.clientId) {
    await prisma.$transaction([
      prisma.client.update({ where: { id: row.clientId }, data: { passwordHash } }),
      // Anyone signed in with the old password is signed out.
      prisma.session.deleteMany({ where: { clientId: row.clientId } }),
      prisma.passwordResetToken.updateMany({
        where: { clientId: row.clientId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
  }
  return NextResponse.json({ ok: true });
}
