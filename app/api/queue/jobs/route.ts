import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/apiGuards";

export async function GET() {
  const auth = await requireClient();
  if (auth instanceof NextResponse) return auth;

  const jobs = await prisma.queueJob.findMany({
    where: { clientId: auth.clientId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  type JobRow = {
    id: string;
    name: string;
    campaignId: string | null;
    batchSize: number;
    attempts: number;
    maxAttempts: number;
    status: string;
    sentCount: number;
    failedCount: number;
    errorMessage: string | null;
    lastRunAt: Date | null;
    createdAt: Date;
  };

  return NextResponse.json({
    jobs: (jobs as JobRow[]).map((j) => ({
      id: j.id,
      name: j.name,
      campaignId: j.campaignId,
      batchSize: j.batchSize,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      status: j.status,
      sentCount: j.sentCount,
      failedCount: j.failedCount,
      errorMessage: j.errorMessage,
      lastRunAt: j.lastRunAt ? j.lastRunAt.toISOString() : null,
      createdAt: j.createdAt.toISOString(),
    })),
  });
}
