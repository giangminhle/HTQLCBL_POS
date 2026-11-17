import { HttpException, Injectable, Logger } from '@nestjs/common';
import {
  AuditAction,
  type AuthUser,
  type ImportError,
  type ImportResult,
  type PriceWarning,
} from '@retailchain/shared';
import { AuditService } from '../../audit/audit.service';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories.service';
import { priceBelowCostWarnings, type ProductRow } from '../product.serializer';
import { PRODUCT_ENTITY, ProductsService } from '../products.service';
import { buildErrorReport, buildGroups, parseCsv, type ImportGroup } from './csv-import.parser';

class DryRunRollback extends Error {}

/**
 * CSV import (REQ-PRD-01). All-or-nothing: any error → nothing is written and every error is reported
 * with its line. dryRun → full validation (including DB conflicts) and the real writes inside a
 * transaction that is then rolled back, so a dry run catches exactly what a commit would.
 */
@Injectable()
export class ProductsImportService {
  private readonly logger = new Logger(ProductsImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly categories: CategoriesService,
    private readonly audit: AuditService,
  ) {}

  async run(actor: AuthUser, file: Buffer, dryRun: boolean, ctx: RequestContext): Promise<ImportResult> {
    const parsed = parseCsv(file);
    const { groups, errors: rowErrors } = buildGroups(parsed.records);
    const errors = [...parsed.errors, ...rowErrors];
    const categoryIds = await this.resolveCategories(groups, errors);
    if (!errors.length) await this.checkConflicts(groups, errors);

    const result: ImportResult = {
      dryRun,
      ok: false,
      totalRows: parsed.records.length,
      productsCreated: 0,
      productsUpdated: 0,
      variantsCreated: 0,
      variantsUpdated: 0,
      errors: [],
      warnings: [],
    };
    if (errors.length) return this.withErrors(result, parsed, errors);

    const written: { before: ProductRow | null; after: ProductRow }[] = [];
    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const g of groups) {
            const before = await this.products.findRowBySku(g.sku, tx);
            const after = await this.products
              .upsertProduct(
                tx,
                before,
                {
                  sku: g.product.sku,
                  name: g.product.name,
                  categoryId: categoryIds.get(g.sku) ?? null,
                  unit: g.product.unit,
                  defaultPrice: g.product.defaultPrice,
                  costPrice: g.product.costPrice,
                  minStock: g.product.minStock,
                  isActive: g.product.isActive,
                },
                g.variants.map((v) => v.input),
              )
              .catch((e: unknown) => {
                throw new GroupError(g, e);
              });
            written.push({ before, after });
          }
          if (dryRun) throw new DryRunRollback();
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
    } catch (e) {
      if (e instanceof GroupError) {
        if (!(e.failure instanceof HttpException))
          this.logger.error({ err: e.failure, sku: e.group.sku }, 'Import write failed');
        return this.withErrors(result, parsed, [
          { line: e.group.lines[0] ?? 1, field: null, message: e.message },
        ]);
      }
      if (!(e instanceof DryRunRollback)) throw e;
    }

    for (const { before, after } of written) {
      if (before) result.productsUpdated++;
      else result.productsCreated++;
      const oldIds = new Set(before?.variants.map((v) => v.id) ?? []);
      for (const v of after.variants) {
        if (oldIds.has(v.id)) result.variantsUpdated++;
        else result.variantsCreated++;
      }
      result.warnings.push(...priceBelowCostWarnings(after));
    }
    result.ok = true;

    if (!dryRun) {
      for (const { before, after } of written) await this.products.auditPrices(actor, after, before, ctx);
      await this.audit.record({
        action: AuditAction.IMPORT,
        entity: PRODUCT_ENTITY,
        actor,
        after: {
          rows: result.totalRows,
          productsCreated: result.productsCreated,
          productsUpdated: result.productsUpdated,
          variantsCreated: result.variantsCreated,
          variantsUpdated: result.variantsUpdated,
        },
        context: ctx,
      });
    }
    return result;
  }

  private withErrors(result: ImportResult, parsed: ReturnType<typeof parseCsv>, errors: ImportError[]) {
    const sorted = [...errors].sort((a, b) => a.line - b.line);
    return {
      ...result,
      ok: false,
      errors: sorted,
      warnings: [] as PriceWarning[],
      errorReportCsv: buildErrorReport(parsed, sorted),
    };
  }

  private async resolveCategories(groups: ImportGroup[], errors: ImportError[]) {
    const byPath = await this.categories.resolvePathByNames();
    const ids = new Map<string, string>();
    for (const g of groups) {
      if (!g.product.categoryPath) continue;
      const key = g.product.categoryPath
        .split('>')
        .map((s) => s.trim())
        .join(' > ')
        .toLowerCase();
      const id = byPath.get(key);
      if (id) ids.set(g.sku, id);
      else {
        errors.push({
          line: g.lines[0] ?? 1,
          field: 'category',
          message: `Không tìm thấy danh mục "${g.product.categoryPath}" (ghi đủ đường dẫn, ví dụ "Mỹ phẩm > Chăm sóc tóc")`,
        });
      }
    }
    return ids;
  }

  /** Variant SKUs / barcodes already owned by OTHER products → per-line errors. */
  private async checkConflicts(groups: ImportGroup[], errors: ImportError[]) {
    const variantSkus = groups.flatMap((g) => g.variants.map((v) => ({ g, line: v.line, sku: v.input.sku })));
    const codes = groups.flatMap((g) =>
      g.variants.flatMap((v) => v.input.barcodes.map((code) => ({ g, line: v.line, code }))),
    );
    const [skuOwners, codeOwners] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: { sku: { in: variantSkus.map((v) => v.sku) } },
        select: { sku: true, product: { select: { sku: true } } },
      }),
      this.prisma.barcode.findMany({
        where: { code: { in: codes.map((c) => c.code) }, deletedAt: null },
        select: { code: true, variant: { select: { sku: true, product: { select: { sku: true } } } } },
      }),
    ]);
    const skuOwner = new Map(skuOwners.map((o) => [o.sku, o.product.sku]));
    const codeOwner = new Map(codeOwners.map((o) => [o.code, o.variant]));
    for (const v of variantSkus) {
      const owner = skuOwner.get(v.sku);
      if (owner && owner !== v.g.sku) {
        errors.push({
          line: v.line,
          field: 'variant_sku',
          message: `variant_sku ${v.sku} đã thuộc sản phẩm ${owner}`,
        });
      }
    }
    for (const c of codes) {
      const owner = codeOwner.get(c.code);
      if (owner && owner.product.sku !== c.g.sku) {
        errors.push({
          line: c.line,
          field: 'barcodes',
          message: `Mã vạch ${c.code} đang thuộc ${owner.sku} (sản phẩm ${owner.product.sku})`,
        });
      }
    }
  }
}

/**
 * Message shown to the user for a product that failed while writing. Business errors (HttpException) are
 * shown as-is; anything else is an internal error whose details (SQL, file paths) must never reach the client.
 */
export function importFailureMessage(sku: string, cause: unknown): string {
  if (cause instanceof HttpException) {
    const body = cause.getResponse();
    const message = typeof body === 'string' ? body : (body as { message?: unknown }).message;
    return `Sản phẩm ${sku}: ${typeof message === 'string' ? message : cause.message}`;
  }
  return `Sản phẩm ${sku}: lỗi hệ thống khi ghi dữ liệu, vui lòng thử lại hoặc báo quản trị`;
}

class GroupError extends Error {
  constructor(
    readonly group: ImportGroup,
    readonly failure: unknown,
  ) {
    super(importFailureMessage(group.sku, failure));
  }
}
