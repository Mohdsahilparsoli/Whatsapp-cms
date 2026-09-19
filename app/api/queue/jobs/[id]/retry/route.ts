import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";
import { retryQueueJob } from "@/lib/queueProcessor";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const existing = await prisma.queueJob.findFirst({ where: { id, clientId: auth.clientId } });
  if (!existing) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  if (existing.status !== "failed") {
    return NextResponse.json({ error: "Only failed batches can be retried." }, { status: 400 });
  }
  if (existing.attempts >= existing.maxAttempts) {
    return NextResponse.json(
      { error: "This batch has already used all its retry attempts." },
      { status: 400 }
    );
  }

  const ok = await retryQueueJob(id, auth.clientId);
  if (!ok) {
    return NextResponse.json(
      { error: "Could not retry — the queue may be paused." },
      { status: 409 }
    );
  }

  const job = await prisma.queueJob.findUnique({ where: { id } });
  return NextResponse.json({
    job: job && {
      id: job.id,
      status: job.status,
      attempts: job.attempts,
      sentCount: job.sentCount,
      failedCount: job.failedCount,
      errorMessage: job.errorMessage,
    },
  });
}
