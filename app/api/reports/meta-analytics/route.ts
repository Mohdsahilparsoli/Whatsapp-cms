import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { fetchMetaAnalytics } from "@/lib/metaAnalytics";

/** Meta's own message + billing analytics for this client's WABA — see lib/metaAnalytics.ts. */
export async function GET(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const requested = Number(new URL(request.url).searchParams.get("days"));
  const days = [7, 30, 90].includes(requested) ? requested : 30;

  const outcome = await fetchMetaAnalytics(auth.clientId, days);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json(outcome.analytics);
}
