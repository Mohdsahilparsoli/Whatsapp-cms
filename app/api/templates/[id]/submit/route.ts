import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { toPublicTemplate } from "@/lib/templateMapper";
import { submitTemplateToMeta, toMetaLanguageCode } from "@/lib/metaTemplates";
import type { TemplateButtonKind, TemplateExtra, TemplateKind } from "@/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Real submission of a saved Custom Template to Meta's WhatsApp Business
 * Management API for review — see lib/metaTemplates.ts for why this exists
 * (it's the only way to combine a Call button with another button). Once
 * Meta approves it (tracked via /status here, or the
 * message_template_status_update webhook), sends of this template
 * automatically switch to the real type:"template" API — see
 * buildPayloadForContact in lib/queueProcessor.ts.
 */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const template = await prisma.customTemplate.findFirst({
    where: { id, clientId: auth.clientId },
  });
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  if (template.status !== "custom") {
    return NextResponse.json(
      { error: "Save the template (not as a draft) before submitting it to Meta." },
      { status: 400 }
    );
  }
  if (template.metaStatus === "pending") {
    return NextResponse.json({ error: "This template is already awaiting Meta's review." }, { status: 400 });
  }
  if (template.metaStatus === "approved") {
    return NextResponse.json({ error: "This template is already approved by Meta." }, { status: 400 });
  }

  const result = await submitTemplateToMeta(auth.clientId, {
    name: template.name,
    language: template.language,
    category: template.category,
    header: template.header,
    body: template.body,
    footer: template.footer,
    buttons: Array.isArray(template.buttons)
      ? (template.buttons as { kind: TemplateButtonKind; label: string; url: string }[])
      : [],
    mediaKind: template.mediaKind,
    mediaUrl: template.mediaUrl,
    origin: new URL(request.url).origin,
    parameterFormat: template.parameterFormat === "named" ? "named" : "positional",
    variables: template.variables,
    templateKind: template.templateKind as TemplateKind,
    extra: (template.extra ?? {}) as TemplateExtra,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const updated = await prisma.customTemplate.update({
    where: { id },
    data: {
      metaTemplateId: result.metaTemplateId,
      metaStatus: result.status,
      metaLanguageCode: toMetaLanguageCode(template.language),
      metaRejectionReason: null,
      submittedAt: new Date(),
    },
  });

  return NextResponse.json({ template: toPublicTemplate(updated) });
}
