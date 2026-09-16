import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { toPublicClient } from "@/lib/session";
import { requireSuperAdmin } from "@/lib/apiGuards";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  return NextResponse.json({ client: toPublicClient(client) });
}

interface UpdateClientBody {
  name?: string;
  email?: string;
  phone?: string;
  startDate?: string;
  expiryDate?: string;
  status?: "active" | "suspended" | "expired";
  /** Optional — only sent when Super Admin sets a new password while editing. */
  password?: string;
}

export async function PUT(request: Request, { params }: Params) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  let body: UpdateClientBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const email = body.email?.trim();
  const phone = body.phone?.trim();
  const startDate = body.startDate;
  const expiryDate = body.expiryDate;
  const status = body.status;

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Client name is required.";
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address.";
  if (!phone || phone.replace(/\D/g, "").length < 10) errors.phone = "Enter a valid phone number.";
  if (!startDate) errors.startDate = "Select a start date.";
  if (!expiryDate) errors.expiryDate = "Select an expiry date.";
  else if (startDate && expiryDate <= startDate) errors.expiryDate = "Expiry must be after the start date.";
  if (body.password !== undefined && body.password.length > 0 && body.password.length < 6)
    errors.password = "Temporary password needs at least 6 characters.";

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const passwordHash = body.password ? await hashPassword(body.password) : undefined;

  const client = await prisma.client.update({
    where: { id },
    data: {
      name,
      email,
      phone,
      startDate: new Date(startDate!),
      expiryDate: new Date(expiryDate!),
      ...(status ? { status } : {}),
      ...(passwordHash ? { passwordHash } : {}),
    },
  });

  // A new password should force a fresh login.
  if (passwordHash) {
    await prisma.session.deleteMany({ where: { clientId: id } });
  }

  return NextResponse.json({ client: toPublicClient(client) });
}
