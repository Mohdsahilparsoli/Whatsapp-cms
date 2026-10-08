-- AlterEnum
ALTER TYPE "ChatMessageType" ADD VALUE 'location';

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "locationName" TEXT,
ADD COLUMN "locationAddress" TEXT;
