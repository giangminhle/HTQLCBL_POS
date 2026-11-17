import { z } from 'zod';
import { paginatedSchema, paginationQuerySchema } from './pagination';

export const AuditAction = {
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  LOGOUT: 'LOGOUT',
  CHANGE_PASSWORD: 'CHANGE_PASSWORD',
  RESET_PASSWORD: 'RESET_PASSWORD',
  REFRESH_TOKEN_REUSE: 'REFRESH_TOKEN_REUSE',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  PRICE_CHANGE: 'PRICE_CHANGE',
  IMPORT: 'IMPORT',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN: 'Đăng nhập',
  LOGIN_FAILED: 'Đăng nhập thất bại',
  ACCOUNT_LOCKED: 'Khóa tài khoản',
  LOGOUT: 'Đăng xuất',
  CHANGE_PASSWORD: 'Đổi mật khẩu',
  RESET_PASSWORD: 'Đặt lại mật khẩu',
  REFRESH_TOKEN_REUSE: 'Phát hiện dùng lại token',
  CREATE: 'Tạo mới',
  UPDATE: 'Cập nhật',
  PRICE_CHANGE: 'Đổi giá',
  IMPORT: 'Nhập dữ liệu',
};

export const auditLogSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  username: z.string().nullable(),
  branchId: z.string().nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  ip: z.string().nullable(),
  requestId: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;
export const auditLogPageSchema = paginatedSchema(auditLogSchema);

export const auditQuerySchema = paginationQuerySchema.extend({
  userId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  entity: z.string().max(50).optional(),
  entityId: z.string().max(100).optional(),
  action: z.string().max(50).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AuditQuery = z.output<typeof auditQuerySchema>;
export type AuditQueryInput = z.input<typeof auditQuerySchema>;
