-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "replyToId" TEXT,
ADD COLUMN     "replyToText" TEXT,
ADD COLUMN     "replyToType" TEXT,
ADD COLUMN     "replyToDirection" TEXT;
