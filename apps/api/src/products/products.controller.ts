import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuditAction,
  createProductSchema,
  importResultSchema,
  productPageSchema,
  productQuerySchema,
  productSchema,
  Role,
  updateProductSchema,
  type AuthUser,
} from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { Audited } from '../audit/audited.decorator';
import { CurrentUser, Roles } from '../common/authz/decorators';
import { badRequest } from '../common/http-errors';
import { requestContext, type AuthenticatedRequest } from '../common/request-context';
import { importTemplateCsv } from './import/csv-import.parser';
import { ProductsImportService } from './import/products-import.service';
import { PRODUCT_ENTITY, ProductsService } from './products.service';

class CreateProductDto extends createZodDto(createProductSchema) {}
class UpdateProductDto extends createZodDto(updateProductSchema) {}
class ProductQueryDto extends createZodDto(productQuerySchema) {}
class ProductDto extends createZodDto(productSchema) {}
class ProductPageDto extends createZodDto(productPageSchema) {}
class ImportResultDto extends createZodDto(importResultSchema) {}

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly importer: ProductsImportService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Danh sách sản phẩm kèm biến thể và mã vạch. q: tên (không dấu), SKU, hoặc mã vạch chính xác. ' +
      'costPrice bị ẩn với CASHIER.',
  })
  @ApiOkResponse({ type: ProductPageDto })
  list(@CurrentUser() user: AuthUser, @Query() query: ProductQueryDto) {
    return this.products.list(user, query);
  }

  @Get('import/template')
  @Roles(Role.OWNER)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="mau-nhap-san-pham.csv"')
  @ApiOperation({ summary: 'Tải file CSV mẫu để nhập sản phẩm' })
  template(): string {
    return importTemplateCsv();
  }

  @Get('by-barcode/:code')
  @ApiOperation({ summary: 'Tra sản phẩm theo mã vạch (máy quét POS)' })
  @ApiOkResponse({ type: ProductDto })
  byBarcode(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.products.getByBarcode(user, code);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductDto })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(user, id);
  }

  @Post()
  @Roles(Role.OWNER)
  @Audited({ action: AuditAction.CREATE, entity: PRODUCT_ENTITY })
  @ApiOperation({
    summary:
      'Tạo sản phẩm. Không khai báo variants thì tự tạo biến thể mặc định (SKU = SKU sản phẩm, dùng barcodes). ' +
      'Giá bán < giá vốn: trả warnings, không chặn.',
  })
  @ApiOkResponse({ type: ProductDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto, @Req() req: AuthenticatedRequest) {
    return this.products.create(user, dto, requestContext(req));
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  @Audited({ action: AuditAction.UPDATE, entity: PRODUCT_ENTITY })
  @ApiOperation({
    summary:
      'Sửa sản phẩm. variants (nếu gửi) là danh sách đầy đủ: có id → sửa, không id → tạo, thiếu → ngưng hoạt động.',
  })
  @ApiOkResponse({ type: ProductDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.products.update(user, id, dto, requestContext(req));
  }

  @Post('import')
  @HttpCode(200)
  @Roles(Role.OWNER)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiQuery({ name: 'dryRun', required: false, type: Boolean })
  @ApiOperation({
    summary:
      'Nhập sản phẩm từ CSV UTF-8 (tối đa 5.000 dòng, 2 MB). Tất cả hoặc không có gì: có lỗi thì không ghi gì, ' +
      'trả lỗi theo dòng và errorReportCsv. dryRun=true chỉ kiểm tra.',
  })
  @ApiOkResponse({ type: ImportResultDto })
  import(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('dryRun') dryRun: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file) throw badRequest('Chưa chọn file CSV (field "file")');
    return this.importer.run(user, file.buffer, dryRun === 'true' || dryRun === '1', requestContext(req));
  }
}
