import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { toPublicTemplate } from "@/lib/templateMapper";
import {
  normalizeTemplateInput,
  validateTemplateFields,
  type TemplateInputBody,
} from "@/lib/templateValidation";

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const templates = await prisma.customTemplate.findMany({
    where: { clientId: auth.clientId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ templates: templates.map(toPublicTemplate) });
}

export async function POST(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: TemplateInputBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const t = normalizeTemplateInput(body);
  const errors = validateTemplateFields(t);

  if (!errors.name && t.name) {
    const existing = await prisma.customTemplate.findFirst({
      where: { clientId: auth.clientId, name: { equals: t.name, mode: "insensitive" } },
    });
    if (existing) errors.name = "You already have a template with this name.";
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const template = await prisma.customTemplate.create({
    data: {
      clientId: auth.clientId,
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
    },
  });

  return NextResponse.json({ template: toPublicTemplate(template) }, { status: 201 });
}
