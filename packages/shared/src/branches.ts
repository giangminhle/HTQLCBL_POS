import { z } from 'zod';
import { paginatedSchema, paginationQuerySchema, queryBoolean } from './pagination';

export const BRANCH_TYPES = ['STORE', 'WAREHOUSE'] as const;
export const branchTypeSchema = z.enum(BRANCH_TYPES);
export type BranchType = z.infer<typeof branchTypeSchema>;
export const BRANCH_TYPE_LABELS: Record<BranchType, string> = { STORE: 'Cửa hàng', WAREHOUSE: 'Kho' };

export const branchSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  type: branchTypeSchema,
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Branch = z.infer<typeof branchSchema>;
export const branchPageSchema = paginatedSchema(branchSchema);

export const createBranchSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, 'Mã chi nhánh gồm 2–20 ký tự chữ in hoa, số hoặc dấu gạch ngang'),
  name: z.string().trim().min(1, 'Nhập tên chi nhánh').max(100),
  address: z.string().trim().max(255).nullish(),
  type: branchTypeSchema,
});
export type CreateBranch = z.output<typeof createBranchSchema>;

/** Code is immutable once created (it appears on printed documents). */
export const updateBranchSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    address: z.string().trim().max(255).nullable(),
    type: branchTypeSchema,
    isActive: z.boolean(),
  })
  .partial();
export type UpdateBranch = z.output<typeof updateBranchSchema>;

export const branchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  type: branchTypeSchema.optional(),
  isActive: queryBoolean.optional(),
});
export type BranchQuery = z.output<typeof branchQuerySchema>;
export type BranchQueryInput = z.input<typeof branchQuerySchema>;
