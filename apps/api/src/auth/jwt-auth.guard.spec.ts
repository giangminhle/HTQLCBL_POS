import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@retailchain/shared';
import { AllowWhenPasswordChangeRequired, Public } from '../common/authz/decorators';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const jwt = new JwtService({ secret: 'unit-test-secret-0123456789' });
const authService = { verifyAccessToken: (t: string) => jwt.verifyAsync(t) } as unknown as AuthService;

function ctxFor(decorators: MethodDecorator[], authorization?: string) {
  class C {
    h() {}
  }
  const d = Object.getOwnPropertyDescriptor(C.prototype, 'h')!;
  for (const dec of decorators) dec(C.prototype, 'h', d);
  const req: Record<string, unknown> = { headers: authorization ? { authorization } : {} };
  return {
    req,
    ctx: {
      getHandler: () => C.prototype.h,
      getClass: () => C,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext,
  };
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof HttpException)
      return { status: e.getStatus(), code: (e.getResponse() as { code: string }).code };
    throw e;
  }
  return null;
}

describe('JwtAuthGuard', () => {
  const state = {
    id: 'u1',
    username: 'u',
    fullName: 'U',
    role: Role.CASHIER,
    branchId: 'b1',
    isActive: true,
    mustChangePassword: false,
    tokenVersion: 2,
  };
  const users = { findAuthState: jest.fn(async () => ({ ...state })) };
  const guard = new JwtAuthGuard(new Reflector(), authService, users as never);
  const token = (ver = 2, expiresIn = 60) => jwt.sign({ sub: 'u1', ver, cl: 'pos' }, { expiresIn });

  it('REQ-AUTH-01: public routes need no token', async () => {
    await expect(guard.canActivate(ctxFor([Public()]).ctx)).resolves.toBe(true);
  });

  it('REQ-AUTH-01: missing token → 401 UNAUTHORIZED', async () => {
    expect(await codeOf(guard.canActivate(ctxFor([]).ctx))).toEqual({ status: 401, code: 'UNAUTHORIZED' });
  });

  it('REQ-AUTH-01: valid token attaches the user reloaded from the database', async () => {
    const { ctx, req } = ctxFor([], `Bearer ${token()}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toMatchObject({ id: 'u1', role: 'CASHIER', branchId: 'b1' });
    expect(req.authClient).toBe('pos');
  });

  it('REQ-AUTH-01: expired token → 401 TOKEN_EXPIRED', async () => {
    const expired = jwt.sign({ sub: 'u1', ver: 2, cl: 'pos', exp: Math.floor(Date.now() / 1000) - 10 });
    expect((await codeOf(guard.canActivate(ctxFor([], `Bearer ${expired}`).ctx)))?.code).toBe(
      'TOKEN_EXPIRED',
    );
  });

  it('REQ-AUTH-02: token from before a reset/role change (old tokenVersion) → 401 INVALID_TOKEN', async () => {
    expect((await codeOf(guard.canActivate(ctxFor([], `Bearer ${token(1)}`).ctx)))?.code).toBe(
      'INVALID_TOKEN',
    );
  });

  it('REQ-AUTH-01: deactivated user → 401 even with a valid token', async () => {
    users.findAuthState.mockResolvedValueOnce({ ...state, isActive: false });
    expect((await codeOf(guard.canActivate(ctxFor([], `Bearer ${token()}`).ctx)))?.status).toBe(401);
  });

  it('REQ-AUTH-01: mustChangePassword blocks normal endpoints with 403 PASSWORD_CHANGE_REQUIRED', async () => {
    users.findAuthState.mockResolvedValueOnce({ ...state, mustChangePassword: true });
    expect(await codeOf(guard.canActivate(ctxFor([], `Bearer ${token()}`).ctx))).toEqual({
      status: 403,
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  });

  it('REQ-AUTH-01: mustChangePassword still allows change-password and logout', async () => {
    users.findAuthState.mockResolvedValueOnce({ ...state, mustChangePassword: true });
    const { ctx } = ctxFor([AllowWhenPasswordChangeRequired()], `Bearer ${token()}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
