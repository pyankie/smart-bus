import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

export const IDEMPOTENCY_HEADER = 'idempotency-key';

// Matches UUID v4 — the only accepted format for idempotency keys
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type IdempotentRequest = Request & { idempotencyKey?: string };

@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<IdempotentRequest>();
    const res = context.switchToHttp().getResponse<Response>();

    const key = req.headers[IDEMPOTENCY_HEADER] as string | undefined;

    if (!key) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    if (!UUID_V4.test(key)) {
      throw new BadRequestException('Idempotency-Key must be a valid UUID v4');
    }

    const cached = await this.prisma.idempotencyKey.findUnique({ where: { key } });

    if (cached && cached.expiresAt > new Date()) {
      // Cache hit — replay the stored response and short-circuit the handler
      res.status(cached.statusCode).json(cached.responseBody);
      return false;
    }

    // Cache miss — pass the key along for IdempotencyInterceptor to store
    req.idempotencyKey = key;
    return true;
  }
}
