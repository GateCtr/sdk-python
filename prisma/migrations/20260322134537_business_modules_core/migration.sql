/*
  Warnings:

  - The required column `deliveryId` was added to the `webhook_deliveries` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "webhook_deliveries" ADD COLUMN     "deliveryId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "usage_logs_userId_provider_createdAt_idx" ON "usage_logs"("userId", "provider", "createdAt");
