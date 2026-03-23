-- DropIndex
DROP INDEX "team_invitations_teamId_email_key";

-- AlterTable
ALTER TABLE "team_invitations" ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "team_members" ADD COLUMN     "invitedById" TEXT;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "settings" JSONB DEFAULT '{}';

-- CreateIndex
CREATE INDEX "team_invitations_teamId_email_idx" ON "team_invitations"("teamId", "email");

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
