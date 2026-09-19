import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionAdminId } from "@/lib/adminSession";
import { getSessionClientId } from "@/lib/session";
import type { User } from "@/types";

interface ProfileBody {
  name?: string;
  email?: string;
  phone?: string;
}

export async function PUT(request: Request) {
  let body: ProfileBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const email = body.email?.trim();
  const phone = body.phone?.trim();

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Name is required.";
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address.";
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const adminId = await getSessionAdminId();
  if (adminId) {
    const admin = await prisma.adminUser.update({
      where: { id: adminId },
      data: { name: name!, email: email!, phone: phone || null },
    });
    const user: User = {
      id: admin.id,
      userId: admin.userId,
      name: admin.name,
      email: admin.email,
      phone: admin.phone,
      role: "super_admin",
      notifications: admin.notificationPrefs as User["notifications"],
      preferences: admin.cmsPrefs as User["preferences"],
    };
    return NextResponse.json({ user });
  }

  const clientId = await getSessionClientId();
  if (clientId) {
    const client = await prisma.client.update({
      where: { id: clientId },
      data: { name: name!, email: email!, phone: phone || "" },
    });
    const user: User = {
      id: client.id,
      userId: client.userId,
      name: client.name,
      email: client.email,
      phone: client.phone,
      role: "client_admin",
      clientId: client.id,
      clientName: client.name,
      notifications: client.notificationPrefs as User["notifications"],
      preferences: client.cmsPrefs as User["preferences"],
    };
    return NextResponse.json({ user });
  }

  return NextResponse.json({ error: "Not authorized." }, { status: 401 });
}
