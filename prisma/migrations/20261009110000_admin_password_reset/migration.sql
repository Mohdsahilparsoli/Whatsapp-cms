-- AlterTable
ALTER TABLE "password_reset_tokens" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "password_reset_tokens" ADD COLUMN "adminId" TEXT;

-- CreateIndex
CREATE INDEX "password_reset_tokens_adminId_createdAt_idx" ON "password_reset_tokens"("adminId", "createdAt");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
