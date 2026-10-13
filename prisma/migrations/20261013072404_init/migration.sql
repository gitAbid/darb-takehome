-- Hand-added CHECK constraints (Prisma cannot express them): see IMPLEMENTATION.md §6.2.

-- CreateTable
CREATE TABLE "Client" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ClientSenderEmail" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    CONSTRAINT "ClientSenderEmail_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    CONSTRAINT "Driver_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Card" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientId" INTEGER NOT NULL,
    "last4" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    CONSTRAINT "Card_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientId" INTEGER NOT NULL,
    "cardId" INTEGER NOT NULL,
    "driverPhone" TEXT,
    "merchantName" TEXT NOT NULL,
    "mcc" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "transactionAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_amount_positive" CHECK ("amount" > 0)
);

-- CreateTable
CREATE TABLE "Document" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "contentHash" TEXT,
    "senderIdentifier" TEXT NOT NULL,
    "recipientIdentifier" TEXT,
    "clientId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "failureReason" TEXT,
    "decisionReasons" JSONB,
    "storageKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "documentType" TEXT,
    "merchantName" TEXT,
    "vatNumber" TEXT,
    "invoiceNumber" TEXT,
    "totalAmount" INTEGER,
    "currency" TEXT,
    "documentDate" DATETIME,
    "cardLast4" TEXT,
    "rawText" TEXT,
    "extractionConfidence" REAL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_failed_has_reason" CHECK ("status" <> 'FAILED' OR "failureReason" IS NOT NULL),
    CONSTRAINT "Document_hash_or_failed" CHECK ("contentHash" IS NOT NULL OR "status" = 'FAILED')
);

-- CreateTable
CREATE TABLE "DocumentMatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentId" INTEGER NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "confidence" REAL NOT NULL,
    "signals" JSONB NOT NULL,
    "flags" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CANDIDATE',
    "decidedBy" TEXT,
    "decidedAt" DATETIME,
    "confirmedTransactionId" INTEGER,
    "confirmedDocumentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentMatch_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentMatch_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DocumentMatch_confirmed_txn_iff_confirmed" CHECK (("status" IN ('CONFIRMED', 'AUTO_CONFIRMED')) = ("confirmedTransactionId" IS NOT NULL)),
    CONSTRAINT "DocumentMatch_confirmed_doc_iff_confirmed" CHECK (("status" IN ('CONFIRMED', 'AUTO_CONFIRMED')) = ("confirmedDocumentId" IS NOT NULL)),
    CONSTRAINT "DocumentMatch_confirmed_txn_is_own" CHECK ("confirmedTransactionId" IS NULL OR "confirmedTransactionId" = "transactionId"),
    CONSTRAINT "DocumentMatch_confirmed_doc_is_own" CHECK ("confirmedDocumentId" IS NULL OR "confirmedDocumentId" = "documentId"),
    CONSTRAINT "DocumentMatch_decided_when_not_candidate" CHECK ("status" = 'CANDIDATE' OR ("decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL)),
    CONSTRAINT "DocumentMatch_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_slug_key" ON "Client"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ClientSenderEmail_email_key" ON "ClientSenderEmail"("email");

-- CreateIndex
CREATE INDEX "ClientSenderEmail_clientId_idx" ON "ClientSenderEmail"("clientId");

-- CreateIndex
CREATE INDEX "Driver_phone_idx" ON "Driver"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_clientId_phone_key" ON "Driver"("clientId", "phone");

-- CreateIndex
CREATE INDEX "Card_clientId_last4_idx" ON "Card"("clientId", "last4");

-- CreateIndex
CREATE INDEX "Transaction_clientId_transactionAt_idx" ON "Transaction"("clientId", "transactionAt");

-- CreateIndex
CREATE INDEX "Transaction_driverPhone_transactionAt_idx" ON "Transaction"("driverPhone", "transactionAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_externalId_key" ON "Document"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_contentHash_key" ON "Document"("contentHash");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentMatch_confirmedTransactionId_key" ON "DocumentMatch"("confirmedTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentMatch_confirmedDocumentId_key" ON "DocumentMatch"("confirmedDocumentId");

-- CreateIndex
CREATE INDEX "DocumentMatch_transactionId_idx" ON "DocumentMatch"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentMatch_documentId_transactionId_key" ON "DocumentMatch"("documentId", "transactionId");
