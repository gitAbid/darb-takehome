-- Card-feed reference for idempotent transaction ingestion (additive; existing CHECK constraints untouched).

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "externalRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_externalRef_key" ON "Transaction"("externalRef");
