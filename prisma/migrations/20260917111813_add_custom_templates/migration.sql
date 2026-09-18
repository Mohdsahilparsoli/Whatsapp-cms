-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('Marketing', 'Utility', 'Authentication');

-- CreateEnum
CREATE TYPE "CustomTemplateStatus" AS ENUM ('draft', 'custom');

-- CreateEnum
CREATE TYPE "TemplateMediaKind" AS ENUM ('none', 'image', 'video', 'document');

-- CreateTable
CREATE TABLE "custom_templates" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL,
    "status" "CustomTemplateStatus" NOT NULL DEFAULT 'draft',
    "header" TEXT,
    "body" TEXT NOT NULL,
    "footer" TEXT,
    "mediaKind" "TemplateMediaKind" NOT NULL DEFAULT 'none',
    "mediaUrl" TEXT,
    "mediaFileName" TEXT,
    "buttons" JSONB NOT NULL DEFAULT '[]',
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_templates_clientId_idx" ON "custom_templates"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_templates_clientId_name_key" ON "custom_templates"("clientId", "name");

-- AddForeignKey
ALTER TABLE "custom_templates" ADD CONSTRAINT "custom_templates_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
