-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "llm_provider_keys" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "webhooks" ADD COLUMN     "teamId" TEXT;

-- CreateIndex
CREATE INDEX "api_keys_teamId_idx" ON "api_keys"("teamId");

-- CreateIndex
CREATE INDEX "llm_provider_keys_teamId_idx" ON "llm_provider_keys"("teamId");

-- CreateIndex
CREATE INDEX "webhooks_teamId_idx" ON "webhooks"("teamId");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_provider_keys" ADD CONSTRAINT "llm_provider_keys_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
