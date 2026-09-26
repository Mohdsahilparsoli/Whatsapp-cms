import { NextResponse } from "next/server";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireClient } from "@/lib/apiGuards";
import { storeFile } from "@/lib/fileStorage";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_TYPES: Record<string, { mimeTypes: string[]; extensions: string[] }> = {
  image: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
  },
  video: {
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
    extensions: [".mp4", ".webm", ".mov"],
  },
  document: {
    mimeTypes: ["application/pdf"],
    extensions: [".pdf"],
  },
};

/**
 * Uploads go to Vercel Blob when this app is deployed there (or anywhere
 * BLOB_READ_WRITE_TOKEN is set) so they actually persist and are fetchable
 * by Meta — see lib/fileStorage.ts. Falls back to local disk for
 * `npm run dev` / a self-hosted server without Blob configured.
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

  const kind = formData.get("kind");
  const file = formData.get("file");

  if (typeof kind !== "string" || !(kind in ALLOWED_TYPES)) {
    return NextResponse.json({ error: "kind must be image, video, or document." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is larger than 10MB." }, { status: 400 });
  }

  const allowed = ALLOWED_TYPES[kind];
  const ext = path.extname(file.name).toLowerCase();
  const mimeOk = allowed.mimeTypes.includes(file.type);
  const extOk = allowed.extensions.includes(ext);
  if (!mimeOk && !extOk) {
    return NextResponse.json(
      { error: `That file doesn't look like a ${kind} (${allowed.extensions.join(", ")}).` },
      { status: 400 }
    );
  }

  const safeExt = extOk ? ext : allowed.extensions[0];
  const fileName = `${randomUUID()}${safeExt}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  let stored;
  try {
    stored = await storeFile(buffer, ["templates", auth.clientId, fileName], file.type || "application/octet-stream");
  } catch (err) {
    console.error("templates/media: storeFile failed", err);
    return NextResponse.json({ error: "Could not save the file. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ url: stored.url, fileName: file.name });
}
