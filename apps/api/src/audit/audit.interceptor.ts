import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, mergeMap, Observable } from 'rxjs';
import { requestContext, type AuthenticatedRequest } from '../common/request-context';
import { AuditSnapshotRegistry } from './audit-snapshot.registry';
import { AuditService } from './audit.service';
import { AUDITED_KEY, type AuditedOptions } from './audited.decorator';

const field = (obj: unknown, key: string): string | null => {
  if (obj && typeof obj === 'object' && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : null;
  }
  return null;
};

/**
 * For handlers marked @Audited(): load `before` (via the entity's registered loader), run the handler,
 * then record `after`. Nothing is written when the handler throws.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
    private readonly snapshots: AuditSnapshotRegistry,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditedOptions | undefined>(AUDITED_KEY, context.getHandler());
    if (!options) return next.handle();

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawId: unknown = req.params?.[options.idParam ?? 'id'];
    const paramId = typeof rawId === 'string' ? rawId : undefined;
    const loadBefore = paramId ? this.snapshots.load(options.entity, paramId) : Promise.resolve(null);

    return from(loadBefore).pipe(
      mergeMap((before) =>
        next.handle().pipe(
          mergeMap(async (result: unknown) => {
            const entityId = paramId ?? field(result, 'id');
            const after =
              options.reloadAfter && entityId ? await this.snapshots.load(options.entity, entityId) : result;
            const branchId =
              options.entity === 'Branch'
                ? entityId
                : (field(after, 'branchId') ?? field(before, 'branchId') ?? req.user?.branchId ?? null);
            await this.audit.record({
              action: options.action,
              entity: options.entity,
              entityId,
              actor: req.user,
              branchId,
              before,
              after,
              context: requestContext(req),
            });
            return result;
          }),
        ),
      ),
    );
  }
}
