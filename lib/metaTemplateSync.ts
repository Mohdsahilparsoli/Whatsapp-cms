import "server-only";
import { prisma } from "@/lib/db";
import { getWhatsAppCredentials } from "@/lib/whatsappCredentials";
import { normalizeMetaStatus } from "@/lib/metaTemplates";

/**
 * Full template sync FROM Meta: pulls every Message Template on the
 * client's WhatsApp Business Account (GET /{waba-id}/message_templates) and
 * mirrors them into CustomTemplate, so templates created in Meta's own
 * Business Manager (or by another tool) show up here and can be used in
 * campaigns — instead of only tracking templates this CMS submitted itself,
 * one status check at a time.
 *
 * Existing rows are matched by metaTemplateId first; for those, status +
 * content are refreshed from Meta (Meta is the source of truth once a
 * template is submitted). A brand-new Meta template is imported as a
 * "custom" template. Anything this app can't faithfully send is SKIPPED with
 * a reason rather than imported half-broken (Authentication/OTP templates,
 * named {{variables}}, carousel and other newer component types, and a
 * same-name template in another language, since a client's template names
 * are unique here).
 *
 * Never deletes anything: a template removed on Meta's side stays here.
 */

const LANGUAGE_NAMES: Record<string, string> = {
  en_US: "English",
  en: "English",
  en_GB: "English",
  hi: "Hindi",
  es: "Spanish",
  pt_BR: "Portuguese",
  ar: "Arabic",
  fr: "French",
  de: "German",
  id: "Indonesian",
  mr: "Marathi",
  ta: "Tamil",
  bn: "Bengali",
};

interface MetaButton {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
}

interface MetaComponent {
  type?: string;
  format?: string;
  text?: string;
  buttons?: MetaButton[];
}

interface MetaTemplate {
  id: string;
  name: string;
  status?: string;
  category?: string;
  language?: string;
  rejected_reason?: string;
  parameter_format?: string;
  components?: MetaComponent[];
}

export interface SyncResult {
  imported: number;
  updated: number;
  skipped: { name: string; reason: string }[];
}

export type SyncOutcome = { ok: true; result: SyncResult } | { ok: false; error: string; status: number };

function placeholderCount(text: string): number {
  const matches = text.match(/\{\{\s*(\d+)\s*\}\}/g) ?? [];
  return matches.reduce((max, m) => Math.max(max, Number(m.replace(/\D/g, ""))), 0);
}

