import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register user and send OTP' })
  @ApiResponse({ status: 201, description: 'OTP sent' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('verify-otp')
  @ApiOperation({ summary: 'Verify OTP for registration or reset' })
  @ApiResponse({ status: 200, description: 'Verified' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post('login')
  @ApiOperation({ summary: 'Login with identifier + password' })
  @ApiResponse({ status: 200, description: 'Token pair issued' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token' })
  @ApiResponse({ status: 200, description: 'New token pair issued' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Logout by revoking refresh token' })
  @ApiResponse({ status: 204, description: 'Logged out' })
  async logout(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<void> {
    await this.auth.logout(dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Send password reset OTP' })
  @ApiResponse({ status: 200, description: 'OTP sent' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with OTP' })
  @ApiResponse({ status: 200, description: 'Password updated' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }
}
