import { z } from 'zod';
import { paginatedSchema, paginationQuerySchema } from './pagination';

// ==========================================
// Enums and Constants
// ==========================================

export const ShiftStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type ShiftStatus = (typeof ShiftStatus)[keyof typeof ShiftStatus];

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  OPEN: 'Đang mở',
  CLOSED: 'Đã đóng',
};

export const SaleStatus = {
  COMPLETED: 'COMPLETED',
  RETURNED_PARTIAL: 'RETURNED_PARTIAL',
  RETURNED_FULL: 'RETURNED_FULL',
  CANCELLED: 'CANCELLED',
} as const;
export type SaleStatus = (typeof SaleStatus)[keyof typeof SaleStatus];

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  COMPLETED: 'Hoàn thành',
  RETURNED_PARTIAL: 'Trả một phần',
  RETURNED_FULL: 'Đã trả toàn bộ',
  CANCELLED: 'Đã hủy',
};

export const PaymentMethod = {
  CASH: 'CASH',
  CARD: 'CARD',
  QR: 'QR',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Tiền mặt',
  CARD: 'Thẻ',
  QR: 'Chuyển khoản QR',
};

// ==========================================
// Shifts Schemas (REQ-SHF-01)
// ==========================================

export const OpenShiftSchema = z.object({
  openingCash: z.number().int().nonnegative({ message: 'Tiền mặt đầu ca phải lớn hơn hoặc bằng 0' }),
  note: z.string().max(500).nullish(),
});
export type OpenShiftInput = z.infer<typeof OpenShiftSchema>;

export const CloseShiftSchema = z.object({
  closingCash: z.number().int().nonnegative({ message: 'Tiền mặt đếm thực tế phải lớn hơn hoặc bằng 0' }),
  note: z.string().max(500).nullish(),
});
export type CloseShiftInput = z.infer<typeof CloseShiftSchema>;

export const ShiftQuerySchema = paginationQuerySchema.extend({
  branchId: z.string().uuid().optional(),
  cashierId: z.string().uuid().optional(),
  status: z.nativeEnum(ShiftStatus).optional(),
});
export type ShiftQuery = z.infer<typeof ShiftQuerySchema>;

export const shiftSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  branchId: z.string().uuid(),
  branchName: z.string().optional(),
  cashierId: z.string().uuid(),
  cashierName: z.string().optional(),
  openingCash: z.number().int(),
  closingCash: z.number().int().nullable(),
  expectedCash: z.number().int().nullable(),
  difference: z.number().int().nullable(),
  status: z.nativeEnum(ShiftStatus),
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Shift = z.infer<typeof shiftSchema>;

export const shiftSummarySchema = z.object({
  shift: shiftSchema,
  cashSales: z.number().int(),
  cardSales: z.number().int(),
  qrSales: z.number().int(),
  cashRefunds: z.number().int(),
  totalSales: z.number().int(),
  expectedCash: z.number().int(),
});
export type ShiftSummary = z.infer<typeof shiftSummarySchema>;

export const shiftPageSchema = paginatedSchema(shiftSchema);
export type ShiftPage = z.infer<typeof shiftPageSchema>;

// ==========================================
// Sales & Items Schemas (REQ-POS-01, 02)
// ==========================================

export const SaleItemInputSchema = z.object({
  variantId: z.string().uuid({ message: 'variantId phải là UUID hợp lệ' }),
  quantity: z.number().int().positive({ message: 'Số lượng phải lớn hơn 0' }),
  unitPrice: z.number().int().nonnegative({ message: 'Đơn giá không được âm' }),
  discount: z.number().int().nonnegative().default(0),
  lineTotal: z.number().int().nonnegative({ message: 'Thành tiền không được âm' }),
});
export type SaleItemInput = z.infer<typeof SaleItemInputSchema>;

