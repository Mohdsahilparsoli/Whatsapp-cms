import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getAppOrigin } from "@/lib/appUrl";
import { isMailConfigured, passwordResetEmail, sendMail } from "@/lib/mailer";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 3;

/** Always answers the same way whether or not the account exists, so this
 * can't be used to find out which emails are registered. Works for the Super
 * Admin too (the terminal `npm run reset-admin-password` still exists as a
 * fallback if the admin's email is unreachable). */
export async function POST(request: Request) {
  let body: { identifier?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const identifier = body.identifier?.trim();
  if (!identifier) return NextResponse.json({ error: "Enter your email or User ID." }, { status: 400 });

  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: "Password reset email isn't set up yet. Contact support to reset your password." },
      { status: 503 }
    );
  }

  const where = {
    OR: [
      { userId: { equals: identifier, mode: "insensitive" as const } },
      { email: { equals: identifier, mode: "insensitive" as const } },
    ],
  };
  // The Super Admin is looked up first (there is only ever one row).
  const admin = await prisma.adminUser.findFirst({ where });
  let target: { kind: "admin" | "client"; id: string; name: string; email: string } | null = null;
  if (admin) {
    target = { kind: "admin", id: admin.id, name: admin.name, email: admin.email };
  } else {
    const matches = await prisma.client.findMany({ where, take: 2 });
    // More than one account on the same email is ambiguous — send nothing.
    const c = matches.length === 1 ? matches[0] : null;
    if (c && c.status !== "suspended") target = { kind: "client", id: c.id, name: c.name, email: c.email };
  }

  if (target && target.email) {
    const owner = target.kind === "admin" ? { adminId: target.id } : { clientId: target.id };
    const recent = await prisma.passwordResetToken.count({
      where: { ...owner, createdAt: { gt: new Date(Date.now() - TOKEN_TTL_MS) } },
    });
    if (recent < MAX_PER_HOUR) {
      const token = randomBytes(32).toString("hex");
      await prisma.passwordResetToken.create({
        data: {
          ...owner,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
      });
      const origin = process.env.APP_URL ? getAppOrigin() : new URL(request.url).origin;
      const mail = passwordResetEmail(target.name, `${origin}/reset-password?token=${token}`);
      try {
        await sendMail({ to: target.email, ...mail });
      } catch (err) {
        console.error("[forgot-password] mail failed", err);
        return NextResponse.json(
          { error: "We couldn't send the email right now. Try again in a few minutes." },
          { status: 502 }
        );
      }
    }
  }
  return NextResponse.json({ ok: true });
}
