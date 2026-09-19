-- CreateTable
CREATE TABLE "whatsapp_accounts" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "checklistDone" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "businessName" TEXT,
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "displayNumber" TEXT,
    "qualityRating" TEXT,
    "accessTokenEnc" TEXT,
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_clientId_key" ON "whatsapp_accounts"("clientId");

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
