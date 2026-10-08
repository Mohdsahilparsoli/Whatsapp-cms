import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { sendAndRecordInboxMessage } from "@/lib/inboxSend";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/payments";

type Params = { params: Promise<{ id: string }> };

const LABELS: Record<OrderStatus, string> = {
  processing: "Your order is being processed.",
  shipped: "Your order has been shipped.",
  completed: "Your order is complete. Thank you!",
  canceled: "Your order was cancelled.",
};

/** Tells the customer where their order stands (WhatsApp order_status message). */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const payment = await prisma.paymentRequest.findFirst({ where: { id, clientId: auth.clientId } });
  if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  let body: { status?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const status = body.status as OrderStatus;
  if (!ORDER_STATUSES.includes(status)) return NextResponse.json({ error: "Choose a valid order status." }, { status: 400 });
  const description = body.description?.trim().slice(0, 120);

  if (payment.status !== "captured" && status !== "canceled") {
    return NextResponse.json({ error: "Update the order only after the payment has been received." }, { status: 409 });
  }

  const result = await sendAndRecordInboxMessage({
    clientId: auth.clientId,
    to: payment.customerPhone,
    contactName: payment.customerName,
    payload: {
      type: "interactive",
      interactive: {
        type: "order_status",
        body: { text: LABELS[status] },
        action: {
          name: "review_order",
          parameters: { reference_id: payment.referenceId, order: { status, ...(description ? { description } : {}) } },
        },
      },
    },
    preview: `📦 Order ${status}`,
    displayText: `📦 Order update — ${status}\nOrder ${payment.referenceId}${description ? `\n${description}` : ""}`,
  });
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });

  await prisma.paymentRequest.update({ where: { id }, data: { orderStatus: status } });
  return NextResponse.json({ ok: true });
}
