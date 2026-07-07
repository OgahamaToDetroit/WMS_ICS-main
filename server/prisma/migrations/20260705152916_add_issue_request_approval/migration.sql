/*
  Warnings:

  - Added the required column `status` to the `stock_documents` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "stock_request_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "document_id" INTEGER NOT NULL,
    "item_id" TEXT NOT NULL,
    "qty_requested" REAL NOT NULL,
    "qty_confirmed" REAL,
    "note" TEXT,
    CONSTRAINT "stock_request_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "stock_documents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_request_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items" ("item_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_stock_documents" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "doc_no" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "doc_date" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "requested_by" INTEGER,
    "resolved_by" INTEGER,
    "resolved_at" DATETIME,
    "created_by" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_documents_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_documents_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_stock_documents" ("created_at", "created_by", "doc_date", "doc_no", "doc_type", "id", "note") SELECT "created_at", "created_by", "doc_date", "doc_no", "doc_type", "id", "note" FROM "stock_documents";
DROP TABLE "stock_documents";
ALTER TABLE "new_stock_documents" RENAME TO "stock_documents";
CREATE UNIQUE INDEX "stock_documents_doc_no_key" ON "stock_documents"("doc_no");
CREATE INDEX "stock_documents_created_by_idx" ON "stock_documents"("created_by");
CREATE INDEX "stock_documents_requested_by_idx" ON "stock_documents"("requested_by");
CREATE INDEX "stock_documents_resolved_by_idx" ON "stock_documents"("resolved_by");
CREATE TABLE "new_users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "is_active" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_users" ("id", "is_active", "name") SELECT "id", "is_active", "name" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "stock_request_items_document_id_idx" ON "stock_request_items"("document_id");

-- CreateIndex
CREATE INDEX "stock_request_items_item_id_idx" ON "stock_request_items"("item_id");
