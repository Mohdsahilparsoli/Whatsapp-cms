import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { prisma } from "@/lib/db";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";

/**
 * Sends via the signed-in client's own connected WhatsApp account if they
 * have one, else the shared test number — see lib/whatsappCredentials.ts
 * and send-test/route.ts for the full explanation.
 *
 * Additionally: Meta's servers fetch the media from the `link` URL you give
 * them, so this only works if this app is reachable on a **public** URL —
 * on localhost, the request to Meta will succeed in being sent but Meta
 * will fail to actually fetch the file, and the message will show as
 * failed. Use ngrok for local dev, same as the delivery webhook.
 */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const credentials = await getWhatsAppCredentials(auth.clientId);
  if (!credentials) {
    return NextResponse.json(
      {
        error:
          "No WhatsApp number available. Connect one in WhatsApp Account Setup, or add META_TEST_PHONE_NUMBER_ID and META_TEST_ACCESS_TOKEN to .env.",
      },
      { status: 500 }
    );
  }
  const { phoneNumberId, accessToken } = credentials;

  let body: {
    to?: string;
    name?: string;
    mediaUrl?: string;
    mediaKind?: "image" | "document";
    fileName?: string;
    caption?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const to = body.to?.replace(/\D/g, "");
  const mediaUrl = body.mediaUrl?.trim();
  const mediaKind = body.mediaKind;

  if (!to || to.length < 10) {
    return NextResponse.json({ error: "Enter a valid recipient phone number (with country code)." }, { status: 400 });
  }
  if (!mediaUrl || (mediaKind !== "image" && mediaKind !== "document")) {
    return NextResponse.json({ error: "Upload a file first." }, { status: 400 });
  }

  const absoluteUrl = mediaUrl.startsWith("http") ? mediaUrl : `${new URL(request.url).origin}${mediaUrl}`;
  const preview = mediaKind === "image" ? "📷 Photo" : `📄 ${body.fileName ?? "Document"}`;

  const mediaPayload =
    mediaKind === "image"
      ? { link: absoluteUrl, caption: body.caption?.trim() || undefined }
      : { link: absoluteUrl, filename: body.fileName, caption: body.caption?.trim() || undefined };

  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: mediaKind,
        [mediaKind]: mediaPayload,
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
      return NextResponse.json(
        {
          error: `${metaMessage}${
            !mediaUrl.startsWith("http") ? " (Tip: Meta can't fetch media from localhost — expose this app with ngrok or deploy it.)" : ""
          }`,
          messageRecordId: record.id,
        },
        { status: res.status }
      );
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
        type: mediaKind,
        text: body.caption?.trim() ?? "",
        mediaUrl,
        mediaFileName: body.fileName,
        whatsappMessageId,
        status: "sent",
      },
    });

    return NextResponse.json({ ok: true, whatsappMessageId, messageRecordId: record.id, conversationId: conversation.id });
  } catch {
    return NextResponse.json({ error: "Could not reach the WhatsApp API. Please try again." }, { status: 502 });
  }
}
