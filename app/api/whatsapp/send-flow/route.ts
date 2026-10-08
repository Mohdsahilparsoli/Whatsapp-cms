import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { sendAndRecordInboxMessage } from "@/lib/inboxSend";
import { getFlowFirstScreen } from "@/lib/metaCommerce";

/**
 * Sends a WhatsApp Flow (an in-chat form / mini app built in Meta's Flow
 * Builder) as a message with a button that opens it. The customer's answers
 * come back through the webhook as a normal inbound message (see
 * app/api/webhooks/meta/route.ts — nfm_reply) and show up in the thread.
 * Free-form, so only inside the 24-hour window.
 */
const BODY_MAX = 1024;
const CTA_MAX = 30;

export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: {
    to?: string;
    name?: string;
    message?: string;
    flowId?: string;
    flowName?: string;
    flowStatus?: string;
    flowCta?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = body.message?.trim();
  if (!text) return NextResponse.json({ error: "Type the message text first — it's shown above the Flow button." }, { status: 400 });
  if (text.length > BODY_MAX) {
    return NextResponse.json({ error: `Message is too long (max ${BODY_MAX} characters).` }, { status: 400 });
  }
  const flowId = body.flowId?.trim();
  if (!flowId) return NextResponse.json({ error: "Pick a Flow first." }, { status: 400 });
  const cta = body.flowCta?.trim() || "Open";
  if (cta.length > CTA_MAX) {
    return NextResponse.json({ error: `The button text can be at most ${CTA_MAX} characters.` }, { status: 400 });
  }

  const screen = await getFlowFirstScreen(auth.clientId, flowId);
  if (!screen.ok) return NextResponse.json({ error: screen.error }, { status: 502 });

  const isDraft = body.flowStatus?.toUpperCase() === "DRAFT";
  const result = await sendAndRecordInboxMessage({
    clientId: auth.clientId,
    to: body.to ?? "",
    contactName: body.name,
    payload: {
      type: "interactive",
      interactive: {
        type: "flow",
        body: { text },
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_token: randomUUID(),
            flow_id: flowId,
            flow_cta: cta,
            flow_action: "navigate",
            flow_action_payload: { screen: screen.screen },
            // A DRAFT flow can only be sent in draft mode (testing).
            ...(isDraft ? { mode: "draft" } : {}),
          },
        },
      },
    },
    preview: text,
    displayText: `${text}\n\n📋 ${body.flowName?.trim() || "Flow"} · ${cta}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
  return NextResponse.json({ ok: true, whatsappMessageId: result.whatsappMessageId, conversationId: result.conversationId });
}
