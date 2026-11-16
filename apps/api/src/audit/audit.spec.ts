import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditAction, Role } from '@retailchain/shared';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AuditSnapshotRegistry } from './audit-snapshot.registry';
import { AuditInterceptor } from './audit.interceptor';
import { Audited } from './audited.decorator';
import { REDACTED, redact } from './redact';

const actor = {
  id: 'owner-id',
  username: 'owner',
  fullName: 'Owner',
  role: Role.OWNER,
  branchId: null,
  mustChangePassword: false,
};

function ctxFor(decorators: MethodDecorator[], params: Record<string, string> = {}) {
  class C {
    h() {}
  }
  const d = Object.getOwnPropertyDescriptor(C.prototype, 'h')!;
  for (const dec of decorators) dec(C.prototype, 'h', d);
  const req = { params, user: actor, headers: { 'user-agent': 'jest' }, ip: '10.0.0.1', id: 'req-9' };
  return {
    getHandler: () => C.prototype.h,
    getClass: () => C,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('redact', () => {
  it('REQ-AUD-01: removes secrets at any depth and serialises dates', () => {
    const out = redact({
      passwordHash: 'x',
      nested: { refreshToken: 'y', ok: 1 },
      list: [{ temporaryPassword: 'z' }],
      at: new Date('2026-01-01T00:00:00Z'),
    });
    expect(out).toEqual({
      passwordHash: REDACTED,
      nested: { refreshToken: REDACTED, ok: 1 },
      list: [{ temporaryPassword: REDACTED }],
      at: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('AuditInterceptor', () => {
  function setup() {
    const audit = { record: jest.fn() };
    const registry = new AuditSnapshotRegistry();
    const store: Record<string, unknown> = { b1: { id: 'b1', name: 'Old', branchId: 'b1' } };
    registry.register('Branch', async (id) => store[id] ?? null);
    const interceptor = new AuditInterceptor(new Reflector(), audit as never, registry);
    return { audit, interceptor, store };
  }

  it('REQ-AUD-01: records before (via registry) and after (response) for an UPDATE', async () => {
    const { audit, interceptor } = setup();
    const ctx = ctxFor([Audited({ action: AuditAction.UPDATE, entity: 'Branch' })], { id: 'b1' });
    const next: CallHandler = { handle: () => of({ id: 'b1', name: 'New' }) };
    await lastValueFrom(interceptor.intercept(ctx, next));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entity: 'Branch',
        entityId: 'b1',
        branchId: 'b1',
        actor,
        before: { id: 'b1', name: 'Old', branchId: 'b1' },
        after: { id: 'b1', name: 'New' },
        context: { ip: '10.0.0.1', userAgent: 'jest', requestId: 'req-9' },
      }),
    );
  });

  it('REQ-AUD-01: CREATE takes entityId from the response', async () => {
    const { audit, interceptor } = setup();
    const ctx = ctxFor([Audited({ action: AuditAction.CREATE, entity: 'User' })]);
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of({ id: 'u9', branchId: 'b2' }) }));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'u9', branchId: 'b2', before: null }),
    );
  });

  it('REQ-AUD-01: reloadAfter records the entity state, not the response (e.g. temp password)', async () => {
    const { audit, interceptor, store } = setup();
    const ctx = ctxFor(
      [Audited({ action: AuditAction.RESET_PASSWORD, entity: 'Branch', reloadAfter: true })],
      {
        id: 'b1',
      },
    );
    const next: CallHandler = {
      handle: () => {
        store.b1 = { id: 'b1', name: 'Reloaded' };
        return of({ temporaryPassword: 'secret' });
      },
    };
    await lastValueFrom(interceptor.intercept(ctx, next));
    expect(audit.record.mock.calls[0][0].after).toEqual({ id: 'b1', name: 'Reloaded' });
  });

  it('REQ-AUD-01: writes nothing when the handler fails', async () => {
    const { audit, interceptor } = setup();
    const ctx = ctxFor([Audited({ action: AuditAction.UPDATE, entity: 'Branch' })], { id: 'b1' });
    await expect(
      lastValueFrom(interceptor.intercept(ctx, { handle: () => throwError(() => new Error('boom')) })),
    ).rejects.toThrow('boom');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('REQ-AUD-01: handlers without @Audited are not logged', async () => {
    const { audit, interceptor } = setup();
    await lastValueFrom(interceptor.intercept(ctxFor([]), { handle: () => of({ id: 'x' }) }));
    expect(audit.record).not.toHaveBeenCalled();
  });
});
