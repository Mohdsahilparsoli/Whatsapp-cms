import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { listCatalogProducts } from "@/lib/metaCommerce";

/** The client's WhatsApp-connected product catalog + its products — see lib/metaCommerce.ts. */
export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const outcome = await listCatalogProducts(auth.clientId);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({
    catalogId: outcome.catalogId,
    catalogName: outcome.catalogName,
    products: outcome.products,
  });
}
