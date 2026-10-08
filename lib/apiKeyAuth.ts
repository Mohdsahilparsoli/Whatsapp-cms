import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** A new random key: `wak_` + 32 random bytes (base64url). Shown once, stored hashed. */
export function generateApiKey(): { key: string; prefix: string; keyHash: string } {
  const key = `wak_${randomBytes(32).toString("base64url")}`;
  return { key, prefix: key.slice(0, 12), keyHash: hashApiKey(key) };
}

/**
 * Authenticates a public API call: `Authorization: Bearer wak_…`. Returns the
 * owning client's id, or a 401 response. Revoked keys never match.
 */
export async function requireApiKey(request: Request): Promise<{ clientId: string } | NextResponse> {
  const header = request.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key.startsWith("wak_")) {
    return NextResponse.json({ error: "Missing or invalid API key. Send it as 'Authorization: Bearer wak_…'." }, { status: 401 });
  }
  const row = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(key) } });
  if (!row || row.revokedAt) {
    return NextResponse.json({ error: "Missing or invalid API key." }, { status: 401 });
  }
  // Best-effort "last used" stamp; never blocks the call.
  prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { clientId: row.clientId };
}
