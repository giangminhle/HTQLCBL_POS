import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('REQ-NFR-01: applies defaults and parses CORS list', () => {
    const env = validateEnv({ ...base, CORS_ORIGINS: 'http://a, http://b' });
    expect(env.API_PORT).toBe(3000);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.CORS_ORIGINS).toEqual(['http://a', 'http://b']);
    expect(env.PAYMENT_ADAPTER).toBe('mock');
  });

  it('REQ-NFR-01: fails fast when required variables are missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });
});
