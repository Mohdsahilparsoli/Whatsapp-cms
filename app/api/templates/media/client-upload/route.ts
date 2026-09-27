import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireClient } from "@/lib/apiGuards";

/**
 * Authorizes CLIENT-SIDE (browser → Vercel Blob, directly) uploads for
 * template media — see components/templates/TemplateBuilder.tsx's
 * handleFileSelected, which calls @vercel/blob/client's upload() against
 * this route instead of posting the file body through our own Next.js
 * route handler.
 *
 * Why this exists: the old app/api/templates/media/route.ts proxied the
 * whole file through a Next.js Serverless Function, and Vercel enforces a
 * hard ~4.5MB request body limit on those regardless of our own MAX_BYTES
 * checks — any video (or a bigger image) over that silently failed the
 * fetch itself ("Could not reach the server. Please try again."), before
 * our code ever got a chance to return a real error. A client upload goes
 * straight from the browser to Blob storage; this route only ever
 * authorizes that transfer and hands back a short-lived, scoped token — no
 * file bytes pass through it, so there's no Serverless Function body limit
 * in the way. We don't use handleUpload's onUploadCompleted callback (no
 * callbackUrl is generated below), so Vercel Blob never calls back into
 * this route after the upload — the browser itself is what receives the
 * final blob URL, exactly like the old route's response did.
 */

const ALLOWED_CONTENT_TYPES: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  document: ["application/pdf"],
};

// Real Meta Cloud API media-size ceilings (images/documents 100MB, video
// 16MB) are far above what a WhatsApp template needs — this app's own
// long-standing 10MB cap stays as the ceiling for images/documents, with a
// little more headroom for video since a few seconds of real footage
// routinely lands between 4–10MB.
const MAX_BYTES: Record<string, number> = {
  image: 10 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 10 * 1024 * 1024,
};

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const kind = clientPayload && clientPayload in ALLOWED_CONTENT_TYPES ? clientPayload : "image";
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES[kind],
          maximumSizeInBytes: MAX_BYTES[kind],
          addRandomSuffix: false,
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not authorize the upload." },
      { status: 400 }
    );
  }
}
