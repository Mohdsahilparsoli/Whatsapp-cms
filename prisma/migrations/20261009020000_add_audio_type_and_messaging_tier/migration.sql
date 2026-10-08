-- AlterEnum
ALTER TYPE "ChatMessageType" ADD VALUE 'audio';

-- AlterTable
ALTER TABLE "whatsapp_accounts" ADD COLUMN "messagingTier" TEXT,
ADD COLUMN "qualityCheckedAt" TIMESTAMP(3);
