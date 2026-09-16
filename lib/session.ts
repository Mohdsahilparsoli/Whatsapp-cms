import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { toISODate } from "@/lib/utils";
import type { Client } from "@/types";

export const SESSION_COOKIE = "wacms.session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Shape returned to the browser — never includes passwordHash. */
export interface ClientPublic {
  id: string;
  name: string;
  userId: string;
  email: string;
  phone: string;
  startDate: string;
  expiryDate: string;
  status: Client["status"];
  messagesSent: number;
  contacts: number;
  plan: string;
}

export function toPublicClient(client: {
  id: string;
  name: string;
  userId: string;
  email: string;
  phone: string;
  startDate: Date;
  expiryDate: Date;
  status: string;
  messagesSent: number;
  contacts: number;
  plan: string;
}): ClientPublic {
  return {
    id: client.id,
    name: client.name,
    userId: client.userId,
    email: client.email,
    phone: client.phone,
    startDate: toISODate(client.startDate),
    expiryDate: toISODate(client.expiryDate),
    status: client.status as Client["status"],
    messagesSent: client.messagesSent,
    contacts: client.contacts,
    plan: client.plan,
  };
}

/** Creates a Session row for this client and sets the httpOnly cookie.
 * `remember=false` sets a browser-session cookie (cleared when the browser
 * closes) instead of a persistent 7-day one — same "Remember me" checkbox
 * behavior the login page already had. */
export async function createSession(clientId: string, remember: boolean = true) {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { token, clientId, expiresAt },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // The DB row still expires after SESSION_TTL_MS either way — this only
    // controls whether the browser forgets the cookie itself on close.
    ...(remember ? { expires: expiresAt } : {}),
  });
}

/** Reads the session cookie and returns the signed-in client, or null. */
export async function getSessionClient(): Promise<ClientPublic | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { client: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return toPublicClient(session.client);
}

/** Reads the session cookie and returns the raw clientId, or null — for
 * endpoints (like change-password) that need to act on the client's own row
 * without a second DB round trip for display fields. */
export async function getSessionClientId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.clientId;
}

/** Deletes the session row and clears the cookie. */
export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.delete({ where: { token } }).catch(() => {});
  }
  store.delete(SESSION_COOKIE);
}
