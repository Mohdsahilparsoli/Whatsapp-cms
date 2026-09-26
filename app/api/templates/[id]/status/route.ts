import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { toPublicTemplate } from "@/lib/templateMapper";
import { fetchTemplateStatusFromMeta } from "@/lib/metaTemplates";

type Params = { params: Promise<{ id: string }> };

/**
 * Manually re-checks a submitted template's real approval status with Meta
 * — a backstop for the "Check status" button when the
 * message_template_status_update webhook isn't configured/reachable yet
 * (same real-world caveat as delivery/read receipts — see
 * app/api/webhooks/meta/route.ts).
 */
export async function POST(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const template = await prisma.customTemplate.findFirst({
    where: { id, clientId: auth.clientId },
  });
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  if (!template.metaTemplateId) {
    return NextResponse.json(
      { error: "This template hasn't been submitted to Meta yet." },
      { status: 400 }
    );
  }

  const result = await fetchTemplateStatusFromMeta(auth.clientId, template.metaTemplateId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const updated = await prisma.customTemplate.update({
    where: { id },
    data: {
      metaStatus: result.status,
      metaRejectionReason: result.rejectionReason,
    },
  });

  return NextResponse.json({ template: toPublicTemplate(updated) });
}
