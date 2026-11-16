import { z } from 'zod';
import { parseDuration } from '../common/duration';

const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const duration = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .refine((v) => {
      try {
        parseDuration(v);
        return true;
      } catch {
        return false;
      }
    }, 'Expected a duration like 15m, 12h, 7d');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGINS: csv,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: duration('15m'),
  /** ADR-001: admin web, and OWNER on any app. */
  JWT_REFRESH_TTL_ADMIN: duration('7d'),
  /** ADR-001: POS app for CASHIER and BRANCH_MANAGER (long offline periods). */
  JWT_REFRESH_TTL_POS: duration('30d'),
  PAYMENT_ADAPTER: z.enum(['mock', 'real']).default('mock'),
  EINVOICE_ADAPTER: z.enum(['mock', 'real']).default('mock'),
  SMS_ADAPTER: z.enum(['mock', 'real']).default('mock'),
});

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule: fail fast at startup with a readable list of bad variables. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}
