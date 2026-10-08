import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { syncTemplatesFromMeta } from "@/lib/metaTemplateSync";

/**
 * Pulls every template on the client's WhatsApp Business Account from Meta
 * and mirrors it here — see lib/metaTemplateSync.ts.
 */
export async function POST() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const outcome = await syncTemplatesFromMeta(auth.clientId);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json(outcome.result);
}
