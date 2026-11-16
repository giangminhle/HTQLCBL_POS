import { z } from 'zod';
import { passwordSchema } from './auth';
import { paginatedSchema, paginationQuerySchema, queryBoolean } from './pagination';
import { roleSchema } from './roles';

export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  fullName: z.string(),
  role: roleSchema,
  branchId: z.string().nullable(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  lockedUntil: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type User = z.infer<typeof userSchema>;
export const userPageSchema = paginatedSchema(userSchema);

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._]{3,50}$/, 'Tên đăng nhập 3–50 ký tự: chữ thường, số, dấu chấm, gạch dưới'),
  fullName: z.string().trim().min(1, 'Nhập họ tên').max(100),
  role: roleSchema,
  /** Required for every role except OWNER; must be null for OWNER. */
  branchId: z.string().uuid().nullable(),
  /** Initial password. The user must change it at first login. */
  password: passwordSchema,
});
export type CreateUser = z.output<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(100),
    role: roleSchema,
    branchId: z.string().uuid().nullable(),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateUser = z.output<typeof updateUserSchema>;

export const userQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  branchId: z.string().uuid().optional(),
  isActive: queryBoolean.optional(),
});
export type UserQuery = z.output<typeof userQuerySchema>;
export type UserQueryInput = z.input<typeof userQuerySchema>;

/** REQ-AUTH-02: the temporary password is returned exactly once and never stored in plain text. */
export const resetPasswordResponseSchema = z.object({
  userId: z.string(),
  temporaryPassword: z.string(),
  mustChangePassword: z.literal(true),
});
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;
