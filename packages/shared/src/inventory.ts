import { z } from 'zod';
import { paginationQuerySchema } from './pagination';

// ---------- enums ----------

export const StockMovementType = {
  IMPORT: 'IMPORT',
  SALE: 'SALE',
  RETURN: 'RETURN',
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];

export const GoodsReceiptStatus = {
  DRAFT: 'DRAFT',
  COMPLETED: 'COMPLETED',
} as const;
export type GoodsReceiptStatus = (typeof GoodsReceiptStatus)[keyof typeof GoodsReceiptStatus];

export const StockTransferStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  RECEIVED: 'RECEIVED',
} as const;
export type StockTransferStatus = (typeof StockTransferStatus)[keyof typeof StockTransferStatus];

export const StockCountStatus = {
  DRAFT: 'DRAFT',
  COMPLETED: 'COMPLETED',
} as const;
export type StockCountStatus = (typeof StockCountStatus)[keyof typeof StockCountStatus];

// ---------- supplier ----------

export const CreateSupplierSchema = z.object({
  code: z.string().min(1).max(20).trim(),
  name: z.string().min(1).max(100).trim(),
  phone: z.string().max(20).trim().nullish(),
  email: z.string().email().max(100).trim().nullish(),
  address: z.string().max(255).trim().nullish(),
});
export type CreateSupplier = z.infer<typeof CreateSupplierSchema>;

export const UpdateSupplierSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  phone: z.string().max(20).trim().nullish(),
  email: z.string().email().max(100).trim().nullish(),
  address: z.string().max(255).trim().nullish(),
  isActive: z.boolean().optional(),
});
export type UpdateSupplier = z.infer<typeof UpdateSupplierSchema>;

export const SupplierQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});
export type SupplierQuery = z.infer<typeof SupplierQuerySchema>;

export interface Supplier {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------- goods receipt ----------

export const GoodsReceiptItemInput = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitCost: z.number().int().nonnegative(),
});
export type GoodsReceiptItemInput = z.infer<typeof GoodsReceiptItemInput>;

export const CreateGoodsReceiptSchema = z.object({
  supplierId: z.string().uuid(),
  branchId: z.string().uuid(),
  note: z.string().max(500).trim().nullish(),
  items: z.array(GoodsReceiptItemInput).min(1),
  complete: z.boolean().default(false),
});
export type CreateGoodsReceipt = z.infer<typeof CreateGoodsReceiptSchema>;

export const UpdateGoodsReceiptSchema = z.object({
  supplierId: z.string().uuid().optional(),
  note: z.string().max(500).trim().nullish(),
  items: z.array(GoodsReceiptItemInput).min(1).optional(),
});
export type UpdateGoodsReceipt = z.infer<typeof UpdateGoodsReceiptSchema>;

export const GoodsReceiptQuerySchema = paginationQuerySchema.extend({
  branchId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  status: z.nativeEnum(GoodsReceiptStatus as Record<string, string>).optional(),
});
export type GoodsReceiptQuery = z.infer<typeof GoodsReceiptQuerySchema>;

export interface GoodsReceiptItem {
  id: string;
  receiptId: string;
  variantId: string;
  variantSku?: string;
  variantName?: string;
  productName?: string;
  unit?: string;
  quantity: number;
  unitCost: number;
}

export interface GoodsReceipt {
  id: string;
  code: string;
  supplierId: string;
  supplierName?: string;
  branchId: string;
  branchName?: string;
  note: string | null;
  status: GoodsReceiptStatus;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  items: GoodsReceiptItem[];
  totalQuantity?: number;
  totalCost?: number;
}

// ---------- stock transfer ----------

export const StockTransferItemInput = z.object({
  variantId: z.string().uuid(),
  sentQuantity: z.number().int().positive(),
});
export type StockTransferItemInput = z.infer<typeof StockTransferItemInput>;

export const CreateStockTransferSchema = z.object({
  fromBranchId: z.string().uuid(),
  toBranchId: z.string().uuid(),
  note: z.string().max(500).trim().nullish(),
  items: z.array(StockTransferItemInput).min(1),
});
export type CreateStockTransfer = z.infer<typeof CreateStockTransferSchema>;

export const ReceiveTransferItemInput = z.object({
  itemId: z.string().uuid(),
  receivedQuantity: z.number().int().nonnegative(),
});
export type ReceiveTransferItemInput = z.infer<typeof ReceiveTransferItemInput>;

export const ReceiveStockTransferSchema = z.object({
  items: z.array(ReceiveTransferItemInput).min(1),
});
export type ReceiveStockTransfer = z.infer<typeof ReceiveStockTransferSchema>;

export const StockTransferQuerySchema = paginationQuerySchema.extend({
  branchId: z.string().uuid().optional(),
  status: z.nativeEnum(StockTransferStatus as Record<string, string>).optional(),
});
export type StockTransferQuery = z.infer<typeof StockTransferQuerySchema>;

