import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { listFlows } from "@/lib/metaCommerce";

/** The client's WhatsApp Flows (from Meta) that can be sent — see lib/metaCommerce.ts. */
export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const outcome = await listFlows(auth.clientId);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ flows: outcome.flows });
}
