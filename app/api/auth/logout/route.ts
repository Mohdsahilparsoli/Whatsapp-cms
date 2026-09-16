import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";
import { destroyAdminSession } from "@/lib/adminSession";

export async function POST() {
  // Harmless no-op if that particular cookie wasn't set.
  await destroySession();
  await destroyAdminSession();
  return NextResponse.json({ ok: true });
}
