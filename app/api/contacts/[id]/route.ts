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

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const contact = await prisma.contact.findFirst({ where: { id, clientId: auth.clientId } });
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  return NextResponse.json({ contact: toPublicContact(contact) });
}

interface UpdateContactBody {
  name?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  consent?: Consent;
  /** Optional — only used when `consent` is actually changing (e.g. "Manual
   * — Consent page"). If omitted, the existing source is kept as-is. */
  consentSource?: string;
}

export async function PUT(request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const existing = await prisma.contact.findFirst({ where: { id, clientId: auth.clientId } });
  if (!existing) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  let body: UpdateContactBody;
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
    body.consent && CONSENT_VALUES.includes(body.consent) ? body.consent : existing.consent as Consent;

  const errors: Record<string, string> = {};
  if (!phone || phone.replace(/\D/g, "").length < 10) {
    errors.phone = "Enter a phone number with country code.";
  }
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  if (phone !== existing.phone) {
    const duplicate = await prisma.contact.findUnique({
      where: { clientId_phone: { clientId: auth.clientId, phone: phone! } },
    });
    if (duplicate) {
      return NextResponse.json(
        { errors: { phone: "A contact with this phone number already exists." } },
        { status: 409 }
      );
    }
  }

  const contact = await prisma.contact.update({
    where: { id },
    data: {
      name: name || null,
      phone: phone!,
      email: email || null,
      tags,
      consent,
      // Real audit trail: only touch these when consent actually changed,
      // so editing unrelated fields (name, tags, ...) never silently resets
      // when/why someone was opted in or out.
      ...(consent !== existing.consent
        ? {
            consentDate: new Date(),
            consentSource: body.consentSource?.trim() || existing.consentSource,
          }
        : {}),
    },
  });

  return NextResponse.json({ contact: toPublicContact(contact) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const existing = await prisma.contact.findFirst({ where: { id, clientId: auth.clientId } });
  if (!existing) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  await prisma.contact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