export const PaymentInputSchema = z.object({
  method: z.nativeEnum(PaymentMethod, { message: 'Phương thức thanh toán không hợp lệ' }),
  amount: z.number().int().positive({ message: 'Số tiền thanh toán phải lớn hơn 0' }),
  reference: z.string().max(100).nullish(),
});
export type PaymentInput = z.infer<typeof PaymentInputSchema>;

export const CreateSaleSchema = z.object({
  id: z.string().uuid({ message: 'id hóa đơn phải là UUID (v7 sinh từ client)' }),
  branchId: z.string().uuid({ message: 'branchId phải là UUID' }),
  shiftId: z.string().uuid({ message: 'shiftId phải là UUID' }),
  customerId: z.string().uuid().nullish(),
  subtotal: z.number().int().nonnegative(),
  discount: z.number().int().nonnegative().default(0),
  discountApprovalToken: z.string().optional(),
  total: z.number().int().nonnegative(),
  note: z.string().max(500).nullish(),
  createdAtClient: z.string().datetime({ message: 'createdAtClient phải là chuỗi ISO datetime' }),
  items: z.array(SaleItemInputSchema).min(1, { message: 'Hóa đơn phải có ít nhất 1 sản phẩm' }),
  payments: z
    .array(PaymentInputSchema)
    .min(1, { message: 'Hóa đơn phải có ít nhất 1 phương thức thanh toán' }),
});
export type CreateSaleInput = z.infer<typeof CreateSaleSchema>;

export const SaleQuerySchema = paginationQuerySchema.extend({
  branchId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  cashierId: z.string().uuid().optional(),
  code: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.nativeEnum(SaleStatus).optional(),
});
export type SaleQuery = z.infer<typeof SaleQuerySchema>;

export const saleItemSchema = z.object({
  id: z.string().uuid(),
  saleId: z.string().uuid(),
  variantId: z.string().uuid(),
  variantName: z.string().optional(),
  productName: z.string().optional(),
  sku: z.string().optional(),
  unit: z.string().optional(),
  quantity: z.number().int(),
  unitPrice: z.number().int(),
  discount: z.number().int(),
  lineTotal: z.number().int(),
  returnedQuantity: z.number().int(),
});
export type SaleItem = z.infer<typeof saleItemSchema>;

export const paymentSchema = z.object({
  id: z.string().uuid(),
  saleId: z.string().uuid(),
  method: z.nativeEnum(PaymentMethod),
  amount: z.number().int(),
  reference: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const saleSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  branchId: z.string().uuid(),
  branchName: z.string().optional(),
  shiftId: z.string().uuid(),
  cashierId: z.string().uuid(),
  cashierName: z.string().optional(),
  customerId: z.string().uuid().nullable(),
  subtotal: z.number().int(),
  discount: z.number().int(),
  total: z.number().int(),
  status: z.nativeEnum(SaleStatus),
  note: z.string().nullable(),
  createdAtClient: z.string().datetime(),
  createdAtServer: z.string().datetime(),
  updatedAt: z.string().datetime(),
  itemCount: z.number().int().optional(),
});
export type Sale = z.infer<typeof saleSchema>;

export const saleDetailSchema = saleSchema.extend({
  items: z.array(saleItemSchema),
  payments: z.array(paymentSchema),
});
export type SaleDetail = z.infer<typeof saleDetailSchema>;

export const salePageSchema = paginatedSchema(saleSchema);
export type SalePage = z.infer<typeof salePageSchema>;

// ==========================================
// Sales Returns Schemas (REQ-POS-04)
// ==========================================

export const SaleReturnItemInputSchema = z.object({
  saleItemId: z.string().uuid({ message: 'saleItemId phải là UUID' }),
  variantId: z.string().uuid({ message: 'variantId phải là UUID' }),
  quantity: z.number().int().positive({ message: 'Số lượng trả phải lớn hơn 0' }),
  refundAmount: z.number().int().nonnegative({ message: 'Số tiền hoàn trả không được âm' }),
});
export type SaleReturnItemInput = z.infer<typeof SaleReturnItemInputSchema>;

