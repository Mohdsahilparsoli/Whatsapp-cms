import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { getQueueSettings } from "@/lib/queueSettings";

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const settings = await getQueueSettings(auth.clientId);
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  let body: { messagesPerMinute?: number; batchSize?: number; maxRetryAttempts?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const messagesPerMinute = Number(body.messagesPerMinute);
  const batchSize = Number(body.batchSize);
  const maxRetryAttempts = Number(body.maxRetryAttempts);

  const errors: Record<string, string> = {};
  if (!Number.isFinite(messagesPerMinute) || messagesPerMinute < 1 || messagesPerMinute > 1000)
    errors.messagesPerMinute = "Enter a number between 1 and 1000.";
  if (!Number.isFinite(batchSize) || batchSize < 1 || batchSize > 1000)
    errors.batchSize = "Enter a number between 1 and 1000.";
  if (!Number.isFinite(maxRetryAttempts) || maxRetryAttempts < 1 || maxRetryAttempts > 10)
    errors.maxRetryAttempts = "Enter a number between 1 and 10.";

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  // Ensure the row exists first (lazy-create), then update it.
  await getQueueSettings(auth.clientId);
  const settings = await prisma.queueSettings.update({
    where: { clientId: auth.clientId },
    data: { messagesPerMinute, batchSize, maxRetryAttempts },
  });

  return NextResponse.json({
    settings: {
      messagesPerMinute: settings.messagesPerMinute,
      batchSize: settings.batchSize,
      maxRetryAttempts: settings.maxRetryAttempts,
      paused: settings.paused,
    },
  });
}
