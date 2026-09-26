-- CreateEnum
CREATE TYPE "MetaTemplateStatus" AS ENUM ('not_submitted', 'pending', 'approved', 'rejected', 'paused', 'disabled');

-- AlterTable
ALTER TABLE "custom_templates" ADD COLUMN     "metaTemplateId" TEXT,
ADD COLUMN     "metaStatus" "MetaTemplateStatus" NOT NULL DEFAULT 'not_submitted',
ADD COLUMN     "metaLanguageCode" TEXT,
ADD COLUMN     "metaRejectionReason" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "custom_templates_metaTemplateId_key" ON "custom_templates"("metaTemplateId");
