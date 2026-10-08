import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";
import { uploadBufferForHandle } from "@/lib/metaTemplates";

const MAX_BYTES = 5 * 1024 * 1024; // Meta's limit for profile pictures

/**
 * Changes the WhatsApp Business profile photo: the image goes to Meta's
 * Resumable Upload API (needs META_APP_ID), and the handle it returns is
 * set as the profile's picture. JPEG or PNG, at least 640×640, max 5MB.
 */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const credentials = await getWhatsAppCredentials(auth.clientId);
  if (!credentials || credentials.source !== "client") {
    return NextResponse.json({ error: "Connect your own WhatsApp number first." }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an image first." }, { status: 400 });
  }
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    return NextResponse.json({ error: "The profile photo must be a JPEG or PNG." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "The photo must be 5MB or smaller." }, { status: 400 });
  }

  const uploaded = await uploadBufferForHandle(credentials.accessToken, Buffer.from(await file.arrayBuffer()), file.type);
  if (!uploaded.ok) return NextResponse.json({ error: uploaded.error }, { status: 502 });

  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${credentials.phoneNumberId}/whatsapp_business_profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", profile_picture_handle: uploaded.handle }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message ?? "Meta rejected the photo." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reach Meta's API." }, { status: 502 });
  }
}
