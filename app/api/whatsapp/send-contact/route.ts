import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { sendAndRecordInboxMessage } from "@/lib/inboxSend";

/** Sends a contact card (name + phone) from the Inbox — free-form, so only inside the 24h window. */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: { to?: string; name?: string; contactName?: string; contactPhone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const cardName = body.contactName?.trim();
  const cardPhone = body.contactPhone?.replace(/[^\d+]/g, "");
  if (!cardName) return NextResponse.json({ error: "Enter the contact's name." }, { status: 400 });
  if (!cardPhone || cardPhone.replace(/\D/g, "").length < 7) {
    return NextResponse.json({ error: "Enter a valid phone number for the contact." }, { status: 400 });
  }

  const result = await sendAndRecordInboxMessage({
    clientId: auth.clientId,
    to: body.to ?? "",
    contactName: body.name ?? null,
    payload: {
      type: "contacts",
      contacts: [
        {
          name: { formatted_name: cardName, first_name: cardName },
          phones: [{ phone: cardPhone, type: "CELL" }],
        },
      ],
    },
    preview: `👤 Contact: ${cardName}`,
    displayText: `👤 Contact card\n${cardName}\n${cardPhone}`,
  });
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  return NextResponse.json({ ok: true, conversationId: result.conversationId });
}
