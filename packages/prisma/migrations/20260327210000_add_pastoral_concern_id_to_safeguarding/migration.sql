-- AlterTable
ALTER TABLE "safeguarding_concerns" ADD COLUMN "pastoral_concern_id" UUID;

-- AddForeignKey
ALTER TABLE "safeguarding_concerns" ADD CONSTRAINT "safeguarding_concerns_pastoral_concern_id_fkey" FOREIGN KEY ("pastoral_concern_id") REFERENCES "pastoral_concerns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "idx_safeguarding_concerns_pastoral_concern_id" ON "safeguarding_concerns" ("pastoral_concern_id") WHERE "pastoral_concern_id" IS NOT NULL;
