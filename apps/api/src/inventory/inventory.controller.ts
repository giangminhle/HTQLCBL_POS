import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  BalanceQuerySchema,
  LowStockQuerySchema,
  MovementQuerySchema,
  Role,
  type AuthUser,
} from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, Roles } from '../common/authz/decorators';
import { InventoryService } from './inventory.service';

class BalanceQueryDto extends createZodDto(BalanceQuerySchema) {}
class MovementQueryDto extends createZodDto(MovementQuerySchema) {}
class LowStockQueryDto extends createZodDto(LowStockQuerySchema) {}

const INVENTORY_READERS = [Role.OWNER, Role.BRANCH_MANAGER, Role.WAREHOUSE_KEEPER, Role.ACCOUNTANT];

@ApiTags('inventory')
@ApiBearerAuth('JWT')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('balances')
  @Roles(...INVENTORY_READERS)
  @ApiOperation({ summary: 'Truy vấn tồn kho hiện tại theo chi nhánh và sản phẩm' })
  async getBalances(@CurrentUser() viewer: AuthUser, @Query() query: BalanceQueryDto) {
    return this.inventory.getBalances(viewer, query);
  }

  @Get('movements')
  @Roles(...INVENTORY_READERS)
  @ApiOperation({ summary: 'Xem thẻ kho (lịch sử biến động) của một biến thể tại một chi nhánh' })
  async getMovements(@CurrentUser() viewer: AuthUser, @Query() query: MovementQueryDto) {
    return this.inventory.getMovements(viewer, query);
  }

  @Get('low-stock')
  @Roles(...INVENTORY_READERS)
  @ApiOperation({ summary: 'Danh sách sản phẩm có tồn kho dưới mức tồn tối thiểu (REQ-INV-04)' })
  async getLowStock(@CurrentUser() viewer: AuthUser, @Query() query: LowStockQueryDto) {
    return this.inventory.getLowStock(viewer, query);
  }
}
