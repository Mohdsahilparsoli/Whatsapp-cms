import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { getSessionAdminId } from "@/lib/adminSession";
import { getSessionClientId } from "@/lib/session";

/**
 * Lets the currently signed-in user (admin or client — whichever session
 * cookie is present) change their own password, after verifying the current
 * one. Same endpoint serves both roles so Settings → Password works
 * identically either way.
 */
export async function POST(request: Request) {
  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";

  if (!currentPassword) {
    return NextResponse.json({ error: "Enter your current password." }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json(
      { error: "New password must be at least 6 characters." },
      { status: 400 }
    );
  }

  const adminId = await getSessionAdminId();
  if (adminId) {
    const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    const currentOk = await verifyPassword(currentPassword, admin.passwordHash);
    if (!currentOk) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.adminUser.update({ where: { id: adminId }, data: { passwordHash } });
    return NextResponse.json({ ok: true });
  }

  const clientId = await getSessionClientId();
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    const currentOk = await verifyPassword(currentPassword, client.passwordHash);
    if (!currentOk) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.client.update({ where: { id: clientId }, data: { passwordHash } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
}
