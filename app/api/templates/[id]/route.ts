import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { toPublicTemplate } from "@/lib/templateMapper";
import {
  normalizeTemplateInput,
  validateTemplateFields,
  type TemplateInputBody,
} from "@/lib/templateValidation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const template = await prisma.customTemplate.findFirst({
    where: { id, clientId: auth.clientId },
  });
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  return NextResponse.json({ template: toPublicTemplate(template) });
}

export async function PUT(request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const existing = await prisma.customTemplate.findFirst({
    where: { id, clientId: auth.clientId },
  });
  if (!existing) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  let body: TemplateInputBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const t = normalizeTemplateInput(body);
  const errors = validateTemplateFields(t);

  if (!errors.name && t.name) {
    const duplicate = await prisma.customTemplate.findFirst({
      where: {
        clientId: auth.clientId,
        name: { equals: t.name, mode: "insensitive" },
        NOT: { id },
      },
    });
    if (duplicate) errors.name = "You already have a template with this name.";
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  // Editing a template that was already submitted/approved invalidates that
  // submission — Meta approves an exact snapshot of the text/buttons, and
  // buildTemplateSendPayload (lib/metaTemplates.ts) relies on our stored
  // header/body matching what Meta has on file. Rather than silently
  // sending stale or mismatched content, any edit resets Meta status back
  // to "not_submitted" so the client has to resubmit (and re-review) the
  // new version before it can be sent as a real template again.
  const resetMeta = existing.metaStatus !== "not_submitted";

  const template = await prisma.customTemplate.update({
    where: { id },
    data: {
      name: t.name,
      language: t.language,
      category: t.category,
      status: t.isDraft ? "draft" : "custom",
      header: t.header,
      body: t.body,
      footer: t.footer,
      mediaKind: t.mediaKind,
      mediaUrl: t.mediaUrl,
      mediaFileName: t.mediaFileName,
      buttons: t.buttons,
      variables: t.variables,
      parameterFormat: t.parameterFormat,
      templateKind: t.templateKind,
      extra: t.extra as object,
      ...(resetMeta
        ? {
            metaStatus: "not_submitted",
            metaTemplateId: null,
            metaLanguageCode: null,
            metaRejectionReason: null,
            submittedAt: null,
          }
        : {}),
    },
  });

  return NextResponse.json({ template: toPublicTemplate(template) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const existing = await prisma.customTemplate.findFirst({
    where: { id, clientId: auth.clientId },
  });
  if (!existing) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  await prisma.customTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