export const CreateSaleReturnSchema = z.object({
  reason: z.string().min(1, { message: 'Lý do trả hàng không được để trống' }).max(255),
  items: z.array(SaleReturnItemInputSchema).min(1, { message: 'Phiếu trả phải có ít nhất 1 sản phẩm' }),
});
export type CreateSaleReturnInput = z.infer<typeof CreateSaleReturnSchema>;

export const saleReturnItemSchema = z.object({
  id: z.string().uuid(),
  returnId: z.string().uuid(),
  saleItemId: z.string().uuid(),
  variantId: z.string().uuid(),
  variantName: z.string().optional(),
  sku: z.string().optional(),
  unit: z.string().optional(),
  quantity: z.number().int(),
  refundAmount: z.number().int(),
});
export type SaleReturnItem = z.infer<typeof saleReturnItemSchema>;

export const saleReturnSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  saleId: z.string().uuid(),
  saleCode: z.string().optional(),
  branchId: z.string().uuid(),
  branchName: z.string().optional(),
  shiftId: z.string().uuid(),
  cashierId: z.string().uuid(),
  cashierName: z.string().optional(),
  reason: z.string(),
  totalRefund: z.number().int(),
  createdAt: z.string().datetime(),
  items: z.array(saleReturnItemSchema).optional(),
});
export type SaleReturn = z.infer<typeof saleReturnSchema>;

export const saleReturnPageSchema = paginatedSchema(saleReturnSchema);
export type SaleReturnPage = z.infer<typeof saleReturnPageSchema>;

// ==========================================
// Manager Discount Authorization Schema
// ==========================================

export const AuthorizeDiscountSchema = z.object({
  username: z.string().min(1, { message: 'Tên đăng nhập không được để trống' }),
  password: z.string().min(1, { message: 'Mật khẩu không được để trống' }),
});
export type AuthorizeDiscountInput = z.infer<typeof AuthorizeDiscountSchema>;

// ==========================================
// POS Business & Calculation Helpers
// ==========================================

export function calculateLineTotal(quantity: number, unitPrice: number, discount: number = 0): number {
  const lineSubtotal = quantity * unitPrice;
  return Math.max(0, lineSubtotal - discount);
}

export function calculateCartSummary(
  items: Array<{ quantity: number; unitPrice: number; discount?: number }>,
  orderDiscount: number = 0,
): {
  subtotal: number;
  itemsDiscount: number;
  orderDiscount: number;
  totalDiscount: number;
  total: number;
  totalQuantity: number;
} {
  let subtotal = 0;
  let itemsDiscount = 0;
  let totalQuantity = 0;

  for (const item of items) {
    const rawTotal = item.quantity * item.unitPrice;
    const itemDisc = Math.min(rawTotal, Math.max(0, item.discount ?? 0));
    subtotal += rawTotal;
    itemsDiscount += itemDisc;
    totalQuantity += item.quantity;
  }

  const netSubtotal = subtotal - itemsDiscount;
  const appliedOrderDiscount = Math.min(netSubtotal, Math.max(0, orderDiscount));
  const total = Math.max(0, netSubtotal - appliedOrderDiscount);
  const totalDiscount = itemsDiscount + appliedOrderDiscount;

  return {
    subtotal,
    itemsDiscount,
    orderDiscount: appliedOrderDiscount,
    totalDiscount,
    total,
    totalQuantity,
  };
}

export function calculateCashChange(totalDue: number, cashGiven: number): number {
  return Math.max(0, cashGiven - totalDue);
}

export function isDiscountOverLimit(
  discountAmount: number,
  baseAmount: number,
  maxPercent: number = 10,
): boolean {
  if (baseAmount <= 0) return discountAmount > 0;
  const percent = (discountAmount / baseAmount) * 100;
  return percent > maxPercent;
}
