import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";

type Params = { params: Promise<{ id: string }> };

/**
 * Blocks / unblocks a customer through WhatsApp's Block Users API. Meta only
 * lets a business block someone who has messaged it in the last 24 hours;
 * unblocking has no such limit.
 */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({ where: { id, clientId: auth.clientId } });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  let body: { blocked?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const block = body.blocked !== false;

  const credentials = await getWhatsAppCredentials(auth.clientId, conversation.phoneNumberId);
  if (!credentials || credentials.source !== "client") {
    return NextResponse.json({ error: "Connect your own WhatsApp number first." }, { status: 400 });
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${credentials.phoneNumberId}/block_users`, {
      method: block ? "POST" : "DELETE",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", block_users: [{ user: conversation.contactPhone }] }),
    });
    const data = await res.json().catch(() => ({}));
    const failed = data?.block_users?.failed_users?.[0] ?? data?.block_users?.removed_users?.[0]?.errors;
    if (!res.ok || (block && data?.block_users?.failed_users?.length)) {
      const reason = data?.error?.message ?? failed?.errors?.[0]?.message ?? "Meta rejected the request.";
      return NextResponse.json({ error: reason }, { status: 502 });
    }
    await prisma.conversation.update({ where: { id }, data: { blocked: block } });
    return NextResponse.json({ ok: true, blocked: block });
  } catch {
    return NextResponse.json({ error: "Could not reach the WhatsApp API. Please try again." }, { status: 502 });
  }
}
