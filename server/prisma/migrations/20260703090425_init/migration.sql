-- CreateTable
CREATE TABLE "item_groups" (
    "group_id" TEXT NOT NULL PRIMARY KEY,
    "group_name" TEXT NOT NULL,
    "detail" TEXT
);

-- CreateTable
CREATE TABLE "items" (
    "item_id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "group_id" TEXT NOT NULL,
    "latest_cost" REAL,
    "is_asset" BOOLEAN NOT NULL DEFAULT false,
    "storage_type" TEXT,
    "vendor" TEXT,
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "item_groups" ("group_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_transactions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "item_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "qty_change" REAL NOT NULL,
    "unit_cost" REAL,
    "project" TEXT,
    "note" TEXT,
    "transaction_date" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items" ("item_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "items_group_id_idx" ON "items"("group_id");

-- CreateIndex
CREATE INDEX "stock_transactions_item_id_idx" ON "stock_transactions"("item_id");
