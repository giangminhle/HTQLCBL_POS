import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuditAction,
  AuthorizeDiscountSchema,
  CreateSaleReturnSchema,
  CreateSaleSchema,
  Role,
  SaleQuerySchema,
  type AuthUser,
  type Paginated,
  type Sale,
  type SaleDetail,
  type SaleReturn,
} from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { Audited } from '../audit/audited.decorator';
import { CurrentUser, Roles } from '../common/authz/decorators';
import { SALE_ENTITY, SALE_RETURN_ENTITY, SalesService } from './sales.service';

class CreateSaleDto extends createZodDto(CreateSaleSchema) {}
class CreateSaleReturnDto extends createZodDto(CreateSaleReturnSchema) {}
class SaleQueryDto extends createZodDto(SaleQuerySchema) {}
class AuthorizeDiscountDto extends createZodDto(AuthorizeDiscountSchema) {}

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  @Roles(Role.CASHIER, Role.BRANCH_MANAGER, Role.OWNER)
  @Audited({ action: AuditAction.CREATE, entity: SALE_ENTITY })
  @ApiOperation({ summary: 'Tạo mới đơn hàng POS (idempotent, trừ kho SALE) (REQ-POS-01, REQ-POS-02)' })
  createSale(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleDto): Promise<SaleDetail> {
    return this.sales.createSale(user, dto);
  }

  @Post('authorize-discount')
  @Roles(Role.CASHIER, Role.BRANCH_MANAGER, Role.OWNER)
  @ApiOperation({ summary: 'Xác thực tài khoản quản lý để phê duyệt giảm giá > 10%' })
  authorizeDiscount(
    @CurrentUser() user: AuthUser,
    @Body() dto: AuthorizeDiscountDto,
  ): Promise<{ authorized: boolean; managerName: string; managerRole: Role }> {
    return this.sales.authorizeDiscount(user, dto);
  }

  @Get(':id')
  @Roles(Role.CASHIER, Role.BRANCH_MANAGER, Role.OWNER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Xem chi tiết đơn hàng kèm danh sách sản phẩm và thanh toán' })
  getSale(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<SaleDetail> {
    return this.sales.getSale(user, id);
  }

  @Get()
  @Roles(Role.CASHIER, Role.BRANCH_MANAGER, Role.OWNER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Danh sách đơn hàng có phân trang và lọc' })
  getSales(@CurrentUser() user: AuthUser, @Query() query: SaleQueryDto): Promise<Paginated<Sale>> {
    return this.sales.getSales(user, query);
  }

  @Post(':id/returns')
  @Roles(Role.CASHIER, Role.BRANCH_MANAGER, Role.OWNER)
  @Audited({ action: AuditAction.RETURN, entity: SALE_RETURN_ENTITY })
  @ApiOperation({ summary: 'Đổi trả hàng (hoàn kho RETURN, giới hạn 7 ngày) (REQ-POS-04)' })
  createReturn(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSaleReturnDto,
  ): Promise<SaleReturn> {
    return this.sales.createReturn(user, id, dto);
  }
}
