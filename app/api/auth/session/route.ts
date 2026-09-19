import { NextResponse } from "next/server";
import { getSessionAdmin } from "@/lib/adminSession";
import { getSessionClient } from "@/lib/session";
import type { User } from "@/types";

/**
 * Returns the currently signed-in user (from whichever session cookie is
 * present — admin or client), or null. Used to restore/verify a session on
 * page load, since both roles are real (DB-backed) now.
 */
export async function GET() {
  const admin = await getSessionAdmin();
  if (admin) {
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

  const client = await getSessionClient();
  if (client) {
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

  return NextResponse.json({ user: null });
}
