import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { PAYMENT_GATEWAYS } from "@/lib/payments";

/** Which payment gateway + WhatsApp Manager payment-configuration this client's orders use. */
export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;
  const account = await prisma.whatsAppAccount.findUnique({
    where: { clientId: auth.clientId },
    select: { paymentGateway: true, paymentConfigName: true },
  });
  return NextResponse.json({
    paymentGateway: account?.paymentGateway ?? "razorpay",
    paymentConfigName: account?.paymentConfigName ?? "",
  });
}

export async function PUT(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: { paymentGateway?: string; paymentConfigName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const gateway = body.paymentGateway as (typeof PAYMENT_GATEWAYS)[number];
  const configName = body.paymentConfigName?.trim() ?? "";
  if (!PAYMENT_GATEWAYS.includes(gateway)) {
    return NextResponse.json({ error: "Choose Razorpay or PayU." }, { status: 400 });
  }
  if (!configName) {
    return NextResponse.json({ error: "Enter the payment configuration name from WhatsApp Manager." }, { status: 400 });
  }

  const account = await prisma.whatsAppAccount.findUnique({ where: { clientId: auth.clientId } });
  if (!account) return NextResponse.json({ error: "Connect your WhatsApp number first." }, { status: 400 });
  await prisma.whatsAppAccount.update({
    where: { clientId: auth.clientId },
    data: { paymentGateway: gateway, paymentConfigName: configName },
  });
  return NextResponse.json({ ok: true });
}
