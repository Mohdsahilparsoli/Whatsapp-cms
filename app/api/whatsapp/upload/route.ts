import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireClient } from "@/lib/apiGuards";

const MAX_BYTES = 16 * 1024 * 1024; // WhatsApp's own document limit is 100MB, but keep this modest for a local-disk demo setup

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
 * Same local-disk-only tradeoff as /api/templates/media: files are written
 * under public/uploads/inbox/<clientId>/, which only persists on a
 * self-hosted server (not serverless). Additionally — unlike template
 * media, which is only ever *displayed* in this app — this file's URL gets
 * sent to Meta for Meta's servers to fetch, so it only actually works if
 * this app is reachable on a public URL (same requirement as the delivery
 * webhook; ngrok for local dev). On localhost, the upload succeeds but
 * Meta's send will fail to fetch the media — see send-media/route.ts.
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
  const dir = path.join(process.cwd(), "public", "uploads", "inbox", auth.clientId);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, fileName), buffer);

  const url = `/uploads/inbox/${auth.clientId}/${fileName}`;
  return NextResponse.json({ url, fileName: file.name, kind });
}
