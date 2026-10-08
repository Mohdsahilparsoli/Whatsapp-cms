import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { prisma } from "@/lib/db";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";
import { normalizePhone } from "@/lib/phone";
import { getConversationWindow } from "@/lib/sessionWindowServer";
import { SESSION_CLOSED_MESSAGE } from "@/lib/sessionWindow";

/**
 * Sends a free-form INTERACTIVE message from the Inbox — either tappable
 * reply buttons (up to 3) or a list menu (up to 10 rows). These are
 * customer-service messages, so like every free-form message they only work
 * inside the 24-hour window (checked below). When the customer taps an
 * option, Meta sends it back as a normal inbound message, which the webhook
 * (app/api/webhooks/meta/route.ts) already records as their reply.
 *
 * Meta's limits, enforced here so a bad request fails with a clear message
 * instead of an opaque Graph API error:
 *   body ≤ 1024 · button title ≤ 20 · max 3 buttons
 *   list: button label ≤ 20 · max 10 rows · row title ≤ 24 · description ≤ 72
 */
const BODY_MAX = 1024;
const BUTTON_TITLE_MAX = 20;
const MAX_BUTTONS = 3;
const MAX_ROWS = 10;
const ROW_TITLE_MAX = 24;
const ROW_DESCRIPTION_MAX = 72;

interface RequestBody {
  to?: string;
  name?: string;
  message?: string;
  kind?: "buttons" | "list";
  /** Button titles (kind "buttons"). */
  buttons?: string[];
  /** List label shown on the "open menu" button (kind "list"). */
  listButtonLabel?: string;
  /** List rows (kind "list"). */
  rows?: { title?: string; description?: string }[];
}

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

  let body: RequestBody;
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

  const text = body.message?.trim();
  if (!text) return NextResponse.json({ error: "Type the message text first." }, { status: 400 });
  if (text.length > BODY_MAX) {
    return NextResponse.json({ error: `Message is too long for an interactive message (max ${BODY_MAX} characters).` }, { status: 400 });
  }

  let interactive: Record<string, unknown>;
  let optionLabels: string[];

  if (body.kind === "buttons") {
    const titles = (body.buttons ?? []).map((b) => b.trim()).filter(Boolean);
    if (titles.length < 1 || titles.length > MAX_BUTTONS) {
      return NextResponse.json({ error: `Add 1 to ${MAX_BUTTONS} buttons.` }, { status: 400 });
    }
    if (titles.some((t) => t.length > BUTTON_TITLE_MAX)) {
      return NextResponse.json({ error: `Each button title can be at most ${BUTTON_TITLE_MAX} characters.` }, { status: 400 });
    }
    if (new Set(titles.map((t) => t.toLowerCase())).size !== titles.length) {
      return NextResponse.json({ error: "Button titles must be different from each other." }, { status: 400 });
    }
    optionLabels = titles;
    interactive = {
      type: "button",
      body: { text },
      action: {
        buttons: titles.map((title, i) => ({ type: "reply", reply: { id: `btn_${i + 1}`, title } })),
      },
    };
  } else if (body.kind === "list") {
    const label = body.listButtonLabel?.trim() || "Choose an option";
    if (label.length > BUTTON_TITLE_MAX) {
      return NextResponse.json({ error: `The menu button label can be at most ${BUTTON_TITLE_MAX} characters.` }, { status: 400 });
    }
    const rows = (body.rows ?? [])
      .map((r) => ({ title: r.title?.trim() ?? "", description: r.description?.trim() ?? "" }))
      .filter((r) => r.title);
    if (rows.length < 1 || rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Add 1 to ${MAX_ROWS} list options.` }, { status: 400 });
    }
    if (rows.some((r) => r.title.length > ROW_TITLE_MAX)) {
      return NextResponse.json({ error: `Each list option title can be at most ${ROW_TITLE_MAX} characters.` }, { status: 400 });
    }
    if (rows.some((r) => r.description.length > ROW_DESCRIPTION_MAX)) {
      return NextResponse.json({ error: `Each option description can be at most ${ROW_DESCRIPTION_MAX} characters.` }, { status: 400 });
    }
    if (new Set(rows.map((r) => r.title.toLowerCase())).size !== rows.length) {
      return NextResponse.json({ error: "List option titles must be different from each other." }, { status: 400 });
    }
    optionLabels = rows.map((r) => r.title);
    interactive = {
      type: "list",
      body: { text },
      action: {
        button: label,
        sections: [
          {
            title: "Options",
            rows: rows.map((r, i) => ({
              id: `row_${i + 1}`,
              title: r.title,
              ...(r.description ? { description: r.description } : {}),
            })),
          },
        ],
      },
    };
  } else {
    return NextResponse.json({ error: "Choose buttons or a list." }, { status: 400 });
  }

  // Free-form messages only work inside the 24h window — see lib/sessionWindow.ts.
  if (!(await getConversationWindow(auth.clientId, to)).open) {
    return NextResponse.json({ error: SESSION_CLOSED_MESSAGE, code: "session_closed" }, { status: 409 });
  }

  // How this shows up in the Inbox thread: the question, then its options.
  const display = `${text}\n\n${optionLabels.map((o) => `🔘 ${o}`).join("\n")}`;

  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "interactive", interactive }),
    });
    const data = await res.json();

    if (!res.ok) {
      const metaMessage = data?.error?.message ?? "Meta rejected the message.";
      const record = await prisma.messageRecord.create({
        data: {
          clientId: auth.clientId,
          recipientName: body.name ?? null,
          recipientPhone: to,
          preview: text,
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
        preview: text,
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
        type: "text",
        text: display,
        whatsappMessageId,
        status: "sent",
      },
    });

    return NextResponse.json({ ok: true, whatsappMessageId, messageRecordId: record.id, conversationId: conversation.id });
  } catch {
    return NextResponse.json({ error: "Could not reach the WhatsApp API. Please try again." }, { status: 502 });
  }
}
