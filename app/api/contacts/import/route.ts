import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

interface RawImportRow {
  phone?: string;
  name?: string;
  email?: string;
  /** Raw cell value(s) — comma-separated if the mapped column has several. */
  tags?: string;
  /** Raw cell value — normalized against common variants below. */
  consent?: string;
}

const CONSENT_ALIASES: Record<string, "opted_in" | "opted_out" | "pending"> = {
  opted_in: "opted_in",
  "opted-in": "opted_in",
  optin: "opted_in",
  yes: "opted_in",
  true: "opted_in",
  subscribed: "opted_in",
  opted_out: "opted_out",
  "opted-out": "opted_out",
  optout: "opted_out",
  no: "opted_out",
  false: "opted_out",
  unsubscribed: "opted_out",
  pending: "pending",
};

/** Import-specific defaults: an empty/unrecognized consent becomes
 * "opted_in", and an empty tags cell becomes the "normal" tag — this is
 * deliberately different from the plain Add Contact form (Phase A), which
 * leaves both blank when not given. */
function normalizeConsent(raw: string | undefined): "opted_in" | "opted_out" | "pending" {
  const key = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return CONSENT_ALIASES[key] ?? "opted_in";
}

function normalizeTags(raw: string | undefined): string[] {
  const cleaned = (raw ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const unique = Array.from(new Set(cleaned));
  return unique.length > 0 ? unique : ["normal"];
}

function isValidPhone(phone: string) {
  return phone.replace(/\D/g, "").length >= 10;
}

function isValidEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email);
}

export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: { rows?: RawImportRow[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawRows = Array.isArray(body.rows) ? body.rows : [];
  if (rawRows.length === 0) {
    return NextResponse.json({ error: "No rows to import." }, { status: 400 });
  }
  if (rawRows.length > 20000) {
    return NextResponse.json({ error: "That file has too many rows (max 20,000)." }, { status: 400 });
  }

  let invalid = 0;
  let invalidEmail = 0;
  const byPhone = new Map<
    string,
    { name: string | null; phone: string; email: string | null; tags: string[]; consent: "opted_in" | "opted_out" | "pending" }
  >();

  for (const row of rawRows) {
    const phone = row.phone?.trim() ?? "";
    if (!isValidPhone(phone)) {
      invalid += 1;
      continue;
    }

    let email = row.email?.trim() || null;
    if (email && !isValidEmail(email)) {
      invalidEmail += 1;
      email = null;
    }

    // Last occurrence of a phone in the file wins — matches "the latest row
    // for this contact" rather than silently keeping stale earlier data.
    byPhone.set(phone, {
      name: row.name?.trim() || null,
      phone,
      email,
      tags: normalizeTags(row.tags),
      consent: normalizeConsent(row.consent),
    });
  }

  const duplicatesInFile = rawRows.length - invalid - byPhone.size;
  const dedupedRows = Array.from(byPhone.values());

  let imported = 0;
  if (dedupedRows.length > 0) {
    const result = await prisma.contact.createMany({
      data: dedupedRows.map((r) => ({ ...r, clientId: auth.clientId })),
      skipDuplicates: true,
    });
    imported = result.count;
  }

  const duplicatesExisting = dedupedRows.length - imported;

  return NextResponse.json({
    totalRows: rawRows.length,
    invalid,
    invalidEmail,
    duplicatesInFile,
    duplicatesExisting,
    imported,
  });
}
