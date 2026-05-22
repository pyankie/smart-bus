import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserStatus } from '@prisma-generated/client';
import { PrismaService } from '../prisma/prisma.service';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

@Injectable()
export class CleanupJob {
  private readonly logger = new Logger(CleanupJob.name);

  constructor(private prisma: PrismaService) {}

  @Cron('0 * * * *')
  async cleanupIdempotencyKeys(): Promise<void> {
    const { count } = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    this.logger.log(`Deleted ${count} expired idempotency keys`);
  }

  @Cron('0 */6 * * *')
  async cleanupStaleUsers(): Promise<void> {
    const cutoff = new Date(Date.now() - DAY_MS);

    const stale = await this.prisma.user.findMany({
      where: { status: UserStatus.PENDING_VERIFICATION, createdAt: { lt: cutoff } },
      select: { id: true },
    });

    if (stale.length === 0) {
      this.logger.log('No stale unverified users to clean up');
      return;
    }

    const ids = stale.map((u) => u.id);

    await this.prisma.otpCode.deleteMany({ where: { userId: { in: ids } } });
    await this.prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
    await this.prisma.user.deleteMany({ where: { id: { in: ids } } });

    this.logger.log(`Cleaned up ${stale.length} stale unverified users`);
  }

  @Cron('0 3 * * *')
  async cleanupExpiredTokens(): Promise<void> {
    const cutoff = new Date(Date.now() - WEEK_MS);
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    this.logger.log(`Deleted ${count} expired refresh tokens`);
  }

  @Cron('0 * * * *')
  async cleanupExpiredOtps(): Promise<void> {
    const cutoff = new Date(Date.now() - HOUR_MS);
    const { count } = await this.prisma.otpCode.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    this.logger.log(`Deleted ${count} expired OTP codes`);
  }
}
