import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { TRIAL_DAYS } from "@/data/plans";

/** Strong-enough password rule for self-service accounts. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Include at least one letter and one number.";
  return null;
}

export function trialDates(): { startDate: Date; expiryDate: Date } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const expiry = new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  return { startDate: start, expiryDate: expiry };
}

export async function findClientsByEmail(email: string) {
  return prisma.client.findMany({ where: { email: { equals: email.trim(), mode: "insensitive" } } });
}

/** Picks a free User ID for accounts created through social login. */
export async function generateUserId(seed: string): Promise<string> {
  const base = seed.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16) || "user";
  for (let i = 0; i < 8; i++) {
    const candidate = `${base.length >= 4 ? base : base + "user"}${randomBytes(2).toString("hex")}`;
    const taken = await prisma.client.findFirst({
      where: { userId: { equals: candidate, mode: "insensitive" } },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `user${randomBytes(6).toString("hex")}`;
}
