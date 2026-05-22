import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Extracts the authenticated user from the request.
 * Returns the full payload, or a single field when a key is passed:
 *   @CurrentUser()          → JwtPayload
 *   @CurrentUser('sub')     → string (userId)
 *   @CurrentUser('role')    → UserRole
 */
export const CurrentUser = createParamDecorator(
  (
    field: keyof JwtPayload | undefined,
    ctx: ExecutionContext,
  ): JwtPayload | JwtPayload[keyof JwtPayload] | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    return field ? req.user?.[field] : req.user;
  },
);
