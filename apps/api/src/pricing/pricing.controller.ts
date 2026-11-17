import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuditAction,
  createPriceListSchema,
  effectivePriceQuerySchema,
  effectivePriceResponseSchema,
  endPriceListSchema,
  priceListItemsResponseSchema,
  priceListPageSchema,
  priceListQuerySchema,
  priceListSchema,
  Role,
  updatePriceListSchema,
  upsertPriceListItemsSchema,
  type AuthUser,
} from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { Audited } from '../audit/audited.decorator';
import { BranchScoped, CurrentUser, Roles } from '../common/authz/decorators';
import { requestContext, type AuthenticatedRequest } from '../common/request-context';
import { PRICE_LIST_ENTITY, PriceListsService } from './price-lists.service';

class CreatePriceListDto extends createZodDto(createPriceListSchema) {}
class UpdatePriceListDto extends createZodDto(updatePriceListSchema) {}
class EndPriceListDto extends createZodDto(endPriceListSchema) {}
class PriceListQueryDto extends createZodDto(priceListQuerySchema) {}
class UpsertItemsDto extends createZodDto(upsertPriceListItemsSchema) {}
class EffectivePriceQueryDto extends createZodDto(effectivePriceQuerySchema) {}
class PriceListDto extends createZodDto(priceListSchema) {}
class PriceListPageDto extends createZodDto(priceListPageSchema) {}
class PriceListItemsDto extends createZodDto(priceListItemsResponseSchema) {}
class EffectivePriceDto extends createZodDto(effectivePriceResponseSchema) {}

const WRITERS = [Role.OWNER, Role.BRANCH_MANAGER];

@ApiTags('pricing')
@ApiBearerAuth()
@Controller()
export class PricingController {
  constructor(private readonly priceLists: PriceListsService) {}

  @Get('pricing/effective-price')
  @BranchScoped({ source: 'query', key: 'branchId' })
  @ApiOperation({
    summary:
      'Giá bán áp dụng (REQ-PRC-01, CR-004): bảng giá chi nhánh đang hiệu lực → variant.price → product.defaultPrice',
  })
  @ApiOkResponse({ type: EffectivePriceDto })
  effectivePrice(@CurrentUser() user: AuthUser, @Query() q: EffectivePriceQueryDto) {
    return this.priceLists.getEffectivePriceFor(user, q.variantId, q.branchId, q.at);
  }

  @Get('price-lists')
  @BranchScoped({ source: 'query', key: 'branchId' })
  @ApiOperation({
    summary: 'Bảng giá. Người không phải OWNER chỉ thấy chi nhánh mình. activeAt: chỉ bảng đang hiệu lực',
  })
  @ApiOkResponse({ type: PriceListPageDto })
  list(@CurrentUser() user: AuthUser, @Query() q: PriceListQueryDto) {
    return this.priceLists.list(user, q);
  }

  @Get('price-lists/:id')
  @ApiOkResponse({ type: PriceListDto })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.priceLists.get(user, id);
  }

  @Post('price-lists')
  @Roles(...WRITERS)
  @BranchScoped({ source: 'body', key: 'branchId' })
  @Audited({ action: AuditAction.CREATE, entity: PRICE_LIST_ENTITY })
  @ApiOperation({
    summary:
      'Tạo bảng giá chi nhánh. Khoảng [effectiveFrom, effectiveTo), effectiveTo null = vô thời hạn. ' +
      'Chồng thời gian với bảng giá khác của chi nhánh → 409 PRICE_LIST_OVERLAP (kèm bảng bị chồng).',
  })
  @ApiOkResponse({ type: PriceListDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePriceListDto, @Req() req: AuthenticatedRequest) {
    return this.priceLists.create(user, dto, requestContext(req));
  }

  @Patch('price-lists/:id')
  @Roles(...WRITERS)
  @Audited({ action: AuditAction.UPDATE, entity: PRICE_LIST_ENTITY })
  @ApiOkResponse({ type: PriceListDto })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriceListDto,
  ) {
    return this.priceLists.update(user, id, dto);
  }

  @Post('price-lists/:id/end')
  @HttpCode(200)
  @Roles(...WRITERS)
  @Audited({ action: AuditAction.UPDATE, entity: PRICE_LIST_ENTITY })
  @ApiOperation({ summary: 'Kết thúc bảng giá vào thời điểm endAt (đặt effectiveTo)' })
  @ApiOkResponse({ type: PriceListDto })
  end(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EndPriceListDto) {
    return this.priceLists.end(user, id, dto.endAt);
  }

  @Get('price-lists/:id/items')
  @ApiOkResponse({ type: PriceListItemsDto })
  async items(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { items: await this.priceLists.listItems(user, id), warnings: [] };
  }

  @Put('price-lists/:id/items')
  @Roles(...WRITERS)
  @ApiOperation({ summary: 'Đặt giá cho các biến thể (ghi audit PRICE_CHANGE; giá < giá vốn → warnings)' })
  @ApiOkResponse({ type: PriceListItemsDto })
  upsertItems(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertItemsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.priceLists.upsertItems(user, id, dto.items, requestContext(req));
  }

  @Delete('price-lists/:id/items/:variantId')
  @Roles(...WRITERS)
  @ApiOperation({ summary: 'Bỏ biến thể khỏi bảng giá (xóa mềm, ghi audit PRICE_CHANGE)' })
  @ApiOkResponse({ type: PriceListItemsDto })
  removeItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.priceLists.removeItem(user, id, variantId, requestContext(req));
  }
}
