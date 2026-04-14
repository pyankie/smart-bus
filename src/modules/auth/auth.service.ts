import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AuthEventType,
  IdentifierType,
  OtpPurpose,
  User,
  UserRole,
  UserStatus,
} from '@prisma-generated/client';
import { hash as argonHash, verify as argonVerify } from 'argon2';
import { createHash, randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    role: UserRole;
    status: UserStatus;
    fullName: string;
    phone: string;
    email: string | null;
    fid: string | null;
  };
};

type RequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private users: UsersService,
    private notifications: NotificationsService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existingByFid = await this.users.findAuthByIdentifier(dto.fid, IdentifierType.FID, true);
    if (
      existingByFid &&
      !existingByFid.deletedAt &&
      existingByFid.status !== UserStatus.PENDING_VERIFICATION
    ) {
      throw new ConflictException('FID already registered');
    }

    const existing = await this.users.findAuthByIdentifier(dto.phone, IdentifierType.PHONE, true);

    if (existing && existing.status === UserStatus.ACTIVE && !existing.deletedAt) {
      throw new ConflictException('Phone number already registered');
    }

    if (existing && existing.status === UserStatus.PENDING_VERIFICATION && !existing.deletedAt) {
      await this.assertNoOtpCooldown(dto.phone, OtpPurpose.REGISTRATION);
      const code = await this.createOtp(dto.phone, OtpPurpose.REGISTRATION, existing.id);
      await this.sendOtpSms(dto.phone, code);
      return { message: 'OTP sent' };
    }

    const passwordHash = await argonHash(dto.password);

    const created = await this.users.create({
      role: UserRole.PASSENGER,
      fullName: dto.fullName,
      phone: dto.phone,
      email: dto.email,
      fid: dto.fid,
      passwordHash,
    });

    const code = await this.createOtp(dto.phone, OtpPurpose.REGISTRATION, created.id);
    await this.sendOtpSms(dto.phone, code);

    return { message: 'OTP sent' };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{ message: string }> {
    const purpose = dto.purpose as OtpPurpose;
    await this.consumeOtp(dto.phone, dto.code, purpose);

    if (purpose === OtpPurpose.REGISTRATION) {
      const user = await this.users.findAuthByIdentifier(dto.phone, IdentifierType.PHONE, true);
      if (!user || user.deletedAt) {
        throw new GoneException('Registration request expired');
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: UserStatus.ACTIVE },
      });
    }

    return { message: 'Verified' };
  }

  async login(dto: LoginDto, context: RequestContext): Promise<AuthResult> {
    const user = await this.users.findAuthByIdentifier(dto.identifier, dto.identifierType);

    if (!user) {
      await this.logAuthEvent(null, dto.identifier, AuthEventType.LOGIN_FAILURE, context);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.DISABLED) {
      await this.logAuthEvent(user.id, dto.identifier, AuthEventType.LOGIN_FAILURE, context);
      throw new ForbiddenException('Account is disabled');
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      await this.logAuthEvent(user.id, dto.identifier, AuthEventType.LOGIN_FAILURE, context);
      throw new ForbiddenException('Please verify your phone first');
    }

    const ok = await argonVerify(user.passwordHash, dto.password);
    if (!ok) {
      await this.logAuthEvent(user.id, dto.identifier, AuthEventType.LOGIN_FAILURE, context);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.logAuthEvent(user.id, dto.identifier, AuthEventType.LOGIN_SUCCESS, context);

    return this.issueTokens(user);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResult> {
    const tokenHash = this.sha256(dto.refreshToken);
    const now = new Date();

    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!token) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (token.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      throw new UnauthorizedException('Refresh token replay detected');
    }

    if (token.expiresAt <= now) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const nextRaw = this.generateRefreshToken();
    const nextHash = this.sha256(nextRaw);
    const refreshExpiry = this.refreshExpiryDate();

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: token.id },
        data: { revokedAt: now },
      });

      const created = await tx.refreshToken.create({
        data: {
          userId: token.userId,
          tokenHash: nextHash,
          expiresAt: refreshExpiry,
        },
      });

      await tx.refreshToken.update({
        where: { id: token.id },
        data: { replacedById: created.id },
      });

      return created;
    });

    const accessToken = await this.signAccessToken(token.user);

    return {
      accessToken,
      refreshToken: nextRaw,
      user: {
        id: token.user.id,
        role: token.user.role,
        status: token.user.status,
        fullName: token.user.fullName,
        phone: token.user.phone,
        email: token.user.email,
        fid: token.user.fid,
      },
    };
  }

  async logout(dto: RefreshTokenDto, context: RequestContext): Promise<void> {
    const tokenHash = this.sha256(dto.refreshToken);

    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (token?.userId) {
      await this.logAuthEvent(token.userId, token.user.phone, AuthEventType.LOGOUT, context);
    }
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.users.findAuthByIdentifier(dto.phone, IdentifierType.PHONE);

    if (!user || user.fid !== dto.fid) {
      throw new NotFoundException('No account found');
    }

    await this.assertNoOtpCooldown(dto.phone, OtpPurpose.PASSWORD_RESET);
    const code = await this.createOtp(dto.phone, OtpPurpose.PASSWORD_RESET, user.id);
    await this.sendOtpSms(dto.phone, code);

    return { message: 'OTP sent' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    await this.consumeOtp(dto.phone, dto.code, OtpPurpose.PASSWORD_RESET);

    const user = await this.users.findAuthByIdentifier(dto.phone, IdentifierType.PHONE);
    if (!user) {
      throw new NotFoundException('No account found');
    }

    const passwordHash = await argonHash(dto.newPassword);
    await this.users.updatePassword(user.id, passwordHash);

    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.logAuthEvent(user.id, user.phone, AuthEventType.PASSWORD_RESET, {});

    return { message: 'Password updated' };
  }

  private async createOtp(phone: string, purpose: OtpPurpose, userId?: string): Promise<string> {
    const code = this.generateOtpCode();
    const codeHash = this.sha256(code);
    const expiresAt = new Date(Date.now() + this.otpTtlMinutes() * 60_000);

    await this.prisma.otpCode.create({
      data: {
        phone,
        purpose,
        userId,
        codeHash,
        expiresAt,
      },
    });

    return code;
  }

  private async sendOtpSms(phone: string, code: string): Promise<void> {
    await this.notifications.sendSms(phone, `Your SmartBus verification code is ${code}`);
  }

  private async consumeOtp(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        phone,
        purpose,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new GoneException('OTP expired or not found');
    }

    const skewMs = this.authClockSkewSeconds() * 1000;
    if (otp.expiresAt.getTime() + skewMs < Date.now()) {
      throw new GoneException('OTP expired or not found');
    }

    const submittedHash = this.sha256(code);
    if (submittedHash !== otp.codeHash) {
      const attempts = otp.attempts + 1;
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: {
          attempts,
          ...(attempts >= this.otpMaxAttempts() ? { consumedAt: new Date() } : {}),
        },
      });

      throw new BadRequestException('Invalid OTP');
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
  }

  private async issueTokens(user: User): Promise<AuthResult> {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = this.generateRefreshToken();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.sha256(refreshToken),
        expiresAt: this.refreshExpiryDate(),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        role: user.role,
        status: user.status,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        fid: user.fid,
      },
    };
  }

  private async signAccessToken(user: User): Promise<string> {
    const jwtSecret = this.config.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const accessExpiry = this.config.get<string>('JWT_ACCESS_EXPIRY') ?? '15m';

    return this.jwt.signAsync(
      {
        sub: user.id,
        role: user.role,
        phone: user.phone,
      },
      {
        secret: jwtSecret,
        expiresIn: this.parseDurationSeconds(accessExpiry),
      },
    );
  }

  private refreshExpiryDate(): Date {
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRY') ?? '7d';
    const seconds = this.parseDurationSeconds(expiresIn);
    return new Date(Date.now() + seconds * 1000);
  }

  private parseDurationSeconds(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) return 7 * 24 * 60 * 60;

    const amount = Number(match[1]);
    const unit = match[2];
    if (unit === 's') return amount;
    if (unit === 'm') return amount * 60;
    if (unit === 'h') return amount * 60 * 60;
    return amount * 24 * 60 * 60;
  }

  private otpTtlMinutes(): number {
    return this.config.get<number>('app.otpTtlMinutes') ?? 10;
  }

  private otpMaxAttempts(): number {
    return this.config.get<number>('app.otpMaxAttempts') ?? 5;
  }

  private otpResendSeconds(): number {
    return this.config.get<number>('app.otpResendSeconds') ?? 60;
  }

  private authClockSkewSeconds(): number {
    return this.config.get<number>('app.authClockSkewSeconds') ?? 30;
  }

  private async assertNoOtpCooldown(phone: string, purpose: OtpPurpose): Promise<void> {
    const latest = await this.prisma.otpCode.findFirst({
      where: { phone, purpose },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (!latest) return;

    const allowedAt = latest.createdAt.getTime() + this.otpResendSeconds() * 1000;
    if (allowedAt > Date.now()) {
      throw new BadRequestException('Please wait before requesting another OTP');
    }
  }

  private async logAuthEvent(
    userId: string | null,
    identifier: string,
    eventType: AuthEventType,
    context: RequestContext,
  ): Promise<void> {
    await this.prisma.authSecurityEvent.create({
      data: {
        userId,
        identifier,
        eventType,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        metadata: {},
      },
    });
  }

  private generateOtpCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('hex');
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
