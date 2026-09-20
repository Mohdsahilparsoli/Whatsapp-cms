-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('text', 'image', 'document');

-- CreateTable
CREATE TABLE "contact_lists" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'Manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactName" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "type" "ChatMessageType" NOT NULL DEFAULT 'text',
    "text" TEXT NOT NULL DEFAULT '',
    "mediaUrl" TEXT,
    "mediaFileName" TEXT,
    "whatsappMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_lists_clientId_idx" ON "contact_lists"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_lists_clientId_name_key" ON "contact_lists"("clientId", "name");

-- CreateIndex
CREATE INDEX "conversations_clientId_idx" ON "conversations"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_clientId_contactPhone_key" ON "conversations"("clientId", "contactPhone");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_whatsappMessageId_key" ON "chat_messages"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "chat_messages_conversationId_idx" ON "chat_messages"("conversationId");

-- CreateIndex
CREATE INDEX "chat_messages_clientId_idx" ON "chat_messages"("clientId");

-- AddForeignKey
ALTER TABLE "contact_lists" ADD CONSTRAINT "contact_lists_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
