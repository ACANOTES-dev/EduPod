import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import {
  loginSchema,
  mfaRecoverySchema,
  mfaVerifySchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  switchTenantSchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';
import type { Request, Response } from 'express';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { apiError } from '../../common/errors/api-error';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import type { MfaVerifyDto } from './dto/mfa-verify.dto';
import type { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import type { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import type { SwitchTenantDto } from './dto/switch-tenant.dto';

@Controller('v1/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentTenant() tenantContext: TenantContext | null,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Use tenant_id from body, or from tenant resolution middleware
    const tenantId = dto.tenant_id || tenantContext?.tenant_id;

    const result = await this.authService.login(
      dto.email,
      dto.password,
      ipAddress,
      userAgent,
      tenantId,
      dto.mfa_code,
    );

    // If MFA required, return early without setting cookie
    if ('mfa_required' in result) {
      return result;
    }

    // Set refresh token as httpOnly cookie
    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      access_token: result.access_token,
      user: result.user,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request) {
    const refreshToken = req.cookies?.refresh_token as string | undefined;

    if (!refreshToken) {
      throw new UnauthorizedException(
        apiError('MISSING_REFRESH_TOKEN', 'No refresh token provided'),
      );
    }

    const result = await this.authService.refresh(refreshToken);
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Extract session_id from the refresh token cookie if available,
    // otherwise we need to find and delete sessions by user
    const refreshToken = req.cookies?.refresh_token as string | undefined;

    if (refreshToken) {
      try {
        const payload = this.authService.verifyRefreshToken(refreshToken);
        await this.authService.logout(payload.session_id, user.sub);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Logout completed after refresh token verification failed: ${message}`);
      }
    }

    // Clear the refresh token cookie
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth/refresh',
    });
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(passwordResetRequestSchema))
  async requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(passwordResetConfirmSchema))
  async confirmPasswordReset(@Body() dto: PasswordResetConfirmDto) {
    return this.authService.confirmPasswordReset(dto.token, dto.new_password);
  }

  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async setupMfa(@CurrentUser() user: JwtPayload) {
    return this.authService.setupMfa(user.sub);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @UsePipes(new ZodValidationPipe(mfaVerifySchema))
  async verifyMfaSetup(@CurrentUser() user: JwtPayload, @Body() dto: MfaVerifyDto) {
    return this.authService.verifyMfaSetup(user.sub, dto.code);
  }

  @Post('mfa/recovery')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(mfaRecoverySchema))
  async loginWithRecoveryCode(
    @Body() dto: { email: string; password: string; recovery_code: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const result = await this.authService.loginWithRecoveryCode(
      dto.email,
      dto.password,
      dto.recovery_code,
      ipAddress,
      userAgent,
    );

    // Set refresh token as httpOnly cookie
    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      access_token: result.access_token,
      user: result.user,
    };
  }

  @Post('switch-tenant')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @UsePipes(new ZodValidationPipe(switchTenantSchema))
  async switchTenant(@CurrentUser() user: JwtPayload, @Body() dto: SwitchTenantDto) {
    return this.authService.switchTenant(user.sub, user.email, dto.tenant_id);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub, user.tenant_id);
  }

  @Get('sessions')
  @UseGuards(AuthGuard)
  async listSessions(@CurrentUser() user: JwtPayload) {
    const sessions = await this.authService.listSessions(user.sub);
    return { data: sessions };
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  async revokeSession(@CurrentUser() user: JwtPayload, @Param('id') sessionId: string) {
    await this.authService.revokeSession(user.sub, sessionId);
  }
}
