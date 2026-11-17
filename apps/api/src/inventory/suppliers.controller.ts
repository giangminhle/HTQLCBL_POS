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
  CreateSupplierSchema,
  Role,
  SupplierQuerySchema,
  UpdateSupplierSchema,
  type AuthUser,
} from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { Audited } from '../audit/audited.decorator';
import { CurrentUser, Roles } from '../common/authz/decorators';
import { SUPPLIER_ENTITY, SuppliersService } from './suppliers.service';

class CreateSupplierDto extends createZodDto(CreateSupplierSchema) {}
class UpdateSupplierDto extends createZodDto(UpdateSupplierSchema) {}
class SupplierQueryDto extends createZodDto(SupplierQuerySchema) {}

const SUPPLIER_READERS = [
  Role.OWNER,
  Role.BRANCH_MANAGER,
  Role.WAREHOUSE_KEEPER,
  Role.ACCOUNTANT,
];
const SUPPLIER_WRITERS = [Role.OWNER, Role.BRANCH_MANAGER, Role.WAREHOUSE_KEEPER];

@ApiTags('suppliers')
@ApiBearerAuth('JWT')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @Roles(...SUPPLIER_READERS)
  @ApiOperation({ summary: 'Danh sách nhà cung cấp' })
  async list(@CurrentUser() viewer: AuthUser, @Query() query: SupplierQueryDto) {
    return this.suppliers.list(viewer, query);
  }

  @Get(':id')
  @Roles(...SUPPLIER_READERS)
  @ApiOperation({ summary: 'Chi tiết nhà cung cấp' })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.get(id);
  }

  @Post()
  @Roles(...SUPPLIER_WRITERS)
  @HttpCode(201)
  @Audited({ action: AuditAction.CREATE, entity: SUPPLIER_ENTITY })
  @ApiOperation({ summary: 'Thêm mới nhà cung cấp' })
  async create(@CurrentUser() viewer: AuthUser, @Body() dto: CreateSupplierDto) {
    return this.suppliers.create(viewer, dto);
  }

  @Patch(':id')
  @Roles(...SUPPLIER_WRITERS)
  @Audited({ action: AuditAction.UPDATE, entity: SUPPLIER_ENTITY })
  @ApiOperation({ summary: 'Cập nhật nhà cung cấp' })
  async update(
    @CurrentUser() viewer: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliers.update(viewer, id, dto);
  }
}
