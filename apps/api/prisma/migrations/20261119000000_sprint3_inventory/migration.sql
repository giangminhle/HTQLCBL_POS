-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('IMPORT', 'SALE', 'RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(100),
    "address" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "ref_type" VARCHAR(50),
    "ref_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "branch_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("branch_id","variant_id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "supplier_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "note" VARCHAR(500),
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_items" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" INTEGER NOT NULL,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "from_branch_id" UUID NOT NULL,
    "to_branch_id" UUID NOT NULL,
    "note" VARCHAR(500),
    "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "sent_by" UUID,
    "sent_at" TIMESTAMP(3),
    "received_by" UUID,
    "received_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "sent_quantity" INTEGER NOT NULL,
    "received_quantity" INTEGER,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "branch_id" UUID NOT NULL,
    "note" VARCHAR(500),
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "completed_by" UUID,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_items" (
    "id" UUID NOT NULL,
    "count_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "system_quantity" INTEGER NOT NULL,
    "actual_quantity" INTEGER,

    CONSTRAINT "stock_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE INDEX "stock_movements_branch_id_variant_id_created_at_idx" ON "stock_movements"("branch_id", "variant_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_ref_type_ref_id_idx" ON "stock_movements"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "stock_balances_branch_id_idx" ON "stock_balances"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_code_key" ON "goods_receipts"("code");

-- CreateIndex
CREATE INDEX "goods_receipts_branch_id_idx" ON "goods_receipts"("branch_id");

-- CreateIndex
CREATE INDEX "goods_receipts_supplier_id_idx" ON "goods_receipts"("supplier_id");

-- CreateIndex
CREATE INDEX "goods_receipt_items_receipt_id_idx" ON "goods_receipt_items"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_code_key" ON "stock_transfers"("code");

-- CreateIndex
CREATE INDEX "stock_transfers_from_branch_id_idx" ON "stock_transfers"("from_branch_id");

-- CreateIndex
CREATE INDEX "stock_transfers_to_branch_id_idx" ON "stock_transfers"("to_branch_id");

-- CreateIndex
CREATE INDEX "stock_transfer_items_transfer_id_idx" ON "stock_transfer_items"("transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_code_key" ON "stock_counts"("code");

-- CreateIndex
CREATE INDEX "stock_counts_branch_id_idx" ON "stock_counts"("branch_id");

-- CreateIndex
CREATE INDEX "stock_count_items_count_id_idx" ON "stock_count_items"("count_id");

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written (not expressible in schema.prisma)
-- ---------------------------------------------------------------------------

-- Stock movement quantity must never be zero.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_quantity_nonzero"
  CHECK ("quantity" != 0);
