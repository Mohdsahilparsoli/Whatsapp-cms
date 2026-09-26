import { NextResponse } from "next/server";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireClient } from "@/lib/apiGuards";
import { storeFile } from "@/lib/fileStorage";

const MAX_BYTES = 16 * 1024 * 1024; // WhatsApp's own document limit is 100MB, but keep this modest

const ALLOWED: Record<string, { mimeTypes: string[]; extensions: string[] }> = {
  image: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
  },
  document: {
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ],
    extensions: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt"],
  },
};

/**
 * Uploads go to Vercel Blob when deployed there (or anywhere
 * BLOB_READ_WRITE_TOKEN is set), so they actually persist — see
 * lib/fileStorage.ts. Falls back to local disk for local dev.
 *
 * Unlike template media, which is only ever *displayed* in this app, this
 * file's URL gets sent to Meta for Meta's own servers to fetch — so it only
 * actually works if that URL is one Meta can reach: Vercel Blob URLs always
 * qualify; a local-disk URL only works if this app itself is on a public
 * URL too (ngrok for local dev). See send-media/route.ts.
 */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is larger than 16MB." }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  const kind: "image" | "document" | null = ALLOWED.image.extensions.includes(ext)
    ? "image"
    : ALLOWED.document.extensions.includes(ext)
      ? "document"
      : null;

  if (!kind) {
    return NextResponse.json(
      { error: "Unsupported file type. Send an image (jpg/png/webp) or document (pdf/doc/docx/xls/xlsx/txt)." },
      { status: 400 }
    );
  }

  const fileName = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  let stored;
  try {
    stored = await storeFile(buffer, ["inbox", auth.clientId, fileName], file.type || "application/octet-stream");
  } catch (err) {
    console.error("whatsapp/upload: storeFile failed", err);
    return NextResponse.json({ error: "Could not save the file. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ url: stored.url, fileName: file.name, kind });
}
