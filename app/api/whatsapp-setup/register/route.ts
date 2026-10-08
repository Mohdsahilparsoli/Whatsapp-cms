import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";

/**
 * Number registration + two-step verification PIN, straight to Meta:
 *   request_code → SMS/voice code to the number
 *   verify_code  → confirm that code
 *   register     → register the number for Cloud API with a 6-digit PIN
 *                  (also how the PIN is set or changed)
 */
export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const credentials = await getWhatsAppCredentials(auth.clientId);
  if (!credentials || credentials.source !== "client") {
    return NextResponse.json({ error: "Connect your own WhatsApp number first." }, { status: 400 });
  }

  let body: { action?: string; pin?: string; code?: string; codeMethod?: string; language?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const base = `https://graph.facebook.com/v25.0/${credentials.phoneNumberId}`;
  let path: string;
  let payload: Record<string, unknown>;

  if (body.action === "request_code") {
    const method = body.codeMethod === "VOICE" ? "VOICE" : "SMS";
    path = "request_code";
    payload = { code_method: method, language: body.language?.trim() || "en_US" };
  } else if (body.action === "verify_code") {
    const code = body.code?.replace(/\D/g, "") ?? "";
    if (code.length !== 6) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
    path = "verify_code";
    payload = { code };
  } else if (body.action === "register") {
    const pin = body.pin?.replace(/\D/g, "") ?? "";
    if (pin.length !== 6) return NextResponse.json({ error: "The PIN must be exactly 6 digits." }, { status: 400 });
    path = "register";
    payload = { messaging_product: "whatsapp", pin };
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  try {
    const res = await fetch(`${base}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message ?? "Meta rejected the request." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reach Meta's API." }, { status: 502 });
  }
}
