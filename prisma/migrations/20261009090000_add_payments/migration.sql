-- AlterTable
ALTER TABLE "whatsapp_accounts" ADD COLUMN "paymentGateway" TEXT,
ADD COLUMN "paymentConfigName" TEXT;

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerName" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "items" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "orderStatus" TEXT,
    "whatsappMessageId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_requests_referenceId_key" ON "payment_requests"("referenceId");

-- CreateIndex
CREATE INDEX "payment_requests_clientId_createdAt_idx" ON "payment_requests"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
