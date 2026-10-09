import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { createSession } from "@/lib/session";
import { findClientsByEmail, passwordProblem, trialDates } from "@/lib/clientAccounts";

/** Self-service sign-up: creates a Client with the standard free trial and
 * signs them straight in — no Super Admin involvement. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const name = str("name");
  const userId = str("userId");
  const email = str("email");
  const phone = str("phone");
  const password = typeof body.password === "string" ? body.password : "";

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Enter your business or full name.";
  if (!/^[a-z0-9_]{4,20}$/i.test(userId)) errors.userId = "Use 4–20 letters, numbers or underscores.";
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address.";
  if (phone && phone.replace(/\D/g, "").length < 10) errors.phone = "Enter a valid phone number.";
  const pwProblem = passwordProblem(password);
  if (pwProblem) errors.password = pwProblem;
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 400 });

  const [idTaken, admin, emailTaken] = await Promise.all([
    prisma.client.findFirst({ where: { userId: { equals: userId, mode: "insensitive" } }, select: { id: true } }),
    prisma.adminUser.findFirst({ where: { userId: { equals: userId, mode: "insensitive" } }, select: { id: true } }),
    findClientsByEmail(email),
  ]);
  if (idTaken || admin) {
    return NextResponse.json({ errors: { userId: "That User ID is already taken." } }, { status: 409 });
  }
  if (emailTaken.length) {
    return NextResponse.json(
      { errors: { email: "An account with this email already exists. Sign in instead." } },
      { status: 409 }
    );
  }

  const client = await prisma.client.create({
    data: {
      name,
      userId,
      passwordHash: await hashPassword(password),
      email,
      phone,
      ...trialDates(),
      status: "active",
      plan: "Free Trial",
    },
  });
  await createSession(client.id, true);
  return NextResponse.json({ ok: true }, { status: 201 });
}
