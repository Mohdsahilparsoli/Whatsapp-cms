import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

/** Parses a .csv, .xlsx, or .xls file (in the browser) into headers + rows. */
export async function parseContactFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") return parseCsv(file);
  if (ext === "xlsx" || ext === "xls") return parseExcel(file);
  throw new Error("Unsupported file type — upload a .csv, .xlsx, or .xls file.");
}

function parseCsv(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = (results.meta.fields ?? []).map((h) => h.trim()).filter(Boolean);
        const rows = results.data.map((row) => {
          const clean: Record<string, string> = {};
          for (const h of headers) clean[h] = (row[h] ?? "").toString().trim();
          return clean;
        });
        resolve({ headers, rows });
      },
      error: (err: Error) => reject(err),
    });
  });
}

async function parseExcel(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const headers = raw.length > 0 ? Object.keys(raw[0]) : [];
  const rows = raw.map((row) => {
    const clean: Record<string, string> = {};
    for (const h of headers) clean[h] = String(row[h] ?? "").trim();
    return clean;
  });
  return { headers, rows };
}

export type ContactField = "phone" | "name" | "email" | "tags" | "consent";

const FIELD_ALIASES: Record<ContactField, string[]> = {
  phone: ["phone", "phone number", "mobile", "mobile number", "whatsapp", "whatsapp number", "contact number"],
  name: ["name", "full name", "contact name", "customer name"],
  email: ["email", "email address", "e-mail"],
  tags: ["tags", "tag", "labels", "segment"],
  consent: ["consent", "consent status", "opt-in", "opt in", "opted in", "subscription status"],
};

/** Best-effort auto mapping from file headers to our fields, by common name variants. */
export function guessColumnMapping(headers: string[]): Record<ContactField, string | null> {
  const lowerHeaders = headers.map((h) => h.toLowerCase());
  const result = { phone: null, name: null, email: null, tags: null, consent: null } as Record<
    ContactField,
    string | null
  >;

  (Object.keys(FIELD_ALIASES) as ContactField[]).forEach((field) => {
    const idx = lowerHeaders.findIndex((h) => FIELD_ALIASES[field].includes(h));
    if (idx !== -1) result[field] = headers[idx];
  });

  return result;
}
