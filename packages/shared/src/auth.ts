import { z } from 'zod';
import { roleSchema } from './roles';

export const AUTH_CLIENTS = ['admin', 'pos'] as const;
export const authClientSchema = z.enum(AUTH_CLIENTS);
export type AuthClient = z.infer<typeof authClientSchema>;

/** Password policy: at least 8 characters, containing letters and digits. */
export const passwordSchema = z
  .string()
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .max(128, 'Mật khẩu tối đa 128 ký tự')
  .regex(/[A-Za-z]/, 'Mật khẩu phải có chữ cái')
  .regex(/\d/, 'Mật khẩu phải có chữ số');

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1, 'Nhập tên đăng nhập').max(50),
  password: z.string().min(1, 'Nhập mật khẩu').max(128),
  client: authClientSchema.default('admin'),
});
export type LoginRequest = z.input<typeof loginRequestSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  fullName: z.string(),
  role: roleSchema,
  branchId: z.string().nullable(),
  mustChangePassword: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  /** Seconds until the access token expires. */
  accessTokenExpiresIn: z.number().int(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.string(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const loginResponseSchema = authTokensSchema.extend({ user: authUserSchema });
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshRequestSchema = z.object({ refreshToken: z.string().min(1).max(512) });
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const logoutRequestSchema = refreshRequestSchema;

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại').max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
    path: ['newPassword'],
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
