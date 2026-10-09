import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getAppOrigin } from "@/lib/appUrl";
import { isMailConfigured, passwordResetEmail, sendMail } from "@/lib/mailer";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 3;

/** Always answers the same way whether or not the account exists, so this
 * can't be used to find out which emails are registered. Super Admin has no
 * email reset on purpose — that stays terminal-only (npm run
 * reset-admin-password). */
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

  const matches = await prisma.client.findMany({
    where: {
      OR: [
        { userId: { equals: identifier, mode: "insensitive" } },
        { email: { equals: identifier, mode: "insensitive" } },
      ],
    },
    take: 2,
  });
  // More than one account on the same email is ambiguous — send nothing.
  const client = matches.length === 1 ? matches[0] : null;

  if (client && client.status !== "suspended" && client.email) {
    const recent = await prisma.passwordResetToken.count({
      where: { clientId: client.id, createdAt: { gt: new Date(Date.now() - TOKEN_TTL_MS) } },
    });
    if (recent < MAX_PER_HOUR) {
      const token = randomBytes(32).toString("hex");
      await prisma.passwordResetToken.create({
        data: {
          clientId: client.id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
      });
      const origin = process.env.APP_URL ? getAppOrigin() : new URL(request.url).origin;
      const mail = passwordResetEmail(client.name, `${origin}/reset-password?token=${token}`);
      try {
        await sendMail({ to: client.email, ...mail });
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
