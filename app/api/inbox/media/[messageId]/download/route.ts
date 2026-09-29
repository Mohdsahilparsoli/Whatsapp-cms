import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

type Params = { params: Promise<{ messageId: string }> };

/**
 * Streams an Inbox media file back with a real `Content-Disposition:
 * attachment` header, scoped to the caller's own client.
 *
 * In production, media is stored in Vercel Blob (see lib/fileStorage.ts),
 * which lives on a different origin (*.public.blob.vercel-storage.com).
 * Browsers only honor an <a download> attribute for same-origin URLs — for
 * a cross-origin href they ignore `download` and just navigate to it, which
 * is why clicking "Save" in the media viewer opened the file in a new tab
 * instead of downloading it. Proxying the bytes through our own origin with
 * an explicit attachment header makes the download actually happen.
 */
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { messageId } = await params;
  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, clientId: auth.clientId },
    select: { mediaUrl: true, mediaFileName: true },
  });
  if (!message?.mediaUrl) {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }

  const upstream = await fetch(message.mediaUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Failed to fetch media." }, { status: 502 });
  }

  const fileName = message.mediaFileName ?? "download";
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const contentLength = upstream.headers.get("content-length");

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
  });
  if (contentLength) headers.set("Content-Length", contentLength);

  return new NextResponse(upstream.body, { headers });
}
