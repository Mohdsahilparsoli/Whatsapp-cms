import "server-only";
import { prisma } from "@/lib/db";

export interface QueueSettingsPublic {
  messagesPerMinute: number;
  batchSize: number;
  maxRetryAttempts: number;
  paused: boolean;
}

/** Reads a client's queue settings, creating a default row the first time
 * (so no seed data or migration-time setup is needed). */
export async function getQueueSettings(clientId: string): Promise<QueueSettingsPublic> {
  const settings = await prisma.queueSettings.upsert({
    where: { clientId },
    update: {},
    create: { clientId },
  });
  return {
    messagesPerMinute: settings.messagesPerMinute,
    batchSize: settings.batchSize,
    maxRetryAttempts: settings.maxRetryAttempts,
    paused: settings.paused,
  };
}
