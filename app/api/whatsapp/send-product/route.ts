import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { sendAndRecordInboxMessage } from "@/lib/inboxSend";

/**
 * Sends catalog product(s) to a customer as a native WhatsApp product card
 * (1 product) or a multi-product message (2–30). Free-form, so — like every
 * non-template message — only inside the 24-hour window (checked in
 * sendAndRecordInboxMessage). Meta's limits: body ≤ 1024 chars, ≤ 30 items.
 */
const MAX_ITEMS = 30;
const BODY_MAX = 1024;

export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: {
    to?: string;
    name?: string;
    message?: string;
    catalogId?: string;
    products?: { retailerId?: string; name?: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = body.message?.trim();
  if (!text) return NextResponse.json({ error: "Type the message text first — it's shown above the product." }, { status: 400 });
  if (text.length > BODY_MAX) {
    return NextResponse.json({ error: `Message is too long (max ${BODY_MAX} characters).` }, { status: 400 });
  }

  const catalogId = body.catalogId?.trim();
  const products = (body.products ?? []).filter((p) => p.retailerId?.trim());
  if (!catalogId) return NextResponse.json({ error: "Pick a catalog first." }, { status: 400 });
  if (products.length < 1 || products.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Pick 1 to ${MAX_ITEMS} products.` }, { status: 400 });
  }

  const names = products.map((p) => p.name?.trim() || p.retailerId!);
  const interactive =
    products.length === 1
      ? {
          type: "product",
          body: { text },
          action: { catalog_id: catalogId, product_retailer_id: products[0].retailerId },
        }
      : {
          type: "product_list",
          header: { type: "text", text: "Products for you" },
          body: { text },
          action: {
            catalog_id: catalogId,
            sections: [{ title: "Products", product_items: products.map((p) => ({ product_retailer_id: p.retailerId })) }],
          },
        };

  const result = await sendAndRecordInboxMessage({
    clientId: auth.clientId,
    to: body.to ?? "",
    contactName: body.name,
    payload: { type: "interactive", interactive },
    preview: text,
    displayText: `${text}\n\n${names.map((n) => `🛍️ ${n}`).join("\n")}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
  return NextResponse.json({ ok: true, whatsappMessageId: result.whatsappMessageId, conversationId: result.conversationId });
}
