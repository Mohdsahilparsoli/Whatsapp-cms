-- AlterTable
ALTER TABLE "custom_templates" ADD COLUMN "parameterFormat" TEXT NOT NULL DEFAULT 'positional',
ADD COLUMN "templateKind" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN "extra" JSONB NOT NULL DEFAULT '{}';
