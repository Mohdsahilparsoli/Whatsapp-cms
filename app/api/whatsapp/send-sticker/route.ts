import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { sendAndRecordInboxMessage } from "@/lib/inboxSend";

/**
 * Sends a sticker (.webp, already uploaded via /api/whatsapp/upload) from the
 * Inbox. Free-form, so only inside the 24-hour window. Meta fetches the link
 * itself, so the URL must be publicly reachable (Vercel Blob is).
 */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: { to?: string; name?: string; mediaUrl?: string; fileName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const mediaUrl = body.mediaUrl?.trim();
  if (!mediaUrl) return NextResponse.json({ error: "Upload a sticker first." }, { status: 400 });
  const absolute = mediaUrl.startsWith("http") ? mediaUrl : `${new URL(request.url).origin}${mediaUrl}`;

  const result = await sendAndRecordInboxMessage({
    clientId: auth.clientId,
    to: body.to ?? "",
    contactName: body.name ?? null,
    payload: { type: "sticker", sticker: { link: absolute } },
    preview: "🏷️ Sticker",
    displayText: "🏷️ Sticker",
    chatMedia: { type: "image", url: mediaUrl, fileName: body.fileName ?? null },
  });
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  return NextResponse.json({ ok: true, conversationId: result.conversationId });
}
