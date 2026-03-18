/*
  Warnings:

  - A unique constraint covering the columns `[inviteCode]` on the table `waitlist_entries` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "waitlist_entries" ADD COLUMN     "inviteCode" TEXT,
ADD COLUMN     "inviteExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_inviteCode_key" ON "waitlist_entries"("inviteCode");

-- CreateIndex
CREATE INDEX "waitlist_entries_inviteCode_idx" ON "waitlist_entries"("inviteCode");
