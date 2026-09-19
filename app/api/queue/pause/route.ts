import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { getQueueSettings } from "@/lib/queueSettings";

export async function POST() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  await getQueueSettings(auth.clientId); // ensure the row exists
  const settings = await prisma.queueSettings.update({
    where: { clientId: auth.clientId },
    data: { paused: true },
  });

  return NextResponse.json({ paused: settings.paused });
}
