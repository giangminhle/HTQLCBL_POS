import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { syncCatalogQuerySchema, syncCatalogResponseSchema, type AuthUser } from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { BranchScoped, CurrentUser } from '../common/authz/decorators';
import { SyncService } from './sync.service';

class SyncCatalogQueryDto extends createZodDto(syncCatalogQuerySchema) {}
class SyncCatalogDto extends createZodDto(syncCatalogResponseSchema) {}

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('catalog')
  @BranchScoped({ source: 'query', key: 'branchId' })
  @ApiOperation({
    summary:
      'Dữ liệu danh mục/sản phẩm/mã vạch/bảng giá thay đổi kể từ `since` cho POS dùng offline. ' +
      'Bỏ `since` để tải toàn bộ. Lần sau gửi `since = nextSince`. Không có giá vốn.',
  })
  @ApiOkResponse({ type: SyncCatalogDto })
  catalog(@CurrentUser() user: AuthUser, @Query() query: SyncCatalogQueryDto) {
    return this.sync.catalog(user, query);
  }
}