function hasNamedPlaceholder(text: string): boolean {
  return /\{\{\s*[A-Za-z_]/.test(text);
}

/** Turns one Meta template into the CustomTemplate columns, or a skip reason. */
function mapTemplate(
  t: MetaTemplate
): { ok: true; data: MappedTemplate } | { ok: false; reason: string } {
  const category =
    t.category === "MARKETING" ? "Marketing" : t.category === "UTILITY" ? "Utility" : null;
  if (!category) {
    return {
      ok: false,
      reason:
        t.category === "AUTHENTICATION"
          ? "Authentication (OTP) templates can't be sent from campaigns"
          : "Unsupported template category",
    };
  }

  const components = t.components ?? [];
  const unsupported = components.find((c) => !["HEADER", "BODY", "FOOTER", "BUTTONS"].includes(c.type ?? ""));
  if (unsupported) return { ok: false, reason: `Uses an unsupported component (${unsupported.type})` };

  const body = components.find((c) => c.type === "BODY")?.text;
  if (!body) return { ok: false, reason: "Has no body text" };

  const header = components.find((c) => c.type === "HEADER");
  const footer = components.find((c) => c.type === "FOOTER")?.text ?? null;
  const buttonList = components.find((c) => c.type === "BUTTONS")?.buttons ?? [];

  const allText = [body, header?.text ?? "", footer ?? ""].join(" ");
  if (t.parameter_format === "NAMED" || hasNamedPlaceholder(allText)) {
    return { ok: false, reason: "Uses named {{variables}} (only {{1}}, {{2}}… are supported)" };
  }

  let mediaKind: "none" | "image" | "video" | "document" = "none";
  let headerText: string | null = null;
  if (header) {
    const format = (header.format ?? "TEXT").toUpperCase();
    if (format === "TEXT") headerText = header.text ?? null;
    else if (format === "IMAGE") mediaKind = "image";
    else if (format === "VIDEO") mediaKind = "video";
    else if (format === "DOCUMENT") mediaKind = "document";
    else return { ok: false, reason: `Unsupported header type (${format})` };
  }

  const buttons: { id: string; kind: "url" | "call" | "quick_reply"; label: string; url: string }[] = [];
  for (const [i, b] of buttonList.entries()) {
    const label = b.text ?? "";
    if (b.type === "URL") buttons.push({ id: `btn-${i}`, kind: "url", label, url: b.url ?? "" });
    else if (b.type === "PHONE_NUMBER") buttons.push({ id: `btn-${i}`, kind: "call", label, url: b.phone_number ?? "" });
    else if (b.type === "QUICK_REPLY") buttons.push({ id: `btn-${i}`, kind: "quick_reply", label, url: "" });
    else return { ok: false, reason: `Unsupported button type (${b.type})` };
  }

  const count = Math.max(placeholderCount(body), placeholderCount(headerText ?? ""));
  const variables = Array.from({ length: count }, (_, i) => (i === 0 ? "Name" : `Variable ${i + 1}`));

  const languageCode = t.language ?? "en_US";
  return {
    ok: true,
    data: {
      name: t.name,
      language: LANGUAGE_NAMES[languageCode] ?? languageCode,
      category,
      header: headerText,
      body,
      footer,
      mediaKind,
      buttons,
      variables,
      metaTemplateId: t.id,
      metaStatus: normalizeMetaStatus(t.status),
      metaLanguageCode: languageCode,
      metaRejectionReason:
        t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
    },
  };
}

interface MappedTemplate {
  name: string;
  language: string;
  category: "Marketing" | "Utility";
  header: string | null;
  body: string;
  footer: string | null;
  mediaKind: "none" | "image" | "video" | "document";
  buttons: { id: string; kind: "url" | "call" | "quick_reply"; label: string; url: string }[];
  variables: string[];
  metaTemplateId: string;
  metaStatus: ReturnType<typeof normalizeMetaStatus>;
  metaLanguageCode: string;
  metaRejectionReason: string | null;
}

async function fetchAllMetaTemplates(wabaId: string, accessToken: string): Promise<MetaTemplate[]> {
  const all: MetaTemplate[] = [];
  let url: string | null =
    `https://graph.facebook.com/v25.0/${wabaId}/message_templates` +
    `?fields=id,name,status,category,language,rejected_reason,parameter_format,components&limit=100`;

  // Follow Meta's cursor pagination, capped so a bad response can't loop forever.
  for (let page = 0; url && page < 20; page++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data: { data?: MetaTemplate[]; paging?: { next?: string }; error?: { message?: string } } = await res
      .json()
      .catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message ?? "Meta rejected the request.");
    all.push(...(data.data ?? []));
    url = data.paging?.next ?? null;
  }
  return all;
}

export async function syncTemplatesFromMeta(clientId: string): Promise<SyncOutcome> {
  const credentials = await getWhatsAppCredentials(clientId);
  if (!credentials) {
    return { ok: false, status: 400, error: "No WhatsApp number available — connect one in WhatsApp Account Setup first." };
  }
  if (!credentials.wabaId) {
    return {
      ok: false,
      status: 400,
      error: "Syncing needs your WhatsApp Business Account ID — reconnect your account in WhatsApp Account Setup.",
    };
  }

  let metaTemplates: MetaTemplate[];
  try {
    metaTemplates = await fetchAllMetaTemplates(credentials.wabaId, credentials.accessToken);
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `Could not load templates from Meta: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  const existing = await prisma.customTemplate.findMany({
    where: { clientId },
    select: { id: true, name: true, metaTemplateId: true, mediaKind: true },
  });
  const byMetaId = new Map<string, (typeof existing)[number]>();
  const byName = new Map<string, (typeof existing)[number]>();
  for (const row of existing) {
    if (row.metaTemplateId) byMetaId.set(row.metaTemplateId, row);
    byName.set(row.name, row);
  }

  const result: SyncResult = { imported: 0, updated: 0, skipped: [] };

  for (const t of metaTemplates) {
    const mapped = mapTemplate(t);
    if (!mapped.ok) {
      result.skipped.push({ name: t.name, reason: mapped.reason });
      continue;
    }
    const d = mapped.data;

    const known = byMetaId.get(d.metaTemplateId);
    if (known) {
      await prisma.customTemplate.update({
        where: { id: known.id },
        data: {
          language: d.language,
          category: d.category,
          header: d.header,
          body: d.body,
          footer: d.footer,
          buttons: d.buttons,
          variables: d.variables,
          metaStatus: d.metaStatus,
          metaLanguageCode: d.metaLanguageCode,
          metaRejectionReason: d.metaRejectionReason,
          // Media files live on our side (Meta only returns an upload
          // handle), so only the KIND follows Meta when it changed — the
          // file itself is never overwritten or cleared.
          ...(known.mediaKind !== d.mediaKind ? { mediaKind: d.mediaKind } : {}),
        },
      });
      result.updated += 1;
      continue;
    }

    if (byName.has(d.name)) {
      result.skipped.push({
        name: t.name,
        reason: "A different template with this name already exists here (or it's the same name in another language)",
      });
      continue;
    }

    const created = await prisma.customTemplate.create({
      data: {
        clientId,
        name: d.name,
        language: d.language,
        category: d.category,
        status: "custom",
        header: d.header,
        body: d.body,
        footer: d.footer,
        mediaKind: d.mediaKind,
        buttons: d.buttons,
        variables: d.variables,
        metaTemplateId: d.metaTemplateId,
        metaStatus: d.metaStatus,
        metaLanguageCode: d.metaLanguageCode,
        metaRejectionReason: d.metaRejectionReason,
        submittedAt: new Date(),
      },
    });
    byName.set(d.name, { id: created.id, name: d.name, metaTemplateId: d.metaTemplateId, mediaKind: d.mediaKind });
    byMetaId.set(d.metaTemplateId, byName.get(d.name)!);
    result.imported += 1;
  }

  return { ok: true, result };
}
