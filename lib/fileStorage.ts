import "server-only";
import { put } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredFile {
  url: string;
}

/**
 * Saves a file where it will actually be readable back later.
 *
 * - **On Vercel** (or anywhere `BLOB_READ_WRITE_TOKEN` is set): uploads to
 *   Vercel Blob and returns its public URL. This is what makes uploads
 *   (Template media, Inbox photos/documents) actually work in production —
 *   Vercel's own filesystem is read-only/ephemeral per request, so writing
 *   to `public/uploads/...` there silently fails or vanishes on the next
 *   cold start.
 * - **Without that token** (local `npm run dev`, or a self-hosted server
 *   without Blob configured): falls back to writing under
 *   `public/uploads/<...pathSegments>`, served by Next.js as a static file
 *   — same behavior this app always had locally.
 *
 * `pathSegments` is the file's path, e.g. `["templates", clientId,
 * "abc123.jpg"]` — the last segment is the filename.
 */
export async function storeFile(
  buffer: Buffer,
  pathSegments: string[],
  contentType: string
): Promise<StoredFile> {
  const key = pathSegments.join("/");

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(key, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
    return { url: blob.url };
  }

  const dir = path.join(process.cwd(), "public", "uploads", ...pathSegments.slice(0, -1));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, pathSegments[pathSegments.length - 1]), buffer);
  return { url: `/uploads/${key}` };
}
