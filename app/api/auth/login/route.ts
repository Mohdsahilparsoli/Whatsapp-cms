import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import { createSession } from "@/lib/session";
import { createAdminSession } from "@/lib/adminSession";
import type { User } from "@/types";

/**
 * Single login endpoint for both roles. There is exactly one Super Admin
 * account (see scripts/create-admin.ts) and any number of Client Admin
 * accounts (created from the Clients page) — both are real, DB-backed,
 * bcrypt-hashed logins. We check AdminUser first (there's only ever one row,
 * so this is cheap), then Client.
 */
export async function POST(request: Request) {
  let body: { userId?: string; password?: string; remember?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userId = body.userId?.trim();
  const password = body.password ?? "";
  const remember = body.remember ?? true;
  if (!userId || !password) {
    return NextResponse.json({ error: "User ID and password are required." }, { status: 400 });
  }

  const admin = await prisma.adminUser.findFirst({
    where: { userId: { equals: userId, mode: "insensitive" } },
  });
  if (admin) {
    const ok = await verifyPassword(password, admin.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid User ID or password." }, { status: 401 });
    }
    await createAdminSession(admin.id, remember);
    const user: User = {
      id: admin.id,
      userId: admin.userId,
      name: admin.name,
      email: admin.email,
      phone: admin.phone,
      role: "super_admin",
      notifications: admin.notificationPrefs as User["notifications"],
      preferences: admin.cmsPrefs as User["preferences"],
    };
    return NextResponse.json({ user });
  }

  const client = await prisma.client.findFirst({
    where: { userId: { equals: userId, mode: "insensitive" } },
  });
  if (client) {
    const ok = await verifyPassword(password, client.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid User ID or password." }, { status: 401 });
    }
    if (client.status === "suspended") {
      return NextResponse.json(
        { error: "This account has been suspended by Super Admin. Contact them to reactivate it." },
        { status: 403 }
      );
    }
    await createSession(client.id, remember);
    const user: User = {
      id: client.id,
      userId: client.userId,
      name: client.name,
      email: client.email,
      phone: client.phone,
      role: "client_admin",
      clientId: client.id,
      clientName: client.name,
      notifications: client.notificationPrefs as User["notifications"],
      preferences: client.cmsPrefs as User["preferences"],
    };
    return NextResponse.json({ user });
  }

  return NextResponse.json({ error: "Invalid User ID or password." }, { status: 401 });
}