export interface StockTransferItem {
  id: string;
  transferId: string;
  variantId: string;
  variantSku?: string;
  variantName?: string;
  productName?: string;
  unit?: string;
  sentQuantity: number;
  receivedQuantity: number | null;
}

export interface StockTransfer {
  id: string;
  code: string;
  fromBranchId: string;
  fromBranchName?: string;
  toBranchId: string;
  toBranchName?: string;
  note: string | null;
  status: StockTransferStatus;
  sentBy: string | null;
  sentByName?: string | null;
  sentAt: string | null;
  receivedBy: string | null;
  receivedByName?: string | null;
  receivedAt: string | null;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  items: StockTransferItem[];
}

// ---------- stock count ----------

export const StockCountItemInput = z.object({
  variantId: z.string().uuid(),
});
export type StockCountItemInput = z.infer<typeof StockCountItemInput>;

export const CreateStockCountSchema = z.object({
  branchId: z.string().uuid(),
  note: z.string().max(500).trim().nullish(),
  items: z.array(StockCountItemInput).min(1),
});
export type CreateStockCount = z.infer<typeof CreateStockCountSchema>;

export const UpdateStockCountItemInput = z.object({
  itemId: z.string().uuid(),
  actualQuantity: z.number().int().nonnegative(),
});
export type UpdateStockCountItemInput = z.infer<typeof UpdateStockCountItemInput>;

export const UpdateStockCountSchema = z.object({
  items: z.array(UpdateStockCountItemInput).min(1),
});
export type UpdateStockCount = z.infer<typeof UpdateStockCountSchema>;

export const StockCountQuerySchema = paginationQuerySchema.extend({
  branchId: z.string().uuid().optional(),
  status: z.nativeEnum(StockCountStatus as Record<string, string>).optional(),
});
export type StockCountQuery = z.infer<typeof StockCountQuerySchema>;

export interface StockCountItem {
  id: string;
  countId: string;
  variantId: string;
  variantSku?: string;
  variantName?: string;
  productName?: string;
  unit?: string;
  systemQuantity: number;
  actualQuantity: number | null;
}

export interface StockCount {
  id: string;
  code: string;
  branchId: string;
  branchName?: string;
  note: string | null;
  status: StockCountStatus;
  createdBy: string;
  createdByName?: string;
  completedBy: string | null;
  completedByName?: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: StockCountItem[];
}

// ---------- inventory queries & models ----------

export const BalanceQuerySchema = paginationQuerySchema.extend({
  branchId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  q: z.string().optional(),
});
export type BalanceQuery = z.infer<typeof BalanceQuerySchema>;

export interface StockBalanceItem {
  branchId: string;
  branchName?: string;
  variantId: string;
  variantSku: string;
  variantName: string;
  productName: string;
  unit: string;
  quantity: number;
  minStock: number;
  updatedAt: string;
}

export const MovementQuerySchema = paginationQuerySchema.extend({
  branchId: z.string().uuid(),
  variantId: z.string().uuid(),
});
export type MovementQuery = z.infer<typeof MovementQuerySchema>;

export interface StockMovementItem {
  id: string;
  branchId: string;
  variantId: string;
  type: StockMovementType;
  quantity: number;
  refType: string | null;
  refId: string | null;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export const LowStockQuerySchema = paginationQuerySchema.extend({
  branchId: z.string().uuid().optional(),
});
export type LowStockQuery = z.infer<typeof LowStockQuerySchema>;

export interface LowStockItem {
  branchId: string;
  branchName: string;
  variantId: string;
  variantSku: string;
  variantName: string;
  productName: string;
  unit: string;
  quantity: number;
  minStock: number;
  deficit: number;
}

// ---------- client validation schemas ----------
export const supplierSchema = z.custom<Supplier>();
export const supplierPageSchema = z.object({
  items: z.array(supplierSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const goodsReceiptSchema = z.custom<GoodsReceipt>();
export const goodsReceiptPageSchema = z.object({
  items: z.array(goodsReceiptSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const stockTransferSchema = z.custom<StockTransfer>();
export const stockTransferPageSchema = z.object({
  items: z.array(stockTransferSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const stockCountSchema = z.custom<StockCount>();
export const stockCountPageSchema = z.object({
  items: z.array(stockCountSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const stockBalanceItemSchema = z.custom<StockBalanceItem>();
export const stockBalancePageSchema = z.object({
  items: z.array(stockBalanceItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const stockMovementItemSchema = z.custom<StockMovementItem>();
export const stockMovementPageSchema = z.object({
  items: z.array(stockMovementItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const lowStockItemSchema = z.custom<LowStockItem>();
export const lowStockPageSchema = z.object({
  items: z.array(lowStockItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
