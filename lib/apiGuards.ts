import { NextResponse } from "next/server";
import { getSessionAdminId } from "@/lib/adminSession";

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
