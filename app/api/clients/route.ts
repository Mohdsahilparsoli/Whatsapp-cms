import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { toPublicClient } from "@/lib/session";
import { requireSuperAdmin } from "@/lib/apiGuards";

export async function GET() {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const clients = await prisma.client.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ clients: clients.map(toPublicClient) });
}

interface CreateClientBody {
  name?: string;
  userId?: string;
  password?: string;
  email?: string;
  phone?: string;
  startDate?: string;
  expiryDate?: string;
  status?: "active" | "suspended" | "expired";
}

export async function POST(request: Request) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  let body: CreateClientBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const userId = body.userId?.trim();
  const password = body.password ?? "";
  const email = body.email?.trim();
  const phone = body.phone?.trim();
  const startDate = body.startDate;
  const expiryDate = body.expiryDate;
  const status = body.status ?? "active";

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Client name is required.";
  if (!userId || !/^[a-z0-9_]{4,}$/i.test(userId))
    errors.userId = "Use at least 4 letters, numbers, or underscores.";
  if (password.length < 6) errors.password = "Temporary password needs at least 6 characters.";
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address.";
  if (!phone || phone.replace(/\D/g, "").length < 10) errors.phone = "Enter a valid phone number.";
  if (!startDate) errors.startDate = "Select a start date.";
  if (!expiryDate) errors.expiryDate = "Select an expiry date.";
  else if (startDate && expiryDate <= startDate) errors.expiryDate = "Expiry must be after the start date.";

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const existing = await prisma.client.findFirst({
    where: { userId: { equals: userId!, mode: "insensitive" } },
  });
  if (existing) {
    return NextResponse.json(
      { errors: { userId: "That User ID is already taken." } },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);

  const client = await prisma.client.create({
    data: {
      name: name!,
      userId: userId!,
      passwordHash,
      email: email!,
      phone: phone!,
      startDate: new Date(startDate!),
      expiryDate: new Date(expiryDate!),
      status,
      plan: "Free Trial",
    },
  });

  return NextResponse.json({ client: toPublicClient(client) }, { status: 201 });
}
