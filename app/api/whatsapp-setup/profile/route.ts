import { NextResponse } from "next/server";
import { requireClient } from "@/lib/apiGuards";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";

/**
 * The public WhatsApp Business Profile customers see (about, description,
 * address, email, websites, category). Read and written straight against
 * Meta's /{phone-number-id}/whatsapp_business_profile. Only the client's own
 * connected number — never the shared test number.
 */
const VERTICALS = [
  "UNDEFINED", "OTHER", "AUTO", "BEAUTY", "APPAREL", "EDU", "ENTERTAIN", "EVENT_PLAN", "FINANCE", "GROCERY",
  "GOVT", "HOTEL", "HEALTH", "NONPROFIT", "PROF_SERVICES", "RETAIL", "TRAVEL", "RESTAURANT", "NOT_A_BIZ",
];

async function ownCredentials(clientId: string) {
  const credentials = await getWhatsAppCredentials(clientId);
  return credentials?.source === "client" ? credentials : null;
}

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const credentials = await ownCredentials(auth.clientId);
  if (!credentials) return NextResponse.json({ error: "Connect your own WhatsApp number first." }, { status: 400 });

  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${credentials.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
      { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message ?? "Could not load the profile from Meta." }, { status: 502 });
    }
    const p = data.data?.[0] ?? {};
    return NextResponse.json({
      profile: {
        about: p.about ?? "",
        address: p.address ?? "",
        description: p.description ?? "",
        email: p.email ?? "",
        websites: p.websites ?? [],
        vertical: p.vertical ?? "UNDEFINED",
        profilePictureUrl: p.profile_picture_url ?? null,
      },
      verticals: VERTICALS,
    });
  } catch {
    return NextResponse.json({ error: "Could not reach Meta's API." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const credentials = await ownCredentials(auth.clientId);
  if (!credentials) return NextResponse.json({ error: "Connect your own WhatsApp number first." }, { status: 400 });

  let body: { about?: string; address?: string; description?: string; email?: string; websites?: string[]; vertical?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const about = body.about?.trim() ?? "";
  const address = body.address?.trim() ?? "";
  const description = body.description?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const websites = (body.websites ?? []).map((w) => w.trim()).filter(Boolean);

  if (about.length > 139) return NextResponse.json({ error: "About must be 139 characters or fewer." }, { status: 400 });
  if (address.length > 256) return NextResponse.json({ error: "Address must be 256 characters or fewer." }, { status: 400 });
  if (description.length > 512) return NextResponse.json({ error: "Description must be 512 characters or fewer." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (websites.length > 2) return NextResponse.json({ error: "WhatsApp allows at most 2 websites." }, { status: 400 });
  if (websites.some((w) => !/^https?:\/\//i.test(w))) {
    return NextResponse.json({ error: "Websites must start with http:// or https://." }, { status: 400 });
  }
  const vertical = body.vertical && VERTICALS.includes(body.vertical) ? body.vertical : undefined;

  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/${credentials.phoneNumberId}/whatsapp_business_profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        about: about || undefined,
        address,
        description,
        email,
        websites,
        ...(vertical ? { vertical } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message ?? "Meta rejected the profile update." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reach Meta's API." }, { status: 502 });
  }
}
