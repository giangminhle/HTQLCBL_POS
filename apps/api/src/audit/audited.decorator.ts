import { SetMetadata } from '@nestjs/common';
import type { AuditAction } from '@retailchain/shared';

export const AUDITED_KEY = 'audit:audited';

export interface AuditedOptions {
  action: AuditAction;
  /** Entity name; must match the name registered in AuditSnapshotRegistry for `before` snapshots. */
  entity: string;
  /** Route param holding the entity id (default "id"). */
  idParam?: string;
  /** Record `after` by reloading the entity instead of using the response body. */
  reloadAfter?: boolean;
}

/** Writes an audit_logs row after the handler succeeds (REQ-AUD-01). */
export const Audited = (options: AuditedOptions) => SetMetadata(AUDITED_KEY, options);
