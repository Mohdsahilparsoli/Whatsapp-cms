import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireClient } from "@/lib/apiGuards";

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
 * Files are written straight to this server's local disk, under
 * public/uploads/templates/<clientId>/ — which Next.js then serves as a
 * static file at the returned `url`. There is no cloud storage (S3, etc.)
 * here on purpose, to keep the local-Postgres-only setup simple. This means
 * uploads only work on a persistent, self-hosted server (fine for
 * `npm run dev` / `npm start`) — not on a stateless/serverless host like
 * Vercel, where the filesystem doesn't persist between requests.
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
  const dir = path.join(process.cwd(), "public", "uploads", "templates", auth.clientId);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, fileName), buffer);

  const url = `/uploads/templates/${auth.clientId}/${fileName}`;
  return NextResponse.json({ url, fileName: file.name });
}
