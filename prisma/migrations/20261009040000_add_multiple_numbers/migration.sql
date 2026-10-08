-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "phoneNumberId" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_additional_numbers" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "label" TEXT,
    "wabaId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayNumber" TEXT,
    "businessName" TEXT,
    "qualityRating" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_additional_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_additional_numbers_phoneNumberId_key" ON "whatsapp_additional_numbers"("phoneNumberId");

-- CreateIndex
CREATE INDEX "whatsapp_additional_numbers_clientId_idx" ON "whatsapp_additional_numbers"("clientId");

-- AddForeignKey
ALTER TABLE "whatsapp_additional_numbers" ADD CONSTRAINT "whatsapp_additional_numbers_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_additional_numbers" ADD CONSTRAINT "whatsapp_additional_numbers_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
