import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuditAction,
  CreateGoodsReceiptSchema,
  GoodsReceiptQuerySchema,
  Role,
  UpdateGoodsReceiptSchema,
  type AuthUser,
} from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { Audited } from '../audit/audited.decorator';
import { CurrentUser, Roles } from '../common/authz/decorators';
import { GOODS_RECEIPT_ENTITY, GoodsReceiptsService } from './goods-receipts.service';

class CreateGoodsReceiptDto extends createZodDto(CreateGoodsReceiptSchema) {}
class UpdateGoodsReceiptDto extends createZodDto(UpdateGoodsReceiptSchema) {}
class GoodsReceiptQueryDto extends createZodDto(GoodsReceiptQuerySchema) {}

const RECEIPT_READERS = [
  Role.OWNER,
  Role.BRANCH_MANAGER,
  Role.WAREHOUSE_KEEPER,
  Role.ACCOUNTANT,
];
const RECEIPT_WRITERS = [Role.OWNER, Role.BRANCH_MANAGER, Role.WAREHOUSE_KEEPER];

@ApiTags('goods-receipts')
@ApiBearerAuth('JWT')
@Controller('inventory/goods-receipts')
export class GoodsReceiptsController {
  constructor(private readonly goodsReceipts: GoodsReceiptsService) {}

  @Get()
  @Roles(...RECEIPT_READERS)
  @ApiOperation({ summary: 'Danh sách phiếu nhập kho (REQ-INV-01)' })
  async list(@CurrentUser() viewer: AuthUser, @Query() query: GoodsReceiptQueryDto) {
    return this.goodsReceipts.list(viewer, query);
  }

  @Get(':id')
  @Roles(...RECEIPT_READERS)
  @ApiOperation({ summary: 'Chi tiết phiếu nhập kho' })
  async get(@CurrentUser() viewer: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.goodsReceipts.get(viewer, id);
  }

  @Post()
  @Roles(...RECEIPT_WRITERS)
  @HttpCode(201)
  @Audited({ action: AuditAction.CREATE, entity: GOODS_RECEIPT_ENTITY })
  @ApiOperation({ summary: 'Tạo phiếu nhập kho (có thể hoàn thành ngay)' })
  async create(@CurrentUser() viewer: AuthUser, @Body() dto: CreateGoodsReceiptDto) {
    return this.goodsReceipts.create(viewer, dto);
  }

  @Patch(':id')
  @Roles(...RECEIPT_WRITERS)
  @Audited({ action: AuditAction.UPDATE, entity: GOODS_RECEIPT_ENTITY })
  @ApiOperation({ summary: 'Cập nhật phiếu nhập kho (khi còn là DRAFT)' })
  async update(
    @CurrentUser() viewer: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoodsReceiptDto,
  ) {
    return this.goodsReceipts.update(viewer, id, dto);
  }

  @Post(':id/complete')
  @Roles(...RECEIPT_WRITERS)
  @HttpCode(200)
  @Audited({ action: AuditAction.COMPLETE, entity: GOODS_RECEIPT_ENTITY })
  @ApiOperation({ summary: 'Hoàn thành phiếu nhập kho và ghi sổ cái tồn kho' })
  async complete(@CurrentUser() viewer: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.goodsReceipts.complete(viewer, id);
  }
}
