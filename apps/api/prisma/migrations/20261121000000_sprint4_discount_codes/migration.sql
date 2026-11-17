ALTER TABLE "sales" ADD COLUMN "approved_by_manager_id" UUID;
CREATE TABLE "document_code_counters" (
  "branch_id" UUID NOT NULL,
  "document_type" VARCHAR(10) NOT NULL,
  "business_date" DATE NOT NULL,
  "value" INTEGER NOT NULL,
  CONSTRAINT "document_code_counters_pkey" PRIMARY KEY ("branch_id", "document_type", "business_date")
);
