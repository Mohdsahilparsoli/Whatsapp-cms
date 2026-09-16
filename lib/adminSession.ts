import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

export const ADMIN_SESSION_COOKIE = "wacms.admin_session";
const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Shape returned to the browser — never includes passwordHash. */
export interface AdminPublic {
  id: string;
  userId: string;
  name: string;
  email: string;
}

export function toPublicAdmin(admin: {
  id: string;
  userId: string;
  name: string;
  email: string;
}): AdminPublic {
  return { id: admin.id, userId: admin.userId, name: admin.name, email: admin.email };
}

/** Creates an AdminSession row and sets the httpOnly cookie. Kept as a
 * separate cookie/table from the Client `Session` so an admin login and a
 * client login can never be mixed up server-side. */
export async function createAdminSession(adminId: string, remember: boolean = true) {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS);

  await prisma.adminSession.create({
    data: { token, adminId, expiresAt },
  });

  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(remember ? { expires: expiresAt } : {}),
  });
}

/** Reads the admin session cookie and returns the signed-in admin, or null. */
export async function getSessionAdmin(): Promise<AdminPublic | null> {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.adminSession.findUnique({
    where: { token },
    include: { admin: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return toPublicAdmin(session.admin);
}

/** Reads the admin session cookie and returns the raw adminId, or null. Used
 * by endpoints (change-password, and the Super-Admin-only Client CRUD
 * routes) that need to verify identity without a second DB round trip. */
export async function getSessionAdminId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.adminSession.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.adminId;
}

/** Deletes the admin session row and clears the cookie. */
export async function destroyAdminSession() {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) {
    await prisma.adminSession.delete({ where: { token } }).catch(() => {});
  }
  store.delete(ADMIN_SESSION_COOKIE);
}
