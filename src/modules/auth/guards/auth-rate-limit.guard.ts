import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthEventType } from '@prisma-generated/client';
import { PrismaService } from '../../../prisma/prisma.service';

const LOCKOUT_STEPS_SECONDS = [5, 30, 300, 900, 3600] as const;

type LoginRequest = Request & {
  body: {
    identifier?: string;
  };
};

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<LoginRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const identifier = req.body?.identifier?.trim();

    if (!identifier) return true;

    const events = await this.prisma.authSecurityEvent.findMany({
      where: {
        identifier,
        eventType: {
          in: [AuthEventType.LOGIN_SUCCESS, AuthEventType.LOGIN_FAILURE],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { eventType: true, createdAt: true },
      take: 20,
    });

    const failureCount = this.countConsecutiveFailures(events);
    if (failureCount === 0) return true;

    const lockoutSeconds = this.lockoutSecondsForFailures(failureCount);
    if (!lockoutSeconds) return true;

    const latestFailure = events.find((e) => e.eventType === AuthEventType.LOGIN_FAILURE);
    if (!latestFailure) return true;

    const lockoutUntil = latestFailure.createdAt.getTime() + lockoutSeconds * 1000;
    const remainingSeconds = Math.ceil((lockoutUntil - Date.now()) / 1000);

    if (remainingSeconds <= 0) return true;

    res.setHeader('Retry-After', String(remainingSeconds));

    await this.prisma.authSecurityEvent.create({
      data: {
        identifier,
        eventType: AuthEventType.LOCKOUT,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        metadata: { retryAfter: remainingSeconds },
      },
    });

    throw new HttpException(
      'Too many failed login attempts. Please try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private countConsecutiveFailures(
    events: Array<{ eventType: AuthEventType; createdAt: Date }>,
  ): number {
    let failures = 0;

    for (const event of events) {
      if (event.eventType === AuthEventType.LOGIN_SUCCESS) break;
      if (event.eventType === AuthEventType.LOGIN_FAILURE) failures += 1;
    }

    return failures;
  }

  private lockoutSecondsForFailures(failures: number): number {
    if (failures <= 0) return 0;
    if (failures >= LOCKOUT_STEPS_SECONDS.length) {
      return LOCKOUT_STEPS_SECONDS[LOCKOUT_STEPS_SECONDS.length - 1];
    }
    return LOCKOUT_STEPS_SECONDS[failures - 1];
  }
}
