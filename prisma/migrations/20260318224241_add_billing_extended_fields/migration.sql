-- AlterTable
ALTER TABLE "daily_usage_cache" ADD COLUMN     "overageTokens" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "stripeMeteredItemId" TEXT,
ADD COLUMN     "stripeSeatsItemId" TEXT;

-- CreateIndex
CREATE INDEX "user_roles_userId_idx" ON "user_roles"("userId");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");
