import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { sendAndRecordInboxMessage } from "@/lib/inboxSend";
import { normalizePhone } from "@/lib/phone";
import { toPaise } from "@/lib/payments";

interface ItemInput {
  name?: string;
  price?: number | string; // rupees
  quantity?: number | string;
}

/**
 * Sends a WhatsApp Payments (India) "order_details" message — an itemised
 * bill with a Pay button that opens UPI inside WhatsApp — through the
 * client's own gateway configuration (Razorpay / PayU, set in WhatsApp
 * Account Setup). Free-form, so only inside the 24-hour window. The payment
 * result arrives later as a webhook and is shown in the chat and on the
 * Payments page.
 */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: {
    to?: string;
    name?: string;
    message?: string;
    items?: ItemInput[];
    tax?: number | string;
    shipping?: number | string;
    discount?: number | string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const account = await prisma.whatsAppAccount.findUnique({ where: { clientId: auth.clientId } });
  if (!account?.connected || !account.paymentGateway || !account.paymentConfigName) {
    return NextResponse.json(
      { error: "Set up Payments first: WhatsApp Account Setup → Payments (gateway + configuration name)." },
      { status: 400 }
    );
  }

  const text = body.message?.trim();
  if (!text) return NextResponse.json({ error: "Type the message to show with the bill." }, { status: 400 });
  if (text.length > 1024) return NextResponse.json({ error: "The message can be at most 1024 characters." }, { status: 400 });

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items: { retailer_id: string; name: string; amount: { value: number; offset: number }; quantity: number }[] = [];
  for (const [i, item] of rawItems.entries()) {
    const name = item.name?.trim();
    const price = Number(item.price);
    const quantity = Number(item.quantity ?? 1);
    if (!name || name.length > 60) return NextResponse.json({ error: `Item ${i + 1}: enter a name (up to 60 characters).` }, { status: 400 });
    if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: `Item ${i + 1}: enter a price above 0.` }, { status: 400 });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return NextResponse.json({ error: `Item ${i + 1}: quantity must be a whole number.` }, { status: 400 });
    items.push({ retailer_id: `item-${i + 1}`, name, amount: { value: toPaise(price), offset: 100 }, quantity });
  }
  if (items.length === 0) return NextResponse.json({ error: "Add at least one item." }, { status: 400 });

  const money = (raw: number | string | undefined) => {
    const n = Number(raw ?? 0);
    return Number.isFinite(n) && n > 0 ? toPaise(n) : 0;
  };
  const subtotal = items.reduce((sum, it) => sum + it.amount.value * it.quantity, 0);
  const tax = money(body.tax);
  const shipping = money(body.shipping);
  const discount = money(body.discount);
  const total = subtotal + tax + shipping - discount;
  if (total < 100) return NextResponse.json({ error: "The total must be at least ₹1." }, { status: 400 });

  const referenceId = `ORD-${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString("hex").toUpperCase()}`;
  const parameters = {
    reference_id: referenceId,
    type: "digital-goods",
    payment_settings: [
      {
        type: "payment_gateway",
        payment_gateway: { type: account.paymentGateway, configuration_name: account.paymentConfigName },
      },
    ],
    currency: "INR",
    total_amount: { value: total, offset: 100 },
    order: {
      status: "pending",
      items,
      subtotal: { value: subtotal, offset: 100 },
      tax: { value: tax, offset: 100 },
      ...(shipping > 0 ? { shipping: { value: shipping, offset: 100 } } : {}),
      ...(discount > 0 ? { discount: { value: discount, offset: 100, description: "Discount" } } : {}),
    },
  };

  const rupees = (total / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const result = await sendAndRecordInboxMessage({
    clientId: auth.clientId,
    to: body.to ?? "",
    contactName: body.name ?? null,
    payload: {
      type: "interactive",
      interactive: {
        type: "order_details",
        body: { text },
        action: { name: "review_and_pay", parameters: JSON.stringify(parameters) },
      },
    },
    preview: `💳 Payment request ₹${rupees}`,
    displayText: `💳 Payment request — ₹${rupees}\n${items.map((it) => `• ${it.name} × ${it.quantity}`).join("\n")}\nOrder ${referenceId}`,
  });
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });

  await prisma.paymentRequest.create({
    data: {
      clientId: auth.clientId,
      referenceId,
      customerPhone: normalizePhone(body.to ?? ""),
      customerName: body.name ?? null,
      amountPaise: total,
      items: items.map((it) => ({ name: it.name, quantity: it.quantity, pricePaise: it.amount.value })),
      whatsappMessageId: result.whatsappMessageId,
    },
  });

  return NextResponse.json({ ok: true, referenceId });
}
