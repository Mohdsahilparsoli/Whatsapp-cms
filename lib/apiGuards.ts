import { NextResponse } from "next/server";
import { getSessionAdminId } from "@/lib/adminSession";
import { getSessionClientId } from "@/lib/session";

/**
 * Verifies the caller has a real, valid Super Admin session. Returns null
 * when authorized (caller should proceed), or a 401 NextResponse to return
 * immediately when not.
 *
 * This replaces the Phase 1 placeholder that only checked "is the caller
 * *not* a signed-in Client" — this now checks a real AdminSession row via
 * the httpOnly cookie, the same way Client routes check a Client session.
 */
export async function requireSuperAdmin(): Promise<NextResponse | null> {
  const adminId = await getSessionAdminId();
  if (!adminId) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  return null;
}

/**
 * Verifies the caller has a real, valid Client Admin session, and returns
 * their clientId — every Contacts route uses this to scope its query, so a
 * client only ever sees/touches its own rows. Returns a 401 NextResponse to
 * return immediately when there's no valid client session (this includes
 * Super Admin — Contacts is a Client-Admin-only area, matching the sidebar).
 */
export async function requireClient(): Promise<{ clientId: string } | NextResponse> {
  const clientId = await getSessionClientId();
  if (!clientId) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  return { clientId };
}
