-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "stock_documents" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "doc_no" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "doc_date" DATETIME NOT NULL,
    "note" TEXT,
    "created_by" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_stock_transactions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "item_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "qty_change" REAL NOT NULL,
    "unit_cost" REAL,
    "project" TEXT,
    "note" TEXT,
    "transaction_date" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "document_id" INTEGER,
    "created_by" INTEGER,
    CONSTRAINT "stock_transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items" ("item_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_transactions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "stock_documents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_stock_transactions" ("created_at", "id", "item_id", "note", "project", "qty_change", "transaction_date", "type", "unit_cost") SELECT "created_at", "id", "item_id", "note", "project", "qty_change", "transaction_date", "type", "unit_cost" FROM "stock_transactions";
DROP TABLE "stock_transactions";
ALTER TABLE "new_stock_transactions" RENAME TO "stock_transactions";
CREATE INDEX "stock_transactions_item_id_idx" ON "stock_transactions"("item_id");
CREATE INDEX "stock_transactions_document_id_idx" ON "stock_transactions"("document_id");
CREATE INDEX "stock_transactions_created_by_idx" ON "stock_transactions"("created_by");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "stock_documents_doc_no_key" ON "stock_documents"("doc_no");

-- CreateIndex
CREATE INDEX "stock_documents_created_by_idx" ON "stock_documents"("created_by");
