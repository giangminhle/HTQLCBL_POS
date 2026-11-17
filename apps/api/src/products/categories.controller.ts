import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuditAction,
  categoryListSchema,
  categorySchema,
  createCategorySchema,
  Role,
  updateCategorySchema,
} from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { Audited } from '../audit/audited.decorator';
import { Roles } from '../common/authz/decorators';
import { CATEGORY_ENTITY, CategoriesService } from './categories.service';

class CreateCategoryDto extends createZodDto(createCategorySchema) {}
class UpdateCategoryDto extends createZodDto(updateCategorySchema) {}
class CategoryDto extends createZodDto(categorySchema) {}
class CategoryListDto extends createZodDto(categoryListSchema) {}

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Cây danh mục (danh sách phẳng, cha đứng trước con; dùng parentId/path dựng cây)',
  })
  @ApiOkResponse({ type: CategoryListDto })
  list() {
    return this.categories.list();
  }

  @Post()
  @Roles(Role.OWNER)
  @Audited({ action: AuditAction.CREATE, entity: CATEGORY_ENTITY })
  @ApiOkResponse({ type: CategoryDto })
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  @Audited({ action: AuditAction.UPDATE, entity: CATEGORY_ENTITY })
  @ApiOperation({ summary: 'Sửa / đổi danh mục cha (chặn vòng lặp: 400 CATEGORY_CYCLE)' })
  @ApiOkResponse({ type: CategoryDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  @Audited({ action: AuditAction.UPDATE, entity: CATEGORY_ENTITY })
  @ApiOperation({ summary: 'Xóa danh mục trống (còn con/sản phẩm: 409 CATEGORY_NOT_EMPTY)' })
  @ApiOkResponse({ type: CategoryDto })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(id);
  }
}
