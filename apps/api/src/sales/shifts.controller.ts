import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuditAction,
  CloseShiftSchema,
  OpenShiftSchema,
  Role,
  ShiftQuerySchema,
  type AuthUser,
  type Paginated,
  type Shift,
  type ShiftSummary,
} from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { Audited } from '../audit/audited.decorator';
import { CurrentUser, Roles } from '../common/authz/decorators';
import { SHIFT_ENTITY, ShiftsService } from './shifts.service';

class OpenShiftDto extends createZodDto(OpenShiftSchema) {}
class CloseShiftDto extends createZodDto(CloseShiftSchema) {}
class ShiftQueryDto extends createZodDto(ShiftQuerySchema) {}

@ApiTags('shifts')
@ApiBearerAuth()
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Post('open')
  @Roles(Role.CASHIER, Role.BRANCH_MANAGER, Role.OWNER)
  @Audited({ action: AuditAction.OPEN, entity: SHIFT_ENTITY })
  @ApiOperation({ summary: 'Mở ca làm việc mới (REQ-SHF-01)' })
  openShift(@CurrentUser() user: AuthUser, @Body() dto: OpenShiftDto): Promise<Shift> {
    return this.shifts.openShift(user, dto);
  }

  @Get('current')
  @Roles(Role.CASHIER, Role.BRANCH_MANAGER, Role.OWNER)
  @ApiOperation({ summary: 'Lấy thông tin ca làm việc hiện tại của thu ngân' })
  getCurrentShift(@CurrentUser() user: AuthUser): Promise<ShiftSummary | null> {
    return this.shifts.getCurrentShift(user);
  }

  @Post(':id/close')
  @Roles(Role.CASHIER, Role.BRANCH_MANAGER, Role.OWNER)
  @Audited({ action: AuditAction.CLOSE, entity: SHIFT_ENTITY })
  @ApiOperation({ summary: 'Chốt ca làm việc và đối soát tiền mặt (REQ-SHF-01)' })
  closeShift(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseShiftDto,
  ): Promise<Shift> {
    return this.shifts.closeShift(user, id, dto);
  }

  @Get(':id')
  @Roles(Role.CASHIER, Role.BRANCH_MANAGER, Role.OWNER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Xem chi tiết ca làm việc' })
  getShiftById(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ShiftSummary> {
    return this.shifts.getShiftById(user, id);
  }

  @Get()
  @Roles(Role.CASHIER, Role.BRANCH_MANAGER, Role.OWNER, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Danh sách ca làm việc có phân trang và lọc' })
  getShifts(@CurrentUser() user: AuthUser, @Query() query: ShiftQueryDto): Promise<Paginated<Shift>> {
    return this.shifts.getShifts(user, query);
  }
}
