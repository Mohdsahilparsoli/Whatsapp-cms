import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { prisma } from "@/lib/db";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";
import { normalizePhone } from "@/lib/phone";
import { getConversationWindow } from "@/lib/sessionWindowServer";
import { SESSION_CLOSED_MESSAGE } from "@/lib/sessionWindow";

/**
 * Sends a location pin from the Inbox (free-form, so — like every
 * non-template message — only inside the 24-hour window). The customer sees
 * it as a normal WhatsApp location with a map preview and an "open in maps"
 * action.
 */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const credentials = await getWhatsAppCredentials(auth.clientId);
  if (!credentials) {
    return NextResponse.json(
      { error: "No WhatsApp number available. Connect one in WhatsApp Account Setup." },
      { status: 500 }
    );
  }
  const { phoneNumberId, accessToken } = credentials;

  let body: {
    to?: string;
    name?: string;
    latitude?: number | string;
    longitude?: number | string;
    locationName?: string;
    address?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawDigits = body.to?.replace(/\D/g, "");
  if (!rawDigits || rawDigits.length < 10) {
    return NextResponse.json({ error: "Enter a valid recipient phone number (with country code)." }, { status: 400 });
  }
  const to = normalizePhone(rawDigits);

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (body.latitude === "" || body.longitude === "" || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "Enter a valid latitude and longitude." }, { status: 400 });
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json(
      { error: "Latitude must be between -90 and 90, and longitude between -180 and 180." },
      { status: 400 }
    );
  }
  const locationName = body.locationName?.trim() || null;
  const address = body.address?.trim() || null;

  if (!(await getConversationWindow(auth.clientId, to)).open) {
    return NextResponse.json({ error: SESSION_CLOSED_MESSAGE, code: "session_closed" }, { status: 409 });
  }

  const preview = `📍 ${locationName ?? "Location"}`;

  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "location",
        location: {
          latitude,
          longitude,
          ...(locationName ? { name: locationName } : {}),
          ...(address ? { address } : {}),
        },
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      const metaMessage = data?.error?.message ?? "Meta rejected the message.";
      const record = await prisma.messageRecord.create({
        data: {
          clientId: auth.clientId,
          recipientName: body.name ?? null,
          recipientPhone: to,
          preview,
          status: "failed",
          errorMessage: metaMessage,
          failedAt: new Date(),
        },
      });
      return NextResponse.json({ error: metaMessage, messageRecordId: record.id }, { status: res.status });
    }

    const whatsappMessageId: string | null = data.messages?.[0]?.id ?? null;
    const record = await prisma.messageRecord.create({
      data: {
        clientId: auth.clientId,
        recipientName: body.name ?? null,
        recipientPhone: to,
        preview,
        whatsappMessageId,
        status: "sent",
        sentAt: new Date(),
      },
    });

    const conversation = await prisma.conversation.upsert({
      where: { clientId_contactPhone: { clientId: auth.clientId, contactPhone: to } },
      update: { contactName: body.name ?? undefined, lastMessageAt: new Date() },
      create: { clientId: auth.clientId, contactPhone: to, contactName: body.name ?? null },
    });
    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        clientId: auth.clientId,
        direction: "outbound",
        type: "location",
        text: "",
        latitude,
        longitude,
        locationName,
        locationAddress: address,
        whatsappMessageId,
        status: "sent",
      },
    });

    return NextResponse.json({ ok: true, whatsappMessageId, messageRecordId: record.id, conversationId: conversation.id });
  } catch {
    return NextResponse.json({ error: "Could not reach the WhatsApp API. Please try again." }, { status: 502 });
  }
}
