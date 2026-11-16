import { Injectable } from '@nestjs/common';

export type SnapshotLoader = (id: string) => Promise<unknown>;

/**
 * Each module registers how to load its own entity by id, so the audit interceptor can record the
 * `before` state without touching other modules' tables (CLAUDE.md: modules talk via services only).
 */
@Injectable()
export class AuditSnapshotRegistry {
  private readonly loaders = new Map<string, SnapshotLoader>();

  register(entity: string, loader: SnapshotLoader): void {
    this.loaders.set(entity, loader);
  }

  async load(entity: string, id: string): Promise<unknown> {
    const loader = this.loaders.get(entity);
    return loader ? loader(id) : null;
  }
}
