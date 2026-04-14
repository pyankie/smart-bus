-- AlterTable
ALTER TABLE "users" ADD COLUMN     "fcm_token" TEXT;

-- CreateIndex
CREATE INDEX "users_phone_deleted_at_idx" ON "users"("phone", "deleted_at");

-- CreateIndex
CREATE INDEX "users_email_deleted_at_idx" ON "users"("email", "deleted_at");

-- CreateIndex
CREATE INDEX "users_fid_deleted_at_idx" ON "users"("fid", "deleted_at");
