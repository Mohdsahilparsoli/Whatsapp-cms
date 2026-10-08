import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const rows = await prisma.paymentRequest.findMany({
    where: { clientId: auth.clientId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({
    payments: rows.map((p) => ({
      id: p.id,
      referenceId: p.referenceId,
      customerPhone: p.customerPhone,
      customerName: p.customerName,
      amountPaise: p.amountPaise,
      status: p.status,
      orderStatus: p.orderStatus,
      items: p.items,
      paidAt: p.paidAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}
