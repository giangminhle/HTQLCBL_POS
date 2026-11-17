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
  CreateStockCountSchema,
  Role,
  StockCountQuerySchema,
  UpdateStockCountSchema,
  type AuthUser,
} from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { Audited } from '../audit/audited.decorator';
import { CurrentUser, Roles } from '../common/authz/decorators';
import { STOCK_COUNT_ENTITY, StockCountsService } from './stock-counts.service';

class CreateStockCountDto extends createZodDto(CreateStockCountSchema) {}
class UpdateStockCountDto extends createZodDto(UpdateStockCountSchema) {}
class StockCountQueryDto extends createZodDto(StockCountQuerySchema) {}

const COUNT_READERS = [
  Role.OWNER,
  Role.BRANCH_MANAGER,
  Role.WAREHOUSE_KEEPER,
  Role.ACCOUNTANT,
];
const COUNT_WRITERS = [Role.OWNER, Role.BRANCH_MANAGER, Role.WAREHOUSE_KEEPER];

@ApiTags('stock-counts')
@ApiBearerAuth('JWT')
@Controller('inventory/stock-counts')
export class StockCountsController {
  constructor(private readonly stockCounts: StockCountsService) {}

  @Get()
  @Roles(...COUNT_READERS)
  @ApiOperation({ summary: 'Danh sách phiếu kiểm kê (REQ-INV-03)' })
  async list(@CurrentUser() viewer: AuthUser, @Query() query: StockCountQueryDto) {
    return this.stockCounts.list(viewer, query);
  }

  @Get(':id')
  @Roles(...COUNT_READERS)
  @ApiOperation({ summary: 'Chi tiết phiếu kiểm kê' })
  async get(@CurrentUser() viewer: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.stockCounts.get(viewer, id);
  }

  @Post()
  @Roles(...COUNT_WRITERS)
  @HttpCode(201)
  @Audited({ action: AuditAction.CREATE, entity: STOCK_COUNT_ENTITY })
  @ApiOperation({ summary: 'Tạo phiếu kiểm kê (lưu snapshot tồn hệ thống)' })
  async create(@CurrentUser() viewer: AuthUser, @Body() dto: CreateStockCountDto) {
    return this.stockCounts.create(viewer, dto);
  }

  @Patch(':id')
  @Roles(...COUNT_WRITERS)
  @Audited({ action: AuditAction.UPDATE, entity: STOCK_COUNT_ENTITY })
  @ApiOperation({ summary: 'Cập nhật số lượng đếm thực tế của phiếu kiểm kê' })
  async update(
    @CurrentUser() viewer: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockCountDto,
  ) {
    return this.stockCounts.update(viewer, id, dto);
  }

  @Post(':id/complete')
  @Roles(...COUNT_WRITERS)
  @HttpCode(200)
  @Audited({ action: AuditAction.COMPLETE, entity: STOCK_COUNT_ENTITY })
  @ApiOperation({ summary: 'Chốt phiếu kiểm kê và tự động điều chỉnh tồn kho (ADJUSTMENT)' })
  async complete(@CurrentUser() viewer: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.stockCounts.complete(viewer, id);
  }
}
