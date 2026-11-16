import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { auditLogPageSchema, auditQuerySchema, Role, type AuthUser } from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser, Roles } from '../common/authz/decorators';
import { AuditService } from './audit.service';

class AuditQueryDto extends createZodDto(auditQuerySchema) {}
class AuditLogPageDto extends createZodDto(auditLogPageSchema) {}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles(Role.OWNER, Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Xem nhật ký thao tác (REQ-AUD-01). Quản lý chỉ thấy log chi nhánh mình.' })
  @ApiOkResponse({ type: AuditLogPageDto })
  list(@CurrentUser() user: AuthUser, @Query() query: AuditQueryDto) {
    return this.audit.list(user, query);
  }
}
