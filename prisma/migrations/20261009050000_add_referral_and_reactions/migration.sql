-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "adSourceType" TEXT,
ADD COLUMN "adSourceId" TEXT,
ADD COLUMN "adSourceUrl" TEXT,
ADD COLUMN "adHeadline" TEXT,
ADD COLUMN "adClickId" TEXT;

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "customerReaction" TEXT,
ADD COLUMN "agentReaction" TEXT;
