import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { toPublicContact } from "@/lib/contactMapper";

const CONSENT_VALUES = ["opted_in", "opted_out", "pending"] as const;
type Consent = (typeof CONSENT_VALUES)[number];

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const cleaned = input
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const contacts = await prisma.contact.findMany({
    where: { clientId: auth.clientId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ contacts: contacts.map(toPublicContact) });
}

interface CreateContactBody {
  name?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  consent?: Consent;
}

export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: CreateContactBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const phone = body.phone?.trim();
  const email = body.email?.trim();
  const tags = normalizeTags(body.tags);
  const consent: Consent =
    body.consent && CONSENT_VALUES.includes(body.consent) ? body.consent : "opted_in";

  const errors: Record<string, string> = {};
  // Phone is the only required field — see ContactForm / Contacts Phase A scope.
  if (!phone || phone.replace(/\D/g, "").length < 10) {
    errors.phone = "Enter a phone number with country code.";
  }
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const existing = await prisma.contact.findUnique({
    where: { clientId_phone: { clientId: auth.clientId, phone: phone! } },
  });
  if (existing) {
    return NextResponse.json(
      { errors: { phone: "A contact with this phone number already exists." } },
      { status: 409 }
    );
  }

  const contact = await prisma.contact.create({
    data: {
      clientId: auth.clientId,
      name: name || null,
      phone: phone!,
      email: email || null,
      tags,
      consent,
    },
  });

  return NextResponse.json({ contact: toPublicContact(contact) }, { status: 201 });
}
