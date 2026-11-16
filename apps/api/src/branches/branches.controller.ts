import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuditAction,
  branchPageSchema,
  branchQuerySchema,
  branchSchema,
  createBranchSchema,
  Role,
  updateBranchSchema,
  type AuthUser,
} from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { Audited } from '../audit/audited.decorator';
import { BranchScoped, CurrentUser, Roles } from '../common/authz/decorators';
import { BRANCH_ENTITY, BranchesService } from './branches.service';

class CreateBranchDto extends createZodDto(createBranchSchema) {}
class UpdateBranchDto extends createZodDto(updateBranchSchema) {}
class BranchQueryDto extends createZodDto(branchQuerySchema) {}
class BranchDto extends createZodDto(branchSchema) {}
class BranchPageDto extends createZodDto(branchPageSchema) {}

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách chi nhánh. Người dùng không phải OWNER chỉ thấy chi nhánh của mình.' })
  @ApiOkResponse({ type: BranchPageDto })
  list(@CurrentUser() user: AuthUser, @Query() query: BranchQueryDto) {
    return this.branches.list(user, query);
  }

  @Get(':id')
  @BranchScoped({ source: 'params', key: 'id' })
  @ApiOkResponse({ type: BranchDto })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.branches.get(user, id);
  }

  @Post()
  @Roles(Role.OWNER)
  @Audited({ action: AuditAction.CREATE, entity: BRANCH_ENTITY })
  @ApiOperation({ summary: 'Tạo chi nhánh / kho (OWNER)' })
  @ApiCreatedResponse({ type: BranchDto })
  create(@Body() dto: CreateBranchDto) {
    return this.branches.create(dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  @Audited({ action: AuditAction.UPDATE, entity: BRANCH_ENTITY })
  @ApiOperation({ summary: 'Sửa chi nhánh, ngưng hoạt động bằng isActive=false (OWNER). Mã không đổi được.' })
  @ApiOkResponse({ type: BranchDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBranchDto) {
    return this.branches.update(id, dto);
  }
}
