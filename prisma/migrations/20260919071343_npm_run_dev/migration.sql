-- CreateEnum
CREATE TYPE "MessageStatusValue" AS ENUM ('sent', 'delivered', 'read', 'failed');

-- CreateTable
CREATE TABLE "message_records" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "campaignId" TEXT,
    "campaignName" TEXT,
    "queueJobId" TEXT,
    "recipientName" TEXT,
    "recipientPhone" TEXT NOT NULL,
    "templateId" TEXT,
    "templateName" TEXT,
    "preview" TEXT NOT NULL,
    "whatsappMessageId" TEXT,
    "status" "MessageStatusValue" NOT NULL,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_records_whatsappMessageId_key" ON "message_records"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "message_records_clientId_idx" ON "message_records"("clientId");

-- AddForeignKey
ALTER TABLE "message_records" ADD CONSTRAINT "message_records_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
