import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  authUserSchema,
  changePasswordRequestSchema,
  loginRequestSchema,
  loginResponseSchema,
  logoutRequestSchema,
  refreshRequestSchema,
  type AuthUser,
} from '@retailchain/shared';
import { createZodDto } from 'nestjs-zod';
import { AllowWhenPasswordChangeRequired, CurrentUser, Public } from '../common/authz/decorators';
import { requestContext, type AuthenticatedRequest } from '../common/request-context';
import { AuthService } from './auth.service';

class LoginDto extends createZodDto(loginRequestSchema) {}
class RefreshDto extends createZodDto(refreshRequestSchema) {}
class LogoutDto extends createZodDto(logoutRequestSchema.partial()) {}
class ChangePasswordDto extends createZodDto(changePasswordRequestSchema) {}
class LoginResponseDto extends createZodDto(loginResponseSchema) {}
class AuthUserDto extends createZodDto(authUserSchema) {}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Đăng nhập (REQ-AUTH-01). Sai 5 lần liên tiếp: khóa 15 phút (423 ACCOUNT_LOCKED).',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  login(@Body() dto: LoginDto, @Req() req: AuthenticatedRequest) {
    return this.auth.login(dto.username, dto.password, dto.client, requestContext(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Đổi refresh token lấy cặp token mới (xoay vòng; dùng lại token cũ thu hồi mọi phiên)',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  refresh(@Body() dto: RefreshDto, @Req() req: AuthenticatedRequest) {
    return this.auth.refresh(dto.refreshToken, requestContext(req));
  }

  @Post('logout')
  @HttpCode(204)
  @AllowWhenPasswordChangeRequired()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất, thu hồi refresh token đã gửi' })
  async logout(@CurrentUser() user: AuthUser, @Body() dto: LogoutDto, @Req() req: AuthenticatedRequest) {
    await this.auth.logout(user, dto.refreshToken, requestContext(req));
  }

  @Post('change-password')
  @HttpCode(200)
  @AllowWhenPasswordChangeRequired()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đổi mật khẩu: thu hồi mọi phiên cũ, trả cặp token mới cho phiên hiện tại' })
  @ApiOkResponse({ type: LoginResponseDto })
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.auth.changePassword(user, req.authClient ?? 'admin', dto, requestContext(req));
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthUserDto })
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
