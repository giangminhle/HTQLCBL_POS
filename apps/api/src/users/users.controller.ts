import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuditAction,
  createUserSchema,
  resetPasswordResponseSchema,
  Role,
  updateUserSchema,
  userPageSchema,
  userQuerySchema,
  userSchema,
  type AuthUser,
} from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { Audited } from '../audit/audited.decorator';
import { BranchScoped, CurrentUser, Roles } from '../common/authz/decorators';
import { USER_ENTITY, UsersService } from './users.service';

class CreateUserDto extends createZodDto(createUserSchema) {}
class UpdateUserDto extends createZodDto(updateUserSchema) {}
class UserQueryDto extends createZodDto(userQuerySchema) {}
class UserDto extends createZodDto(userSchema) {}
class UserPageDto extends createZodDto(userPageSchema) {}
class ResetPasswordResponseDto extends createZodDto(resetPasswordResponseSchema) {}

@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.OWNER, Role.BRANCH_MANAGER)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @BranchScoped({ source: 'query', key: 'branchId' })
  @ApiOperation({ summary: 'Danh sách người dùng. Quản lý chi nhánh chỉ thấy chi nhánh mình.' })
  @ApiOkResponse({ type: UserPageDto })
  list(@CurrentUser() actor: AuthUser, @Query() query: UserQueryDto) {
    return this.users.list(actor, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: UserDto })
  get(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(actor, id);
  }

  @Post()
  @BranchScoped({ source: 'body', key: 'branchId' })
  @Audited({ action: AuditAction.CREATE, entity: USER_ENTITY })
  @ApiOperation({
    summary: 'Tạo người dùng. Quản lý chi nhánh chỉ tạo Thu ngân/Thủ kho/Kế toán trong chi nhánh mình.',
  })
  @ApiCreatedResponse({ type: UserDto })
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor, dto);
  }

  @Patch(':id')
  @BranchScoped({ source: 'body', key: 'branchId' })
  @Audited({ action: AuditAction.UPDATE, entity: USER_ENTITY })
  @ApiOperation({ summary: 'Sửa người dùng: họ tên, vai trò, chi nhánh, khóa (isActive=false).' })
  @ApiOkResponse({ type: UserDto })
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(actor, id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @Audited({ action: AuditAction.RESET_PASSWORD, entity: USER_ENTITY, reloadAfter: true })
  @ApiOperation({
    summary:
      'Đặt lại mật khẩu (REQ-AUTH-02). Trả mật khẩu tạm một lần; người dùng phải đổi ở lần đăng nhập sau.',
  })
  @ApiOkResponse({ type: ResetPasswordResponseDto })
  resetPassword(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.resetPassword(actor, id);
  }
}
