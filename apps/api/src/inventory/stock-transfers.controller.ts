import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuditAction,
  CreateStockTransferSchema,
  ReceiveStockTransferSchema,
  Role,
  StockTransferQuerySchema,
  type AuthUser,
} from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { Audited } from '../audit/audited.decorator';
import { CurrentUser, Roles } from '../common/authz/decorators';
import { STOCK_TRANSFER_ENTITY, StockTransfersService } from './stock-transfers.service';

class CreateStockTransferDto extends createZodDto(CreateStockTransferSchema) {}
class ReceiveStockTransferDto extends createZodDto(ReceiveStockTransferSchema) {}
class StockTransferQueryDto extends createZodDto(StockTransferQuerySchema) {}

const TRANSFER_READERS = [
  Role.OWNER,
  Role.BRANCH_MANAGER,
  Role.WAREHOUSE_KEEPER,
  Role.ACCOUNTANT,
];
const TRANSFER_WRITERS = [Role.OWNER, Role.BRANCH_MANAGER, Role.WAREHOUSE_KEEPER];

@ApiTags('stock-transfers')
@ApiBearerAuth('JWT')
@Controller('inventory/stock-transfers')
export class StockTransfersController {
  constructor(private readonly transfers: StockTransfersService) {}

  @Get()
  @Roles(...TRANSFER_READERS)
  @ApiOperation({ summary: 'Danh sách phiếu chuyển kho (REQ-INV-02)' })
  async list(@CurrentUser() viewer: AuthUser, @Query() query: StockTransferQueryDto) {
    return this.transfers.list(viewer, query);
  }

  @Get(':id')
  @Roles(...TRANSFER_READERS)
  @ApiOperation({ summary: 'Chi tiết phiếu chuyển kho' })
  async get(@CurrentUser() viewer: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.get(viewer, id);
  }

  @Post()
  @Roles(...TRANSFER_WRITERS)
  @HttpCode(201)
  @Audited({ action: AuditAction.CREATE, entity: STOCK_TRANSFER_ENTITY })
  @ApiOperation({ summary: 'Tạo phiếu chuyển kho (DRAFT)' })
  async create(@CurrentUser() viewer: AuthUser, @Body() dto: CreateStockTransferDto) {
    return this.transfers.create(viewer, dto);
  }

  @Post(':id/send')
  @Roles(...TRANSFER_WRITERS)
  @HttpCode(200)
  @Audited({ action: AuditAction.SEND, entity: STOCK_TRANSFER_ENTITY })
  @ApiOperation({ summary: 'Gửi hàng chuyển kho (trừ tồn tại chi nhánh gửi)' })
  async send(@CurrentUser() viewer: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.send(viewer, id);
  }

  @Post(':id/receive')
  @Roles(...TRANSFER_WRITERS)
  @HttpCode(200)
  @Audited({ action: AuditAction.RECEIVE, entity: STOCK_TRANSFER_ENTITY })
  @ApiOperation({ summary: 'Nhận hàng chuyển kho (cộng tồn tại chi nhánh nhận và ghi nhận chênh lệch)' })
  async receive(
    @CurrentUser() viewer: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveStockTransferDto,
  ) {
    return this.transfers.receive(viewer, id, dto);
  }
}
