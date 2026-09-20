import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionAdminId } from "@/lib/adminSession";
import { getSessionClientId } from "@/lib/session";
import type { CmsPrefs } from "@/types";

export async function PUT(request: Request) {
  let body: Partial<CmsPrefs>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const prefs: CmsPrefs = {
    timezone: body.timezone?.trim() || "Asia/Kolkata",
    dateFormat: body.dateFormat?.trim() || "DD MMM YYYY",
    language: body.language?.trim() || "English",
    defaultList: body.defaultList?.trim() || "All opted-in contacts",
  };

  const adminId = await getSessionAdminId();
  if (adminId) {
    await prisma.adminUser.update({
      where: { id: adminId },
      data: { cmsPrefs: JSON.parse(JSON.stringify(prefs)) },
    });
    return NextResponse.json({ preferences: prefs });
  }

  const clientId = await getSessionClientId();
  if (clientId) {
    await prisma.client.update({
      where: { id: clientId },
      data: { cmsPrefs: JSON.parse(JSON.stringify(prefs)) },
    });
    return NextResponse.json({ preferences: prefs });
  }

  return NextResponse.json({ error: "Not authorized." }, { status: 401 });
}
