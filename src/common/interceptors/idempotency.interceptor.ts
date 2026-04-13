import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma-generated/client';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

type IdempotentRequest = Request & { user?: JwtPayload; idempotencyKey?: string };

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<IdempotentRequest>();
    const key = req.idempotencyKey;

    // Only act when IdempotencyGuard set a key (cache miss path)
    if (!key) return next.handle();

    const res = context.switchToHttp().getResponse<Response>();
    const endpoint = `${req.method} ${req.path}`;
    const requestHash = createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
    const ttlMs = this.config.get<number>('app.idempotencyTtlMs') ?? 24 * 60 * 60 * 1000;

    return next.handle().pipe(
      tap({
        next: (body: unknown) => {
          // Read statusCode after the handler has run
          const statusCode = res.statusCode || 200;
          const expiresAt = new Date(Date.now() + ttlMs);

          let responseBody: Prisma.InputJsonValue | Prisma.JsonNullValueInput = Prisma.JsonNull;
          try {
            if (body !== undefined) {
              const normalized = JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue | null;
              responseBody = normalized === null ? Prisma.JsonNull : normalized;
            }
          } catch (err: unknown) {
            this.logger.warn(
              `Failed to serialize idempotency response for key ${key}: ${String(err)}`,
            );
            return;
          }

          this.prisma.idempotencyKey
            .create({
              data: {
                key,
                userId: req.user?.sub,
                endpoint,
                requestHash,
                responseBody,
                statusCode,
                expiresAt,
              },
            })
            .catch((err: unknown) => {
              // Fire-and-forget — a storage failure must not affect the response
              this.logger.warn(`Failed to store idempotency key ${key}: ${String(err)}`);
            });
        },
      }),
    );
  }
}
