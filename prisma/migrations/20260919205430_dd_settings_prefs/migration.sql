-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "cmsPrefs" JSONB,
ADD COLUMN     "notificationPrefs" JSONB,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "cmsPrefs" JSONB,
ADD COLUMN     "notificationPrefs" JSONB;
