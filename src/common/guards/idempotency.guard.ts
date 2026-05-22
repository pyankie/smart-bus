import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';

export const IDEMPOTENCY_HEADER = 'idempotency-key';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idempotencyKeySchema = z.string().regex(UUID_V4_REGEX);

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
    if (!idempotencyKeySchema.safeParse(key).success) {
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
