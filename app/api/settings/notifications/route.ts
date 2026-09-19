import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionAdminId } from "@/lib/adminSession";
import { getSessionClientId } from "@/lib/session";
import type { NotificationPrefs } from "@/types";

export async function PUT(request: Request) {
  let body: Partial<NotificationPrefs>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const prefs: NotificationPrefs = {
    campaignComplete: Boolean(body.campaignComplete),
    deliveryFailures: Boolean(body.deliveryFailures),
    newInboxMessage: Boolean(body.newInboxMessage),
    weeklySummary: Boolean(body.weeklySummary),
  };

  const adminId = await getSessionAdminId();
  if (adminId) {
    await prisma.adminUser.update({ where: { id: adminId }, data: { notificationPrefs: prefs } });
    return NextResponse.json({ notifications: prefs });
  }

  const clientId = await getSessionClientId();
  if (clientId) {
    await prisma.client.update({ where: { id: clientId }, data: { notificationPrefs: prefs } });
    return NextResponse.json({ notifications: prefs });
  }

  return NextResponse.json({ error: "Not authorized." }, { status: 401 });
}
